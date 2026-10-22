import { randomBytes, randomUUID } from "node:crypto";
import { DECK, type Card, type ErrorCode, type ParticipantView, type RoomState, type RoundResult } from "../shared/messages.js";

/** Injectable time source so lifecycle timers (grace period, idle cleanup) can be faked. */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
};

export class RoomError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const SEQ = [1, 2, 3, 5, 8, 13];

export function computeResult(votes: Card[]): RoundResult {
  const idx = votes.flatMap((v) => (v === "coffee" ? [] : [SEQ.indexOf(v)]));
  if (!idx.length) return { kind: "discuss" };
  const lo = Math.min(...idx);
  const hi = Math.max(...idx);
  if (hi - lo <= 1) return { kind: "points", points: SEQ[hi] };
  return { kind: "discuss", lo: SEQ[lo], hi: SEQ[hi] };
}

interface Participant {
  id: string;
  token: string;
  name: string;
  observer: boolean;
  connected: boolean;
  vote?: Card;
}

export class Room {
  phase: "voting" | "revealed" = "voting";
  lastActivity: number;
  private participants: Participant[] = [];

  constructor(
    readonly id: string,
    private clock: Clock,
  ) {
    this.lastActivity = clock.now();
  }

  touch() {
    this.lastActivity = this.clock.now();
  }

  join(token: string, name: string, observer: boolean): string {
    this.touch();
    const existing = this.participants.find((p) => p.token === token);
    if (existing) {
      existing.connected = true;
      return existing.id;
    }
    const p: Participant = { id: randomUUID(), token, name, observer, connected: true };
    this.participants.push(p);
    return p.id;
  }

  setConnected(id: string, connected: boolean) {
    const p = this.participants.find((p) => p.id === id);
    if (p) p.connected = connected;
  }

  vote(id: string, card: Card) {
    this.touch();
    const p = this.participants.find((p) => p.id === id)!;
    if (!DECK.includes(card)) throw new RoomError("invalid_card", "Not a card in the deck");
    if (p.observer) throw new RoomError("observer_cannot_vote", "Observers cannot vote");
    if (this.phase === "revealed") throw new RoomError("votes_locked", "Cards are locked after the reveal");
    p.vote = card;
  }

  reveal() {
    this.touch();
    this.phase = "revealed";
  }

  newRound() {
    this.touch();
    this.phase = "voting";
    this.participants.forEach((p) => delete p.vote);
  }

  /** The privacy boundary: builds the state one participant is allowed to see. */
  viewFor(id: string): RoomState {
    const revealed = this.phase === "revealed";
    const voters = this.participants.filter((p) => !p.observer);
    const views: ParticipantView[] = this.participants.map((p) => {
      const v: ParticipantView = {
        id: p.id,
        name: p.name,
        observer: p.observer,
        connected: p.connected,
        hasVoted: p.vote !== undefined,
      };
      if (p.vote !== undefined && (revealed || p.id === id)) v.vote = p.vote;
      return v;
    });
    const state: RoomState = {
      roomId: this.id,
      phase: this.phase,
      you: id,
      participants: views,
      votedCount: voters.filter((p) => p.vote !== undefined).length,
      voterCount: voters.length,
    };
    if (revealed) {
      state.result = computeResult(voters.flatMap((p) => (p.vote === undefined ? [] : [p.vote])));
      state.notVoted = voters.filter((p) => p.vote === undefined).map((p) => p.id);
    }
    return state;
  }

  participantIds(): string[] {
    return this.participants.map((p) => p.id);
  }
}

export class RoomRegistry {
  private rooms = new Map<string, Room>();
  constructor(private clock: Clock) {}

  create(): Room {
    const room = new Room(randomBytes(12).toString("base64url"), this.clock);
    this.rooms.set(room.id, room);
    return room;
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id);
  }
}
