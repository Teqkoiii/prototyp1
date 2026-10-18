import assert from 'node:assert/strict';
import test from 'node:test';
import { decideDoorAccess, isStudentAuthorizedAtCampus } from './accessPolicy';

test('allows check-out for an active session even if the card was disabled', () => {
  assert.deepEqual(decideDoorAccess({
    checkedIn: true,
    cardActive: false,
    briefingComplete: false,
    isWednesday: true,
    isEmployee: false,
  }), { action: 'check_out', allowed: true });
});

test('denies an inactive card at entry', () => {
  assert.deepEqual(decideDoorAccess({
    checkedIn: false,
    cardActive: false,
    briefingComplete: true,
    isWednesday: false,
    isEmployee: false,
  }), { action: 'denied', allowed: false, reason: 'card_disabled' });
});

test('limits Wednesday entry to employees', () => {
  assert.deepEqual(decideDoorAccess({
    checkedIn: false,
    cardActive: true,
    briefingComplete: true,
    isWednesday: true,
    isEmployee: false,
  }), { action: 'denied', allowed: false, reason: 'employee_only_day' });
});

test('only allows entry at the student campus when there is no active session', () => {
  assert.equal(isStudentAuthorizedAtCampus('dhbw-mgt', undefined, 'dhbw-mgt'), true);
  assert.equal(isStudentAuthorizedAtCampus('dhbw-mgt', undefined, 'dhbw-mosbach'), false);
});

test('keeps an active session bound to the campus where it started', () => {
  assert.equal(isStudentAuthorizedAtCampus('dhbw-mosbach', 'dhbw-mgt', 'dhbw-mgt'), true);
  assert.equal(isStudentAuthorizedAtCampus('dhbw-mgt', 'dhbw-mgt', 'dhbw-mosbach'), false);
});
