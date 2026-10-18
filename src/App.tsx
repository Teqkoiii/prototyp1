/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  INITIAL_STUDENTS,
  INITIAL_CHECKINS,
  INITIAL_ACCESS_LOGS,
  INITIAL_GYM_STATE,
  DHBW_CAMPUSES,
} from './data/mockDatabase';
import { Student, ActiveCheckIn, AccessLog, GymState, PrivacyLevel, CampusId } from './types';
import { calculateOccupancyStatus, processDoorScan } from './services/gymEngine';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { HardwareSimulator } from './components/HardwareSimulator';
import { StudentsManagement } from './components/StudentsManagement';
import { TechnicalConceptView } from './components/TechnicalConceptView';
import { DsgvoPrivacyView } from './components/DsgvoPrivacyView';
import { StudentRegistrationModal } from './components/StudentRegistrationModal';
import { StudentProfileModal } from './components/StudentProfileModal';
import { Radio, Wifi, Shield, Bell, Check, Sparkles, MapPin, Infinity as InfinityIcon } from 'lucide-react';
import { useLanguage } from './context/LanguageContext';


// Storage is best-effort only. Browser storage is not a secure or shared database.
const validCampusIds: CampusId[] = ['dhbw-mgt', 'dhbw-mosbach', 'dhbw-heilbronn', 'dhbw-stuttgart'];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isRetentionHours = (value: unknown): value is number =>
  value === 4 || value === 24 || value === 48;
const isStudentList = (value: unknown): value is Student[] =>
  Array.isArray(value) && value.every((item) => isRecord(item) &&
    typeof item.id === 'string' && validCampusIds.includes(item.campusId as CampusId) &&
    (item.role === 'student' || item.role === 'employee') &&
    typeof item.firstName === 'string' && typeof item.lastName === 'string' &&
    typeof item.rfidUid === 'string' && typeof item.safetyBriefingCompleted === 'boolean' &&
    typeof item.cardActive === 'boolean' &&
    (item.privacyMode === 'public' || item.privacyMode === 'pseudonym' || item.privacyMode === 'anonymous'));
const isCheckInList = (value: unknown): value is ActiveCheckIn[] =>
  Array.isArray(value) && value.every((item) => isRecord(item) &&
    typeof item.id === 'string' && typeof item.studentId === 'string' &&
    validCampusIds.includes(item.campusId as CampusId) && typeof item.timestampIn === 'string');
const isAccessLogList = (value: unknown): value is AccessLog[] =>
  Array.isArray(value) && value.every((item) => isRecord(item) &&
    typeof item.id === 'string' && validCampusIds.includes(item.campusId as CampusId) &&
    typeof item.timestamp === 'string' && Number.isFinite(Date.parse(item.timestamp)) && typeof item.displayName === 'string' &&
    ['check_in', 'check_out', 'access_denied', 'auto_checkout'].includes(String(item.eventType)));
const isGymState = (value: unknown): value is GymState =>
  isRecord(value) && validCampusIds.includes(value.campusId as CampusId) &&
  typeof value.currentOccupancy === 'number' && typeof value.comfortGuide === 'number' &&
  typeof value.isOpen === 'boolean';

function readStoredValue<T>(key: string, fallback: T, isValid: (value: unknown) => value is T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    return isValid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredValue(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    // Storage may be disabled or full. The current session can continue without persistence.
  }
}

export default function App() {
  const { language, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'hardware' | 'students' | 'concept' | 'dsgvo'>('dashboard');

  const [selectedCampusId, setSelectedCampusId] = useState<CampusId>(() => {
    const saved = readStoredValue<string>('dhbw_selected_campus', 'dhbw-mgt', (value): value is string => typeof value === 'string');
    return validCampusIds.includes(saved as CampusId) ? (saved as CampusId) : 'dhbw-mgt';
  });

  const selectedCampus = DHBW_CAMPUSES.find((c) => c.id === selectedCampusId) || DHBW_CAMPUSES[0];

  const [students, setStudents] = useState<Student[]>(() =>
    readStoredValue<Student[]>('dhbw_gym_students', INITIAL_STUDENTS, isStudentList)
  );

  const [checkIns, setCheckIns] = useState<ActiveCheckIn[]>(() =>
    readStoredValue<ActiveCheckIn[]>('dhbw_gym_checkins', INITIAL_CHECKINS, isCheckInList)
  );

  const [logs, setLogs] = useState<AccessLog[]>(() =>
    readStoredValue<AccessLog[]>('dhbw_gym_logs', INITIAL_ACCESS_LOGS, isAccessLogList)
  );

  const [gymState, setGymState] = useState<GymState>(() =>
    readStoredValue<GymState>('dhbw_gym_state', INITIAL_GYM_STATE, isGymState)
  );

  const [currentUserId, setCurrentUserId] = useState<string>(() => students[0]?.id || 'stud-01');
  const currentUser = students.find((s) => s.id === currentUserId) || students[0];

  const [retentionHours, setRetentionHours] = useState<number>(() => readStoredValue<number>('dhbw_retention_hours', 48, isRetentionHours));
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [realtimePulse, setRealtimePulse] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync state to local storage
  useEffect(() => {
    writeStoredValue('dhbw_selected_campus', selectedCampusId);
  }, [selectedCampusId]);

  useEffect(() => {
    writeStoredValue('dhbw_gym_students', students);
  }, [students]);

  useEffect(() => {
    writeStoredValue('dhbw_gym_checkins', checkIns);
  }, [checkIns]);

  useEffect(() => {
    writeStoredValue('dhbw_gym_logs', logs);
  }, [logs]);

  useEffect(() => {
    writeStoredValue('dhbw_gym_state', gymState);
  }, [gymState]);

  useEffect(() => {
    writeStoredValue('dhbw_retention_hours', retentionHours);
  }, [retentionHours]);

  // Real-time pulse effect (simulating WebSocket telemetry)
  useEffect(() => {
    const interval = setInterval(() => {
      setRealtimePulse(true);
      setTimeout(() => setRealtimePulse(false), 800);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Apply the configured retention period to every access log.
  useEffect(() => {
    const purgeInterval = setInterval(() => {
      const now = Date.now();
      setLogs((prevLogs) => {
        const filtered = prevLogs.filter((log) => {
          const expiry = new Date(log.timestamp).getTime() + retentionHours * 3600 * 1000;
          return Number.isFinite(expiry) && expiry > now;
        });
        return filtered;
      });
    }, 30000);

    return () => clearInterval(purgeInterval);
  }, [retentionHours]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Check-Out student by ID
  const handleCheckOutStudent = (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    if (!student) return;

    const result = processDoorScan(student.rfidUid, students, checkIns, logs, gymState, 'rfid_door', selectedCampus.id, undefined, retentionHours);
    setCheckIns(result.updatedCheckIns);
    setLogs(result.updatedLogs);
    setGymState(result.updatedGymState);
    showToast(result.doorResponse.message);
  };

  // Toggle safety briefing
  const handleToggleBriefing = (studentId: string) => {
    setStudents((prev) =>
      prev.map((s) => {
        if (s.id !== studentId) return s;
        const newStatus = !s.safetyBriefingCompleted;
        return {
          ...s,
          safetyBriefingCompleted: newStatus,
          safetyBriefingDate: newStatus ? new Date().toISOString().split('T')[0] : undefined,
          safetyBriefingInstructor: newStatus ? 'Prof. Dr. Hartmann (Sportbeauftragter)' : undefined,
          cardActive: newStatus,
        };
      })
    );
    showToast('Einweisungsstatus erfolgreich aktualisiert');
  };

  // Update privacy mode
  const handleUpdatePrivacy = (studentId: string, level: PrivacyLevel) => {
    setStudents((prev) =>
      prev.map((s) => {
        if (s.id !== studentId) return s;
        return { ...s, privacyMode: level };
      })
    );
    showToast('Privatsphäre-Einstellung aktualisiert');
  };

  // Update RFID UID
  const handleUpdateUid = (studentId: string, newUid: string) => {
    setStudents((prev) =>
      prev.map((s) => {
        if (s.id !== studentId) return s;
        return { ...s, rfidUid: newUid };
      })
    );
    showToast(`Neue Chip-UID zugewiesen: ${newUid}`);
  };

  // Update current user profile
  const handleUpdateProfile = (updated: Student) => {
    setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setCheckIns((prev) =>
      prev.map((c) => {
        if (c.studentId !== updated.id) return c;
        return {
          ...c,
          displayName:
            updated.privacyMode === 'anonymous'
              ? 'Anonymer Nutzer'
              : updated.privacyMode === 'pseudonym' && updated.pseudonymLabel
              ? updated.pseudonymLabel
              : `${updated.firstName} ${updated.lastName[0]}.`,
          course: updated.course,
          role: updated.role,
        };
      })
    );
    showToast('Profil und DHBW-Stammdaten erfolgreich aktualisiert');
  };

  // Add new student
  const handleAddStudent = (newStudentData: Omit<Student, 'id'>) => {
    const newStudent: Student = {
      ...newStudentData,
      id: `stud-${Date.now()}`,
    };
    setStudents((prev) => [newStudent, ...prev]);
    showToast(`Studierender ${newStudent.firstName} ${newStudent.lastName} registriert`);
  };

  // Handle hardware scan result
  const handleScanResult = (result: ReturnType<typeof processDoorScan>) => {
    setCheckIns(result.updatedCheckIns);
    setLogs(result.updatedLogs);
    setGymState(result.updatedGymState);
    showToast(result.doorResponse.message);
  };

  // Purge all logs manually
  const handlePurgeLogs = () => {
    const now = Date.now();
    setLogs((prev) => prev.filter((log) => {
      const expiry = new Date(log.timestamp).getTime() + retentionHours * 3600 * 1000;
      return Number.isFinite(expiry) && expiry > now;
    }));
    showToast('DSGVO-Bereinigung ausgeführt: Ältere Logs gelöscht.');
  };

  const currentCampusCheckIns = checkIns.filter((c) => c.campusId === selectedCampus.id);
  const status = calculateOccupancyStatus(currentCampusCheckIns.length, selectedCampus.comfortGuide);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white text-xs px-4 py-3 rounded-xl shadow-lg border border-slate-800 flex items-center gap-2.5 animate-in slide-in-from-bottom-2 duration-200">
          <Bell className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Bar Header with Campus Selector & Profile */}
      <Header
        activeTab={activeTab === 'dsgvo' ? 'students' : activeTab}
        setActiveTab={(tab) => setActiveTab(tab)}
        occupancyCount={currentCampusCheckIns.length}
        status={status}
        selectedCampus={selectedCampus}
        campuses={DHBW_CAMPUSES}
        currentUser={currentUser}
        allStudents={students}
        onSelectCampus={(campusId) => {
          setSelectedCampusId(campusId);
          showToast(`Standort gewechselt zu: ${DHBW_CAMPUSES.find((c) => c.id === campusId)?.name}`);
        }}
        onOpenProfile={() => setIsProfileOpen(true)}
        onQuickScan={() => setActiveTab('hardware')}
        onSwitchUser={(studentId) => {
          setCurrentUserId(studentId);
          const st = students.find((s) => s.id === studentId);
          if (st) showToast(`Benutzer gewechselt zu: ${st.firstName} ${st.lastName}`);
        }}
      />

      {/* Sub-Header Bar: Realtime status ticker & quick tabs */}
      <div className="bg-slate-900 text-slate-300 border-b border-slate-800 py-2 px-4 sm:px-6 lg:px-8 text-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
              <span
                className={`w-2 h-2 rounded-full ${
                  realtimePulse ? 'bg-emerald-400 scale-125' : 'bg-emerald-500'
                } transition-all duration-300`}
              />
              <span className="text-white font-medium">{selectedCampus.shortName}:</span>
              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-amber-300">DEMO</span>
              <span className="text-slate-300 font-mono tabular-nums">{currentCampusCheckIns.length} Personen aktiv</span>
            </div>
            <span className="text-slate-600">·</span>
            <span className="text-emerald-400 font-medium hidden sm:inline-flex items-center gap-1">
              <InfinityIcon className="w-3.5 h-3.5" />
              <span>Unbegrenzte Plätze</span>
            </span>
            <span className="text-slate-600 hidden sm:inline">·</span>
            <span className="text-slate-400 font-mono hidden sm:inline">
              DSGVO-Löschung: {retentionHours}h
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('dsgvo')}
              className={`px-2.5 py-1 rounded text-xs transition-colors flex items-center gap-1 ${
                activeTab === 'dsgvo'
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Shield className="w-3 h-3" />
              <span>DSGVO-Portal</span>
            </button>

            <button
              onClick={() => setIsRegistrationOpen(true)}
              className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-xs transition-colors font-medium flex items-center gap-1.5 shadow-xs"
            >
              <span>+ DHBW Login / SSO</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && (
          <DashboardView
            gymState={{ ...gymState, currentOccupancy: currentCampusCheckIns.length }}
            checkIns={checkIns}
            students={students}
            logs={logs}
            selectedCampus={selectedCampus}
            currentUser={currentUser}
            onOpenProfile={() => setIsProfileOpen(true)}
            onTriggerCheckOut={handleCheckOutStudent}
            onOpenHardwareSimulator={() => setActiveTab('hardware')}
            onOpenStudentBriefings={() => setActiveTab('students')}
          />
        )}

        {activeTab === 'hardware' && (
          <HardwareSimulator
            students={students}
            checkIns={checkIns}
            logs={logs}
            gymState={{ ...gymState, currentOccupancy: currentCampusCheckIns.length }}
            selectedCampus={selectedCampus}
            retentionHours={retentionHours}
            onScanResult={handleScanResult}
          />
        )}

        {activeTab === 'students' && (
          <StudentsManagement
            students={students}
            selectedCampus={selectedCampus}
            onToggleBriefing={handleToggleBriefing}
            onUpdatePrivacy={handleUpdatePrivacy}
            onAddStudent={handleAddStudent}
            onUpdateUid={handleUpdateUid}
            onEditProfile={(st) => {
              setCurrentUserId(st.id);
              setIsProfileOpen(true);
            }}
          />
        )}

        {activeTab === 'concept' && <TechnicalConceptView />}

        {activeTab === 'dsgvo' && (
          <DsgvoPrivacyView
            logs={logs.filter((l) => l.campusId === selectedCampus.id).map((log) => ({
              ...log,
              retentionExpiresAt: new Date(new Date(log.timestamp).getTime() + retentionHours * 3600 * 1000).toISOString(),
            }))}
            students={students.filter((s) => s.campusId === selectedCampus.id)}
            onPurgeLogs={handlePurgeLogs}
            retentionHours={retentionHours}
            setRetentionHours={setRetentionHours}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            {selectedCampus.name} · Campus Gym System · Unbegrenzte Plätze & freier Zutritt
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Standort: {selectedCampus.location}</span>
            <span>·</span>
            <span>{retentionHours}h Log-Aufbewahrung aktiv (Demo)</span>
            <span>·</span>
            <button
              onClick={() => setActiveTab('concept')}
              className="text-slate-600 hover:text-slate-900 underline"
            >
              Architekturkonzept
            </button>
          </div>
        </div>
      </footer>

      {/* Student Registration Modal */}
      <StudentRegistrationModal
        isOpen={isRegistrationOpen}
        selectedCampus={selectedCampus}
        onClose={() => setIsRegistrationOpen(false)}
        onRegisterSuccess={(newStudent) => {
          setStudents((prev) => [newStudent, ...prev]);
          showToast(`Erfolgreich registriert: ${newStudent.firstName} ${newStudent.lastName}`);
        }}
      />

      {/* Student Profile & DHBW Info Sync Modal */}
      {currentUser && (
        <StudentProfileModal
          isOpen={isProfileOpen}
          currentUser={currentUser}
          allStudents={students}
          onClose={() => setIsProfileOpen(false)}
          onUpdateProfile={handleUpdateProfile}
          onSwitchUser={(studentId) => {
            setCurrentUserId(studentId);
            const st = students.find((s) => s.id === studentId);
            if (st) showToast(`Profil gewechselt zu: ${st.firstName} ${st.lastName}`);
          }}
        />
      )}
    </div>
  );
}
