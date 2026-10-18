export interface OccupancySnapshot {
  campusId: string;
  current: number;
  capacity: number;
  percentage: number;
  status: 'available' | 'busy' | 'full';
  source: 'access_control_sessions';
  updatedAt: string;
  lastAccessEventAt: string | null;
  hardwareStatus: 'not_verified';
}

function isOccupancySnapshot(value: unknown): value is OccupancySnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.campusId === 'string' &&
    Number.isInteger(item.current) && Number(item.current) >= 0 &&
    Number.isInteger(item.capacity) && Number(item.capacity) > 0 &&
    typeof item.percentage === 'number' &&
    (item.status === 'available' || item.status === 'busy' || item.status === 'full') &&
    item.source === 'access_control_sessions' &&
    typeof item.updatedAt === 'string' &&
    (item.lastAccessEventAt === null || typeof item.lastAccessEventAt === 'string') &&
    item.hardwareStatus === 'not_verified';
}

export async function fetchOccupancy(
  campusId: string,
  fetcher: typeof fetch = fetch,
): Promise<OccupancySnapshot> {
  const response = await fetcher(`/api/v1/occupancy?campusId=${encodeURIComponent(campusId)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Occupancy request failed: ${response.status}`);
  const payload: unknown = await response.json();
  if (!isOccupancySnapshot(payload) || payload.campusId !== campusId) {
    throw new Error('Occupancy API returned an invalid payload');
  }
  return payload;
}

export function subscribeToOccupancy(
  campusId: string,
  onUpdate: (snapshot: OccupancySnapshot) => void,
  onStatus?: (status: 'connecting' | 'connected' | 'disconnected') => void,
): () => void {
  if (typeof EventSource === 'undefined') {
    onStatus?.('disconnected');
    return () => undefined;
  }

  onStatus?.('connecting');
  const stream = new EventSource(`/api/v1/occupancy/stream?campusId=${encodeURIComponent(campusId)}`);
  stream.onopen = () => onStatus?.('connected');
  stream.addEventListener('occupancy', (event: MessageEvent<string>) => {
    try {
      const payload: unknown = JSON.parse(event.data);
      if (isOccupancySnapshot(payload) && payload.campusId === campusId) {
        onUpdate(payload);
      }
    } catch {
      // Ignore malformed stream events; EventSource reconnects automatically.
    }
  });
  stream.onerror = () => onStatus?.('disconnected');
  return () => stream.close();
}
