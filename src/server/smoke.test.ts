import { afterAll, beforeAll, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { startServer, type RunningServer } from "./server.js";

let server: RunningServer;
let port: number;

beforeAll(async () => {
  server = await startServer({
    port: 0,
    staticDir: new URL("./fixtures", import.meta.url).pathname,
  });
  port = (server.httpServer.address() as AddressInfo).port;
});
afterAll(() => server.close());

it("serves the static client over HTTP", async () => {
  const res = await fetch(`http://localhost:${port}/`);
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("fixture-client");
});

it("accepts WebSocket connections and answers ping with pong", async () => {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const reply = await new Promise<string>((resolve, reject) => {
    ws.on("error", reject);
    ws.on("open", () => ws.send(JSON.stringify({ type: "ping" })));
    ws.on("message", (d) => resolve(d.toString()));
  });
  ws.close();
  expect(JSON.parse(reply)).toEqual({ type: "pong" });
});
