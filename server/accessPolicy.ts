export type DoorDecision =
  | { action: 'check_in'; allowed: true }
  | { action: 'check_out'; allowed: true }
  | { action: 'denied'; allowed: false; reason: string };

export interface DoorPolicyInput {
  checkedIn: boolean;
  cardActive: boolean;
  briefingComplete: boolean;
  isWednesday: boolean;
  isEmployee: boolean;
}

/** Checks checkout first so an existing visitor can leave if a card or briefing changes. */
export function decideDoorAccess(input: DoorPolicyInput): DoorDecision {
  if (input.checkedIn) return { action: 'check_out', allowed: true };
  if (!input.cardActive) return { action: 'denied', allowed: false, reason: 'card_disabled' };
  if (!input.briefingComplete) return { action: 'denied', allowed: false, reason: 'briefing_required' };
  if (input.isWednesday && !input.isEmployee) {
    return { action: 'denied', allowed: false, reason: 'employee_only_day' };
  }
  return { action: 'check_in', allowed: true };
}
