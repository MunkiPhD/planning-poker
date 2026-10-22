/**
 * Render's free tier sleeps a service after ~15 minutes without inbound traffic, which
 * would drop all in-memory rooms mid-meeting. While a room has had real activity recently,
 * ping our own public URL so the service stays awake. Once activity stops for `maxIdleMs`
 * the pings stop and Render can sleep the service as usual.
 */
export interface KeepAliveOptions {
  /** Public URL of this service (Render sets RENDER_EXTERNAL_URL). */
  url: string;
  hasActivityWithin(ms: number): boolean;
  intervalMs?: number;
  maxIdleMs?: number;
  fetch?: (url: string) => Promise<unknown>;
}

export const KEEPALIVE_INTERVAL_MS = 10 * 60 * 1000;
export const KEEPALIVE_MAX_IDLE_MS = 4 * 60 * 60 * 1000;

export function startKeepAlive({
  url,
  hasActivityWithin,
  intervalMs = KEEPALIVE_INTERVAL_MS,
  maxIdleMs = KEEPALIVE_MAX_IDLE_MS,
  fetch: doFetch = (u) => fetch(u),
}: KeepAliveOptions): () => void {
  const target = `${url.replace(/\/$/, "")}/healthz`;
  const handle = setInterval(() => {
    if (!hasActivityWithin(maxIdleMs)) return;
    doFetch(target).catch(() => {});
  }, intervalMs);
  handle.unref();
  return () => clearInterval(handle);
}
