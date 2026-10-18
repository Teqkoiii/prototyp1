import React, { useMemo, useState } from 'react';
import {
  Users,
  Clock,
  MapPin,
  ShieldCheck,
  AlertTriangle,
  Zap,
  ArrowRight,
  Sparkles,
  Info,
  LogOut,
  Radio,
  CreditCard,
  TrendingUp,
  BarChart3,
  Activity,
  Infinity as InfinityIcon,
  User,
  RefreshCw,
  GraduationCap,
  Flame,
  CheckCircle2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { GymState, ActiveCheckIn, Student, AccessLog, Campus, OccupancyStatus } from '../types';
import { TYPICAL_HOURLY_DISTRIBUTION } from '../data/mockDatabase';
import { useLanguage } from '../context/LanguageContext';

interface DashboardViewProps {
  gymState: GymState;
  checkIns: ActiveCheckIn[];
  students: Student[];
  logs: AccessLog[];
  selectedCampus: Campus;
  currentUser?: Student;
  onOpenProfile?: () => void;
  onTriggerCheckOut: (studentId: string) => void;
  onOpenHardwareSimulator: () => void;
  onOpenStudentBriefings: () => void;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    payload: {
      time: string;
      fullTime: string;
      occupancy: number;
      comfortGuide: number;
      events: number;
      isCurrent: boolean;
      isPeak: boolean;
    };
  }>;
  language: 'de' | 'en';
}

const SimpleLineChartTooltip: React.FC<CustomTooltipProps> = ({ active, payload, language }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const count = data.occupancy;
    const isDe = language === 'de';

    let statusLabel = isDe ? 'Viel Platz / Frei' : 'Plenty of Space / Free';
    let statusClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    let tipText = isDe
      ? 'Ideale Trainingszeit: Alle Racks, Hanteln und Kardiogeräte sind frei.'
      : 'Optimal workout time: All racks, dumbbells and cardio gear are available.';

    if (count >= 13) {
      statusLabel = isDe ? 'Hauptstoßzeit (Sehr voll)' : 'Peak Rush Hour (Very busy)';
      statusClass = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      tipText = isDe
        ? 'Hoher Andrang: Kurze Wartezeiten an Kniebeugenständern und Bänken möglich.'
        : 'High demand: Short waits possible at squat racks and benches.';
    } else if (count >= 9) {
      statusLabel = isDe ? 'Stoßzeit (Gut besucht)' : 'Busy (Rush hour)';
      statusClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      tipText = isDe
        ? 'Moderat belebt: Die meisten Geräte sind nach kurzer Abstimmung nutzbar.'
        : 'Moderately busy: Most equipment readily usable.';
    }

    return (
      <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-xl shadow-2xl border border-slate-700 text-xs font-sans min-w-[210px] pointer-events-none">
        <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-800">
          <span className="font-semibold text-slate-200">{data.fullTime}</span>
          {data.isCurrent && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-600 text-white font-bold uppercase tracking-wider animate-pulse">
              {isDe ? 'Jetzt' : 'Now'}
            </span>
          )}
        </div>

        <div className="mt-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">{isDe ? 'Auslastung:' : 'Occupancy:'}</span>
            <span className="font-bold font-mono tabular-nums text-base text-white">
              {count} {isDe ? 'Personen' : 'people'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-400">{isDe ? 'Kategorie:' : 'Category:'}</span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${statusClass}`}>
              {statusLabel}
            </span>
          </div>

          <p className="text-[11px] text-slate-300 pt-1.5 border-t border-slate-800/80 leading-snug">
            {tipText}
          </p>

          {data.events > 0 && (
            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/60">
              <span>{isDe ? 'Scans in dieser Stunde:' : 'Scans in this hour:'}</span>
              <span className="font-mono text-emerald-400">{data.events}</span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: {
    occupancy: number;
    isCurrent: boolean;
    isPeak: boolean;
  };
  highlightPeaks: boolean;
}

const CustomLineDot: React.FC<DotProps> = ({ cx, cy, payload, highlightPeaks }) => {
  if (cx === undefined || cy === undefined || !payload) return null;

  // Current hour marker (now)
  if (payload.isCurrent) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={9} fill="#DC2626" fillOpacity={0.25} className="animate-ping" />
        <circle cx={cx} cy={cy} r={6} fill="#DC2626" stroke="#FFFFFF" strokeWidth={2.5} />
      </g>
    );
  }

  // Peak hour dot highlight
  if (highlightPeaks && payload.isPeak) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={5.5} fill="#DC2626" stroke="#FFFFFF" strokeWidth={2} />
      </g>
    );
  }

  // Standard subtle dot
  return <circle cx={cx} cy={cy} r={2.5} fill="#FFFFFF" stroke="#DC2626" strokeWidth={1.5} />;
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  gymState,
  checkIns,
  students,
  logs,
  selectedCampus,
  currentUser,
  onOpenProfile,
  onTriggerCheckOut,
  onOpenHardwareSimulator,
  onOpenStudentBriefings,
}) => {
  const { language, t } = useLanguage();
  const [highlightPeaks, setHighlightPeaks] = useState(true);

  // Filter active visitors and logs specifically for the selected campus
  const campusCheckIns = checkIns.filter((c) => c.campusId === selectedCampus.id);
  const campusLogs = logs.filter((l) => l.campusId === selectedCampus.id);
  const campusStudents = students.filter((s) => s.campusId === selectedCampus.id);

  const currentCount = campusCheckIns.length;
  const comfortGuide = selectedCampus.comfortGuide || 15;

  let statusText = t.statusFree;
  let statusSubtext = t.statusFreeSub;
  let badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  let progressColor = 'bg-emerald-500';

  if (currentCount >= 13) {
    statusText = t.statusBusy;
    statusSubtext = t.statusBusySub;
    badgeColor = 'bg-rose-50 text-rose-700 border-rose-200';
    progressColor = 'bg-rose-600';
  } else if (currentCount >= 9) {
    statusText = t.statusModerate;
    statusSubtext = t.statusModerateSub;
    badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
    progressColor = 'bg-amber-500';
  }

  // Calculate 24-hour occupancy trends using existing access logs data + hourly baseline
  const usageTrendsData = useMemo(() => {
    const points = [];
    const now = new Date();

    for (let i = 23; i >= 0; i--) {
      const bucketTime = new Date(now.getTime() - i * 3600 * 1000);
      const hourNum = bucketTime.getHours();
      const hourLabel = `${hourNum.toString().padStart(2, '0')}:00`;

      // Filter access logs matching this specific hour for this campus
      const bucketLogs = campusLogs.filter((l) => {
        const logTime = new Date(l.timestamp);
        return (
          logTime.getFullYear() === bucketTime.getFullYear() &&
          logTime.getMonth() === bucketTime.getMonth() &&
          logTime.getDate() === bucketTime.getDate() &&
          logTime.getHours() === hourNum
        );
      });

      // Realistic baseline by campus lecture block
      let baseline = 0;
      if (hourNum >= 6 && hourNum <= 22) {
        if (hourNum === 7) baseline = 4;
        else if (hourNum === 8) baseline = 3;
        else if (hourNum >= 9 && hourNum <= 11) baseline = 2;
        else if (hourNum === 12) baseline = 7;
        else if (hourNum === 13) baseline = 8;
        else if (hourNum >= 14 && hourNum <= 16) baseline = 4 + (hourNum - 14);
        else if (hourNum === 17) baseline = 12;
        else if (hourNum === 18) baseline = 14;
        else if (hourNum === 19) baseline = 11;
        else if (hourNum === 20) baseline = 6;
        else if (hourNum === 21) baseline = 3;
        else baseline = 1;
      }

      // If this is the current hour, anchor strictly to live current occupancy
      const checkInsCount = bucketLogs.filter((l) => l.eventType === 'check_in').length;
      const checkOutsCount = bucketLogs.filter((l) => l.eventType === 'check_out').length;
      const computed = i === 0 ? currentCount : Math.max(0, baseline + (checkInsCount - checkOutsCount));

      const dayFormat = bucketTime.toLocaleDateString(language === 'en' ? 'en-US' : 'de-DE', { weekday: 'short' });

      points.push({
        time: hourLabel,
        fullTime: `${dayFormat} ${hourLabel} ${language === 'de' ? 'Uhr' : ''}`,
        occupancy: computed,
        comfortGuide,
        events: bucketLogs.length,
        isCurrent: i === 0,
        isPeak: computed >= 9,
      });
    }
    return points;
  }, [campusLogs, currentCount, comfortGuide, language]);

  // Derived trend statistics
  const peakPoint = useMemo(() => {
    return usageTrendsData.reduce((prev, curr) => (curr.occupancy > prev.occupancy ? curr : prev), usageTrendsData[0]);
  }, [usageTrendsData]);

  const avgOccupancy = useMemo(() => {
    const sum = usageTrendsData.reduce((acc, curr) => acc + curr.occupancy, 0);
    return (sum / usageTrendsData.length).toFixed(1);
  }, [usageTrendsData]);

  // Calculate briefing stats
  const totalBriefed = campusStudents.filter((s) => s.safetyBriefingCompleted).length;

  return (
    <div className="space-y-6">
      {/* Personalized Student & Course Banner */}
      {currentUser && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
              {currentUser.firstName.charAt(0)}{currentUser.lastName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm">
                  {currentUser.firstName} {currentUser.lastName}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200">
                  {currentUser.role === 'employee' ? t.loggedEmployee : t.loggedStudent}
                </span>
                <span className="text-slate-400 text-xs hidden md:inline">· {currentUser.email}</span>
              </div>
              <div className="text-xs text-slate-600 flex flex-wrap items-center gap-1.5 mt-0.5">
                <span className="text-slate-500 font-medium">{t.courseLabel}:</span>
                <span className="font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-xs flex items-center gap-1">
                  <GraduationCap className="w-3 h-3 text-red-600 inline" />
                  {currentUser.course}
                </span>
                <span className="text-slate-400">·</span>
                <span className="font-mono text-slate-500 text-[11px]">
                  {currentUser.role === 'employee' ? t.personalNoShort : t.matriculationShort}: {currentUser.matriculationNo}
                </span>
                <span className="text-slate-400">·</span>
                <span className={`inline-flex items-center gap-1 font-medium ${currentUser.safetyBriefingCompleted ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {currentUser.safetyBriefingCompleted ? t.briefingActive : t.briefingMissing}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            {onOpenProfile && (
              <>
                <button
                  onClick={onOpenProfile}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-200 cursor-pointer"
                  title={t.editProfile}
                >
                  <User className="w-3.5 h-3.5 text-slate-600" />
                  <span>{t.editProfile}</span>
                </button>
                <button
                  onClick={onOpenProfile}
                  className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-red-200 shadow-2xs cursor-pointer"
                  title={t.readDhbw}
                >
                  <RefreshCw className="w-3.5 h-3.5 text-red-600" />
                  <span>{t.readDhbw}</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Hero & Live Status Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Main Occupancy Gauge - UNBEGRENZTE PLÄTZE */}
          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-red-600 inline-block"></span>
                  {selectedCampus.name} · {t.liveOccupancy}
                </div>
                <div className={`px-2.5 py-1 rounded-md text-xs font-medium border ${badgeColor}`}>
                  {statusText}
                </div>
              </div>

              <div className="mt-2 flex items-baseline gap-3">
                <span className="text-5xl sm:text-6xl font-extrabold tracking-tight text-slate-900 font-mono tabular-nums">
                  {currentCount}
                </span>
                <span className="text-xl sm:text-2xl font-medium text-slate-600">
                  {t.peopleInGym}
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full ml-auto">
                  <InfinityIcon className="w-3.5 h-3.5" />
                  <span>{t.unlimitedEntryNotice}</span>
                </span>
              </div>

              {/* Progress bar visual indicator */}
              <div className="mt-5">
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                    style={{ width: `${Math.min(100, (currentCount / 20) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 mt-1.5 font-mono">
                  <span>0 ({language === 'de' ? 'Leer' : 'Empty'})</span>
                  <span>5-8 ({language === 'de' ? 'Sehr frei' : 'Quiet'})</span>
                  <span>9-12 ({language === 'de' ? 'Moderat' : 'Moderate'})</span>
                  <span>13+ ({language === 'de' ? 'Stoßzeit · Zutritt jederzeit frei' : 'Busy · Entry always free'})</span>
                </div>
              </div>

              <p className="mt-4 text-sm text-slate-600 leading-relaxed">
                {statusSubtext}
              </p>

              {/* Wednesday Rule Notice */}
              <div className="mt-4 p-3 rounded-lg bg-amber-50/70 border border-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-amber-200/80 text-amber-900 font-bold text-[10px] uppercase">
                    {t.wednesdayRuleBadge}
                  </span>
                  <span className="text-amber-950 font-medium">
                    {t.wednesdayRuleDesc}
                  </span>
                </div>
                <span className="text-[11px] text-amber-800 font-medium whitespace-nowrap">
                  {t.wednesdayRuleScope}
                </span>
              </div>
            </div>

            {/* Quick action buttons */}
            <div className="mt-6 pt-5 border-t border-slate-100 flex flex-wrap items-center gap-3">
              <button
                onClick={onOpenHardwareSimulator}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>{t.testScannerBtn} ({selectedCampus.shortName})</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </button>

              <button
                onClick={onOpenStudentBriefings}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                <span>{t.clearedStudentsBtn} ({totalBriefed}/{campusStudents.length})</span>
              </button>
            </div>
          </div>

          {/* Photo & Quick Info Pane */}
          <div className="lg:col-span-5 relative bg-slate-900 flex flex-col justify-end p-6 overflow-hidden min-h-[220px]">
            <img
              src="/src/assets/images/dhbw_campus_fitness_room_1792346050549.jpg"
              alt={`${selectedCampus.name} Fitnessraum`}
              className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-luminosity hover:mix-blend-normal transition-all duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />

            <div className="relative z-10 text-white space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-red-400">
                <MapPin className="w-3.5 h-3.5" />
                <span>{selectedCampus.location}</span>
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                {selectedCampus.name} Fitnessraum
              </h2>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 pt-1">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>{selectedCampus.openingHours}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t.safetyBriefing}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RECHARTS SECTION: 24-HOUR USAGE TRENDS AS A SIMPLE LINE CHART (STOSSZEITEN IDENTIFIKATION) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6">
        {/* Header with Title and Quick Metric Badges */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-red-50 text-red-600">
                <TrendingUp className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                {t.usageTrendsTitle} · {selectedCampus.name}
              </h3>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                {t.lineChartBadge}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {t.usageTrendsSubtitle}
            </p>
          </div>

          {/* Quick Metrics Bar & Stoßzeiten Toggle */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setHighlightPeaks(!highlightPeaks)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 border cursor-pointer ${
                highlightPeaks
                  ? 'bg-red-50 text-red-700 border-red-300 shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Flame className={`w-3.5 h-3.5 ${highlightPeaks ? 'text-red-600 fill-red-500' : 'text-slate-400'}`} />
              <span>{t.highlightPeaksToggle}</span>
            </button>

            <div className="px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <span className="text-slate-400 block text-[9px] uppercase font-bold">{t.peak24hLabel}</span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">
                {peakPoint?.occupancy ?? 0} {t.peopleUnit}
              </span>
              <span className="text-[10px] text-slate-500 ml-1">({peakPoint?.time})</span>
            </div>

            <div className="px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <span className="text-slate-400 block text-[9px] uppercase font-bold">{t.avg24hLabel}</span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">
                {avgOccupancy} {t.peopleUnit}
              </span>
            </div>
          </div>
        </div>

        {/* 3 Simple Scannable Cards: Sofort verständlich für jedermann */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-4">
          {/* Card 1: Hauptstoßzeit */}
          <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200/80 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 font-bold">
              <Flame className="w-4 h-4 fill-rose-500 text-rose-600" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-900 block">
                {t.peakHoursCardTitle}
              </span>
              <p className="text-xs text-rose-950 mt-0.5 leading-snug font-medium">
                {t.peakHoursCardDesc}
              </p>
            </div>
          </div>

          {/* Card 2: Beste Trainingszeit (Ruhig) */}
          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900 block">
                {t.quietHoursCardTitle}
              </span>
              <p className="text-xs text-emerald-950 mt-0.5 leading-snug font-medium">
                {t.quietHoursCardDesc}
              </p>
            </div>
          </div>

          {/* Card 3: Aktuell im Moment */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-white text-slate-700 border border-slate-200 flex items-center justify-center shrink-0 font-bold text-xs font-mono">
              {currentCount}
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                {t.currentGymCardTitle}
              </span>
              <p className="text-xs text-slate-900 mt-0.5 font-medium leading-snug">
                <span className="font-bold text-red-600 font-mono">{currentCount} {t.peopleUnit}</span> · {statusText}
              </p>
            </div>
          </div>
        </div>

        {/* Recharts LineChart Visualization Container */}
        <div className="mt-4 h-64 sm:h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={usageTrendsData}
              margin={{ top: 16, right: 16, left: -22, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />

              <XAxis
                dataKey="time"
                stroke="#64748B"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#E2E8F0' }}
                interval={2}
              />

              <YAxis
                stroke="#64748B"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#E2E8F0' }}
                allowDecimals={false}
                domain={[0, (dataMax: number) => Math.max(16, dataMax + 2)]}
              />

              {/* Threshold for Rush Hours */}
              <ReferenceLine
                y={9}
                stroke="#DC2626"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: t.peakThresholdLabel,
                  fill: '#DC2626',
                  fontSize: 10,
                  position: 'insideTopRight',
                  fontWeight: 600,
                }}
              />

              {/* Highlight Peak Hours Area if enabled */}
              {highlightPeaks && (
                <ReferenceArea
                  y1={9}
                  y2={20}
                  fill="#FEE2E2"
                  fillOpacity={0.28}
                />
              )}

              <Tooltip
                content={<SimpleLineChartTooltip language={language} />}
              />

              {/* The Recharts Line Component */}
              <Line
                type="monotone"
                dataKey="occupancy"
                name={t.peopleUnit}
                stroke="#DC2626"
                strokeWidth={3}
                dot={<CustomLineDot highlightPeaks={highlightPeaks} />}
                activeDot={{
                  r: 7,
                  fill: '#DC2626',
                  stroke: '#FFFFFF',
                  strokeWidth: 2.5,
                }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Legend & Clarification */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-1 bg-red-600 rounded-full inline-block"></span>
              <span>{t.legendMeasured}</span>
            </span>

            {highlightPeaks && (
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 border border-white inline-block"></span>
                <span className="text-red-700 font-medium">{t.legendRush}</span>
              </span>
            )}

            <span className="flex items-center gap-1.5 text-slate-400">
              <Info className="w-3.5 h-3.5" />
              <span>{t.capacityClarification}</span>
            </span>
          </div>

          <span className="font-mono text-slate-400 text-[11px]">
            {selectedCampus.name}
          </span>
        </div>
      </div>

      {/* Two Column Section: Live Visitors & Hourly Forecast */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Aktuell Anwesende Studierende am ausgewählten Campus */}
        <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 shadow-xs p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {t.activeVisitorsTitle} ({campusCheckIns.length}) · {selectedCampus.shortName}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {t.activeVisitorsSub}
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              {t.autoTtl}
            </span>
          </div>

          {campusCheckIns.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-200 rounded-lg">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-600">
                {t.noVisitorsTitle}
              </p>
              <p className="text-xs text-slate-400 mt-1">{t.noVisitorsSub}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {campusCheckIns.map((ci) => {
                const checkInDate = new Date(ci.timestampIn);
                const minutesAgo = Math.max(1, Math.round((Date.now() - checkInDate.getTime()) / 60000));

                return (
                  <div
                    key={ci.id}
                    className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50/50 px-2 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
                        {ci.displayName.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {ci.displayName}
                          </span>
                          <span className="text-xs text-slate-400">·</span>
                          <span className="text-xs text-slate-500">{ci.course}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <span className="flex items-center gap-1">
                            {ci.method === 'rfid_door' ? (
                              <>
                                <CreditCard className="w-3 h-3 text-slate-400" />
                                <span>{t.rfidDoorMethod}</span>
                              </>
                            ) : (
                              <>
                                <Radio className="w-3 h-3 text-sky-500" />
                                <span>{t.bleBeaconMethod}</span>
                              </>
                            )}
                          </span>
                          <span>·</span>
                          <span className="font-mono tabular-nums">
                            {t.checkedInAgo.replace('{m}', minutesAgo.toString())}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => onTriggerCheckOut(ci.studentId)}
                      title={t.checkoutBtn}
                      className="px-2.5 py-1 text-xs text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors flex items-center gap-1 font-medium cursor-pointer"
                    >
                      <LogOut className="w-3 h-3" />
                      <span>{t.checkoutBtn}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-slate-400" />
              {t.capacityClarification}
            </span>
          </div>
        </div>

        {/* Right Column: Hourly Campus Peak Hours */}
        <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 shadow-xs p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {t.lectureTitle} ({selectedCampus.shortName})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {t.lectureSub}
              </p>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
              {t.lecturePhaseBadge}
            </span>
          </div>

          {/* Bar chart representation */}
          <div className="mt-4 space-y-2">
            <div className="flex items-end gap-1.5 h-40 pt-4 pb-1 border-b border-slate-200">
              {TYPICAL_HOURLY_DISTRIBUTION.map((item) => {
                const heightPercent = Math.min(100, Math.round((item.count / 15) * 100));
                const isPeak = item.count >= 10;

                let barColor = 'bg-slate-200 hover:bg-slate-300';
                if (isPeak) {
                  barColor = 'bg-rose-400 hover:bg-rose-500';
                } else if (item.count >= 7) {
                  barColor = 'bg-amber-400 hover:bg-amber-500';
                } else {
                  barColor = 'bg-emerald-300 hover:bg-emerald-400';
                }

                return (
                  <div
                    key={item.hour}
                    className="flex-1 flex flex-col items-center h-full justify-end group relative"
                  >
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-10 bg-slate-900 text-white text-[10px] py-1 px-1.5 rounded pointer-events-none whitespace-nowrap z-20 font-mono">
                      {item.hour}: {item.count} {t.peopleUnit} ({item.label})
                    </div>

                    <div
                      className={`w-full rounded-t-sm transition-all ${barColor}`}
                      style={{ height: `${heightPercent}%` }}
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between text-[10px] text-slate-400 font-mono px-0.5">
              <span>06h</span>
              <span>09h</span>
              <span>12h ({language === 'de' ? 'Mittag' : 'Noon'})</span>
              <span>15h</span>
              <span>18h (Peak)</span>
              <span>22h</span>
            </div>
          </div>

          {/* Legend and recommendations */}
          <div className="mt-5 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-100">
              <span className="font-semibold text-emerald-800 block text-xs">
                {language === 'de' ? 'Beste Zeit' : 'Best Time'}
              </span>
              <span className="text-[11px] text-emerald-700">07:00 - 11:00</span>
            </div>
            <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-100">
              <span className="font-semibold text-amber-800 block text-xs">
                {language === 'de' ? 'Mittagsandrang' : 'Lunch Rush'}
              </span>
              <span className="text-[11px] text-amber-700">12:30 - 13:45</span>
            </div>
            <div className="p-2.5 rounded-lg bg-rose-50/60 border border-rose-100">
              <span className="font-semibold text-rose-800 block text-xs">
                {language === 'de' ? 'Haupt-Peak' : 'Main Peak'}
              </span>
              <span className="text-[11px] text-rose-700">17:00 - 19:30</span>
            </div>
          </div>
        </div>
      </div>

      {/* Safety & Access rules infobox */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-white border border-slate-200 text-red-600 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              {language === 'de'
                ? `Zutrittsvoraussetzung für ${selectedCampus.name}`
                : `Access requirements for ${selectedCampus.name}`}
            </h4>
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
              {language === 'de'
                ? 'Jeder Studierende mit absolvierter Sicherheitseinweisung erhält unbegrenzt Zutritt. Der DHBW-Ausweis öffnet das Schloss für 3 Sekunden und aktualisiert automatisch die Live-Auslastung.'
                : 'Any student who completed the safety briefing receives unlimited access. The DHBW ID card unlocks the door for 3 seconds and automatically updates the live occupancy.'}
            </p>
          </div>
        </div>

        <button
          onClick={onOpenStudentBriefings}
          className="shrink-0 px-3.5 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap cursor-pointer"
        >
          {language === 'de' ? 'Einweisung prüfen' : 'Check Briefing'}
        </button>
      </div>
    </div>
  );
};
