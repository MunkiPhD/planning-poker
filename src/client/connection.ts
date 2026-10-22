import { useCallback, useEffect, useRef, useState } from "react";
import type { Card, ClientMessage, ErrorCode, RoomState, ServerMessage } from "../shared/messages";
import { clearSession, loadSession, saveSession } from "./session";

export function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

/** Opens a short-lived socket, creates a room, resolves with its id. */
export function createRoom(): Promise<string> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl());
    ws.onopen = () => ws.send(JSON.stringify({ type: "create_room" } satisfies ClientMessage));
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data) as ServerMessage;
      if (m.type === "room_created") {
        ws.close();
        resolve(m.roomId);
      } else if (m.type === "error") {
        ws.close();
        reject(new Error(m.message));
      }
    };
    ws.onerror = () => reject(new Error("Could not reach the server"));
  });
}

export type ConnectionStatus = "connecting" | "open" | "reconnecting";

export interface RoomError {
  code: ErrorCode;
  message: string;
}

export interface RoomConnection {
  status: ConnectionStatus;
  /** Latest privacy-filtered state; null until joined. */
  state: RoomState | null;
  /** True when the room does not exist (any more). */
  roomMissing: boolean;
  /** Latest non-fatal error from the server (cleared on next state). */
  error: RoomError | null;
  /** True while an auto-rejoin from saved session is in flight. */
  rejoining: boolean;
  join: (name: string, observer: boolean) => void;
  vote: (card: Card) => void;
  reveal: () => void;
  newRound: () => void;
}

/**
 * One WebSocket per room page. Auto-joins from localStorage on (re)connect and
 * reconnects with backoff. T5/T6 only need `state` plus the send functions.
 */
export function useRoomConnection(roomId: string): RoomConnection {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [state, setState] = useState<RoomState | null>(null);
  const [roomMissing, setRoomMissing] = useState(false);
  const [error, setError] = useState<RoomError | null>(null);
  const [rejoining, setRejoining] = useState(() => loadSession(localStorage, roomId) !== null);
  const wsRef = useRef<WebSocket | null>(null);

  const send = useCallback((m: ClientMessage) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  }, []);

  useEffect(() => {
    let closed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setStatus("open");
        const saved = loadSession(localStorage, roomId);
        if (saved) ws.send(JSON.stringify({ type: "join", roomId, ...saved } satisfies ClientMessage));
        else setRejoining(false);
      };
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data) as ServerMessage;
        if (m.type === "state") {
          setState(m.state);
          setError(null);
          setRejoining(false);
        } else if (m.type === "error") {
          setRejoining(false);
          if (m.code === "room_not_found") {
            clearSession(localStorage, roomId);
            setRoomMissing(true);
            closed = true;
            ws.close();
          } else setError({ code: m.code, message: m.message });
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setStatus("reconnecting");
        timer = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 10000));
      };
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [roomId]);

  const join = useCallback(
    (name: string, observer: boolean) => {
      const s = saveSession(localStorage, roomId, name, observer);
      setError(null);
      send({ type: "join", roomId, ...s });
    },
    [roomId, send],
  );

  return {
    status,
    state,
    roomMissing,
    error,
    rejoining,
    join,
    vote: (card) => send({ type: "vote", card }),
    reveal: () => send({ type: "reveal" }),
    newRound: () => send({ type: "new_round" }),
  };
}
