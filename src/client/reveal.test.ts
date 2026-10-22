import { describe, expect, it } from "vitest";
import type { ParticipantView, RoomState } from "../shared/messages";
import { revealView } from "./reveal";

const p = (o: Partial<ParticipantView>): ParticipantView => ({
  id: "a", name: "A", observer: false, connected: true, hasVoted: true, ...o,
});
const st = (o: Partial<RoomState>): RoomState => ({
  roomId: "r", phase: "revealed", you: "a", participants: [], votedCount: 0, voterCount: 0, ...o,
});

describe("revealView", () => {
  it("points result shows points and highlights nothing", () => {
    const v = revealView(st({
      result: { kind: "points", points: 5 },
      participants: [p({ id: "a", vote: 3 }), p({ id: "b", name: "B", vote: 5 })],
    }));
    expect(v.headline).toBe("5");
    expect(v.tone).toBe("points");
    expect(v.cards.map((c) => c.highlight)).toEqual([false, false]);
  });

  it("discuss highlights every lowest and highest numeric card, not middle or coffee", () => {
    const v = revealView(st({
      result: { kind: "discuss", lo: 3, hi: 8 },
      participants: [
        p({ id: "a", vote: 3 }), p({ id: "b", vote: 5 }), p({ id: "c", vote: 3 }),
        p({ id: "d", vote: 8 }), p({ id: "e", vote: "coffee" }),
      ],
    }));
    expect(v.headline).toBe("Discuss");
    expect(v.cards.map((c) => c.highlight)).toEqual([true, false, true, true, false]);
    expect(v.reason).toMatch(/3.*8/);
  });

  it("discuss without lo/hi highlights nothing and explains why", () => {
    const v = revealView(st({
      result: { kind: "discuss" },
      participants: [p({ vote: "coffee" })],
    }));
    expect(v.cards[0].highlight).toBe(false);
    expect(v.reason).toBe("No numeric votes");
  });

  it("non-voters show no vote with singular/plural warning", () => {
    const parts = [p({ id: "a", vote: 5 }), p({ id: "b", hasVoted: false }), p({ id: "c", hasVoted: false })];
    const two = revealView(st({ result: { kind: "points", points: 5 }, participants: parts, notVoted: ["b", "c"] }));
    expect(two.warning).toBe("2 people haven't voted");
    expect(two.cards[1].label).toBe("no vote");
    const one = revealView(st({ result: { kind: "points", points: 5 }, participants: parts, notVoted: ["b"] }));
    expect(one.warning).toBe("1 person hasn't voted");
  });

  it("no warning when everyone voted", () => {
    expect(revealView(st({ result: { kind: "points", points: 5 }, participants: [p({ vote: 5 })], notVoted: [] })).warning).toBeUndefined();
  });

  it("observers are labelled observing and never counted as missing", () => {
    const v = revealView(st({ result: { kind: "points", points: 5 }, participants: [p({ observer: true, hasVoted: false })] }));
    expect(v.cards[0]).toMatchObject({ label: "observing", observer: true, highlight: false });
  });

  it("coffee renders as the cup", () => {
    const v = revealView(st({ result: { kind: "points", points: 5 }, participants: [p({ vote: "coffee" })] }));
    expect(v.cards[0].label).toBe("☕");
  });
});
