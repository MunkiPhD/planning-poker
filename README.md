# Planning Poker

A small web app for remote sprint-planning estimation. Open the home page, get a room with a random link, share it, vote privately with Fibonacci cards, and reveal together. No accounts, no database.

## How it works

- Cards: 1, 2, 3, 5, 8, 13 and coffee.
- Votes stay hidden until anyone presses **Reveal cards**. Observers can join, reveal and start a new round, but they don't vote.
- Result rule: if all numeric votes are within one step of each other in the sequence 1, 2, 3, 5, 8, 13, the result is the larger value (3, 5, 3, 3 gives 5). Otherwise the result is **Discuss**, and the lowest and highest cards are highlighted. Coffee and missing votes are ignored. If there are no numeric votes, the result is Discuss.
- **New round** clears all votes.
- Disconnected participants are dropped after about 30 seconds. A refresh within that time keeps your seat and vote. Idle rooms are deleted after about 12 hours.
- Rooms live in memory, so a server restart clears them.

## Development

Requires Node 22+.

```
npm ci
npm run dev     # server on :3000 and Vite dev server (usually :5173), with hot reload
npm test        # Vitest
npm run build   # build the client into dist/
```

To run it the way production does:

```
npm run build
PORT=3000 npm start    # open http://localhost:3000
```

To test with two people, use two browser profiles (or an incognito window). Tabs in the same profile share localStorage and so share a seat.

## Docker

```
docker build -t planning-poker .
docker run --rm -e PORT=8080 -p 8080:8080 planning-poker
```

The server reads the `PORT` environment variable (default 3000).

## Deployment

Built for a single instance, because room state is in memory.

- **Render (free tier):** create a Web Service from this repo with the Docker runtime. Render sets `PORT`. Free services sleep after about 15 idle minutes and lose their rooms, so open the link a few minutes before the meeting. While a room has had activity (join, vote, reveal, new round) in the last 4 hours, the server pings its own `/healthz` every 10 minutes (using Render's `RENDER_EXTERNAL_URL`) to keep the service awake. After 4 idle hours the pings stop and Render can sleep it. The limits are in `src/server/keepalive.ts`.
- **Google Cloud Run:** use `--max-instances=1`, and raise `--timeout` for long WebSocket sessions.

## Code layout

| Path | Contents |
| --- | --- |
| `src/server/` | HTTP and WebSocket server (`server.ts`), room logic and result rule (`rooms.ts`), entry point (`main.ts`) |
| `src/shared/messages.ts` | The WebSocket message protocol shared by client and server |
| `src/client/` | React app: home page, join form, voting and reveal views, WebSocket hook (`connection.ts`) |
| `docs/specs/` | Product spec |
| `docs/tickets/` | Implementation tickets |
| `prototypes/` | Throwaway HTML prototypes used as a visual reference (`c.html` is the chosen design) |

### Architecture notes

- The server is the source of truth. Clients send intents (`join`, `vote`, `reveal`, `new_round`) over a WebSocket at `/ws`, and the server broadcasts room state.
- Privacy is enforced on the server. Before the reveal, a client receives only whether others have voted, plus its own vote.
- The result is computed on the server at reveal time, so every client shows the same outcome.

## Testing

Server tests run through one seam: a real server on a free port, driven by real WebSocket clients, with a fake clock for the grace period and idle timeouts. See `src/server/*.test.ts`. Pure client helpers have small unit tests. The visual layout is checked by hand against `prototypes/c.html`.
