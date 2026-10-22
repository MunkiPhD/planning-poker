import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import type { ClientMessage, ErrorCode, ServerMessage } from "../shared/messages.js";
import { realClock, Room, RoomError, RoomRegistry, type Clock } from "./rooms.js";

export interface ServerOptions {
  port: number;
  staticDir: string;
  /** Injectable time source (defaults to real time). Lifecycle timers build on this. */
  clock?: Clock;
}

export interface RunningServer {
  httpServer: Server;
  /** True if any room had activity within the last `ms`. */
  hasActivityWithin(ms: number): boolean;
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

export const DISCONNECT_GRACE_MS = 30_000;
export const MAX_NAME_LENGTH = 40;
export const MAX_TOKEN_LENGTH = 200;
export const MAX_PAYLOAD_BYTES = 4096;
export const MAX_ROOMS_PER_CONNECTION = 10;

export function startServer({ port, staticDir, clock = realClock }: ServerOptions): Promise<RunningServer> {
  const httpServer = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (path === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" }).end("ok");
      return;
    }
    const rel = normalize(path === "/" ? "/index.html" : path);
    if (rel.includes("..")) {
      res.writeHead(400).end();
      return;
    }
    try {
      const body = await readFile(join(staticDir, rel));
      res.writeHead(200, { "content-type": MIME[extname(rel)] ?? "application/octet-stream" }).end(body);
    } catch {
      try {
        const body = await readFile(join(staticDir, "index.html"));
        res.writeHead(200, { "content-type": "text/html" }).end(body);
      } catch {
        res.writeHead(404).end("Not found");
      }
    }
  });

  const wss = new WebSocketServer({ server: httpServer, path: "/ws", maxPayload: MAX_PAYLOAD_BYTES });
  const sessions = new Map<WebSocket, { room: Room; id: string }>();

  const graceTimers = new Map<string, unknown>();
  const graceKey = (room: Room, id: string) => `${room.id}:${id}`;

  const send = (ws: WebSocket, m: ServerMessage) => ws.send(JSON.stringify(m));
  const fail = (ws: WebSocket, code: ErrorCode, message: string) => send(ws, { type: "error", code, message });
  const broadcast = (room: Room) => {
    for (const [ws, s] of sessions) {
      if (s.room === room && ws.readyState === WebSocket.OPEN) send(ws, { type: "state", state: room.viewFor(s.id) });
    }
  };

  const registry = new RoomRegistry(clock, (room) => {
    for (const [ws, s] of [...sessions]) {
      if (s.room !== room) continue;
      sessions.delete(ws);
      fail(ws, "room_not_found", "This room no longer exists. Ask for a fresh link.");
      ws.close();
    }
    for (const id of room.participantIds()) {
      const key = graceKey(room, id);
      const h = graceTimers.get(key);
      if (h !== undefined) clock.clearTimeout(h);
      graceTimers.delete(key);
    }
  });

  /** Unbinds a socket from its seat; the seat is disconnected and removed after the grace period. */
  const release = (ws: WebSocket) => {
    const session = sessions.get(ws);
    sessions.delete(ws);
    if (!session) return;
    const stillBound = [...sessions.values()].some((s) => s.room === session.room && s.id === session.id);
    if (stillBound) return;
    const { room, id } = session;
    room.setConnected(id, false);
    const key = graceKey(room, id);
    graceTimers.set(
      key,
      clock.setTimeout(() => {
        graceTimers.delete(key);
        room.remove(id);
        broadcast(room);
      }, DISCONNECT_GRACE_MS),
    );
    broadcast(room);
  };

  wss.on("connection", (ws) => {
    let roomsCreated = 0;
    ws.on("message", (data) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString());
        if (typeof msg?.type !== "string") throw new Error();
      } catch {
        return fail(ws, "bad_message", "Malformed message");
      }
      try {
        if (msg.type === "create_room") {
          if (++roomsCreated > MAX_ROOMS_PER_CONNECTION) throw new RoomError("rate_limited", "Too many rooms created");
          return send(ws, { type: "room_created", roomId: registry.create().id });
        }
        if (msg.type === "join") {
          const room = typeof msg.roomId === "string" ? registry.get(msg.roomId) : undefined;
          if (!room) throw new RoomError("room_not_found", "This room no longer exists. Ask for a fresh link.");
          const name = typeof msg.name === "string" ? msg.name.trim() : "";
          if (!name) throw new RoomError("name_required", "A display name is required");
          if (name.length > MAX_NAME_LENGTH) throw new RoomError("bad_message", `Name must be at most ${MAX_NAME_LENGTH} characters`);
          if (typeof msg.token !== "string" || !msg.token) throw new RoomError("bad_message", "Missing token");
          if (msg.token.length > MAX_TOKEN_LENGTH) throw new RoomError("bad_message", "Token too long");
          const prev = sessions.get(ws);
          const id = room.join(msg.token, name, msg.observer === true);
          const pending = graceTimers.get(graceKey(room, id));
          if (pending !== undefined) {
            clock.clearTimeout(pending);
            graceTimers.delete(graceKey(room, id));
          }
          if (prev && !(prev.room === room && prev.id === id)) release(ws);
          sessions.set(ws, { room, id });
          send(ws, { type: "joined", roomId: room.id, you: id });
          return broadcast(room);
        }
        const session = sessions.get(ws);
        if (!session) throw new RoomError("not_joined", "Join a room first");
        const { room, id } = session;
        if (msg.type === "vote") room.vote(id, msg.card);
        else if (msg.type === "reveal") room.reveal();
        else if (msg.type === "new_round") room.newRound();
        else throw new RoomError("bad_message", "Unknown message type");
        broadcast(room);
      } catch (e) {
        if (e instanceof RoomError) fail(ws, e.code, e.message);
        else throw e;
      }
    });
    // ws emits "error" (e.g. payload too large) before closing; unhandled, it would crash the process.
    ws.on("error", () => ws.terminate());
    ws.on("close", () => release(ws));
  });

  return new Promise((resolve) => {
    httpServer.listen(port, () =>
      resolve({
        httpServer,
        hasActivityWithin: (ms) => registry.hasActivityWithin(ms),
        close: () =>
          new Promise<void>((done) => {
            registry.dispose();
            graceTimers.forEach((h) => clock.clearTimeout(h));
            wss.clients.forEach((c) => c.terminate());
            wss.close(() => httpServer.close(() => done()));
          }),
      }),
    );
  });
}
