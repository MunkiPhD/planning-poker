import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { startServer, type RunningServer } from "./server.js";
import type { Clock } from "./rooms.js";
import type { ClientMessage, RoomState, ServerMessage } from "../shared/messages.js";

class FakeClock implements Clock {
  t = 0;
  private timers: { at: number; fn: () => void; h: number }[] = [];
  private n = 0;
  now() {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number) {
    const h = ++this.n;
    this.timers.push({ at: this.t + ms, fn, h });
    return h;
  }
  clearTimeout(h: unknown) {
    this.timers = this.timers.filter((x) => x.h !== h);
  }
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      const due = this.timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.timers = this.timers.filter((x) => x !== due);
      this.t = due.at;
      due.fn();
    }
    this.t = end;
  }
}

const SEC = 1000;
const HOUR = 3600 * SEC;
let server: RunningServer;
let port: number;
let clock: FakeClock;
const open: Client[] = [];

class Client {
  messages: ServerMessage[] = [];
  isClosed = false;
  private constructor(private ws: WebSocket) {
    ws.on("message", (d) => this.messages.push(JSON.parse(d.toString())));
    ws.on("close", () => (this.isClosed = true));
  }
  static async connect() {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    await new Promise((res, rej) => {
      ws.on("open", res);
      ws.on("error", rej);
    });
    const c = new Client(ws);
    open.push(c);
    return c;
  }
  send(m: ClientMessage) {
    this.ws.send(JSON.stringify(m));
  }
  close() {
    this.ws.close();
  }
  async waitFor<T extends ServerMessage>(pred: (m: ServerMessage) => m is T, from = 0): Promise<T> {
    const deadline = Date.now() + 2000;
    for (;;) {
      const f = this.messages.slice(from).find(pred);
      if (f) return f;
      if (Date.now() > deadline) throw new Error("timeout; got " + JSON.stringify(this.messages.slice(from)));
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  async waitClosed() {
    const deadline = Date.now() + 2000;
    while (!this.isClosed) {
      if (Date.now() > deadline) throw new Error("socket not closed");
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  async state(pred: (s: RoomState) => boolean, from = 0) {
    return (await this.waitFor((m): m is Extract<ServerMessage, { type: "state" }> => m.type === "state" && pred(m.state), from)).state;
  }
}

async function newRoom() {
  const c = await Client.connect();
  c.send({ type: "create_room" });
  const m = await c.waitFor((m): m is Extract<ServerMessage, { type: "room_created" }> => m.type === "room_created");
  c.close();
  return m.roomId;
}

async function joinAs(roomId: string, name: string) {
  const c = await Client.connect();
  c.send({ type: "join", roomId, name, observer: false, token: name + "-token" });
  await c.state((s) => s.participants.some((p) => p.name === name));
  return c;
}

const names = (s: RoomState) => s.participants.map((p) => p.name).sort();

beforeEach(async () => {
  clock = new FakeClock();
  server = await startServer({ port: 0, staticDir: "/nonexistent", clock });
  port = (server.httpServer.address() as AddressInfo).port;
});
afterEach(async () => {
  open.splice(0).forEach((c) => c.close());
  await server.close();
});

describe("disconnect grace", () => {
  it("removes a disconnected participant after 30s and broadcasts", async () => {
    const room = await newRoom();
    const a = await joinAs(room, "ann");
    const b = await joinAs(room, "bob");
    const from = a.messages.length;
    b.close();
    await a.state((s) => s.participants.find((p) => p.name === "bob")?.connected === false, from);
    clock.advance(29 * SEC);
    expect(a.messages.slice(from).some((m) => m.type === "state" && names(m.state).join() === "ann")).toBe(false);
    clock.advance(2 * SEC);
    const s = await a.state((s) => names(s).join() === "ann", from);
    expect(s.voterCount).toBe(1);
  });

  it("keeps seat and vote when resuming by token within the grace period", async () => {
    const room = await newRoom();
    const a = await joinAs(room, "ann");
    const b = await joinAs(room, "bob");
    b.send({ type: "vote", card: 5 });
    await b.state((s) => s.votedCount === 1);
    const from = a.messages.length;
    b.close();
    await a.state((s) => s.participants.find((p) => p.name === "bob")?.connected === false, from);
    clock.advance(20 * SEC);
    const b2 = await Client.connect();
    b2.send({ type: "join", roomId: room, name: "bob", observer: false, token: "bob-token" });
    const s = await b2.state((s) => names(s).join() === "ann,bob");
    expect(s.participants.find((p) => p.name === "bob")).toMatchObject({ connected: true, hasVoted: true, vote: 5 });
    clock.advance(60 * SEC);
    const after = a.messages.length;
    a.send({ type: "reveal" });
    const r = await a.state((s) => s.phase === "revealed", after);
    expect(names(r)).toEqual(["ann", "bob"]);
    expect(r.result).toEqual({ kind: "points", points: 5 });
  });
});

describe("idle rooms", () => {
  it("deletes a room idle for 12h and reports room_not_found", async () => {
    const room = await newRoom();
    clock.advance(13 * HOUR);
    const c = await Client.connect();
    c.send({ type: "join", roomId: room, name: "late", observer: false, token: "t" });
    const e = await c.waitFor((m): m is Extract<ServerMessage, { type: "error" }> => m.type === "error");
    expect(e.code).toBe("room_not_found");
    expect(e.message).toMatch(/no longer exists/);
  });

  it("keeps a room alive while there is activity", async () => {
    const room = await newRoom();
    const a = await joinAs(room, "ann");
    clock.advance(8 * HOUR);
    a.send({ type: "reveal" });
    await a.state((s) => s.phase === "revealed");
    clock.advance(8 * HOUR);
    const b = await joinAs(room, "bob");
    expect(b).toBeDefined();
  });
});

describe("idle deletion with connected sockets", () => {
  it("tells connected sockets room_not_found and closes them", async () => {
    const room = await newRoom();
    const a = await joinAs(room, "ann");
    const from = a.messages.length;
    clock.advance(13 * HOUR);
    const e = await a.waitFor((m): m is Extract<ServerMessage, { type: "error" }> => m.type === "error", from);
    expect(e.code).toBe("room_not_found");
    await a.waitClosed();
  });
});

describe("second join on one socket", () => {
  it("releases the old seat so it is removed after the grace period", async () => {
    const room = await newRoom();
    const a = await joinAs(room, "ann");
    const b = await joinAs(room, "bob");
    const from = a.messages.length;
    b.send({ type: "join", roomId: room, name: "bob2", observer: false, token: "bob2-token" });
    const s = await a.state((s) => names(s).join() === "ann,bob,bob2", from);
    expect(s.participants.find((p) => p.name === "bob")?.connected).toBe(false);
    expect(s.participants.find((p) => p.name === "bob2")?.connected).toBe(true);
    clock.advance(31 * SEC);
    await a.state((s) => names(s).join() === "ann,bob2", from);
  });

  it("re-joining the same seat on the same socket keeps it connected", async () => {
    const room = await newRoom();
    const a = await joinAs(room, "ann");
    a.send({ type: "join", roomId: room, name: "ann", observer: false, token: "ann-token" });
    const from = a.messages.length;
    clock.advance(60 * SEC);
    a.send({ type: "reveal" });
    const s = await a.state((s) => s.phase === "revealed", from);
    expect(s.participants).toHaveLength(1);
    expect(s.participants[0].connected).toBe(true);
  });
});

describe("rejoin with an existing token", () => {
  it("applies the new name and observer flag, dropping a vote when becoming an observer", async () => {
    const room = await newRoom();
    const a = await joinAs(room, "ann");
    a.send({ type: "vote", card: 5 });
    await a.state((s) => s.votedCount === 1);
    a.close();
    const a2 = await Client.connect();
    a2.send({ type: "join", roomId: room, name: "Annie", observer: true, token: "ann-token" });
    const s = await a2.state((s) => names(s).join() === "Annie");
    expect(s.participants).toHaveLength(1);
    expect(s.participants[0]).toMatchObject({ name: "Annie", observer: true, connected: true, hasVoted: false });
    expect(s.voterCount).toBe(0);
  });
});
