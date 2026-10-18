export interface PresenceState {
  isPresent: boolean;
  updatedAt: string | null;
  scope: 'this-device-demo';
}

export const EMPTY_PRESENCE_STATE: PresenceState = {
  isPresent: false,
  updatedAt: null,
  scope: 'this-device-demo',
};

export function parsePresence(value: unknown): PresenceState {
  if (typeof value !== 'string') return EMPTY_PRESENCE_STATE;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return EMPTY_PRESENCE_STATE;
    const record = parsed as Record<string, unknown>;
    if (typeof record.isPresent !== 'boolean' ||
        (record.updatedAt !== null &&
          (typeof record.updatedAt !== 'string' || !Number.isFinite(Date.parse(record.updatedAt))))) {
      return EMPTY_PRESENCE_STATE;
    }
    return {
      isPresent: record.isPresent,
      updatedAt: record.updatedAt,
      scope: 'this-device-demo',
    };
  } catch {
    return EMPTY_PRESENCE_STATE;
  }
}
