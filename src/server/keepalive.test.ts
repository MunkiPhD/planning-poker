import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { startKeepAlive } from "./keepalive.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("pings /healthz while rooms are active and stops when they go idle", () => {
  const fetch = vi.fn().mockResolvedValue(undefined);
  let active = true;
  const stop = startKeepAlive({
    url: "https://x.onrender.com/",
    hasActivityWithin: () => active,
    intervalMs: 1000,
    fetch,
  });
  vi.advanceTimersByTime(2000);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenCalledWith("https://x.onrender.com/healthz");
  active = false;
  vi.advanceTimersByTime(3000);
  expect(fetch).toHaveBeenCalledTimes(2);
  stop();
});
