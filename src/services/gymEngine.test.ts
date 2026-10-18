import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_ACCESS_LOGS, INITIAL_CHECKINS, INITIAL_GYM_STATE, INITIAL_STUDENTS } from '../data/mockDatabase';
import { processDoorScan } from './gymEngine';

test('denies a known student when scanning at a campus they are not assigned to', () => {
  const student = INITIAL_STUDENTS.find((candidate) => candidate.id === 'stud-01');
  assert.ok(student, 'fixture student should exist');

  const result = processDoorScan(
    student.rfidUid,
    INITIAL_STUDENTS,
    INITIAL_CHECKINS.filter((checkIn) => checkIn.studentId !== student.id),
    INITIAL_ACCESS_LOGS,
    INITIAL_GYM_STATE,
    'rfid_door',
    'dhbw-mosbach',
    1,
  );

  assert.equal(result.doorResponse.allowed, false);
  assert.equal(result.rawApiPayload.statusCode, 403);
  assert.match(result.doorResponse.message, /Standort/i);
  assert.equal(result.updatedCheckIns.some((checkIn) => checkIn.studentId === student.id), false);
  assert.match(result.updatedLogs[0]?.reason ?? '', /Campus-Zuordnung/i);
});

test('does not claim the simulated gateway payload is cryptographically authenticated', () => {
  const student = INITIAL_STUDENTS.find((candidate) => candidate.id === 'stud-01');
  assert.ok(student, 'fixture student should exist');

  const result = processDoorScan(
    student.rfidUid,
    INITIAL_STUDENTS,
    INITIAL_CHECKINS.filter((checkIn) => checkIn.studentId !== student.id),
    INITIAL_ACCESS_LOGS,
    INITIAL_GYM_STATE,
    'rfid_door',
    'dhbw-mgt',
    1,
  );

  const headers = result.rawApiPayload.request.headers as Record<string, string>;
  assert.equal(headers['X-Gateway-Signature'], 'SIMULATION_ONLY_NOT_AUTHENTICATED');
});
