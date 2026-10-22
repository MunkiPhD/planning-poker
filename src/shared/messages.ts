/**
 * Planning Poker WebSocket protocol (endpoint: /ws, JSON text frames).
 *
 * Room creation: over the WebSocket. Any connection may send `create_room`;
 * the server replies `room_created` with a random unguessable id. The room URL
 * is `/r/<roomId>` on the client side. No HTTP API exists.
 *
 * Flow: join -> server sends `joined` (own participant id) then `state`.
 * After every change the server sends each connected client its own, privacy
 * filtered `state`. Failures are reported as `error` messages.
 */

export const DECK = [1, 2, 3, 5, 8, 13, "coffee"] as const;
export type Card = (typeof DECK)[number];

export type ClientMessage =
  | { type: "create_room" }
  | {
      type: "join";
      roomId: string;
      name: string;
      observer?: boolean;
      /** Client-generated secret; reusing it reclaims the same seat and vote. */
      token: string;
    }
  | { type: "vote"; card: Card }
  | { type: "reveal" }
  | { type: "new_round" };

export type ErrorCode =
  | "bad_message"
  | "room_not_found"
  | "not_joined"
  | "name_required"
  | "observer_cannot_vote"
  | "votes_locked"
  | "invalid_card"
  | "rate_limited";

export type ServerMessage =
  | { type: "room_created"; roomId: string }
  | { type: "joined"; roomId: string; you: string }
  | { type: "state"; state: RoomState }
  | { type: "error"; code: ErrorCode; message: string };

export interface ParticipantView {
  /** Public id (not the secret token). */
  id: string;
  name: string;
  observer: boolean;
  connected: boolean;
  /** Voters only: whether a card has been chosen. Never reveals the card. */
  hasVoted: boolean;
  /**
   * Present only for the receiving client's own participant while voting, and
   * for every participant once revealed (if they voted).
   */
  vote?: Card;
}

export type RoundResult =
  | { kind: "points"; points: number }
  | { kind: "discuss"; lo?: number; hi?: number };

export interface RoomState {
  roomId: string;
  phase: "voting" | "revealed";
  you: string;
  participants: ParticipantView[];
  /** Non-observers who have voted / non-observers in the room. */
  votedCount: number;
  voterCount: number;
  /** Only when revealed. */
  result?: RoundResult;
  /** Only when revealed: ids of voters who did not vote ("no vote"). */
  notVoted?: string[];
}
