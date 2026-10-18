import React, { useState } from 'react';
import {
  User,
  GraduationCap,
  CreditCard,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  CheckCircle2,
  Lock,
  Globe,
  Sparkles,
  X,
  Save,
  Building2,
  Calendar,
  AlertCircle,
  Database,
  Check,
  ExternalLink,
  ChevronDown,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { Student, PrivacyLevel, UserRole, Campus } from '../types';
import { DHBW_CAMPUSES } from '../data/mockDatabase';
import { useLanguage } from '../context/LanguageContext';

interface StudentProfileModalProps {
  isOpen: boolean;
  currentUser: Student;
  allStudents?: Student[];
  onClose: () => void;
  onUpdateProfile: (updated: Student) => void;
  onSwitchUser?: (studentId: string) => void;
}

// Typische DHBW-Studiengänge (insbesondere Bad Mergentheim / Mosbach / Verbund)
export const DHBW_STUDIENGÄNGE = [
  {
    code: 'WWI',
    name: 'Wirtschaftsinformatik (B.Sc.)',
    fakultaet: 'Wirtschaft',
    standardKurs: 'WWI 2024',
    partner: 'Würth Group / SAP SE',
  },
  {
    code: 'IND',
    name: 'BWL - Industrie (B.A.)',
    fakultaet: 'Wirtschaft',
    standardKurs: 'IND 2023',
    partner: 'ebm-papst Mulfingen / Wittenstein SE',
  },
  {
    code: 'IB',
    name: 'BWL - International Business (B.A.)',
    fakultaet: 'Wirtschaft',
    standardKurs: 'IB 2024',
    partner: 'Würth Elektronik / BARTEC',
  },
  {
    code: 'GM',
    name: 'BWL - Gesundheitsmanagement (B.A.)',
    fakultaet: 'Wirtschaft',
    standardKurs: 'GM 2023',
    partner: 'Caritas-Krankenhaus Bad Mergentheim',
  },
  {
    code: 'FM',
    name: 'BWL - Food Management (B.A.)',
    fakultaet: 'Wirtschaft',
    standardKurs: 'FM 2024',
    partner: 'Pfeifer & Langen / Bäckerei Junge',
  },
  {
    code: 'INF',
    name: 'Angewandte Informatik (B.Sc.)',
    fakultaet: 'Technik',
    standardKurs: 'INF 2024',
    partner: 'Bechtle AG / Schwarz IT',
  },
  {
    code: 'MB',
    name: 'Maschinenbau (B.Eng.)',
    fakultaet: 'Technik',
    standardKurs: 'MB 2023',
    partner: 'Audi AG / Bosch Rexroth',
  },
  {
    code: 'WING',
    name: 'Wirtschaftsingenieurwesen (B.Eng.)',
    fakultaet: 'Technik',
    standardKurs: 'WING 2024',
    partner: 'Brose Gruppe / Festo',
  },
];

export const StudentProfileModal: React.FC<StudentProfileModalProps> = ({
  isOpen,
  currentUser,
  allStudents = [],
  onClose,
  onUpdateProfile,
  onSwitchUser,
}) => {
  const { language, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'profile' | 'dhbw_sync'>('profile');

  // Form states
  const [firstName, setFirstName] = useState(currentUser.firstName);
  const [lastName, setLastName] = useState(currentUser.lastName);
  const [matriculationNo, setMatriculationNo] = useState(currentUser.matriculationNo);
  const [course, setCourse] = useState(currentUser.course);
  const [role, setRole] = useState<UserRole>(currentUser.role);
  const [rfidUid, setRfidUid] = useState(currentUser.rfidUid);
  const [privacyMode, setPrivacyMode] = useState<PrivacyLevel>(currentUser.privacyMode);
  const [pseudonymLabel, setPseudonymLabel] = useState(currentUser.pseudonymLabel || '');

  // DHBW Auto-Fetch / Dualis Simulation
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastFetchedData, setLastFetchedData] = useState<{
    studiengang: string;
    kurs: string;
    fakultaet: string;
    semester: string;
    partner: string;
    role: UserRole;
    matriculation: string;
    authProvider: string;
    lastVerified: string;
  } | null>(null);

  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(false);

  // Sync state if currentUser changes
  React.useEffect(() => {
    setFirstName(currentUser.firstName);
    setLastName(currentUser.lastName);
    setMatriculationNo(currentUser.matriculationNo);
    setCourse(currentUser.course);
    setRole(currentUser.role);
    setRfidUid(currentUser.rfidUid);
    setPrivacyMode(currentUser.privacyMode);
    setPseudonymLabel(currentUser.pseudonymLabel || '');
    setSyncSuccessMessage(null);
  }, [currentUser]);

  if (!isOpen) return null;

  const currentCampus = DHBW_CAMPUSES.find((c) => c.id === currentUser.campusId) || DHBW_CAMPUSES[0];

  // Simuliert das Auslesen der offiziellen DHBW-Stammdaten über die Moodle / Dualis / SAML API
  const handleAutoSyncFromDhbw = () => {
    setIsSyncing(true);
    setSyncSuccessMessage(null);

    setTimeout(() => {
      let detectedCourse = 'Wirtschaftsinformatik (B.Sc.) - Kurs WWI 2024';
      let detectedKurs = 'WWI 2024';
      let detectedFakultaet = 'Fakultät Wirtschaft';
      let detectedRole: UserRole = 'student';
      let detectedPartner = 'Würth Group (Künzelsau / Bad Mergentheim)';
      let detectedSemester = '3. Fachsemester (Theoriephase)';

      // Erkennung basierend auf Nutzerdaten
      if (
        currentUser.email.includes('hartmann') ||
        currentUser.email.includes('keller') ||
        currentUser.email.includes('braun') ||
        role === 'employee'
      ) {
        detectedRole = 'employee';
        detectedCourse = 'Dozent / Wissenschaftlicher Mitarbeiter';
        detectedKurs = 'Lehrstuhl Wirtschaftsinformatik';
        detectedFakultaet = 'Fakultät Wirtschaft & Technik';
        detectedPartner = 'DHBW Bad Mergentheim / Mosbach (Angestellt)';
        detectedSemester = 'Lehrender / Fakultätsrat';
      } else if (currentUser.email.includes('bauer') || currentUser.course.toLowerCase().includes('industrie')) {
        detectedCourse = 'BWL - Industrie (B.A.)';
        detectedKurs = 'IND 2023';
        detectedFakultaet = 'Fakultät Wirtschaft';
        detectedPartner = 'ebm-papst Mulfingen GmbH & Co. KG';
        detectedSemester = '5. Fachsemester (Theoriephase)';
      } else if (currentUser.email.includes('kraemer') || currentUser.course.toLowerCase().includes('international')) {
        detectedCourse = 'BWL - International Business (B.A.)';
        detectedKurs = 'IB 2024';
        detectedFakultaet = 'Fakultät Wirtschaft';
        detectedPartner = 'Würth Elektronik eiSos';
        detectedSemester = '3. Fachsemester (Theoriephase)';
      } else if (currentUser.email.includes('zimmermann') || currentUser.course.toLowerCase().includes('gesundheit')) {
        detectedCourse = 'BWL - Gesundheitsmanagement (B.A.)';
        detectedKurs = 'GM 2023';
        detectedFakultaet = 'Fakultät Wirtschaft';
        detectedPartner = 'Caritas-Krankenhaus Bad Mergentheim';
        detectedSemester = '5. Fachsemester (Theoriephase)';
      } else if (currentUser.course.toLowerCase().includes('maschinenbau')) {
        detectedCourse = 'Maschinenbau (B.Eng.)';
        detectedKurs = 'MB 2023';
        detectedFakultaet = 'Fakultät Technik';
        detectedPartner = 'Wittenstein SE (Igersheim)';
        detectedSemester = '5. Fachsemester (Theoriephase)';
      }

      const fetched = {
        studiengang: detectedCourse,
        kurs: detectedKurs,
        fakultaet: detectedFakultaet,
        semester: detectedSemester,
        partner: detectedPartner,
        role: detectedRole,
        matriculation: currentUser.matriculationNo,
        authProvider: 'https://moodle.dhbw.de/simplesaml/ (SAML 2.0 Shibboleth SP)',
        lastVerified: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };

      setLastFetchedData(fetched);
      setCourse(`${fetched.studiengang} (${fetched.kurs})`);
      setRole(detectedRole);
      setIsSyncing(false);
      setSyncSuccessMessage(
        `Ausgelesen: ${fetched.studiengang} (${fetched.kurs}) · Partner: ${fetched.partner}`
      );
    }, 900);
  };

  const handleSelectPredefinedCourse = (studiengang: typeof DHBW_STUDIENGÄNGE[0]) => {
    setCourse(`${studiengang.name} (${studiengang.standardKurs})`);
    setRole('student');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const updatedStudent: Student = {
      ...currentUser,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      matriculationNo: matriculationNo.trim(),
      course: course.trim(),
      role,
      rfidUid: rfidUid.trim().toUpperCase(),
      privacyMode,
      pseudonymLabel:
        privacyMode === 'pseudonym'
          ? pseudonymLabel.trim() || `${firstName.trim()} ${lastName.trim()[0]}. (${course.split(' ')[0]})`
          : undefined,
    };

    onUpdateProfile(updatedStudent);
    setSaveSuccessMessage(true);
    setTimeout(() => {
      setSaveSuccessMessage(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 animate-in fade-in duration-200 max-h-[92vh] overflow-y-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              {firstName.charAt(0)}{lastName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 leading-tight">
                  {language === 'de' ? 'Mein DHBW Profil & Studiengang' : 'My DHBW Profile & Study Program'}
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200">
                  {role === 'employee' ? (language === 'de' ? 'Mitarbeiter' : 'Employee') : (language === 'de' ? 'Studierender' : 'Student')}
                </span>
              </div>
              <span className="text-xs text-slate-500">
                {currentUser.email} · {currentCampus.name}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick User Switcher for Testing */}
        {allStudents.length > 0 && onSwitchUser && (
          <div className="mt-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 text-xs">
            <span className="text-slate-500 font-medium flex items-center gap-1.5 shrink-0">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>{language === 'de' ? 'Profil wechseln:' : 'Switch user:'}</span>
            </span>
            <select
              value={currentUser.id}
              onChange={(e) => onSwitchUser(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1 text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-red-500 cursor-pointer w-full max-w-xs"
            >
              {allStudents.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.firstName} {st.lastName} ({st.role === 'employee' ? (language === 'de' ? 'Mitarbeiter' : 'Employee') : st.course})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Mode Switch Tabs */}
        <div className="mt-4 flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`flex-1 py-2.5 text-xs font-semibold text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'profile'
                ? 'border-red-600 text-red-700 bg-red-50/30'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>{language === 'de' ? 'Profil & Studiengang bearbeiten' : 'Edit Profile & Course'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('dhbw_sync')}
            className={`flex-1 py-2.5 text-xs font-semibold text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'dhbw_sync'
                ? 'border-red-600 text-red-700 bg-red-50/30'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-red-600" />
            <span>{language === 'de' ? 'DHBW Moodle / Dualis Ausleser' : 'DHBW Moodle / Dualis Reader'}</span>
          </button>
        </div>

        {/* Tab 1: Manual Profile & Course Editing */}
        {activeTab === 'profile' && (
          <form onSubmit={handleSave} className="mt-4 space-y-4">
            {/* Live Studiengang Banner */}
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-red-50 via-slate-50 to-slate-50 border border-red-100 flex items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 flex items-center gap-1">
                  <GraduationCap className="w-3.5 h-3.5 text-red-600" />
                  Aktuell hinterlegter Studiengang
                </span>
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  {course || 'Noch kein Studiengang gewählt'}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Wird bei Check-In und im Fitnessraum-Dashboard (anonymisierbar) angezeigt.
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('dhbw_sync');
                  handleAutoSyncFromDhbw();
                }}
                className="px-3 py-1.5 bg-white hover:bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-semibold shadow-2xs whitespace-nowrap transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3 text-red-600" />
                <span>Von DHBW auslesen</span>
              </button>
            </div>

            {/* Quick Studiengang Picker Buttons */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Studiengang schnell auswählen (DHBW Bad Mergentheim / Mosbach):
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {DHBW_STUDIENGÄNGE.map((stg) => {
                  const isSelected = course.includes(stg.name) || course.includes(stg.code);
                  return (
                    <button
                      key={stg.code}
                      type="button"
                      onClick={() => handleSelectPredefinedCourse(stg)}
                      className={`p-2 rounded-lg border text-left text-xs transition-all ${
                        isSelected
                          ? 'border-red-600 bg-red-50 font-bold text-red-950 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-red-600">{stg.code}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-red-600" />}
                      </div>
                      <div className="text-[11px] font-medium truncate mt-0.5" title={stg.name}>
                        {stg.name}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">{stg.fakultaet}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Input for Studiengang & Kurs */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Studiengang & Kurs frei bearbeiten:
              </label>
              <input
                type="text"
                required
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                placeholder="z.B. Wirtschaftsinformatik (WWI 2024)"
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>

            {/* Personal Details */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Vorname</label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Nachname</label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Status an der DHBW */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Status an der DHBW (Zutrittsberechtigung):
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setRole('student')}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    role === 'student'
                      ? 'border-red-600 bg-red-50 text-red-950 font-bold'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-red-600" />
                    <span>Studierender</span>
                  </div>
                  <div className="text-[10px] font-normal text-slate-500 mt-1">
                    Freier Zutritt (Mittwochs exklusiver Mitarbeiter-Tag)
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('employee')}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    role === 'employee'
                      ? 'border-red-600 bg-red-50 text-red-950 font-bold'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-red-600" />
                    <span>DHBW-Mitarbeiter</span>
                  </div>
                  <div className="text-[10px] font-normal text-slate-500 mt-1">
                    Täglicher Zutritt inklusive Mitarbeiter-Mittwoch
                  </div>
                </button>
              </div>
            </div>

            {/* Matrikelnummer & RFID Chip */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  {role === 'employee' ? 'Personalnummer' : 'Matrikelnummer'}
                </label>
                <input
                  type="text"
                  required
                  value={matriculationNo}
                  onChange={(e) => setMatriculationNo(e.target.value)}
                  className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Ausweis Chip-UID (RFID / NFC)
                </label>
                <div className="relative">
                  <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={rfidUid}
                    onChange={(e) => setRfidUid(e.target.value)}
                    placeholder="z.B. 3A:8F:12:0C"
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Privacy Mode */}
            <div className="pt-2 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Dashboard-Darstellung (DSGVO-Einstellung):
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setPrivacyMode('public')}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    privacyMode === 'public'
                      ? 'border-red-600 bg-red-50 text-red-950 font-bold'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  Vollname
                </button>
                <button
                  type="button"
                  onClick={() => setPrivacyMode('pseudonym')}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    privacyMode === 'pseudonym'
                      ? 'border-red-600 bg-red-50 text-red-950 font-bold'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  Pseudonym
                </button>
                <button
                  type="button"
                  onClick={() => setPrivacyMode('anonymous')}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    privacyMode === 'anonymous'
                      ? 'border-red-600 bg-red-50 text-red-950 font-bold'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  100% Anonym
                </button>
              </div>

              {privacyMode === 'pseudonym' && (
                <div className="mt-2.5">
                  <label className="text-[11px] text-slate-500 block mb-1">
                    Wunsch-Pseudonym für das Dashboard:
                  </label>
                  <input
                    type="text"
                    value={pseudonymLabel}
                    onChange={(e) => setPseudonymLabel(e.target.value)}
                    placeholder="z.B. DHBW Athlet #42"
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="pt-3 flex items-center justify-between border-t border-slate-100">
              {saveSuccessMessage && (
                <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{language === 'de' ? 'Profil & Studiengang gespeichert!' : 'Profile & Course saved!'}</span>
                </span>
              )}
              {!saveSuccessMessage && <span />}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  {language === 'de' ? 'Abbrechen' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{language === 'de' ? 'Profil speichern' : 'Save Profile'}</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Tab 2: DHBW Moodle & Dualis Live Reader */}
        {activeTab === 'dhbw_sync' && (
          <div className="mt-4 space-y-4">
            <div className="p-4 rounded-xl bg-slate-900 text-white">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-red-400">
                    <Database className="w-4 h-4" />
                    <span>DHBW Moodle & Dualis API Schnittstelle</span>
                  </div>
                  <h4 className="text-sm font-bold text-white mt-1">
                    Studiengangs- & Immatrikulationsabfrage
                  </h4>
                  <p className="text-xs text-slate-300 mt-1 max-w-lg leading-relaxed">
                    Liest über das DHBW Shibboleth/SAML-Authentifizierungs-Gateway die immatrikulierten Studiengangsdaten, Fachsemester und dualen Partnerunternehmen direkt aus dem zentralen Hochschulsystem aus.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAutoSyncFromDhbw}
                  disabled={isSyncing}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50 whitespace-nowrap self-start sm:self-auto cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>
                    {isSyncing
                      ? (language === 'de' ? 'Verbinde mit Moodle...' : 'Connecting to Moodle...')
                      : (language === 'de' ? 'Jetzt DHBW-Infos abfragen' : 'Fetch DHBW Info Now')}
                  </span>
                </button>
              </div>
            </div>

            {syncSuccessMessage && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium">{syncSuccessMessage}</span>
              </div>
            )}

            {/* Ausgelesene Stammdaten Preview */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-3">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-red-600" />
                  Ausgelesene Daten aus dem Hochschulregister
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  {lastFetchedData ? `Zuletzt: ${lastFetchedData.lastVerified}` : 'Noch nicht synchronisiert'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-white border border-slate-200">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                    Studiengang:
                  </span>
                  <span className="font-bold text-slate-900 text-sm mt-0.5 block">
                    {lastFetchedData?.studiengang || course}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Fakultät: {lastFetchedData?.fakultaet || 'Fakultät Wirtschaft'}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-white border border-slate-200">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                    Kurs & Kohorte:
                  </span>
                  <span className="font-bold text-slate-900 text-sm mt-0.5 block">
                    {lastFetchedData?.kurs || course.split(' ')[0]}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Phase: {lastFetchedData?.semester || 'Aktuell in Theoriephase am Campus'}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-white border border-slate-200">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                    Dualer Partnerbetrieb:
                  </span>
                  <span className="font-semibold text-slate-800 text-xs mt-0.5 block">
                    {lastFetchedData?.partner || 'Würth Group / Region Heilbronn-Franken'}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-white border border-slate-200">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                    Status & Rolle:
                  </span>
                  <span className="font-semibold text-emerald-700 text-xs mt-0.5 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {role === 'employee' ? 'Angestellter Mitarbeiter (DHBW)' : 'Aktiv immatrikuliert (Dualis)'}
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-[11px] text-slate-500 font-mono truncate max-w-xs">
                  SSO: https://moodle.dhbw.de/simplesaml/
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (lastFetchedData) {
                      setCourse(`${lastFetchedData.studiengang} (${lastFetchedData.kurs})`);
                    }
                    setActiveTab('profile');
                  }}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                >
                  <span>{language === 'de' ? 'In Profil übernehmen' : 'Apply to Profile'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
