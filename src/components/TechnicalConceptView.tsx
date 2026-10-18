import React, { useState } from 'react';
import {
  BookOpen,
  Database,
  Server,
  Cpu,
  Shield,
  Layers,
  Copy,
  Check,
  Radio,
  CreditCard,
  Network,
} from 'lucide-react';

export const TechnicalConceptView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'architecture' | 'database' | 'backend' | 'hardware' | 'dsgvo'>('architecture');
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const sqlSchema = `-- ========================================================
-- POSTGRESQL SCHEMA: DHBW Bad Mergentheim Fitnessraum
-- ========================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. STUDIERENDE & ZUGANGSBERECHTIGUNGEN
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    matriculation_number VARCHAR(16) UNIQUE NOT NULL,
    email VARCHAR(128) UNIQUE NOT NULL CHECK (email LIKE '%@badmergentheim.dhbw.de' OR email LIKE '%@dhbw-mosbach.de'),
    first_name VARCHAR(64) NOT NULL,
    last_name VARCHAR(64) NOT NULL,
    course VARCHAR(64) NOT NULL, -- z.B. WWI2024, BWL-Industrie
    rfid_uid_hash VARCHAR(128) UNIQUE NOT NULL, -- Gehashte/verschlüsselte Chip-UID (Mifare DESFire)
    safety_briefing_completed BOOLEAN DEFAULT FALSE NOT NULL,
    safety_briefing_date DATE,
    safety_briefing_instructor VARCHAR(128),
    privacy_mode VARCHAR(16) DEFAULT 'pseudonym' CHECK (privacy_mode IN ('public', 'pseudonym', 'anonymous')),
    pseudonym_label VARCHAR(64),
    is_card_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. AKTUELLER RAUMSTATUS (SINGLETON FÜR LIVE-ANZEIGE)
CREATE TABLE gym_status (
    id VARCHAR(32) PRIMARY KEY DEFAULT 'CAMPUS_MGT_GYM_01',
    current_occupancy INT DEFAULT 0 NOT NULL,
    max_capacity INT DEFAULT 15 NOT NULL,
    warning_threshold INT DEFAULT 10 NOT NULL,
    critical_threshold INT DEFAULT 13 NOT NULL,
    is_open BOOLEAN DEFAULT TRUE NOT NULL,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. AKTIVE CHECK-INS (TRANSIENTE SITZUNGEN)
CREATE TABLE active_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    checked_in_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    method VARCHAR(24) NOT NULL CHECK (method IN ('rfid_door', 'ble_beacon', 'geofence')),
    door_id VARCHAR(32) DEFAULT 'DOOR-GYM-01',
    estimated_checkout_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '120 minutes'
);

-- 4. EPHEMERE ZUTRITTS-LOGS (DSGVO: TTL 4 STUNDEN)
CREATE TABLE ephemeral_access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    event_type VARCHAR(24) NOT NULL CHECK (event_type IN ('check_in', 'check_out', 'denied', 'auto_checkout')),
    masked_uid VARCHAR(32) NOT NULL,
    masked_student_id VARCHAR(32),
    display_name VARCHAR(64) NOT NULL,
    method VARCHAR(24) NOT NULL,
    reason TEXT,
    door_id VARCHAR(32) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '4 hours' NOT NULL
);

CREATE INDEX idx_logs_expires_at ON ephemeral_access_logs(expires_at);`;

  const firestoreSchema = `// ========================================================
// FIRESTORE NO-SQL BLUEPRINT & RULES
// ========================================================

// Collection: "students"
// Doc ID: student UID (Auth User ID)
{
  "matriculationNumber": "7192841",
  "email": "m.weber@badmergentheim.dhbw.de",
  "name": "Maximilian Weber",
  "course": "WWI 2024",
  "rfidUid": "3A:8F:12:0C", // Nur für Admin lesbar
  "safetyBriefingCompleted": true,
  "safetyBriefingDate": "2026-09-15T09:00:00Z",
  "privacyMode": "pseudonym", // 'public' | 'pseudonym' | 'anonymous'
  "pseudonymLabel": "Max W. (WWI)"
}

// Collection: "gymStatus"
// Doc ID: "current" (Echtzeit-Listener via onSnapshot)
{
  "currentCount": 4,
  "maxCapacity": 15,
  "status": "green", // "green" | "yellow" | "red"
  "lastUpdated": "2026-10-18T10:45:00Z",
  "activeVisitors": [
    { "displayName": "Max W. (WWI)", "timestampIn": "2026-10-18T10:15:00Z" },
    { "displayName": "DHBW Athlet #14", "timestampIn": "2026-10-18T10:28:00Z" }
  ]
}

// Firestore Security Rules (DSGVO-Härtung)
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /gymStatus/{docId} {
      allow read: if request.auth != null; // Jeder eingeloggte Studi darf Auslastung sehen
      allow write: if false; // Nur Cloud Function / Backend mit Service Account darf schreiben
    }
    match /students/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}`;

  const backendCode = `// ========================================================
// NODE.JS / EXPRESS: DOOR SCAN WEBHOOK & REALTIME BROADCAST
// ========================================================
import express from 'express';
import crypto from 'crypto';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const app = express();
app.use(express.json());
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const GATEWAY_SECRET = process.env.DOOR_GATEWAY_HMAC_SECRET;
if (!GATEWAY_SECRET) throw new Error('DOOR_GATEWAY_HMAC_SECRET must be configured securely');
const MAX_CAPACITY = 15;

// Broadcast an alle verbundenen WebSockets (Mobile Apps & Web Dashboards)
function broadcastGymState(currentOccupancy, status) {
  const payload = JSON.stringify({
    type: 'OCCUPANCY_UPDATE',
    current: currentOccupancy,
    max: MAX_CAPACITY,
    status: status, // 'green' | 'yellow' | 'red'
    timestamp: new Date().toISOString()
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// 1. TÜR-SCAN WEBHOOK (OPTION A: ESP32 / WIEGAND LESER)
app.post('/api/v1/door/scan', async (req, res) => {
  const signature = req.headers['x-gateway-signature'];
  const { rfidUid, doorId, timestamp } = req.body;

  // HMAC Verifikation: Stellt sicher, dass der Scan wirklich vom physischen Tür-Gateway stammt
  const expectedSig = 'sha256=' + crypto
    .createHmac('sha256', GATEWAY_SECRET)
    .update(\`\${rfidUid}:\${timestamp}:\${doorId}\`)
    .digest('hex');

  if (signature !== expectedSig) {
    return res.status(401).json({ error: 'Ungültige Gateway-Signatur' });
  }

  // Prüfe Student & Einweisung in DB
  const student = await db.findStudentByRfid(rfidUid);
  if (!student) {
    return res.status(403).json({ allowed: false, message: 'Unbekannte Karte' });
  }

  if (!student.safetyBriefingCompleted) {
    return res.status(403).json({ 
      allowed: false, 
      message: 'Sicherheitseinweisung fehlt! Zutritt verweigert.' 
    });
  }

  // Toggle Check-In / Check-Out
  const isCheckedIn = await db.isStudentCheckedIn(student.id);

  if (isCheckedIn) {
    // CHECK-OUT
    await db.removeActiveSession(student.id);
    const newCount = await db.getOccupancyCount();
    broadcastGymState(newCount, calculateStatus(newCount));
    
    return res.json({
      allowed: true,
      action: 'check_out',
      message: \`Auf Wiedersehen, \${student.firstName}!\`,
      occupancy: { current: newCount, max: MAX_CAPACITY }
    });
  } else {
    // CHECK-IN
    const currentCount = await db.getOccupancyCount();
    if (currentCount >= MAX_CAPACITY) {
      return res.status(429).json({
        allowed: false,
        message: 'Fitnessraum voll. Bitte warten.',
        occupancy: { current: currentCount, max: MAX_CAPACITY }
      });
    }

    await db.createActiveSession(student.id, 'rfid_door');
    const newCount = currentCount + 1;
    broadcastGymState(newCount, calculateStatus(newCount));

    return res.json({
      allowed: true,
      action: 'check_in',
      message: \`Willkommen, \${student.firstName}!\`,
      occupancy: { current: newCount, max: MAX_CAPACITY }
    });
  }
});

// 2. CRONJOB: AUTOMATISCHER CHECKOUT & DSGVO LOG-BEREINIGUNG
setInterval(async () => {
  // Auto-Checkout nach 120 Min (falls Studi vergessen hat auszuchecken)
  await db.autoCheckoutExpiredSessions(120);
  
  // DSGVO-Löschung aller Zutritts-Logs älter als 4 Stunden
  await db.purgeLogsOlderThanHours(4);
}, 60 * 1000);`;

  const hardwareFirmware = `// ========================================================
// ESP32 FIRMWARE (ARDUINO C++): WIEGAND / RC522 RFID GATEWAY
// ========================================================
#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <mbedtls/md.h>

#define SS_PIN  5
#define RST_PIN 22
#define RELAY_DOOR_PIN 26 // Schaltet 12V Motorschloss via Transistor/Relais
#define LED_GREEN_PIN  32
#define LED_RED_PIN    33
#define BUZZER_PIN     25

MFRC522 rfc(SS_PIN, RST_PIN);
const char* API_URL = "<CONFIGURE_BACKEND_URL>";
// Provision this secret securely per device. Never commit gateway credentials.
const char* HMAC_KEY = nullptr;

void setup() {
  Serial.begin(115200);
  SPI.begin();
  rfc.PCD_Init();
  
  pinMode(RELAY_DOOR_PIN, OUTPUT);
  pinMode(LED_GREEN_PIN, OUTPUT);
  pinMode(LED_RED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(RELAY_DOOR_PIN, LOW);

  // Load Wi-Fi credentials from secure device provisioning; do not hard-code them.
  WiFi.begin("<CONFIGURE_WIFI_SSID>", "<CONFIGURE_WIFI_PASSWORD>");
  while (WiFi.status() != WL_CONNECTED) delay(500);
}

void loop() {
  if (!rfc.PICC_IsNewCardPresent() || !rfc.PICC_ReadCardSerial()) return;

  // 1. UID auslesen (Hex-String z.B. "3A:8F:12:0C")
  String uidStr = "";
  for (byte i = 0; i < rfc.uid.size; i++) {
    if (i > 0) uidStr += ":";
    if (rfc.uid.uidByte[i] < 0x10) uidStr += "0";
    uidStr += String(rfc.uid.uidByte[i], HEX);
  }
  uidStr.toUpperCase();

  // 2. HTTPS Webhook senden
  sendDoorWebhook(uidStr);
  
  rfc.PICC_HaltA();
  rfc.PCD_StopCrypto1();
  delay(1200); // Entprellen
}

void openDoorRelay(int msDuration) {
  digitalWrite(LED_GREEN_PIN, HIGH);
  digitalWrite(RELAY_DOOR_PIN, HIGH); // Türöffner schaltet
  tone(BUZZER_PIN, 2000, 150);
  delay(msDuration);
  digitalWrite(RELAY_DOOR_PIN, LOW);
  digitalWrite(LED_GREEN_PIN, LOW);
}`;

  return (
    <div className="space-y-6">
      {/* Subtab Navigation */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg overflow-x-auto text-xs">
        <button
          onClick={() => setActiveSubTab('architecture')}
          className={`px-3 py-1.5 font-semibold rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeSubTab === 'architecture' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          1. Systemarchitektur & Ablauf
        </button>
        <button
          onClick={() => setActiveSubTab('database')}
          className={`px-3 py-1.5 font-semibold rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeSubTab === 'database' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          2. Datenbank-Schema (SQL & NoSQL)
        </button>
        <button
          onClick={() => setActiveSubTab('backend')}
          className={`px-3 py-1.5 font-semibold rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeSubTab === 'backend' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          3. Backend API & WebSockets
        </button>
        <button
          onClick={() => setActiveSubTab('hardware')}
          className={`px-3 py-1.5 font-semibold rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeSubTab === 'hardware' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          4. Hardware & ESP32 Firmware
        </button>
        <button
          onClick={() => setActiveSubTab('dsgvo')}
          className={`px-3 py-1.5 font-semibold rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeSubTab === 'dsgvo' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          5. DSGVO-Sicherheitskonzept
        </button>
      </div>

      {/* 1. Architecture View */}
      {activeSubTab === 'architecture' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <h3 className="text-base font-bold text-slate-900 mb-2">
              Empfohlener Tech-Stack für die DHBW Bad Mergentheim
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              Für maximale Zuverlässigkeit, minimalen Wartungsaufwand an der Hochschule und nahtlose Plattformunabhängigkeit (iOS, Android, Desktop) wird eine moderne Cross-Platform-Architektur empfohlen:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">Frontend / App</span>
                <span className="text-slate-700 font-medium">React Native (Expo) / PWA</span>
                <p className="text-slate-500 text-[11px] mt-1.5 leading-relaxed">
                  Eine einzige Codebasis für iOS, Android und Web. Unterstützt Push-Benachrichtigungen und BLE-Hintergrundabfrage.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">Backend</span>
                <span className="text-slate-700 font-medium">Node.js / Express oder Firebase</span>
                <p className="text-slate-500 text-[11px] mt-1.5 leading-relaxed">
                  Leichtgewichtige REST-API mit WebSocket-Server oder Firebase Cloud Functions zur Echtzeit-Synchronisation.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">Echtzeit-Datenbank</span>
                <span className="text-slate-700 font-medium">PostgreSQL + Redis oder Firestore</span>
                <p className="text-slate-500 text-[11px] mt-1.5 leading-relaxed">
                  Sofortige Verteilung von Belegungsänderungen über Pub/Sub. Ephemere Logs mit TTL zur DSGVO-Konformität.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">Hardware Gateway</span>
                <span className="text-slate-700 font-medium">ESP32 + Wiegand / RFID-Leser</span>
                <p className="text-slate-500 text-[11px] mt-1.5 leading-relaxed">
                  Liest 13.56 MHz DHBW-Studierendenausweise (Mifare DESFire), signiert Scans mit HMAC und schaltet das 12V Relais.
                </p>
              </div>
            </div>
          </div>

          {/* Comparison: Option A vs Option B vs Hybrider Mix */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <h3 className="text-base font-bold text-slate-900 mb-2">
              Vergleich: Option A (Tür-Scanner) vs. Option B (BLE-Beacon / Geofence)
            </h3>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Die beste Praxislösung kombiniert beide Ansätze: <strong>Option A als primärer, rechtssicherer Türöffner</strong> und <strong>Option B bzw. Timeouts als intelligenter Check-Out-Assistent</strong>.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                  <tr>
                    <th className="p-3">Kriterium</th>
                    <th className="p-3 text-red-700">Option A: Physischer Tür-Scanner (RFID)</th>
                    <th className="p-3 text-sky-700">Option B: Smartphone BLE / Geofence</th>
                    <th className="p-3 text-emerald-700">Empfehlung: Hybrider Goldstandard</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  <tr>
                    <td className="p-3 font-semibold text-slate-900">Check-In Zuverlässigkeit</td>
                    <td className="p-3"><strong>99.9%</strong> (Physischer Zwang: Tür bleibt sonst zu)</td>
                    <td className="p-3">75-85% (Bluetooth aus, Energiesparmodus von iOS/Android)</td>
                    <td className="p-3 text-emerald-800 font-medium">100% Einlass nur bei Ausweis-Scan</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-slate-900">Check-Out Zuverlässigkeit</td>
                    <td className="p-3">Häufig vergessen, wenn von innen Drücker/Panikstange vorhanden</td>
                    <td className="p-3">Gut, sobald Signalstärke unter Schwellenwert fällt</td>
                    <td className="p-3 text-emerald-800 font-medium">RFID-Tap beim Verlassen ODER BLE/Auto-Timeout</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-slate-900">Datenschutz & DSGVO</td>
                    <td className="p-3">Sehr hoch: Kein Tracking außerhalb der Tür</td>
                    <td className="p-3">Sensibler: App benötigt Standort/Bluetooth-Rechte</td>
                    <td className="p-3 text-emerald-800 font-medium">DSGVO-sauber: Nur lokale RSSI-Beacon-Erkennung</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-slate-900">Hardware-Aufwand</td>
                    <td className="p-3">Gering: 1x ESP32 + RFID-Leser an der Tür (~35 €)</td>
                    <td className="p-3">Minimal: 1x BLE-Beacon an die Wand kleben (~15 €)</td>
                    <td className="p-3 text-emerald-800 font-medium">Kombiniertes Gateway (~50 € Gesamt)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. Database View */}
      {activeSubTab === 'database' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Relationales PostgreSQL Schema</h3>
                <p className="text-xs text-slate-500">Normalisiertes DDL-Schema mit Foreign Keys, Check-Constraints und DSGVO-TTL</p>
              </div>
              <button
                onClick={() => copyToClipboard(sqlSchema, 'sql')}
                className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded flex items-center gap-1 font-medium"
              >
                {copiedIndex === 'sql' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>SQL kopieren</span>
              </button>
            </div>
            <pre className="bg-slate-950 text-slate-200 p-4 rounded-lg font-mono text-[11px] overflow-x-auto leading-relaxed max-h-96">
              {sqlSchema}
            </pre>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Firebase Firestore NoSQL Blueprint & Rules</h3>
                <p className="text-xs text-slate-500">Echtzeit-synchronisierte Dokumentenstruktur für Live-Dashboard und Mobile Client</p>
              </div>
              <button
                onClick={() => copyToClipboard(firestoreSchema, 'firestore')}
                className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded flex items-center gap-1 font-medium"
              >
                {copiedIndex === 'firestore' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Rules kopieren</span>
              </button>
            </div>
            <pre className="bg-slate-950 text-slate-200 p-4 rounded-lg font-mono text-[11px] overflow-x-auto leading-relaxed max-h-80">
              {firestoreSchema}
            </pre>
          </div>
        </div>
      )}

      {/* 3. Backend API View */}
      {activeSubTab === 'backend' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Node.js Express Controller mit WebSockets & HMAC</h3>
              <p className="text-xs text-slate-500">Zentraler Endpunkt zur Validierung von Türscans, Kapazitätskontrolle und Broadcast an alle Apps</p>
            </div>
            <button
              onClick={() => copyToClipboard(backendCode, 'backend')}
              className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded flex items-center gap-1 font-medium"
            >
              {copiedIndex === 'backend' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>Code kopieren</span>
            </button>
          </div>
          <pre className="bg-slate-950 text-slate-200 p-4 rounded-lg font-mono text-[11px] overflow-x-auto leading-relaxed max-h-[500px]">
            {backendCode}
          </pre>
        </div>
      )}

      {/* 4. Hardware View */}
      {activeSubTab === 'hardware' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <h3 className="text-base font-bold text-slate-900 mb-3">
              Hardware-Integrations-Leitfaden (Schritt-für-Schritt)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs mb-6">
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <span className="font-bold text-red-600 block mb-1">Schritt 1: Hardware-Montage</span>
                <p className="text-slate-600 leading-relaxed">
                  Montage eines wetterfesten 13.56 MHz RFID/Wiegand-Lesers außen an der Gym-Tür. Verkabelung (D0, D1, 12V, GND) mit einem ESP32-Microcontroller im gesicherten Gehäuse im Innenbereich.
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <span className="font-bold text-red-600 block mb-1">Schritt 2: Relais-Schaltung</span>
                <p className="text-slate-600 leading-relaxed">
                  Ein 5V-Relais am ESP32 schaltet den 12V-Arbeitsstromkontakt des bestehenden Türsummers bzw. Motorschlosses. Bei Freigabe wird das Relais für 3000ms geschlossen.
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <span className="font-bold text-red-600 block mb-1">Schritt 3: Sichere Netzwerk-Anbindung</span>
                <p className="text-slate-600 leading-relaxed">
                  Der ESP32 verbindet sich mit dem isolierten DHBW-Campus-IoT-WLAN und sendet HTTPS-POST-Requests mit HMAC-SHA256 Signatur an das Server-Backend.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between mb-3 pt-3 border-t border-slate-100">
              <div>
                <h4 className="text-sm font-bold text-slate-900">ESP32 Firmware Code (Arduino C++)</h4>
                <p className="text-xs text-slate-500">MFRC522 SPI-Treiber, HTTPS-Client und Relaissteuerung</p>
              </div>
              <button
                onClick={() => copyToClipboard(hardwareFirmware, 'firmware')}
                className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded flex items-center gap-1 font-medium"
              >
                {copiedIndex === 'firmware' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Firmware kopieren</span>
              </button>
            </div>
            <pre className="bg-slate-950 text-slate-200 p-4 rounded-lg font-mono text-[11px] overflow-x-auto leading-relaxed max-h-96">
              {hardwareFirmware}
            </pre>
          </div>
        </div>
      )}

      {/* 5. DSGVO View */}
      {activeSubTab === 'dsgvo' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900">
            Datenschutz & Sicherheit nach EU-DSGVO
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Die Erfassung von Zutrittsdaten an einer Hochschule unterliegt strengen Anforderungen des Datenschutzes. Das System ist nach dem Prinzip <em>Privacy by Design</em> und <em>Datenminimierung (Art. 5 DSGVO)</em> aufgebaut:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-2">
            <div className="p-4 bg-emerald-50/70 border border-emerald-100 rounded-lg">
              <span className="font-bold text-emerald-900 block mb-1">1. Keine Bewegungsprofile</span>
              <p className="text-emerald-800 leading-relaxed text-[11px]">
                Zutritts-Logs werden nach maximal 4 Stunden automatisiert und unwiderruflich aus der Datenbank gelöscht. Es werden keine langfristigen Historien gespeichert, wann welcher Studierende trainiert hat.
              </p>
            </div>

            <div className="p-4 bg-emerald-50/70 border border-emerald-100 rounded-lg">
              <span className="font-bold text-emerald-900 block mb-1">2. Freiwillige Anzeigemodi</span>
              <p className="text-emerald-800 leading-relaxed text-[11px]">
                Jeder Studierende kann selbst wählen, wie er im Live-Dashboard erscheint: Vollständiger Name, neutrales Pseudonym (z.B. "DHBW Studi #12") oder vollständig anonym als "+1 Person".
              </p>
            </div>

            <div className="p-4 bg-emerald-50/70 border border-emerald-100 rounded-lg">
              <span className="font-bold text-emerald-900 block mb-1">3. Verschlüsselte Chip-UID</span>
              <p className="text-emerald-800 leading-relaxed text-[11px]">
                Die physische Seriennummer (UID) des Studierendenausweises wird im Backend ausschließlich gehasht und mit Salts versehen verarbeitet, um Missbrauch bei Datenlecks auszuschließen.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
