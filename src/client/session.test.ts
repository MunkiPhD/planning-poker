import { beforeEach, describe, expect, it } from "vitest";
import { clearSession, getSavedName, loadSession, saveSession } from "./session";

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("session storage", () => {
  let store: ReturnType<typeof memStore>;
  beforeEach(() => {
    store = memStore();
  });

  it("returns null when nothing is saved", () => {
    expect(loadSession(store, "abc")).toBeNull();
  });

  it("round-trips name, observer flag and token", () => {
    const s = saveSession(store, "abc", "  Ann ", true);
    expect(s.name).toBe("Ann");
    expect(loadSession(store, "abc")).toEqual(s);
  });

  it("reuses the same token for the same room, different token per room", () => {
    const a1 = saveSession(store, "abc", "Ann", false);
    const a2 = saveSession(store, "abc", "Ann2", false);
    const b = saveSession(store, "xyz", "Ann", false);
    expect(a2.token).toBe(a1.token);
    expect(b.token).not.toBe(a1.token);
  });

  it("clearSession forgets the room but keeps the name", () => {
    saveSession(store, "abc", "Ann", false);
    clearSession(store, "abc");
    expect(loadSession(store, "abc")).toBeNull();
    expect(getSavedName(store)).toBe("Ann");
  });
});
