import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type Language = 'de' | 'en';

const translations: Record<Language, Record<string, string>> = {
  de: {
    appTitle: 'Campus Gym', appSubtitle: 'DHBW · Live-Dashboard', campusSelect: 'Campus auswählen',
    tabLive: 'Live-Status', tabDoor: 'Tür & Hardware', tabStudents: 'Studierende',
    tabConcept: 'Technikkonzept', activeBadge: 'aktiv', languageSelect: 'Sprache auswählen',
    myProfile: 'Mein Profil', scanCard: 'Karte scannen',
    statusFree: 'Frei / entspannt', statusFreeSub: 'Aktuell ist ausreichend Platz vorhanden.',
    statusModerate: 'Mäßige Auslastung', statusModerateSub: 'Der Raum füllt sich langsam.',
    statusBusy: 'Hohe Auslastung (nahe Richtwert)', statusBusySub: 'Bitte rechne mit eingeschränktem Platz.',
    loggedEmployee: 'Angemeldete Mitarbeitende', loggedStudent: 'Angemeldete Studierende',
    courseLabel: 'Studiengang', personalNoShort: 'Personalnummer', matriculationShort: 'Matrikelnummer',
    briefingActive: 'Einweisung abgeschlossen', briefingMissing: 'Einweisung ausstehend',
    editProfile: 'Profil bearbeiten', readDhbw: 'DHBW-Informationen anzeigen',
    liveOccupancy: 'Live-Auslastung', peopleInGym: 'Personen im Fitnessraum',
    unlimitedEntryNotice: 'Demo: keine Kapazitätsbegrenzung konfiguriert',
    wednesdayRuleBadge: 'Mittwochsregel', wednesdayRuleDesc: 'Mittwochs ist der Zutritt auf Mitarbeitende beschränkt.',
    wednesdayRuleScope: 'Regel gilt am ausgewählten Campus.', testScannerBtn: 'Scanner testen',
    clearedStudentsBtn: 'Freigeschaltete Karten', safetyBriefing: 'Sicherheitseinweisung',
    usageTrendsTitle: 'Auslastungsverlauf', lineChartBadge: 'Demo-Daten',
    usageTrendsSubtitle: 'Simulierter Verlauf der letzten 24 Stunden.',
    highlightPeaksToggle: 'Spitzenzeiten hervorheben', peak24hLabel: 'Spitzenwert (24 Std.)',
    peopleUnit: 'Personen', avg24hLabel: 'Durchschnitt (24 Std.)',
    peakHoursCardTitle: 'Stoßzeiten', peakHoursCardDesc: 'Typische Zeiten mit höherer Auslastung.',
    quietHoursCardTitle: 'Ruhige Zeiten', quietHoursCardDesc: 'Typische Zeiten mit niedriger Auslastung.',
    currentGymCardTitle: 'Aktueller Raumstatus', peakThresholdLabel: 'Richtwert',
    legendMeasured: 'Messwert', legendRush: 'Spitzenzeit',
    capacityClarification: 'Orientierungswert, keine technische Kapazitätsgrenze.',
    activeVisitorsTitle: 'Aktuell anwesend', activeVisitorsSub: 'Aktive Demo-Check-ins',
    autoTtl: 'Automatische Bereinigung', noVisitorsTitle: 'Noch niemand eingecheckt',
    noVisitorsSub: 'Demo-Scans erscheinen hier.', rfidDoorMethod: 'RFID-Türscanner',
    bleBeaconMethod: 'BLE-Beacon', checkedInAgo: 'eingecheckt',
    checkoutBtn: 'Check-out', lectureTitle: 'Vorlesungszeiten',
    lectureSub: 'Beispielhafte Auslastung rund um Vorlesungen.', lecturePhaseBadge: 'Demo',
  },
  en: {
    appTitle: 'Campus Gym', appSubtitle: 'DHBW · Live dashboard', campusSelect: 'Select campus',
    tabLive: 'Live status', tabDoor: 'Door & hardware', tabStudents: 'Students',
    tabConcept: 'Technical concept', activeBadge: 'active', languageSelect: 'Select language',
    myProfile: 'My profile', scanCard: 'Scan card',
    statusFree: 'Free / relaxed', statusFreeSub: 'There is currently enough space.',
    statusModerate: 'Moderate occupancy', statusModerateSub: 'The room is gradually filling up.',
    statusBusy: 'High occupancy (near guide)', statusBusySub: 'Space may be limited.',
    loggedEmployee: 'Signed-in employee', loggedStudent: 'Signed-in student',
    courseLabel: 'Course', personalNoShort: 'Staff number', matriculationShort: 'Student number',
    briefingActive: 'Briefing completed', briefingMissing: 'Briefing pending',
    editProfile: 'Edit profile', readDhbw: 'View DHBW information',
    liveOccupancy: 'Live occupancy', peopleInGym: 'People in the gym',
    unlimitedEntryNotice: 'Demo: no capacity limit configured',
    wednesdayRuleBadge: 'Wednesday rule', wednesdayRuleDesc: 'Access is limited to employees on Wednesdays.',
    wednesdayRuleScope: 'Rule applies to the selected campus.', testScannerBtn: 'Test scanner',
    clearedStudentsBtn: 'Active cards', safetyBriefing: 'Safety briefing',
    usageTrendsTitle: 'Occupancy trend', lineChartBadge: 'Demo data',
    usageTrendsSubtitle: 'Simulated trend over the last 24 hours.',
    highlightPeaksToggle: 'Highlight peak hours', peak24hLabel: 'Peak (24 hours)',
    peopleUnit: 'people', avg24hLabel: 'Average (24 hours)',
    peakHoursCardTitle: 'Peak hours', peakHoursCardDesc: 'Typical times with higher occupancy.',
    quietHoursCardTitle: 'Quiet hours', quietHoursCardDesc: 'Typical times with lower occupancy.',
    currentGymCardTitle: 'Current room status', peakThresholdLabel: 'Guide',
    legendMeasured: 'Measured', legendRush: 'Peak period',
    capacityClarification: 'Guidance value, not a technical capacity limit.',
    activeVisitorsTitle: 'Currently present', activeVisitorsSub: 'Active demo check-ins',
    autoTtl: 'Automatic cleanup', noVisitorsTitle: 'No one has checked in',
    noVisitorsSub: 'Demo scans appear here.', rfidDoorMethod: 'RFID door scanner',
    bleBeaconMethod: 'BLE beacon', checkedInAgo: 'checked in',
    checkoutBtn: 'Check out', lectureTitle: 'Lecture periods',
    lectureSub: 'Example occupancy around lecture times.', lecturePhaseBadge: 'Demo',
  },
};

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Record<string, string>;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('de');
  const value = useMemo(
    () => ({ language, setLanguage, t: translations[language] }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
}
