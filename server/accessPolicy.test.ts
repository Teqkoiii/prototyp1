import assert from 'node:assert/strict';
import test from 'node:test';
import { decideDoorAccess } from './accessPolicy';

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
