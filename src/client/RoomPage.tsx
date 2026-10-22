import { useState } from "react";
import { useRoomConnection } from "./connection";
import { navigate } from "./nav";
import { getSavedName } from "./session";

function JoinForm({ onJoin, error }: { onJoin: (name: string, observer: boolean) => void; error?: string }) {
  const [name, setName] = useState(() => getSavedName(localStorage));
  const [observer, setObserver] = useState(false);
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onJoin(name, observer);
      }}
    >
      <h2>Join room</h2>
      <label>
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
      </label>
      <label className="check">
        <input type="checkbox" checked={observer} onChange={(e) => setObserver(e.target.checked)} />
        Join as observer (no voting)
      </label>
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      <button className="btn primary" type="submit" disabled={!name.trim()}>
        Join
      </button>
    </form>
  );
}

/** Placeholder room view; T5 replaces <RoomView>. */
function RoomView({ state }: { state: NonNullable<ReturnType<typeof useRoomConnection>["state"]> }) {
  return (
    <section className="panel">
      <h2>Participants</h2>
      <ul>
        {state.participants.map((p) => (
          <li key={p.id}>
            {p.name}
            {p.id === state.you ? " (you)" : ""}
            {p.observer ? " [observer]" : ""}
            {p.connected ? "" : " [offline]"}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RoomPage({ roomId }: { roomId: string }) {
  const conn = useRoomConnection(roomId);

  let body;
  if (conn.roomMissing) {
    body = (
      <div className="panel">
        <h2>This room no longer exists</h2>
        <p className="muted">Rooms are removed after a period of inactivity. Ask for a fresh link or start a new room.</p>
        <button className="btn primary" onClick={() => navigate("/")}>
          Create a new room
        </button>
      </div>
    );
  } else if (conn.state) {
    body = <RoomView state={conn.state} />;
  } else if (conn.status !== "open" || conn.rejoining) {
    body = <p className="muted">{conn.status === "reconnecting" ? "Reconnecting..." : "Connecting..."}</p>;
  } else {
    body = <JoinForm onJoin={conn.join} error={conn.error?.message} />;
  }

  return (
    <main className="center">
      <div className="room">
        Room: <code>{roomId}</code>
        {conn.state && conn.status !== "open" && <span className="warn"> reconnecting...</span>}
      </div>
      {body}
    </main>
  );
}
