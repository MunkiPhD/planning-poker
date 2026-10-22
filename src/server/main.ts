import { fileURLToPath } from "node:url";
import { startServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
const staticDir = fileURLToPath(new URL("../../dist/client", import.meta.url));

await startServer({ port, staticDir });
console.log(`planning-poker listening on http://localhost:${port}`);
