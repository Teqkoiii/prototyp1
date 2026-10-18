import React from 'react';
import { Activity, ShieldCheck, Cpu, BookOpen, MapPin, Globe } from 'lucide-react';
import { Campus, CampusId, OccupancyStatus, Student } from '../types';
import { useLanguage } from '../context/LanguageContext';

interface HeaderProps {
  activeTab: 'dashboard' | 'hardware' | 'students' | 'concept';
  setActiveTab: (tab: 'dashboard' | 'hardware' | 'students' | 'concept') => void;
  occupancyCount: number;
  status: OccupancyStatus;
  selectedCampus: Campus;
  campuses: Campus[];
  currentUser: Student;
  allStudents?: Student[];
  onSelectCampus: (campusId: CampusId) => void;
  onOpenProfile: () => void;
  onQuickScan: () => void;
  onSwitchUser?: (studentId: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  occupancyCount,
  status,
  selectedCampus,
  campuses,
  currentUser,
  allStudents = [],
  onSelectCampus,
  onOpenProfile,
  onQuickScan,
  onSwitchUser,
}) => {
  const { language, setLanguage, t } = useLanguage();

  const statusColorClass =
    status === 'green'
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : status === 'yellow'
      ? 'text-amber-700 bg-amber-50 border-amber-200'
      : 'text-rose-700 bg-rose-50 border-rose-200';

  const statusLabel =
    status === 'green'
      ? t.statusFree.split('/')[0].trim()
      : status === 'yellow'
      ? t.statusModerate
      : t.statusBusy.split('(')[0].trim();

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 h-16">
          {/* Zone 1: Single text wordmark & Campus Picker */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setActiveTab('dashboard')}
              className="text-left group flex items-center gap-2.5 focus:outline-none cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-red-600 text-white flex items-center justify-center font-bold text-sm tracking-tight shadow-sm">
                DH
              </div>
              <div className="hidden sm:block">
                <span className="text-base font-bold tracking-tight text-slate-900 block leading-tight">
                  {t.appTitle}
                </span>
                <span className="text-[11px] text-slate-500">
                  {t.appSubtitle}
                </span>
              </div>
            </button>

            {/* University / Campus Selector Dropdown */}
            <div className="relative ml-1 sm:ml-2">
              <label htmlFor="campus-select" className="sr-only">{t.campusSelect}</label>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 border border-slate-200 transition-colors">
                <MapPin className="w-3.5 h-3.5 text-red-600 shrink-0" />
                <select
                  id="campus-select"
                  value={selectedCampus.id}
                  onChange={(e) => onSelectCampus(e.target.value as CampusId)}
                  className="text-xs font-semibold text-slate-900 bg-transparent border-none pr-3 focus:outline-none cursor-pointer"
                >
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Zone 2: Navigation links */}
          <nav className="hidden lg:flex items-center gap-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              {t.tabLive}
            </button>

            <button
              onClick={() => setActiveTab('hardware')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'hardware'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              {t.tabDoor}
            </button>

            <button
              onClick={() => setActiveTab('students')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'students'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {t.tabStudents}
            </button>

            <button
              onClick={() => setActiveTab('concept')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'concept'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              {t.tabConcept}
            </button>
          </nav>

          {/* Zone 3: Live Count, Language Switcher, Profile & Primary Action */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Live Count Badge */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${statusColorClass}`}
            >
              <span className="font-mono tabular-nums font-bold">
                {occupancyCount} {t.activeBadge}
              </span>
              <span>·</span>
              <span>{statusLabel}</span>
            </div>

            {/* Language Switcher for International Students */}
            <div className="flex items-center rounded-lg bg-slate-100 border border-slate-200 p-0.5" title={t.languageSelect}>
              <button
                onClick={() => setLanguage('de')}
                className={`px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                  language === 'de'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Deutsch"
              >
                <span>🇩🇪</span>
                <span className="hidden sm:inline">DE</span>
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                  language === 'en'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="English (for international students)"
              >
                <span>🇬🇧</span>
                <span className="hidden sm:inline">EN</span>
              </button>
            </div>

            {/* Mein Profil Button */}
            <button
              onClick={onOpenProfile}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors border border-slate-200 group cursor-pointer"
              title={t.myProfile}
            >
              <div className="w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                {currentUser.firstName.charAt(0)}{currentUser.lastName.charAt(0)}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-[11px] font-bold text-slate-900 leading-tight">
                  {currentUser.firstName} {currentUser.lastName[0]}.
                </div>
                <div className="text-[10px] text-red-700 font-medium truncate max-w-[110px]" title={currentUser.course}>
                  {currentUser.course.split(' ')[0]} {currentUser.course.includes('20') ? (currentUser.course.match(/20\d\d/)?.[0] || '') : ''}
                </div>
              </div>
            </button>

            <button
              onClick={onQuickScan}
              className="px-3 py-2 sm:px-3.5 sm:py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-xs whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{t.scanCard}</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="lg:hidden flex items-center justify-around py-2 border-t border-slate-100 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-2.5 py-1 rounded font-medium whitespace-nowrap cursor-pointer ${
              activeTab === 'dashboard' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            {t.tabLive}
          </button>
          <button
            onClick={() => setActiveTab('hardware')}
            className={`px-2.5 py-1 rounded font-medium whitespace-nowrap cursor-pointer ${
              activeTab === 'hardware' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            {t.tabDoor}
          </button>
          <button
            onClick={() => setActiveTab('students')}
            className={`px-2.5 py-1 rounded font-medium whitespace-nowrap cursor-pointer ${
              activeTab === 'students' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            {t.tabStudents}
          </button>
          <button
            onClick={() => setActiveTab('concept')}
            className={`px-2.5 py-1 rounded font-medium whitespace-nowrap cursor-pointer ${
              activeTab === 'concept' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            {t.tabConcept}
          </button>
        </div>
      </div>
    </header>
  );
};
