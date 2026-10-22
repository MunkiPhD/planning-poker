import type { RoomState } from "../shared/messages";
import { cardLabel } from "./roster";

export interface RevealCard {
  id: string;
  name: string;
  label: string;
  observer: boolean;
  noVote: boolean;
  highlight: boolean;
}

export interface RevealView {
  headline: string;
  tone: "points" | "discuss";
  reason: string;
  warning?: string;
  cards: RevealCard[];
}

export function missingWarning(count: number): string | undefined {
  if (count <= 0) return undefined;
  return count === 1 ? "1 person hasn't voted" : `${count} people haven't voted`;
}

export function revealView(state: RoomState): RevealView {
  const result = state.result;
  const lo = result?.kind === "discuss" ? result.lo : undefined;
  const hi = result?.kind === "discuss" ? result.hi : undefined;

  const cards = state.participants.map<RevealCard>((p) => {
    const vote = p.vote;
    const noVote = !p.observer && vote === undefined;
    const highlight =
      !p.observer && typeof vote === "number" && lo !== undefined && (vote === lo || vote === hi);
    const label = p.observer ? "observing" : vote === undefined ? "no vote" : cardLabel(vote);
    return { id: p.id, name: p.name, label, observer: p.observer, noVote, highlight };
  });

  const warning = missingWarning(state.notVoted?.length ?? 0);

  if (result?.kind === "points") {
    return { headline: String(result.points), tone: "points", reason: "Story points", warning, cards };
  }
  const reason =
    lo !== undefined && hi !== undefined
      ? `${lo} to ${hi} are more than one step apart. Start with the highlighted cards.`
      : "No numeric votes";
  return { headline: "Discuss", tone: "discuss", reason, warning, cards };
}
