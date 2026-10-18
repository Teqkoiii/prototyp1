import React, { useState } from 'react';
import {
  Users,
  ShieldCheck,
  ShieldAlert,
  CreditCard,
  Plus,
  Search,
  Check,
  Eye,
  EyeOff,
  UserCheck,
  AlertCircle,
  X,
} from 'lucide-react';
import { Student, PrivacyLevel, Campus } from '../types';

interface StudentsManagementProps {
  students: Student[];
  selectedCampus: Campus;
  onToggleBriefing: (studentId: string) => void;
  onUpdatePrivacy: (studentId: string, level: PrivacyLevel) => void;
  onAddStudent: (newStudent: Omit<Student, 'id'>) => void;
  onUpdateUid: (studentId: string, newUid: string) => void;
  onEditProfile?: (student: Student) => void;
}

export const StudentsManagement: React.FC<StudentsManagementProps> = ({
  students,
  selectedCampus,
  onToggleBriefing,
  onUpdatePrivacy,
  onAddStudent,
  onUpdateUid,
  onEditProfile,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBriefing, setFilterBriefing] = useState<'all' | 'briefed' | 'unbriefed'>('all');
  const [campusOnly, setCampusOnly] = useState<boolean>(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUidStudentId, setEditingUidStudentId] = useState<string | null>(null);
  const [newUidInput, setNewUidInput] = useState('');

  // New Student Form State
  const [newMatriculation, setNewMatriculation] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newCourse, setNewCourse] = useState('Wirtschaftsinformatik (WWI)');
  const [newRfid, setNewRfid] = useState('7E:88:91:02');
  const [newHasBriefing, setNewHasBriefing] = useState(false);
  const [formError, setFormError] = useState('');

  const filteredStudents = students.filter((s) => {
    if (campusOnly && s.campusId !== selectedCampus.id) {
      return false;
    }

    const matchesSearch =
      s.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.matriculationNo.includes(searchQuery) ||
      s.rfidUid.toLowerCase().includes(searchQuery.toLowerCase());

    if (filterBriefing === 'briefed') return matchesSearch && s.safetyBriefingCompleted;
    if (filterBriefing === 'unbriefed') return matchesSearch && !s.safetyBriefingCompleted;
    return matchesSearch;
  });

  const handleCreateStudent = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const emailTrimmed = newEmail.trim().toLowerCase();
    // DHBW E-Mail Validierung
    if (
      !emailTrimmed.endsWith('@badmergentheim.dhbw.de') &&
      !emailTrimmed.endsWith('@dhbw-mosbach.de') &&
      !emailTrimmed.endsWith('@dhbw.de')
    ) {
      setFormError('Ungültige E-Mail: Nur offizielle DHBW-Adressen (@badmergentheim.dhbw.de) sind zugelassen.');
      return;
    }

    if (!newMatriculation.trim() || !newFirstName.trim() || !newLastName.trim()) {
      setFormError('Bitte fülle alle Pflichtfelder aus.');
      return;
    }

    // UID Format Check
    const rfidFormatted = newRfid.trim().toUpperCase();

    onAddStudent({
      campusId: selectedCampus.id,
      role:
        emailTrimmed.includes('prof') ||
        emailTrimmed.includes('hartmann') ||
        emailTrimmed.includes('mitarbeiter') ||
        emailTrimmed.includes('dozent')
          ? 'employee'
          : 'student',
      matriculationNo: newMatriculation.trim(),
      firstName: newFirstName.trim(),
      lastName: newLastName.trim(),
      email: emailTrimmed,
      rfidUid: rfidFormatted,
      safetyBriefingCompleted: newHasBriefing,
      safetyBriefingDate: newHasBriefing ? new Date().toISOString().split('T')[0] : undefined,
      safetyBriefingInstructor: newHasBriefing ? 'Prof. Dr. Hartmann (Sportbeauftragter)' : undefined,
      course: newCourse,
      privacyMode: 'public',
      pseudonymLabel: `${newFirstName.trim()} ${newLastName.trim()[0]}.`,
      cardActive: true,
    });

    setShowAddModal(false);
    // Reset form
    setNewMatriculation('');
    setNewFirstName('');
    setNewLastName('');
    setNewEmail('');
  };

  const handleSaveUid = (studentId: string) => {
    if (newUidInput.trim()) {
      onUpdateUid(studentId, newUidInput.trim().toUpperCase());
    }
    setEditingUidStudentId(null);
    setNewUidInput('');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-red-600" />
            Studierenden- & Einweisungsverwaltung
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Zutrittskontrolle für den Fitnessraum: Nur Studierende mit geprüfter DHBW-Identität und Sicherheitseinweisung erhalten Türzugang.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs whitespace-nowrap self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Neuen Studi registrieren</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Name, Matrikelnr, RFID suchen..."
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 focus:ring-2 focus:ring-red-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg self-stretch sm:self-auto">
          <button
            onClick={() => setFilterBriefing('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              filterBriefing === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Alle ({students.length})
          </button>
          <button
            onClick={() => setFilterBriefing('briefed')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              filterBriefing === 'briefed'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Freigeschaltet ({students.filter((s) => s.safetyBriefingCompleted).length})
          </button>
          <button
            onClick={() => setFilterBriefing('unbriefed')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              filterBriefing === 'unbriefed'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Ausstehend ({students.filter((s) => !s.safetyBriefingCompleted).length})
          </button>

          <button
            onClick={() => setCampusOnly(!campusOnly)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors border ${
              campusOnly ? 'bg-red-50 text-red-900 border-red-200 font-semibold' : 'bg-white text-slate-700 border-slate-200 shadow-xs'
            }`}
          >
            {campusOnly ? `Nur ${selectedCampus.shortName}` : 'Alle Standorte'}
          </button>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-5 py-3 font-semibold">Studierender</th>
                <th className="px-5 py-3 font-semibold">Studiengang</th>
                <th className="px-5 py-3 font-semibold">Ausweis-UID (RFID)</th>
                <th className="px-5 py-3 font-semibold">Sicherheitseinweisung</th>
                <th className="px-5 py-3 font-semibold">Privatsphäre</th>
                <th className="px-5 py-3 font-semibold text-right">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map((student) => (
                <tr key={student.id} className="hover:bg-slate-50/70 transition-colors">
                  {/* Name and matriculation */}
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-slate-900">
                      {student.firstName} {student.lastName}
                    </div>
                    <div className="text-slate-500 text-[11px] font-mono mt-0.5">
                      Matr. {student.matriculationNo} · {student.email}
                    </div>
                  </td>

                  {/* Course */}
                  <td className="px-5 py-3.5 text-slate-600">
                    {student.course}
                  </td>

                  {/* RFID UID */}
                  <td className="px-5 py-3.5">
                    {editingUidStudentId === student.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={newUidInput}
                          onChange={(e) => setNewUidInput(e.target.value)}
                          placeholder="z.B. 3A:8F:12:0C"
                          className="font-mono text-xs border border-slate-300 rounded px-2 py-1 w-28 bg-white"
                        />
                        <button
                          onClick={() => handleSaveUid(student.id)}
                          className="px-2 py-1 bg-slate-900 text-white rounded text-[11px] font-medium"
                        >
                          OK
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-700 font-medium">
                          {student.rfidUid}
                        </span>
                        <button
                          onClick={() => {
                            setEditingUidStudentId(student.id);
                            setNewUidInput(student.rfidUid);
                          }}
                          className="text-[11px] text-slate-400 hover:text-slate-700 underline"
                        >
                          Neu verknüpfen
                        </button>
                      </div>
                    )}
                  </td>

                  {/* Briefing Status */}
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => onToggleBriefing(student.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium text-xs border transition-colors ${
                        student.safetyBriefingCompleted
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                      }`}
                      title="Klicken zum Umschalten"
                    >
                      {student.safetyBriefingCompleted ? (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Absolviert ({student.safetyBriefingDate || 'bestätigt'})</span>
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                          <span>Ausstehend (Gesperrt)</span>
                        </>
                      )}
                    </button>
                  </td>

                  {/* Privacy settings */}
                  <td className="px-5 py-3.5">
                    <select
                      value={student.privacyMode}
                      onChange={(e) => onUpdatePrivacy(student.id, e.target.value as PrivacyLevel)}
                      className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-slate-700 focus:outline-none"
                    >
                      <option value="public">Vollname öffentlich</option>
                      <option value="pseudonym">Pseudonym ({student.pseudonymLabel || 'Studi'})</option>
                      <option value="anonymous">100% Anonym</option>
                    </select>
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      {onEditProfile && (
                        <button
                          onClick={() => onEditProfile(student)}
                          className="px-2 py-1 text-xs text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded font-medium transition-colors"
                          title="Profil bearbeiten oder Studiengang auslesen"
                        >
                          Profil / DHBW-Info
                        </button>
                      )}
                      <button
                        onClick={() => onToggleBriefing(student.id)}
                        className="text-xs text-slate-600 hover:text-slate-900 font-medium px-2 py-1 rounded hover:bg-slate-100"
                      >
                        {student.safetyBriefingCompleted ? 'Sperren' : 'Freischalten'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Neuen Studierenden anlegen */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                Neuen Studierenden registrieren
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStudent} className="mt-4 space-y-3.5">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Vorname</label>
                  <input
                    type="text"
                    required
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    placeholder="z.B. Jonas"
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Nachname</label>
                  <input
                    type="text"
                    required
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    placeholder="z.B. Schmidt"
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  DHBW E-Mail-Adresse
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="name@badmergentheim.dhbw.de"
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Erfordert @badmergentheim.dhbw.de oder @dhbw-mosbach.de
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Matrikelnummer</label>
                  <input
                    type="text"
                    required
                    value={newMatriculation}
                    onChange={(e) => setNewMatriculation(e.target.value)}
                    placeholder="z.B. 7240182"
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Studiengang</label>
                  <select
                    value={newCourse}
                    onChange={(e) => setNewCourse(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-red-500 focus:outline-none"
                  >
                    <option value="Wirtschaftsinformatik (WWI)">Wirtschaftsinformatik</option>
                    <option value="BWL-Industrie">BWL-Industrie</option>
                    <option value="International Business">International Business</option>
                    <option value="BWL-Gesundheitsmanagement">BWL-Gesundheit</option>
                    <option value="Wirtschaftsingenieurwesen">Wirtschaftsingenieur</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  DHBW-Ausweis RFID UID
                </label>
                <input
                  type="text"
                  value={newRfid}
                  onChange={(e) => setNewRfid(e.target.value)}
                  placeholder="z.B. 3A:8F:12:0C"
                  className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newHasBriefing}
                    onChange={(e) => setNewHasBriefing(e.target.checked)}
                    className="rounded text-red-600 focus:ring-red-500"
                  />
                  <span className="font-medium">
                    Sicherheitseinweisung bereits persönlich absolviert
                  </span>
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-xs"
                >
                  Registrieren & Speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
