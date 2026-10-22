import type { Card, ParticipantView, RoomState } from "../shared/messages";

export type RosterStatus = "observing" | "voted" | "waiting";

export function rosterStatus(p: ParticipantView): RosterStatus {
  if (p.observer) return "observing";
  return p.hasVoted ? "voted" : "waiting";
}

export function roomUrl(origin: string, roomId: string): string {
  return `${origin}/r/${roomId}`;
}

export function cardLabel(card: Card): string {
  return card === "coffee" ? "☕" : String(card);
}

/** "Waiting on A, B, C and 2 more." for voters without a vote, or null if none are missing. */
export function missingVotersMessage(state: Pick<RoomState, "participants">): string | null {
  const names = state.participants
    .filter((p) => !p.observer && !p.hasVoted)
    .map((p) => (p.connected ? p.name : `${p.name} (disconnected)`));
  if (names.length === 0) return null;
  const shown = names.slice(0, 3);
  const more = names.length - shown.length;
  if (more > 0) return `Waiting on ${shown.join(", ")} and ${more} more.`;
  if (shown.length === 1) return `Waiting on ${shown[0]}.`;
  return `Waiting on ${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}.`;
}
