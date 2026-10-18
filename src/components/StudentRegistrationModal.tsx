import React, { useState } from 'react';
import {
  Mail,
  ShieldCheck,
  CheckCircle2,
  KeyRound,
  ArrowRight,
  AlertCircle,
  X,
  CreditCard,
  User,
  GraduationCap,
  Lock,
  Globe,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { Student, PrivacyLevel, Campus, CampusId } from '../types';
import { DHBW_CAMPUSES } from '../data/mockDatabase';

interface StudentRegistrationModalProps {
  isOpen: boolean;
  selectedCampus: Campus;
  onClose: () => void;
  onRegisterSuccess: (student: Student) => void;
}

export const StudentRegistrationModal: React.FC<StudentRegistrationModalProps> = ({
  isOpen,
  selectedCampus,
  onClose,
  onRegisterSuccess,
}) => {
  const [authMode, setAuthMode] = useState<'sso' | 'manual'>('sso');
  const [step, setStep] = useState<'form' | 'sso_discovery' | 'sso_login' | 'verify' | 'completed'>('form');

  const [chosenCampusId, setChosenCampusId] = useState<CampusId>(selectedCampus.id);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [matriculationNo, setMatriculationNo] = useState('');
  const [course, setCourse] = useState('Wirtschaftsinformatik (WWI)');
  const [rfidUid, setRfidUid] = useState('4B:11:9F:82');
  const [privacyMode, setPrivacyMode] = useState<PrivacyLevel>('pseudonym');

  // SSO specific state
  const [ssoUsername, setSsoUsername] = useState('s7192841');
  const [ssoPassword, setSsoPassword] = useState('••••••••••••');
  const [ssoLoading, setSsoLoading] = useState(false);

  // Manual code state
  const [verificationCode, setVerificationCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [acceptedDsgvo, setAcceptedDsgvo] = useState(true);

  if (!isOpen) return null;

  const chosenCampus = DHBW_CAMPUSES.find((c) => c.id === chosenCampusId) || selectedCampus;

  // Handler for DHBW SSO Login
  const handleSsoAuthenticate = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSsoLoading(true);

    // Simulate SAML 2.0 Auth Assertion from moodle.dhbw.de / SimpleSAMLphp
    setTimeout(() => {
      setSsoLoading(false);

      // Pre-fill student attributes returned by DHBW SAML IdP
      const extractedFirst = firstName.trim() || 'Lukas';
      const extractedLast = lastName.trim() || 'Sommer';
      const extractedMatr = matriculationNo.trim() || '7241908';
      const extractedEmail = email.trim() || `${extractedFirst.toLowerCase()}.${extractedLast.toLowerCase()}@${chosenCampus.id === 'dhbw-mgt' ? 'badmergentheim.' : ''}dhbw.de`;

      const newStudent: Student = {
        id: `stud-${Date.now()}`,
        campusId: chosenCampusId,
        role: 'student',
        matriculationNo: extractedMatr,
        firstName: extractedFirst,
        lastName: extractedLast,
        email: extractedEmail,
        rfidUid: rfidUid.trim().toUpperCase(),
        safetyBriefingCompleted: false, // Erst nach Sicherheitsbelehrung freigeschaltet
        course,
        privacyMode,
        pseudonymLabel: `${extractedFirst} ${extractedLast[0]}. (${course.split(' ')[0]})`,
        cardActive: true,
      };

      onRegisterSuccess(newStudent);
      setStep('completed');
    }, 900);
  };

  const handleSendVerification = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanEmail = email.trim().toLowerCase();
    const isDhbwEmail =
      cleanEmail.endsWith('@badmergentheim.dhbw.de') ||
      cleanEmail.endsWith('@dhbw-mosbach.de') ||
      cleanEmail.endsWith('@heilbronn.dhbw.de') ||
      cleanEmail.endsWith('@dhbw-stuttgart.de') ||
      cleanEmail.endsWith('@dhbw.de');

    if (!isDhbwEmail) {
      setErrorMessage(
        'Zugang verweigert: Bitte gib deine offizielle DHBW-E-Mail-Adresse deiner Hochschule an (z. B. vorname.nachname@badmergentheim.dhbw.de).'
      );
      return;
    }

    if (!acceptedDsgvo) {
      setErrorMessage('Bitte bestätige die DSGVO-Datenschutzhinweise zur Nutzung des Fitnessraums.');
      return;
    }

    // Generiere 6-stelligen Verifizierungscode
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedCode(code);
    setStep('verify');
  };

  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (verificationCode.trim() !== generatedCode) {
      setErrorMessage('Der eingegebene Verifizierungscode ist ungültig. Bitte prüfe den 6-stelligen Code.');
      return;
    }

    const newStudent: Student = {
      id: `stud-${Date.now()}`,
      campusId: chosenCampusId,
      role: email.toLowerCase().includes('dozent') || email.toLowerCase().includes('mitarbeiter') || email.toLowerCase().includes('prof') ? 'employee' : 'student',
      matriculationNo: matriculationNo.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      rfidUid: rfidUid.trim().toUpperCase(),
      safetyBriefingCompleted: false,
      course,
      privacyMode,
      pseudonymLabel: `${firstName.trim()} ${lastName.trim()[0]}. (${course.split(' ')[0]})`,
      cardActive: true,
    };

    onRegisterSuccess(newStudent);
    setStep('completed');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 animate-in fade-in duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-red-600 text-white flex items-center justify-center font-bold text-xs">
              DH
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-tight">
                DHBW Authentifizierung
              </h3>
              <span className="text-[11px] text-slate-500">
                Single Sign-On (Shibboleth / SimpleSAML) & Registrierung
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher: DHBW SSO vs. Manuelle Verifikation */}
        {step !== 'completed' && (
          <div className="mt-4 flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs">
            <button
              onClick={() => {
                setAuthMode('sso');
                setStep('sso_login');
              }}
              className={`flex-1 py-1.5 font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                authMode === 'sso'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Globe className="w-3.5 h-3.5 text-red-600" />
              <span>DHBW Login (SSO / Moodle)</span>
            </button>
            <button
              onClick={() => {
                setAuthMode('manual');
                setStep('form');
              }}
              className={`flex-1 py-1.5 font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                authMode === 'manual'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mail className="w-3.5 h-3.5 text-slate-500" />
              <span>E-Mail-Verifikation</span>
            </button>
          </div>
        )}

        {/* MODE 1: DHBW SSO LOGIN (SimpleSAML / Shibboleth Federation) */}
        {authMode === 'sso' && step !== 'completed' && (
          <form onSubmit={handleSsoAuthenticate} className="mt-4 space-y-4">
            <div className="p-3.5 rounded-lg bg-red-50/70 border border-red-100 text-xs text-red-950">
              <div className="font-bold flex items-center gap-1.5 text-red-800 mb-1">
                <Globe className="w-3.5 h-3.5 text-red-600" />
                <span>Zentrales DHBW Identity Management (DFN-AAI)</span>
              </div>
              <p className="text-slate-700 leading-relaxed text-[11px]">
                Melde dich direkt mit deiner bekannten <strong>DHBW-Benutzerkennung</strong> an – genau wie bei Moodle (<code>moodle.dhbw.de/simplesaml</code>) oder Dualis. Deine Immatrikulation wird dabei sofort kryptografisch bestätigt.
              </p>
            </div>

            {/* University / IdP Selection */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Dein DHBW-Standort (Identity Provider):
              </label>
              <select
                value={chosenCampusId}
                onChange={(e) => setChosenCampusId(e.target.value as CampusId)}
                className="w-full text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-red-500 focus:outline-none"
              >
                {DHBW_CAMPUSES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.city})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  DHBW-Kürzel / Benutzerkennung
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={ssoUsername}
                    onChange={(e) => setSsoUsername(e.target.value)}
                    placeholder="z.B. s7192841"
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Hochschul-Passwort
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={ssoPassword}
                    onChange={(e) => setSsoPassword(e.target.value)}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Vorname</label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="z.B. Lukas"
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
                  placeholder="z.B. Sommer"
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Ausweis Chip UID */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                DHBW-Studierendenausweis Chip-UID (RFID / NFC)
              </label>
              <div className="relative">
                <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={rfidUid}
                  onChange={(e) => setRfidUid(e.target.value)}
                  placeholder="z.B. 4B:11:9F:82"
                  className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                Deine Kartennummer wird direkt mit deinem DHBW-Account verknüpft.
              </span>
            </div>

            {/* Privacy settings */}
            <div className="pt-2 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Privatsphäre im Live-Dashboard:
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setPrivacyMode('public')}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    privacyMode === 'public'
                      ? 'border-red-600 bg-red-50 text-red-900 font-bold'
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
                      ? 'border-red-600 bg-red-50 text-red-900 font-bold'
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
                      ? 'border-red-600 bg-red-50 text-red-900 font-bold'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  100% Anonym
                </button>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-between border-t border-slate-100">
              <span className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                SAML 2.0 SSL
              </span>

              <button
                type="submit"
                disabled={ssoLoading}
                className="px-4 py-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                {ssoLoading ? (
                  <span>Überprüfe DHBW SAML Assertion...</span>
                ) : (
                  <>
                    <span>Über DHBW Single Sign-On anmelden</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* MODE 2: MANUELLE E-MAIL REGISTRIERUNG */}
        {authMode === 'manual' && step === 'form' && (
          <form onSubmit={handleSendVerification} className="mt-4 space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed">
              Alternativ kannst du dich mit deiner offiziellen DHBW-E-Mail-Adresse und einem Einmal-Code registrieren.
            </p>

            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Deine Hochschule / Campus
              </label>
              <select
                value={chosenCampusId}
                onChange={(e) => setChosenCampusId(e.target.value as CampusId)}
                className="w-full text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-red-500 focus:outline-none"
              >
                {DHBW_CAMPUSES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.city})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Vorname</label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="z.B. Lukas"
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
                  placeholder="z.B. Sommer"
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Offizielle DHBW E-Mail-Adresse
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@badmergentheim.dhbw.de"
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Matrikelnummer</label>
                <input
                  type="text"
                  required
                  value={matriculationNo}
                  onChange={(e) => setMatriculationNo(e.target.value)}
                  placeholder="z.B. 7234910"
                  className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Studiengang</label>
                <select
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-red-500 focus:outline-none"
                >
                  <option value="Wirtschaftsinformatik (WWI)">Wirtschaftsinformatik</option>
                  <option value="BWL-Industrie">BWL-Industrie</option>
                  <option value="International Business">International Business</option>
                  <option value="BWL-Gesundheitsmanagement">BWL-Gesundheit</option>
                  <option value="BWL-Dienstleistungsmanagement">BWL-Dienstleistung</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Ausweis Chip-UID
              </label>
              <input
                type="text"
                required
                value={rfidUid}
                onChange={(e) => setRfidUid(e.target.value)}
                placeholder="z.B. 4B:11:9F:82"
                className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>

            <div className="pt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <span>Code anfordern</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        )}

        {/* Step: Code Verification */}
        {authMode === 'manual' && step === 'verify' && (
          <form onSubmit={handleVerifyCode} className="mt-4 space-y-4">
            <div className="p-3.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 text-xs">
              <div className="font-semibold mb-1">Verifizierungscode gesendet!</div>
              <div>
                Ein 6-stelliger Bestätigungscode wurde an <strong>{email}</strong> gesendet.
              </div>
              <div className="mt-2 text-[11px] font-mono bg-white p-2 rounded border border-sky-200 text-sky-900 flex justify-between items-center">
                <span>Simulierter Posteingang:</span>
                <span className="font-bold text-sm tracking-widest text-red-600">{generatedCode}</span>
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                6-stelligen Verifizierungscode eingeben:
              </label>
              <input
                type="text"
                maxLength={6}
                required
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder="z.B. 123456"
                className="w-full text-base font-mono tracking-widest text-center bg-slate-50 border border-slate-300 rounded-lg py-2.5 focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>

            <div className="pt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep('form')}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Zurück
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <span>Code bestätigen</span>
                <CheckCircle2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        )}

        {/* Step: Completed */}
        {step === 'completed' && (
          <div className="mt-4 text-center space-y-4 py-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div>
              <h4 className="text-base font-bold text-slate-900">
                Erfolgreich über DHBW Single Sign-On authentifiziert!
              </h4>
              <p className="text-xs text-slate-600 mt-1 max-w-sm mx-auto">
                Deine DHBW-Identität wurde verifiziert und dein Ausweis <code>{rfidUid}</code> ist im System registriert.
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs text-left">
              <div className="font-semibold flex items-center gap-1.5 mb-1">
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                Nächster Schritt vor dem ersten Training:
              </div>
              <p className="leading-relaxed text-[11px]">
                Um die Tür öffnen zu können, muss einmalig die 15-minütige <strong>Sicherheitseinweisung</strong> absolviert und vom Sportbeauftragten bestätigt werden.
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-full py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
            >
              Zum Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
