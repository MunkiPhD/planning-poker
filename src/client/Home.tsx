import { useState } from "react";
import { createRoom } from "./connection";
import { navigate } from "./nav";

export function Home() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      navigate(`/r/${await createRoom()}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <main className="center">
      <h1>Planning Poker</h1>
      <p className="muted">Estimate together. No accounts, no setup.</p>
      <button className="btn primary" onClick={create} disabled={busy}>
        {busy ? "Creating..." : "Create room"}
      </button>
      {err && (
        <p className="warn" role="alert">
          {err}
        </p>
      )}
    </main>
  );
}
