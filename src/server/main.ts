import { fileURLToPath } from "node:url";
import { startKeepAlive } from "./keepalive.js";
import { startServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
const staticDir = fileURLToPath(new URL("../../dist/client", import.meta.url));

const server = await startServer({ port, staticDir });
console.log(`planning-poker listening on http://localhost:${port}`);

const publicUrl = process.env.RENDER_EXTERNAL_URL;
if (publicUrl) startKeepAlive({ url: publicUrl, hasActivityWithin: (ms) => server.hasActivityWithin(ms) });
