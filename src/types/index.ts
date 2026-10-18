export type PrivacyLevel = 'public' | 'pseudonym' | 'anonymous';

export type CheckInMethod = 'rfid_door' | 'ble_beacon' | 'geofence' | 'manual_verified';

export type OccupancyStatus = 'green' | 'yellow' | 'red';

export type CampusId = 'dhbw-mgt' | 'dhbw-mosbach' | 'dhbw-heilbronn' | 'dhbw-stuttgart';

export type UserRole = 'student' | 'employee';

export interface Campus {
  id: CampusId;
  name: string;
  shortName: string;
  city: string;
  location: string;
  emailDomain: string;
  comfortGuide: number; // Richtwert für Ampel (z.B. 15), aber KEINE Begrenzung / kein Aussperren!
  openingHours: string;
}

export interface Student {
  id: string;
  campusId: CampusId;
  role: UserRole; // 'student' oder 'employee' (Mittwochs nur employee!)
  matriculationNo: string; // bzw. Personalnummer bei Mitarbeitern
  firstName: string;
  lastName: string;
  email: string;
  rfidUid: string; // z. B. MIFARE DESFire UID "E2:4C:81:0B"
  safetyBriefingCompleted: boolean;
  safetyBriefingDate?: string;
  safetyBriefingInstructor?: string;
  course: string; // z.B. "WWI2024", "Dozent Informatik", "Verwaltung Campus MGT"
  privacyMode: PrivacyLevel;
  pseudonymLabel?: string;
  cardActive: boolean;
}

export interface ActiveCheckIn {
  id: string;
  campusId: CampusId;
  role: UserRole;
  studentId: string;
  displayName: string;
  course: string;
  timestampIn: string;
  method: CheckInMethod;
  doorId: string;
  estimatedCheckoutAt: string;
}

export interface AccessLog {
  id: string;
  campusId: CampusId;
  timestamp: string;
  eventType: 'check_in' | 'check_out' | 'access_denied' | 'auto_checkout';
  rfidUidMasked: string;
  studentIdMasked: string;
  displayName: string;
  method: CheckInMethod;
  reason?: string;
  doorId: string;
  retentionExpiresAt: string;
}

export interface GymState {
  campusId: CampusId;
  currentOccupancy: number;
  comfortGuide: number; // Richtwert (z.B. 15) zur Farborientierung, KEINE Einlass-Sperre!
  warningThreshold: number; // z. B. 9 (ab 60% = gelb)
  criticalThreshold: number; // z. B. 13 (ab 85% = belebter)
  isOpen: boolean;
  openingHours: string;
  currentDayOfWeek: number; // 0=Sonntag, 1=Montag, 2=Dienstag, 3=Mittwoch, 4=Donnerstag, 5=Freitag, 6=Samstag
}

export interface DoorScanRequest {
  rfidUid: string;
  campusId: CampusId;
  doorId: string;
  scannerType: 'rfid_nfc' | 'wiegand_controller';
  hmacSignature: string;
  timestamp: number;
}

export interface DoorScanResponse {
  allowed: boolean;
  action: 'check_in' | 'check_out' | 'denied';
  message: string;
  occupancy: {
    current: number;
    status: OccupancyStatus;
  };
  studentInfo?: {
    name: string;
    course: string;
    role: UserRole;
  };
}
