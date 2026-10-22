import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { startServer, type RunningServer } from "./server.js";
import type { Card, ClientMessage, RoomState, ServerMessage } from "../shared/messages.js";

let server: RunningServer;
let port: number;
const open: Client[] = [];

type Of<T extends ServerMessage["type"]> = Extract<ServerMessage, { type: T }>;

class Client {
  messages: ServerMessage[] = [];
  raw: string[] = [];
  private waiters: (() => void)[] = [];
  closeCode?: number;
  private constructor(private ws: WebSocket) {
    ws.on("close", (code) => (this.closeCode = code));
    ws.on("message", (d) => {
      this.raw.push(d.toString());
      this.messages.push(JSON.parse(d.toString()));
      this.waiters.splice(0).forEach((w) => w());
    });
  }
  static async connect(): Promise<Client> {
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
  sendRaw(s: string) {
    this.ws.send(s);
  }
  close() {
    this.ws.close();
  }
  mark() {
    return this.messages.length;
  }
  /** First message at index >= from matching the predicate; waits for it. */
  async waitFor<T extends ServerMessage>(pred: (m: ServerMessage) => m is T, from = 0): Promise<T> {
    const deadline = Date.now() + 2000;
    for (;;) {
      const found = this.messages.slice(from).find(pred);
      if (found) return found;
      if (Date.now() > deadline) throw new Error("timeout; got " + JSON.stringify(this.messages.slice(from)));
      await new Promise<void>((res) => {
        this.waiters.push(res);
        setTimeout(res, 100);
      });
    }
  }
  async state(pred: (s: RoomState) => boolean = () => true, from = 0): Promise<RoomState> {
    const m = await this.waitFor((m): m is Of<"state"> => m.type === "state" && pred(m.state), from);
    return m.state;
  }
  async error(from = 0) {
    return this.waitFor((m): m is Of<"error"> => m.type === "error", from);
  }
}

async function newRoom(): Promise<string> {
  const c = await Client.connect();
  c.send({ type: "create_room" });
  const m = await c.waitFor((m): m is Of<"room_created"> => m.type === "room_created");
  c.close();
  return m.roomId;
}

async function joinAs(roomId: string, name: string, observer = false, token = name + "-token") {
  const c = await Client.connect();
  c.send({ type: "join", roomId, name, observer, token });
  const st = await c.state((s) => s.participants.some((p) => p.name === name));
  return { c, id: st.you };
}

/** Joins voters, votes, and reveals from the first. */
async function roundWith(votes: (Card | null)[], opts?: { observer?: boolean }) {
  const room = await newRoom();
  const players: Awaited<ReturnType<typeof joinAs>>[] = [];
  for (let i = 0; i < votes.length; i++) players.push(await joinAs(room, `p${i}`));
  const obs = opts?.observer ? await joinAs(room, "obs", true) : undefined;
  votes.forEach((v, i) => v !== null && players[i].c.send({ type: "vote", card: v }));
  const first = players[0].c;
  await first.state((s) => s.votedCount === votes.filter((v) => v !== null).length);
  const from = first.mark();
  first.send({ type: "reveal" });
  const revealed = await first.state((s) => s.phase === "revealed", from);
  return { room, revealed, players, obs };
}

beforeAll(async () => {
  server = await startServer({ port: 0, staticDir: new URL("./fixtures", import.meta.url).pathname });
  port = (server.httpServer.address() as AddressInfo).port;
});
afterAll(async () => {
  open.forEach((c) => c.close());
  await server.close();
});

describe("rooms and joining", () => {
  it("creates rooms with distinct unguessable ids", async () => {
    const a = await newRoom();
    const b = await newRoom();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(12);
  });

  it("join puts the participant in the room state", async () => {
    const room = await newRoom();
    const { c, id } = await joinAs(room, "Ann");
    const st = await c.state();
    expect(st.phase).toBe("voting");
    expect(st.you).toBe(id);
    expect(st.participants).toMatchObject([{ id, name: "Ann", observer: false, hasVoted: false }]);
  });

  it("others see a new joiner in real time", async () => {
    const room = await newRoom();
    const { c: ann } = await joinAs(room, "Ann");
    await joinAs(room, "Bob");
    const st = await ann.state((s) => s.participants.length === 2);
    expect(st.participants.map((p) => p.name)).toEqual(["Ann", "Bob"]);
  });

  it("joining a missing room returns room_not_found", async () => {
    const c = await Client.connect();
    c.send({ type: "join", roomId: "nope", name: "Ann", token: "t" });
    expect((await c.error()).code).toBe("room_not_found");
  });

  it("requires a display name", async () => {
    const room = await newRoom();
    const c = await Client.connect();
    c.send({ type: "join", roomId: room, name: "   ", token: "t" });
    expect((await c.error()).code).toBe("name_required");
  });

  it("rejects actions before joining and malformed messages", async () => {
    const c = await Client.connect();
    c.send({ type: "vote", card: 3 });
    expect((await c.error()).code).toBe("not_joined");
    const from = c.mark();
    c.sendRaw("not json");
    expect((await c.error(from)).code).toBe("bad_message");
  });

  it("rejoining with the same token reclaims the seat and vote", async () => {
    const room = await newRoom();
    const { c: ann, id } = await joinAs(room, "Ann", false, "ann-secret");
    ann.send({ type: "vote", card: 5 });
    await ann.state((s) => s.votedCount === 1);
    ann.close();
    const again = await Client.connect();
    again.send({ type: "join", roomId: room, name: "Ann", token: "ann-secret" });
    const st = await again.state();
    expect(st.you).toBe(id);
    expect(st.participants).toHaveLength(1);
    expect(st.participants[0].vote).toBe(5);
  });
});

describe("voting and privacy", () => {
  it("before reveal, others only see voted/waiting; you see your own vote", async () => {
    const room = await newRoom();
    const { c: ann, id: annId } = await joinAs(room, "Ann");
    const { c: bob } = await joinAs(room, "Bob");
    ann.send({ type: "vote", card: 8 });
    const bobView = await bob.state((s) => s.votedCount === 1);
    const annView = await ann.state((s) => s.participants.some((p) => p.vote === 8));
    expect(bobView.participants.find((p) => p.id === annId)).toMatchObject({ hasVoted: true });
    expect(bobView.participants.every((p) => p.vote === undefined)).toBe(true);
    expect(bobView.result).toBeUndefined();
    expect(annView.votedCount).toBe(1);
    expect(bob.raw.join("")).not.toContain('"vote"');
  });

  it("votes can be changed before the reveal", async () => {
    const room = await newRoom();
    const { c } = await joinAs(room, "Ann");
    c.send({ type: "vote", card: 3 });
    c.send({ type: "vote", card: 13 });
    const st = await c.state((s) => s.participants[0].vote === 13);
    expect(st.votedCount).toBe(1);
  });

  it("rejects invalid cards", async () => {
    const room = await newRoom();
    const { c } = await joinAs(room, "Ann");
    c.send({ type: "vote", card: 4 as Card });
    expect((await c.error()).code).toBe("invalid_card");
  });

  it("after reveal everyone receives everyone's cards", async () => {
    const { revealed, players } = await roundWith([3, 5]);
    expect(revealed.participants.map((p) => p.vote)).toEqual([3, 5]);
    const other = await players[1].c.state((s) => s.phase === "revealed");
    expect(other.participants.map((p) => p.vote)).toEqual([3, 5]);
  });

  it("votes are rejected after the reveal and do not change the result", async () => {
    const { players } = await roundWith([3, 5]);
    const c = players[0].c;
    const from = c.mark();
    c.send({ type: "vote", card: 13 });
    expect((await c.error(from)).code).toBe("votes_locked");
    expect(c.messages.slice(from).some((m) => m.type === "state")).toBe(false);
  });

  it("new round clears votes and hides cards", async () => {
    const { players } = await roundWith([3, 5]);
    const c = players[1].c;
    const from = c.mark();
    c.send({ type: "new_round" });
    const st = await c.state((s) => s.phase === "voting", from);
    expect(st.votedCount).toBe(0);
    expect(st.participants.every((p) => !p.hasVoted && p.vote === undefined)).toBe(true);
    expect(st.result).toBeUndefined();
    c.send({ type: "vote", card: 2 });
    await c.state((s) => s.votedCount === 1);
  });
});

describe("result rule", () => {
  it.each<[string, (Card | null)[], unknown]>([
    ["3,5,3,3 gives 5", [3, 5, 3, 3], { kind: "points", points: 5 }],
    ["8,13 gives 13", [8, 13], { kind: "points", points: 13 }],
    ["all equal gives that value", [2, 2], { kind: "points", points: 2 }],
    ["3,5,3,8 gives Discuss with lo/hi", [3, 5, 3, 8], { kind: "discuss", lo: 3, hi: 8 }],
    ["5 and 13 gives Discuss", [5, 13], { kind: "discuss", lo: 5, hi: 13 }],
    ["coffee is ignored", [3, 5, "coffee"], { kind: "points", points: 5 }],
    ["all coffee gives Discuss", ["coffee", "coffee"], { kind: "discuss" }],
    ["no votes gives Discuss", [null, null], { kind: "discuss" }],
    ["non-voters are excluded", [3, null, 5], { kind: "points", points: 5 }],
  ])("%s", async (_n, votes, expected) => {
    const { revealed } = await roundWith(votes);
    expect(revealed.result).toEqual(expected);
  });

  it("observers are excluded from the result", async () => {
    const { revealed } = await roundWith([3, 3], { observer: true });
    expect(revealed.result).toEqual({ kind: "points", points: 3 });
  });
});

describe("reveal with missing voters", () => {
  it("succeeds and reports who did not vote", async () => {
    const { revealed, players } = await roundWith([3, null, 5]);
    expect(revealed.notVoted).toEqual([players[1].id]);
    expect(revealed.votedCount).toBe(2);
    expect(revealed.voterCount).toBe(3);
  });
});

describe("observers", () => {
  it("are excluded from counts and cannot vote", async () => {
    const room = await newRoom();
    const { c: ann } = await joinAs(room, "Ann");
    const { c: obs, id } = await joinAs(room, "Pat", true);
    const st = await ann.state((s) => s.participants.length === 2);
    expect(st.voterCount).toBe(1);
    expect(st.participants.find((p) => p.id === id)).toMatchObject({ observer: true, hasVoted: false });
    obs.send({ type: "vote", card: 3 });
    expect((await obs.error()).code).toBe("observer_cannot_vote");
  });

  it("can reveal and start a new round", async () => {
    const room = await newRoom();
    const { c: ann } = await joinAs(room, "Ann");
    const { c: obs } = await joinAs(room, "Pat", true);
    ann.send({ type: "vote", card: 5 });
    await obs.state((s) => s.votedCount === 1);
    obs.send({ type: "reveal" });
    const rev = await obs.state((s) => s.phase === "revealed");
    expect(rev.result).toEqual({ kind: "points", points: 5 });
    const from = obs.mark();
    obs.send({ type: "new_round" });
    await obs.state((s) => s.phase === "voting" && s.votedCount === 0, from);
  });
});

describe("clock option", () => {
  it("accepts an injected clock", async () => {
    const s = await startServer({
      port: 0,
      staticDir: new URL("./fixtures", import.meta.url).pathname,
      clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    });
    await s.close();
  });
});

describe("input limits", () => {
  it("rejects names longer than 40 characters", async () => {
    const room = await newRoom();
    const c = await Client.connect();
    c.send({ type: "join", roomId: room, name: "x".repeat(41), observer: false, token: "t" });
    expect((await c.error()).code).toBe("bad_message");
    c.send({ type: "join", roomId: room, name: "x".repeat(40), observer: false, token: "t" });
    await c.state((s) => s.participants.length === 1);
  });

  it("rejects oversized tokens", async () => {
    const room = await newRoom();
    const c = await Client.connect();
    c.send({ type: "join", roomId: room, name: "ann", observer: false, token: "t".repeat(201) });
    expect((await c.error()).code).toBe("bad_message");
  });

  it("closes connections that send oversized messages", async () => {
    const c = await Client.connect();
    c.sendRaw(JSON.stringify({ type: "join", pad: "x".repeat(100_000) }));
    const deadline = Date.now() + 2000;
    while (c.closeCode === undefined && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
    expect(c.closeCode).toBe(1009);
  });

  it("limits how many rooms one connection can create", async () => {
    const c = await Client.connect();
    for (let i = 0; i < 10; i++) c.send({ type: "create_room" });
    await c.waitFor((m): m is Of<"room_created"> => m.type === "room_created" && c.messages.filter((x) => x.type === "room_created").length === 10);
    const from = c.mark();
    c.send({ type: "create_room" });
    expect((await c.error(from)).code).toBe("rate_limited");
  });
});
