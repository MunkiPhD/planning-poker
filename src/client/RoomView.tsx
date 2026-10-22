import { useState } from "react";
import { DECK, type Card, type RoomState } from "../shared/messages";
import type { RoomConnection } from "./connection";
import { revealView } from "./reveal";
import { cardLabel, roomUrl, rosterStatus } from "./roster";

type Props = Pick<RoomConnection, "vote" | "reveal" | "newRound"> & { state: RoomState };

export function CardPicker({ selected, onPick }: { selected?: Card; onPick: (c: Card) => void }) {
  return (
    <div className="picker" role="group" aria-label="Choose a card">
      {DECK.map((c) => (
        <button
          key={String(c)}
          className={`card${selected === c ? " selected" : ""}`}
          aria-pressed={selected === c}
          aria-label={c === "coffee" ? "Coffee" : String(c)}
          onClick={() => onPick(c)}
        >
          {cardLabel(c)}
        </button>
      ))}
    </div>
  );
}

export function Roster({ state }: { state: RoomState }) {
  return (
    <aside className="side">
      <h2>In the room</h2>
      {state.participants.map((p) => {
        const status = rosterStatus(p);
        return (
          <div className={`person${p.connected ? "" : " offline"}`} key={p.id}>
            <span>
              {p.name}
              {p.id === state.you ? " (you)" : ""}
              {!p.connected && <small className="hint"> disconnected</small>}
            </span>
            {status === "observing" ? (
              <span className="dot obs">observing</span>
            ) : (
              <span className={`dot ${status === "voted" ? "voted" : "wait"}`} title={status}>
                {status === "voted" ? "●" : "○"}
                <span className="sr">{status}</span>
              </span>
            )}
          </div>
        );
      })}
    </aside>
  );
}

export function CopyLinkButton({ roomId }: { roomId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn small"
      onClick={() => {
        void navigator.clipboard?.writeText(roomUrl(location.origin, roomId)).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "Copied!" : "Copy room link"}
    </button>
  );
}

function VotingStage({ state, vote, reveal }: Props) {
  const me = state.participants.find((p) => p.id === state.you);
  const observer = me?.observer ?? false;
  const prompt = observer
    ? "You are observing"
    : me?.vote !== undefined
      ? "Vote cast. Tap another card to change it."
      : "Pick your card";
  return (
    <>
      <div className="prompt">{prompt}</div>
      <div className="sub">
        {state.votedCount} of {state.voterCount} voted
      </div>
      {!observer && <CardPicker selected={me?.vote} onPick={vote} />}
      <div className="btns">
        <button className="btn primary" onClick={reveal}>
          Reveal cards
        </button>
      </div>
      {/* T6: show "N people haven't voted" warning before reveal if desired. */}
    </>
  );
}

export function Revealed({ state, newRound }: Props) {
  const view = revealView(state);
  return (
    <>
      <div className={`big ${view.tone === "points" ? "ok" : "discuss"}`} aria-live="polite">
        {view.headline}
      </div>
      <div className="reason">{view.reason}</div>
      {view.warning && (
        <div className="warn" role="status">
          {view.warning}
        </div>
      )}
      <div className="strip" aria-label="Revealed cards">
        {view.cards.map((c) => (
          <div className="mini" key={c.id}>
            <div className={`face${c.highlight ? " out" : ""}${c.noVote || c.observer ? " none" : ""}`}>
              {c.label}
            </div>
            <div className="who">
              {c.name}
              {c.id === state.you ? " (you)" : ""}
              {c.highlight && <span className="sr"> (lowest or highest)</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="btns">
        <button className="btn primary" onClick={newRound}>
          New round
        </button>
      </div>
    </>
  );
}

export function RoomView(props: Props) {
  const { state } = props;
  return (
    <div className="layout">
      <div className="stage">
        <div className="toolbar">
          <CopyLinkButton roomId={state.roomId} />
        </div>
        {state.phase === "revealed" ? <Revealed {...props} /> : <VotingStage {...props} />}
      </div>
      <Roster state={state} />
    </div>
  );
}
