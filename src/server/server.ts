import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { WebSocketServer } from "ws";
import type { ClientMessage, ServerMessage } from "../shared/messages.js";

export interface ServerOptions {
  port: number;
  staticDir: string;
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

export function startServer({ port, staticDir }: ServerOptions): Promise<RunningServer> {
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
  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.type === "ping") {
        const reply: ServerMessage = { type: "pong" };
        ws.send(JSON.stringify(reply));
      }
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
