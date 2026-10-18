import React, { useState } from 'react';
import {
  Cpu,
  Radio,
  CreditCard,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Code2,
  Lock,
  Unlock,
  RefreshCw,
  Send,
  Zap,
} from 'lucide-react';
import { Student, ActiveCheckIn, AccessLog, GymState, DoorScanResponse, Campus } from '../types';
import { processDoorScan } from '../services/gymEngine';

interface HardwareSimulatorProps {
  students: Student[];
  checkIns: ActiveCheckIn[];
  logs: AccessLog[];
  gymState: GymState;
  selectedCampus: Campus;
  retentionHours: number;
  onScanResult: (result: ReturnType<typeof processDoorScan>) => void;
}

export const HardwareSimulator: React.FC<HardwareSimulatorProps> = ({
  students,
  checkIns,
  logs,
  gymState,
  selectedCampus,
  retentionHours,
  onScanResult,
}) => {
  const campusStudents = students.filter((s) => s.campusId === selectedCampus.id);
  const [simulatedDay, setSimulatedDay] = useState<number>(3); // Standard: Mittwoch zum direkten Testen!
  const [selectedStudentId, setSelectedStudentId] = useState<string>(campusStudents[0]?.id || students[0]?.id || '');
  const [customUid, setCustomUid] = useState<string>('FA:39:10:8B');
  const [useCustomCard, setUseCustomCard] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [lastResponse, setLastResponse] = useState<DoorScanResponse | null>(null);
  const [lastApiTrace, setLastApiTrace] = useState<Record<string, unknown> | null>(null);

  // BLE Beacon simulator states
  const [bleDistanceMeters, setBleDistanceMeters] = useState<number>(8); // 8m outside
  const [bleStudentId, setBleStudentId] = useState<string>(students[1]?.id || '');
  const [bleStatusMsg, setBleStatusMsg] = useState<string>('Außerhalb des Empfangsbereichs (>5m)');

  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const bleStudent = students.find((s) => s.id === bleStudentId);

  const handleTriggerRfidScan = () => {
    setIsScanning(true);
    const uidToScan = useCustomCard ? customUid : selectedStudent?.rfidUid || '00:00:00:00';

    setTimeout(() => {
      const result = processDoorScan(
        uidToScan,
        students,
        checkIns,
        logs,
        gymState,
        'rfid_door',
        selectedCampus.id,
        simulatedDay,
        retentionHours
      );
      setLastResponse(result.doorResponse);
      setLastApiTrace({
        request: result.rawApiPayload.request,
        response: result.rawApiPayload.response,
        status: result.rawApiPayload.statusCode,
        latency: `${result.rawApiPayload.latencyMs} ms`,
      });
      onScanResult(result);
      setIsScanning(false);
    }, 450);
  };

  const handleBleDistanceChange = (meters: number) => {
    setBleDistanceMeters(meters);
    if (!bleStudent) return;

    const isCurrentlyCheckedIn = checkIns.some((c) => c.studentId === bleStudent.id);

    if (meters <= 2.5 && !isCurrentlyCheckedIn) {
      setBleStatusMsg(`Näherung erkannt (${meters.toFixed(1)}m, RSSI: -62 dBm) -> Automatischer Check-In ausgelöst!`);
      const result = processDoorScan(bleStudent.rfidUid, students, checkIns, logs, gymState, 'ble_beacon', selectedCampus.id, simulatedDay, retentionHours);
      setLastResponse(result.doorResponse);
      setLastApiTrace({
        request: {
          ...result.rawApiPayload.request,
          endpoint: '/api/v1/beacon/proximity-event',
          body: {
            studentToken: 'DEMO_TOKEN_NOT_AUTHENTICATED',
            beaconId: 'BEACON-GYM-ROOM-01',
            rssi: -62,
            distanceEstimatedMeters: meters,
            event: 'dwell_entered',
          },
        },
        response: result.rawApiPayload.response,
        status: result.rawApiPayload.statusCode,
        latency: '34 ms',
      });
      onScanResult(result);
    } else if (meters > 7.0 && isCurrentlyCheckedIn) {
      setBleStatusMsg(`Entfernung erkannt (${meters.toFixed(1)}m, RSSI: -92 dBm) -> Automatischer Check-Out nach Dwell-Timeout!`);
      const result = processDoorScan(bleStudent.rfidUid, students, checkIns, logs, gymState, 'ble_beacon', selectedCampus.id, simulatedDay, retentionHours);
      setLastResponse(result.doorResponse);
      setLastApiTrace({
        request: {
          ...result.rawApiPayload.request,
          endpoint: '/api/v1/beacon/proximity-event',
          body: {
            studentToken: 'DEMO_TOKEN_NOT_AUTHENTICATED',
            beaconId: 'BEACON-GYM-ROOM-01',
            rssi: -92,
            distanceEstimatedMeters: meters,
            event: 'exit_detected',
          },
        },
        response: result.rawApiPayload.response,
        status: result.rawApiPayload.statusCode,
        latency: '29 ms',
      });
      onScanResult(result);
    } else {
      if (meters <= 2.5) {
        setBleStatusMsg(`Im Fitnessraum aktiv (${meters.toFixed(1)}m, BLE Signal stabil)`);
      } else {
        setBleStatusMsg(`Außerhalb des Erfassungsradius (${meters.toFixed(1)}m)`);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-red-600" />
              Interaktiver Hardware- & Schnittstellen-Simulator
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Hier kannst du in Echtzeit testen, wie der physische RFID-Ausweisleser an der Tür und das Smartphone BLE-Beacon-System mit dem Backend kommunizieren.
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700 whitespace-nowrap self-start">
            IoT Edge Gateway: Online
          </span>
        </div>
      </div>

      {/* Wochentag-Simulation für Mittwochs-Regel */}
      <div className="bg-slate-900 text-white rounded-xl p-4 shadow-xs border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-red-600/20 text-red-400 flex items-center justify-center font-bold text-xs">
            📅
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <span>Zutritts-Regelprüfung Wochentag</span>
              {simulatedDay === 3 ? (
                <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                  Exklusiver Mitarbeiter-Mittwoch aktiv
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                  Regulärer Tag (Studierende & Mitarbeiter)
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {simulatedDay === 3
                ? 'Mittwochs dürfen ausschließlich DHBW-Mitarbeitende trainieren. Studierende werden abgewiesen.'
                : 'An allen anderen Wochentagen haben alle Studierenden & Mitarbeiter mit Einweisung Zutritt.'}
            </div>
          </div>
        </div>

        {/* Day selection buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-800 rounded-lg text-xs self-start sm:self-auto font-medium">
          <button
            type="button"
            onClick={() => setSimulatedDay(1)}
            className={`px-2.5 py-1 rounded transition-colors ${
              simulatedDay === 1 ? 'bg-white text-slate-900 font-bold' : 'text-slate-300 hover:text-white'
            }`}
          >
            Mo (Alle)
          </button>
          <button
            type="button"
            onClick={() => setSimulatedDay(3)}
            className={`px-2.5 py-1 rounded transition-colors ${
              simulatedDay === 3 ? 'bg-red-600 text-white font-bold' : 'text-slate-300 hover:text-white'
            }`}
          >
            Mi (Nur Mitarbeiter)
          </button>
          <button
            type="button"
            onClick={() => setSimulatedDay(4)}
            className={`px-2.5 py-1 rounded transition-colors ${
              simulatedDay === 4 ? 'bg-white text-slate-900 font-bold' : 'text-slate-300 hover:text-white'
            }`}
          >
            Do (Alle)
          </button>
        </div>
      </div>

      {/* Grid: Option A (RFID Tür) & Option B (BLE Smartphone) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* OPTION A: Physischer RFID Tür-Scanner */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
                <h3 className="text-base font-bold text-slate-900">
                  Option A: RFID / NFC Ausweis-Scanner (Tür)
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-500">13.56 MHz MIFARE</span>
            </div>

            <p className="text-xs text-slate-600 mb-5 leading-relaxed">
              Beim Vorhalten des DHBW-Ausweises liest das ESP32-Gateway die Chip-UID. Das Backend prüft den Wochentag (Mittwochs nur Mitarbeiter!), die Sicherheitseinweisung und den aktuellen Aufenthaltsstatus.
            </p>

            {/* Ausweis Selector */}
            <div className="space-y-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <label className="text-xs font-semibold text-slate-700 block">
                Zu scannenden Ausweis wählen (Studierende & Mitarbeiter):
              </label>

              <div className="space-y-2">
                <select
                  disabled={useCustomCard}
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 font-medium text-slate-900 focus:ring-2 focus:ring-red-500 focus:outline-none disabled:opacity-50"
                >
                  <optgroup label="DHBW Mitarbeitende (haben auch mittwochs Zutritt)">
                    {students
                      .filter((s) => s.role === 'employee')
                      .map((s) => {
                        const isCheckedIn = checkIns.some((c) => c.studentId === s.id);
                        return (
                          <option key={s.id} value={s.id}>
                            [Mitarbeiter] {s.firstName} {s.lastName} ({s.course})
                            {isCheckedIn ? ' - [BEREITS DRIN -> Checkout]' : ' - [DRAUSSEN -> Checkin]'}
                          </option>
                        );
                      })}
                  </optgroup>
                  <optgroup label="DHBW Studierende (mittwochs gesperrt, sonst freier Zutritt)">
                    {students
                      .filter((s) => s.role !== 'employee')
                      .map((s) => {
                        const isCheckedIn = checkIns.some((c) => c.studentId === s.id);
                        return (
                          <option key={s.id} value={s.id}>
                            [Student] {s.firstName} {s.lastName} ({s.course.split(' ')[0]})
                            {!s.safetyBriefingCompleted ? ' - [KEINE EINWEISUNG!]' : ''}
                            {isCheckedIn ? ' - [BEREITS DRIN -> Checkout]' : ' - [DRAUSSEN -> Checkin]'}
                          </option>
                        );
                      })}
                  </optgroup>
                </select>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useCustomCard}
                      onChange={(e) => setUseCustomCard(e.target.checked)}
                      className="rounded text-red-600 focus:ring-red-500"
                    />
                    <span>Unbekannte / fremde Karte simulieren</span>
                  </label>

                  {useCustomCard && (
                    <input
                      type="text"
                      value={customUid}
                      onChange={(e) => setCustomUid(e.target.value)}
                      placeholder="z.B. FA:39:10:8B"
                      className="text-xs font-mono bg-white border border-slate-300 rounded px-2 py-1 w-32"
                    />
                  )}
                </div>
              </div>

              {/* Card preview badge */}
              {selectedStudent && !useCustomCard && (
                <div className="mt-3 p-3 bg-white rounded border border-slate-200 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Inhaber:</span>
                    <span className="font-semibold text-slate-900">
                      {selectedStudent.firstName} {selectedStudent.lastName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Matrikelnummer:</span>
                    <span className="font-mono text-slate-700">{selectedStudent.matriculationNo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Sicherheitseinweisung:</span>
                    <span
                      className={`font-semibold ${
                        selectedStudent.safetyBriefingCompleted ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {selectedStudent.safetyBriefingCompleted ? 'Absolviert & freigeschaltet' : 'Ausstehend (Gesperrt)'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Trigger Scan Button */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              Gerät: <span className="font-mono text-slate-700">DOOR-GYM-01</span>
            </div>

            <button
              onClick={handleTriggerRfidScan}
              disabled={isScanning}
              className={`px-4 py-2.5 rounded-lg text-xs font-semibold text-white flex items-center gap-2 transition-all shadow-xs ${
                isScanning ? 'bg-slate-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 active:scale-98'
              }`}
            >
              {isScanning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Lese RFID-Chip...</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  <span>Ausweis an Türleser halten</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* OPTION B: Smartphone Geofencing / BLE Beacon */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                <h3 className="text-base font-bold text-slate-900">
                  Option B: Smartphone BLE-Beacon / Geofence
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-500">iBeacon 2.4 GHz</span>
            </div>

            <p className="text-xs text-slate-600 mb-5 leading-relaxed">
              Ein Bluetooth Low Energy (BLE) iBeacon im Fitnessraum sendet Signale. Die installierte DHBW-App misst die Signalstärke (RSSI) und loggt den Studierenden bei Annäherung (&lt; 2.5m) automatisch ein und beim Verlassen aus.
            </p>

            <div className="space-y-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Test-Studierender (Smartphone Träger):
                </label>
                <select
                  value={bleStudentId}
                  onChange={(e) => setBleStudentId(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} ({s.course})
                    </option>
                  ))}
                </select>
              </div>

              {/* Proximity Slider */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-700">Simulierter Abstand zum Raum-Beacon:</span>
                  <span className="font-mono font-bold text-sky-700">{bleDistanceMeters.toFixed(1)} Meter</span>
                </div>

                <input
                  type="range"
                  min="0.5"
                  max="12"
                  step="0.5"
                  value={bleDistanceMeters}
                  onChange={(e) => handleBleDistanceChange(parseFloat(e.target.value))}
                  className="w-full accent-sky-600 cursor-pointer"
                />

                <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                  <span>0.5m (Direkt im Raum)</span>
                  <span className="text-sky-600 font-semibold">2.5m (Check-In Schwelle)</span>
                  <span>7m (Check-Out)</span>
                  <span>12m (Campus Hof)</span>
                </div>
              </div>

              {/* Proximity status feedback */}
              <div className="p-3 bg-white rounded border border-slate-200 flex items-center gap-2.5">
                <Radio className={`w-4 h-4 shrink-0 ${bleDistanceMeters <= 2.5 ? 'text-sky-600 animate-pulse' : 'text-slate-400'}`} />
                <span className="text-xs font-medium text-slate-700">{bleStatusMsg}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Beacon UUID: <span className="font-mono text-slate-700">e2c56db5-dffb-48d2-b060-d0f5a71096e0</span></span>
            <span className="font-mono text-slate-500">Major: 1 · Minor: 4</span>
          </div>
        </div>
      </div>

      {/* Live Terminal & API Inspector */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 text-slate-100 p-6 shadow-md overflow-hidden">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white font-mono">
              Live Edge-Gateway & REST API Trace
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Protokoll: HTTPS / HMAC-SHA256
          </span>
        </div>

        {lastResponse ? (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4 text-xs font-mono">
            {/* Visual Door Relay & Status Banner */}
            <div className="md:col-span-12 p-3 rounded-lg flex items-center justify-between border bg-slate-800/80 border-slate-700">
              <div className="flex items-center gap-3">
                {lastResponse.allowed ? (
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Unlock className="w-4 h-4" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center">
                    <Lock className="w-4 h-4" />
                  </div>
                )}
                <div>
                  <div className="font-bold text-white text-sm">
                    {lastResponse.allowed ? 'TÜRRELAS FREIGEGEBEN (3000ms)' : 'ZUGANG VERWEIGERT'}
                  </div>
                  <div className="text-slate-400 mt-0.5">
                    {lastResponse.message}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="text-slate-400">Aktion:</span>{' '}
                <span className="font-bold text-white uppercase">{lastResponse.action}</span>
              </div>
            </div>

            {/* Request Inspection */}
            <div className="md:col-span-6 bg-slate-950 p-4 rounded-lg border border-slate-800">
              <div className="text-slate-400 font-bold mb-2 flex items-center justify-between">
                <span>INCOMING GATEWAY HTTP REQUEST</span>
                <span className="text-sky-400">POST /api/v1/door/scan</span>
              </div>
              <pre className="text-slate-300 overflow-x-auto text-[11px] leading-relaxed">
                {JSON.stringify(lastApiTrace?.request, null, 2)}
              </pre>
            </div>

            {/* Response Inspection */}
            <div className="md:col-span-6 bg-slate-950 p-4 rounded-lg border border-slate-800">
              <div className="text-slate-400 font-bold mb-2 flex items-center justify-between">
                <span>BACKEND HTTP RESPONSE</span>
                <span className={lastResponse.allowed ? 'text-emerald-400' : 'text-rose-400'}>
                  HTTP {String(lastApiTrace?.status ?? 200)} ({String(lastApiTrace?.latency ?? '25ms')})
                </span>
              </div>
              <pre className="text-slate-300 overflow-x-auto text-[11px] leading-relaxed">
                {JSON.stringify(lastApiTrace?.response, null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-slate-500 font-mono text-xs">
            Bereit für Scan-Events. Klicke oben auf "Ausweis an Türleser halten" oder bewege den BLE-Abstandsslider.
          </div>
        )}
      </div>
    </div>
  );
};
