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
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

export function startServer({ port, staticDir, clock = realClock }: ServerOptions): Promise<RunningServer> {
  const httpServer = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
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

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const registry = new RoomRegistry(clock);
  const sessions = new Map<WebSocket, { room: Room; id: string }>();

  const send = (ws: WebSocket, m: ServerMessage) => ws.send(JSON.stringify(m));
  const fail = (ws: WebSocket, code: ErrorCode, message: string) => send(ws, { type: "error", code, message });
  const broadcast = (room: Room) => {
    for (const [ws, s] of sessions) {
      if (s.room === room && ws.readyState === WebSocket.OPEN) send(ws, { type: "state", state: room.viewFor(s.id) });
    }
  };

  wss.on("connection", (ws) => {
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
          return send(ws, { type: "room_created", roomId: registry.create().id });
        }
        if (msg.type === "join") {
          const room = typeof msg.roomId === "string" ? registry.get(msg.roomId) : undefined;
          if (!room) throw new RoomError("room_not_found", "This room no longer exists. Ask for a fresh link.");
          const name = typeof msg.name === "string" ? msg.name.trim() : "";
          if (!name) throw new RoomError("name_required", "A display name is required");
          if (typeof msg.token !== "string" || !msg.token) throw new RoomError("bad_message", "Missing token");
          const id = room.join(msg.token, name, msg.observer === true);
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
    ws.on("close", () => {
      const session = sessions.get(ws);
      sessions.delete(ws);
      if (!session) return;
      const stillBound = [...sessions.values()].some((s) => s.room === session.room && s.id === session.id);
      if (stillBound) return;
      session.room.setConnected(session.id, false);
      broadcast(session.room);
    });
  });

  return new Promise((resolve) => {
    httpServer.listen(port, () =>
      resolve({
        httpServer,
        close: () =>
          new Promise<void>((done) => {
            wss.clients.forEach((c) => c.terminate());
            wss.close(() => httpServer.close(() => done()));
          }),
      }),
    );
  });
}
