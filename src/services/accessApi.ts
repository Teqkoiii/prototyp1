export async function checkAccessApi(fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetcher('/api/v1/health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;

    const payload: unknown = await response.json();
    return typeof payload === 'object' && payload !== null &&
      !Array.isArray(payload) && 'status' in payload && payload.status === 'ok';
  } catch {
    return false;
  }
}
