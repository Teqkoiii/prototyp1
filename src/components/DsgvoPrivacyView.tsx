import React, { useState } from 'react';
import {
  ShieldCheck,
  Trash2,
  Download,
  Clock,
  Lock,
  Eye,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileText,
  FileSpreadsheet,
  UserCheck,
  Filter,
} from 'lucide-react';
import { AccessLog, Student } from '../types';

interface DsgvoPrivacyViewProps {
  logs: AccessLog[];
  students: Student[];
  onPurgeLogs: () => void;
  retentionHours: number;
  setRetentionHours: (hours: number) => void;
}

export const DsgvoPrivacyView: React.FC<DsgvoPrivacyViewProps> = ({
  logs,
  students,
  onPurgeLogs,
  retentionHours,
  setRetentionHours,
}) => {
  const [downloadJsonSuccess, setDownloadJsonSuccess] = useState(false);
  const [downloadCsvSuccess, setDownloadCsvSuccess] = useState(false);
  const [manualCleanupSuccess, setManualCleanupSuccess] = useState(false);
  const [userFilter, setUserFilter] = useState<string>('all');

  const filteredLogs = logs.filter((log) => {
    if (userFilter === 'all') return true;
    return log.displayName.toLowerCase().includes(userFilter.toLowerCase());
  });

  const handleExportCsv = () => {
    // CSV Header nach RFC 4180 mit deutschen Spaltenbezeichnungen
    const headers = [
      'Protokoll_ID',
      'Datum_Uhrzeit_ISO',
      'Datum_Lokal',
      'Uhrzeit_Lokal',
      'Ereignis',
      'Name_oder_Pseudonym',
      'Erfassungsmethode',
      'Tuer_oder_Beacon_ID',
      'Maskierte_Chip_UID',
      'Hinweis_oder_Grund',
      'DSGVO_Loeschfrist_Ablauf'
    ];

    const escapeCsv = (str: string | undefined | null) => {
      if (!str) return '""';
      const clean = String(str).replace(/"/g, '""');
      return `"${clean}"`;
    };

    const rows = filteredLogs.map((log) => {
      const dateObj = new Date(log.timestamp);
      const datumLokal = dateObj.toLocaleDateString('de-DE');
      const uhrzeitLokal = dateObj.toLocaleTimeString('de-DE');

      const eventLabel =
        log.eventType === 'check_in'
          ? 'Check-In'
          : log.eventType === 'check_out'
          ? 'Check-Out'
          : log.eventType === 'access_denied'
          ? 'Zutritt verweigert'
          : 'Automatischer Check-Out';

      const methodLabel =
        log.method === 'rfid_door'
          ? 'RFID/NFC Tür-Scanner'
          : log.method === 'ble_beacon'
          ? 'Smartphone BLE-Beacon'
          : 'Manuell verifiziert';

      return [
        escapeCsv(log.id),
        escapeCsv(log.timestamp),
        escapeCsv(datumLokal),
        escapeCsv(uhrzeitLokal),
        escapeCsv(eventLabel),
        escapeCsv(log.displayName),
        escapeCsv(methodLabel),
        escapeCsv(log.doorId),
        escapeCsv(log.rfidUidMasked),
        escapeCsv(log.reason || 'Erfolgreich autorisiert'),
        escapeCsv(log.retentionExpiresAt),
      ].join(';');
    });

    // UTF-8 BOM (\uFEFF) für korrekte Umlaute in Excel & Numbers
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dhbw-gym-zugangslogs-dsgvo-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    setDownloadCsvSuccess(true);
    setTimeout(() => setDownloadCsvSuccess(false), 3000);
  };

  const handleExportJson = () => {
    const exportPayload = {
      exportDate: new Date().toISOString(),
      institution: 'DHBW Bad Mergentheim',
      facility: 'Campus Fitnessraum',
      gdprComplianceArticle: 'Art. 20 DSGVO (Recht auf Datenübertragbarkeit)',
      retentionPolicyHours: retentionHours,
      totalLogsExported: filteredLogs.length,
      accessLogsSummary: filteredLogs.map((l) => ({
        id: l.id,
        timestamp: l.timestamp,
        eventType: l.eventType,
        displayName: l.displayName,
        method: l.method,
        doorId: l.doorId,
        maskedUid: l.rfidUidMasked,
        reason: l.reason,
        expiresAt: l.retentionExpiresAt,
      })),
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dhbw-gym-dsgvo-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setDownloadJsonSuccess(true);
    setTimeout(() => setDownloadJsonSuccess(false), 3000);
  };

  const handleExecutePurge = () => {
    onPurgeLogs();
    setManualCleanupSuccess(true);
    setTimeout(() => setManualCleanupSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* DSGVO Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">
              DSGVO-Datenschutzportal & Transparenzpflicht
            </h2>
          </div>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Gemäß EU-DSGVO (Art. 15 Auskunftsrecht & Art. 20 Datenübertragbarkeit) können Studierende ihre Zugangsdaten jederzeit transparent einsehen und als <strong>CSV für Tabellenkalkulationen</strong> oder JSON exportieren. Alte Logs werden nach der ausgewählten Frist von {retentionHours} Stunden automatisch aus dieser Demo-Ansicht entfernt.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* CSV Export Button */}
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{downloadCsvSuccess ? 'CSV exportiert!' : 'Logs als CSV exportieren'}</span>
          </button>

          {/* JSON Export Button */}
          <button
            onClick={handleExportJson}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{downloadJsonSuccess ? 'JSON exportiert!' : 'JSON (Art. 20)'}</span>
          </button>

          {/* Manual Purge Button */}
          <button
            onClick={handleExecutePurge}
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{manualCleanupSuccess ? 'Bereinigt!' : 'Sofortbereinigung'}</span>
          </button>
        </div>
      </div>

      {/* Auto-Purge & Privacy Configuration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Automatische Bereinigung (TTL)
            </span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>

          <div>
            <div className="text-2xl font-extrabold text-slate-900 font-mono tabular-nums">
              {retentionHours} Stunden
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Nach Ablauf dieser Frist werden Check-In-Logs restlos und automatisiert aus dieser Demo-Ansicht entfernt.
            </p>
          </div>

          <div className="pt-2">
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Aufbewahrungsfrist anpassen:
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRetentionHours(4)}
                className={`px-2.5 py-1 text-xs rounded border ${
                  retentionHours === 4 ? 'bg-slate-900 text-white font-bold' : 'bg-slate-50 text-slate-700'
                }`}
              >
                4 Std. (Strikt)
              </button>
              <button
                onClick={() => setRetentionHours(24)}
                className={`px-2.5 py-1 text-xs rounded border ${
                  retentionHours === 24 ? 'bg-slate-900 text-white font-bold' : 'bg-slate-50 text-slate-700'
                }`}
              >
                24 Std. (1 Tag)
              </button>
              <button
                onClick={() => setRetentionHours(48)}
                className={`px-2.5 py-1 text-xs rounded border ${
                  retentionHours === 48 ? 'bg-slate-900 text-white font-bold' : 'bg-slate-50 text-slate-700'
                }`}
              >
                48 Std. (Standard)
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Pseudonymisierungsgrad
            </span>
            <Lock className="w-4 h-4 text-emerald-600" />
          </div>

          <div className="text-2xl font-extrabold text-emerald-700 font-mono tabular-nums">
            {students.filter((s) => s.privacyMode !== 'public').length} / {students.length}
          </div>
          <p className="text-xs text-slate-500">
            Studierende haben die volle Kontrolle und nutzen Pseudonyme oder anonyme Anzeigen im Dashboard.
          </p>

          <div className="text-xs text-slate-600 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
            ✓ Keine Übermittlung an Dritte<br />
            ✓ Keine Bewegungsprofile außerhalb des Raumes<br />
            ✓ Vollständiger CSV-Export aller Daten
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Aktive Logs im Zwischenspeicher
            </span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>

          <div className="text-2xl font-extrabold text-slate-900 font-mono tabular-nums">
            {logs.length} Einträge
          </div>
          <p className="text-xs text-slate-500">
            Temporäre Protokolle zur Sicherheitsprüfung und Kapazitätsanalyse.
          </p>

          <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Automatische Bereinigungsroutine aktiv</span>
          </div>
        </div>
      </div>

      {/* Ephemeral Access Logs Table with CSV Export Trigger */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Transparente Ephemere Zutritts-Protokolle ({filteredLogs.length})</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Alle UIDs und Student-IDs werden zum Schutz vor Re-Identifikation maskiert.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter by User / Own logs */}
            <div className="flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
              <Filter className="w-3 h-3 text-slate-400" />
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="bg-transparent text-slate-700 text-xs focus:outline-none cursor-pointer"
              >
                <option value="all">Alle Studierenden</option>
                {students.map((s) => (
                  <option key={s.id} value={s.firstName}>
                    Nur {s.firstName} {s.lastName}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleExportCsv}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-xs font-semibold flex items-center gap-1 transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>CSV herunterladen</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px]">
              <tr>
                <th className="px-4 py-3">Zeitpunkt</th>
                <th className="px-4 py-3">Ereignis</th>
                <th className="px-4 py-3">Anzeigename (DSGVO)</th>
                <th className="px-4 py-3">Methode</th>
                <th className="px-4 py-3">Tür / Terminal</th>
                <th className="px-4 py-3">Maskierte UID</th>
                <th className="px-4 py-3">Auto-Löschung in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-xs">
                    Keine Zugangslogs für diesen Filter vorhanden.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isDenied = log.eventType === 'access_denied';
                  const isCheckIn = log.eventType === 'check_in';

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-slate-600 text-xs">
                        {new Date(log.timestamp).toLocaleTimeString('de-DE', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                            isCheckIn
                              ? 'bg-emerald-50 text-emerald-800'
                              : isDenied
                              ? 'bg-rose-50 text-rose-800'
                              : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {isCheckIn ? 'Check-In' : isDenied ? 'Verweigert' : 'Check-Out'}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-semibold text-slate-900 text-xs">
                        {log.displayName}
                        {log.reason && (
                          <div className="text-[11px] font-normal text-rose-600 mt-0.5">
                            {log.reason}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {log.method === 'rfid_door' ? 'Tür-Scanner' : 'BLE Beacon'}
                      </td>

                      <td className="px-4 py-3 font-mono text-slate-500 text-xs">
                        {log.doorId}
                      </td>

                      <td className="px-4 py-3 font-mono text-slate-500 text-xs">
                        {log.rfidUidMasked}
                      </td>

                      <td className="px-4 py-3 font-mono text-slate-500 text-xs">
                        {Math.max(
                          1,
                          Math.round(
                            ((new Date(log.retentionExpiresAt).getTime() - Date.now()) / (3600 * 1000)) * 10
                          ) / 10
                        )}{' '}
                        Std.
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
