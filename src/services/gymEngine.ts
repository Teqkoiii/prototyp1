import {
  Student,
  ActiveCheckIn,
  AccessLog,
  GymState,
  DoorScanResponse,
  OccupancyStatus,
  CheckInMethod,
  CampusId,
  UserRole,
} from '../types';

export function calculateOccupancyStatus(current: number, comfortGuide: number = 15): OccupancyStatus {
  const ratio = current / comfortGuide;
  if (ratio >= 0.85) return 'red';
  if (ratio >= 0.55) return 'yellow';
  return 'green';
}

export function maskUid(uid: string): string {
  const parts = uid.split(':');
  if (parts.length <= 2) return '***';
  return `${parts[0]}:**:**:${parts[parts.length - 1]}`;
}

export function formatStudentDisplayName(student: Student): string {
  if (student.privacyMode === 'anonymous') {
    return 'Anonymer Nutzer';
  }
  if (student.privacyMode === 'pseudonym' && student.pseudonymLabel) {
    return student.pseudonymLabel;
  }
  const roleBadge = student.role === 'employee' ? ' (Mitarbeiter)' : '';
  return `${student.firstName} ${student.lastName[0]}.${roleBadge}`;
}

export interface EngineResult {
  doorResponse: DoorScanResponse;
  updatedStudents: Student[];
  updatedCheckIns: ActiveCheckIn[];
  updatedLogs: AccessLog[];
  updatedGymState: GymState;
  rawApiPayload: {
    request: Record<string, unknown>;
    response: Record<string, unknown>;
    statusCode: number;
    latencyMs: number;
  };
}

export function processDoorScan(
  rfidUid: string,
  students: Student[],
  checkIns: ActiveCheckIn[],
  logs: AccessLog[],
  gymState: GymState,
  method: CheckInMethod = 'rfid_door',
  targetCampusId?: CampusId,
  simulatedDayOfWeek?: number
): EngineResult {
  const cleanUid = rfidUid.trim().toUpperCase();
  const student = students.find((s) => s.rfidUid.toUpperCase() === cleanUid);
  const activeCampusId = targetCampusId || student?.campusId || gymState.campusId;

  // Wochentagsprüfung (0=So, 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr, 6=Sa)
  const currentDay =
    simulatedDayOfWeek !== undefined
      ? simulatedDayOfWeek
      : gymState.currentDayOfWeek !== undefined
      ? gymState.currentDayOfWeek
      : new Date().getDay();

  const isWednesday = currentDay === 3;

  const requestPayload = {
    endpoint: '/api/v1/door/scan',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-ID': `DOOR-${activeCampusId.toUpperCase()}-01`,
      // This is a local demo payload, not a cryptographic signature. Real gateway
      // authentication must be generated and verified by the backend/device integration.
      'X-Gateway-Signature': 'SIMULATION_ONLY_NOT_AUTHENTICATED',
    },
    body: {
      rfidUid: cleanUid,
      campusId: activeCampusId,
      dayOfWeek: currentDay,
      scannerType: method === 'rfid_door' ? 'rfid_nfc' : 'ble_beacon',
      timestamp: Date.now(),
      doorId: `DOOR-${activeCampusId.toUpperCase()}-01`,
    },
  };

  const newLogs = [...logs];
  let newCheckIns = [...checkIns];
  const newGymState = { ...gymState, currentDayOfWeek: currentDay };

  // Case 1: Unbekannte Karte
  if (!student) {
    const deniedLog: AccessLog = {
      id: `log-${Date.now()}`,
      campusId: activeCampusId,
      timestamp: new Date().toISOString(),
      eventType: 'access_denied',
      rfidUidMasked: maskUid(cleanUid),
      studentIdMasked: 'unbekannt',
      displayName: 'Unbekannte Chipkarte',
      method,
      reason: 'Ausweis-ID nicht im System registriert',
      doorId: `DOOR-${activeCampusId.toUpperCase()}-01`,
      retentionExpiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    };
    newLogs.unshift(deniedLog);

    const campusCheckInsCount = newCheckIns.filter((c) => c.campusId === activeCampusId).length;

    const doorResponse: DoorScanResponse = {
      allowed: false,
      action: 'denied',
      message: 'Zugang verweigert: Unbekannter Ausweis. Bitte zuerst in der App registrieren.',
      occupancy: {
        current: campusCheckInsCount,
        status: calculateOccupancyStatus(campusCheckInsCount, newGymState.comfortGuide),
      },
    };

    return {
      doorResponse,
      updatedStudents: students,
      updatedCheckIns: newCheckIns,
      updatedLogs: newLogs,
      updatedGymState: {
        ...newGymState,
        currentOccupancy: campusCheckInsCount,
      },
      rawApiPayload: {
        request: requestPayload,
        response: doorResponse as unknown as Record<string, unknown>,
        statusCode: 401,
        latencyMs: 42,
      },
    };
  }

  // Campus assignment is part of the access decision, not just a display filter.
  if (targetCampusId && student.campusId !== targetCampusId) {
    const deniedLog: AccessLog = {
      id: `log-${Date.now()}`,
      campusId: targetCampusId,
      timestamp: new Date().toISOString(),
      eventType: 'access_denied',
      rfidUidMasked: maskUid(student.rfidUid),
      studentIdMasked: `stud-${student.id.slice(-4)}`,
      displayName: formatStudentDisplayName(student),
      method,
      reason: 'Standort nicht freigegeben: Campus-Zuordnung stimmt nicht überein',
      doorId: `DOOR-${targetCampusId.toUpperCase()}-01`,
      retentionExpiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    };
    newLogs.unshift(deniedLog);
    const campusCheckInsCount = newCheckIns.filter((c) => c.campusId === targetCampusId).length;
    const doorResponse: DoorScanResponse = {
      allowed: false,
      action: 'denied',
      message: 'Zugang verweigert: Dieser Standort ist deinem Profil nicht zugeordnet.',
      occupancy: {
        current: campusCheckInsCount,
        status: calculateOccupancyStatus(campusCheckInsCount, newGymState.comfortGuide),
      },
    };
    return {
      doorResponse,
      updatedStudents: students,
      updatedCheckIns: newCheckIns,
      updatedLogs: newLogs,
      updatedGymState: { ...newGymState, currentOccupancy: campusCheckInsCount },
      rawApiPayload: {
        request: requestPayload,
        response: doorResponse as unknown as Record<string, unknown>,
        statusCode: 403,
        latencyMs: 0,
      },
    };
  }

  // Case 2: Keine Sicherheitseinweisung absolviert!
  if (!student.safetyBriefingCompleted) {
    const deniedLog: AccessLog = {
      id: `log-${Date.now()}`,
      campusId: student.campusId,
      timestamp: new Date().toISOString(),
      eventType: 'access_denied',
      rfidUidMasked: maskUid(student.rfidUid),
      studentIdMasked: `stud-${student.id.slice(-4)}`,
      displayName: formatStudentDisplayName(student),
      method,
      reason: 'Sicherheitseinweisung ausstehend (Freischaltung gesperrt)',
      doorId: `DOOR-${student.campusId.toUpperCase()}-01`,
      retentionExpiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    };
    newLogs.unshift(deniedLog);

    const campusCheckInsCount = newCheckIns.filter((c) => c.campusId === student.campusId).length;

    const doorResponse: DoorScanResponse = {
      allowed: false,
      action: 'denied',
      message: 'Zugang verweigert: Gesetzliche Sicherheitseinweisung fehlt. Melde dich bei der Sportbeauftragten.',
      occupancy: {
        current: campusCheckInsCount,
        status: calculateOccupancyStatus(campusCheckInsCount, newGymState.comfortGuide),
      },
      studentInfo: {
        name: `${student.firstName} ${student.lastName}`,
        course: student.course,
        role: student.role,
      },
    };

    return {
      doorResponse,
      updatedStudents: students,
      updatedCheckIns: newCheckIns,
      updatedLogs: newLogs,
      updatedGymState: {
        ...newGymState,
        currentOccupancy: campusCheckInsCount,
      },
      rawApiPayload: {
        request: requestPayload,
        response: doorResponse as unknown as Record<string, unknown>,
        statusCode: 403,
        latencyMs: 38,
      },
    };
  }

  // Case 3: MITTWOCHS-REGELUNG: Mittwochs dürfen NUR Mitarbeiter der DHBW rein!
  if (isWednesday && student.role !== 'employee') {
    const deniedLog: AccessLog = {
      id: `log-${Date.now()}`,
      campusId: student.campusId,
      timestamp: new Date().toISOString(),
      eventType: 'access_denied',
      rfidUidMasked: maskUid(student.rfidUid),
      studentIdMasked: `stud-${student.id.slice(-4)}`,
      displayName: formatStudentDisplayName(student),
      method,
      reason: 'Mittwochs-Regel: Fitnessraum heute exklusiv für DHBW-Mitarbeitende reserviert',
      doorId: `DOOR-${student.campusId.toUpperCase()}-01`,
      retentionExpiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    };
    newLogs.unshift(deniedLog);

    const campusCheckInsCount = newCheckIns.filter((c) => c.campusId === student.campusId).length;

    const doorResponse: DoorScanResponse = {
      allowed: false,
      action: 'denied',
      message:
        'Zutritt verwehrt: Mittwochs ist der Fitnessraum exklusiv für DHBW-Mitarbeitende reserviert. Für Studierende ab Donnerstag 06:00 Uhr wieder geöffnet.',
      occupancy: {
        current: campusCheckInsCount,
        status: calculateOccupancyStatus(campusCheckInsCount, newGymState.comfortGuide),
      },
      studentInfo: {
        name: `${student.firstName} ${student.lastName}`,
        course: student.course,
        role: student.role,
      },
    };

    return {
      doorResponse,
      updatedStudents: students,
      updatedCheckIns: newCheckIns,
      updatedLogs: newLogs,
      updatedGymState: {
        ...newGymState,
        currentOccupancy: campusCheckInsCount,
      },
      rawApiPayload: {
        request: requestPayload,
        response: doorResponse as unknown as Record<string, unknown>,
        statusCode: 403,
        latencyMs: 35,
      },
    };
  }

  // Case 4: Bereits eingecheckt -> Jetzt CHECK-OUT!
  const existingCheckInIndex = newCheckIns.findIndex((c) => c.studentId === student.id);
  if (existingCheckInIndex !== -1) {
    newCheckIns.splice(existingCheckInIndex, 1);

    const checkoutLog: AccessLog = {
      id: `log-${Date.now()}`,
      campusId: student.campusId,
      timestamp: new Date().toISOString(),
      eventType: 'check_out',
      rfidUidMasked: maskUid(student.rfidUid),
      studentIdMasked: `stud-${student.id.slice(-4)}`,
      displayName: formatStudentDisplayName(student),
      method,
      doorId: `DOOR-${student.campusId.toUpperCase()}-01`,
      retentionExpiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    };
    newLogs.unshift(checkoutLog);

    const campusCheckInsCount = newCheckIns.filter((c) => c.campusId === student.campusId).length;

    const doorResponse: DoorScanResponse = {
      allowed: true,
      action: 'check_out',
      message: `Auf Wiedersehen, ${student.firstName}! Check-Out erfolgreich erfasst.`,
      occupancy: {
        current: campusCheckInsCount,
        status: calculateOccupancyStatus(campusCheckInsCount, newGymState.comfortGuide),
      },
      studentInfo: {
        name: formatStudentDisplayName(student),
        course: student.course,
        role: student.role,
      },
    };

    return {
      doorResponse,
      updatedStudents: students,
      updatedCheckIns: newCheckIns,
      updatedLogs: newLogs,
      updatedGymState: {
        ...newGymState,
        currentOccupancy: campusCheckInsCount,
      },
      rawApiPayload: {
        request: requestPayload,
        response: doorResponse as unknown as Record<string, unknown>,
        statusCode: 200,
        latencyMs: 29,
      },
    };
  }

  // Case 5: Neuer CHECK-IN! (Freigeschaltet & berechtigt)
  const newCheckIn: ActiveCheckIn = {
    id: `cin-${Date.now()}`,
    campusId: student.campusId,
    role: student.role,
    studentId: student.id,
    displayName: formatStudentDisplayName(student),
    course: student.course,
    timestampIn: new Date().toISOString(),
    method,
    doorId: `DOOR-${student.campusId.toUpperCase()}-01`,
    estimatedCheckoutAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
  };
  newCheckIns.unshift(newCheckIn);

  const checkinLog: AccessLog = {
    id: `log-${Date.now()}`,
    campusId: student.campusId,
    timestamp: new Date().toISOString(),
    eventType: 'check_in',
    rfidUidMasked: maskUid(student.rfidUid),
    studentIdMasked: `stud-${student.id.slice(-4)}`,
    displayName: formatStudentDisplayName(student),
    method,
    doorId: `DOOR-${student.campusId.toUpperCase()}-01`,
    retentionExpiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
  };
  newLogs.unshift(checkinLog);

  const campusCheckInsCount = newCheckIns.filter((c) => c.campusId === student.campusId).length;

  const roleText = student.role === 'employee' ? ' (Mitarbeiter)' : '';
  const doorResponse: DoorScanResponse = {
    allowed: true,
    action: 'check_in',
    message: `Willkommen im Gym, ${student.firstName}${roleText}! Tür öffnet für 3 Sekunden.`,
    occupancy: {
      current: campusCheckInsCount,
      status: calculateOccupancyStatus(campusCheckInsCount, newGymState.comfortGuide),
    },
    studentInfo: {
      name: formatStudentDisplayName(student),
      course: student.course,
      role: student.role,
    },
  };

  return {
    doorResponse,
    updatedStudents: students,
    updatedCheckIns: newCheckIns,
    updatedLogs: newLogs,
    updatedGymState: {
      ...newGymState,
      currentOccupancy: campusCheckInsCount,
    },
    rawApiPayload: {
      request: requestPayload,
      response: doorResponse as unknown as Record<string, unknown>,
      statusCode: 200,
      latencyMs: 24,
    },
  };
}
