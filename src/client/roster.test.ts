import { describe, expect, it } from "vitest";
import type { ParticipantView, RoomState } from "../shared/messages";
import { cardLabel, missingVotersMessage, roomUrl, rosterStatus } from "./roster";

const p = (o: Partial<ParticipantView>): ParticipantView => ({
  id: "a", name: "A", observer: false, connected: true, hasVoted: false, ...o,
});

describe("rosterStatus", () => {
  it("observers show as observing", () => expect(rosterStatus(p({ observer: true }))).toBe("observing"));
  it("voted voter", () => expect(rosterStatus(p({ hasVoted: true }))).toBe("voted"));
  it("waiting voter", () => expect(rosterStatus(p({}))).toBe("waiting"));
  it("disconnected voter keeps their voted status", () =>
    expect(rosterStatus(p({ hasVoted: true, connected: false }))).toBe("voted"));
});

describe("roomUrl", () => {
  it("builds /r/<id>", () => expect(roomUrl("https://x.test", "k3x9fq")).toBe("https://x.test/r/k3x9fq"));
});

describe("cardLabel", () => {
  it("renders coffee as an emoji", () => expect(cardLabel("coffee")).toBe("☕"));
  it("renders numbers", () => expect(cardLabel(13)).toBe("13"));
});



const who = (name: string, o: Partial<ParticipantView> = {}): ParticipantView => ({
  id: name,
  name,
  observer: false,
  connected: true,
  hasVoted: false,
  ...o,
});
const st = (participants: ParticipantView[]) => ({ participants }) as RoomState;

describe("missingVotersMessage", () => {
  it("is null when every voter has voted, ignoring observers", () => {
    expect(missingVotersMessage(st([who("A", { hasVoted: true }), who("Obs", { observer: true })]))).toBeNull();
  });
  it("names one, two and three missing voters", () => {
    expect(missingVotersMessage(st([who("A")]))).toBe("Waiting on A.");
    expect(missingVotersMessage(st([who("A"), who("B")]))).toBe("Waiting on A and B.");
    expect(missingVotersMessage(st([who("A"), who("B"), who("C")]))).toBe("Waiting on A, B and C.");
  });
  it("shows three names then 'and N more'", () => {
    const four = ["A", "B", "C", "D"].map((n) => who(n));
    expect(missingVotersMessage(st(four))).toBe("Waiting on A, B, C and 1 more.");
    expect(missingVotersMessage(st([...four, who("E")]))).toBe("Waiting on A, B, C and 2 more.");
  });
  it("marks disconnected people and skips voters and observers", () => {
    const s = st([who("A", { connected: false }), who("B", { hasVoted: true }), who("O", { observer: true })]);
    expect(missingVotersMessage(s)).toBe("Waiting on A (disconnected).");
  });
});
