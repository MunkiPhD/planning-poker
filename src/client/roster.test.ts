import { describe, expect, it } from "vitest";
import type { ParticipantView } from "../shared/messages";
import { cardLabel, roomUrl, rosterStatus } from "./roster";

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
