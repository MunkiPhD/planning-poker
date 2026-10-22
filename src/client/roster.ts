import type { Card, ParticipantView } from "../shared/messages";

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
