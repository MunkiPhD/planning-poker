/** Persisted identity for a room: secret token (per room) + display name (global). */

export interface Session {
  token: string;
  name: string;
  observer: boolean;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const tokenKey = (roomId: string) => `pp:token:${roomId}`;
const observerKey = (roomId: string) => `pp:observer:${roomId}`;
const NAME_KEY = "pp:name";

export function newToken(): string {
  return globalThis.crypto.randomUUID();
}

export function getSavedName(store: Store): string {
  return store.getItem(NAME_KEY) ?? "";
}

/** Returns a session only if both a token and a non-empty name are stored (enables auto-rejoin). */
export function loadSession(store: Store, roomId: string): Session | null {
  const token = store.getItem(tokenKey(roomId));
  const name = getSavedName(store).trim();
  if (!token || !name) return null;
  return { token, name, observer: store.getItem(observerKey(roomId)) === "1" };
}

/** Saves a session, reusing the room's existing token so the same seat is reclaimed. */
export function saveSession(store: Store, roomId: string, name: string, observer: boolean): Session {
  const token = store.getItem(tokenKey(roomId)) ?? newToken();
  const trimmed = name.trim();
  store.setItem(tokenKey(roomId), token);
  store.setItem(observerKey(roomId), observer ? "1" : "0");
  store.setItem(NAME_KEY, trimmed);
  return { token, name: trimmed, observer };
}

/** Forget a room (e.g. it no longer exists). The name is kept for convenience. */
export function clearSession(store: Store, roomId: string): void {
  store.removeItem(tokenKey(roomId));
  store.removeItem(observerKey(roomId));
}
