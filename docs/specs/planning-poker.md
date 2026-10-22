# Planning Poker: Spec

Status: ready-for-agent. Published as a local file, not to an issue tracker, per the user's request.

## Problem Statement

My team estimates stories in remote sprint planning sessions every other week. We use Fibonacci cards (1, 2, 3, 5, 8, 13 and "coffee") and a consensus rule: if all votes are within one step of each other, we take the larger value. Otherwise we stop and discuss. Today there is no simple shared tool for this. People can see each other's votes too early, and someone has to work out the result and the spread by hand. I want a small web app that everyone can open from a link, vote privately, reveal together, and get the result immediately.

## Solution

A small web app. The facilitator opens the home page and gets a new room with a random link, then shares it in the meeting. Each person opens the link, types a display name (optionally joining as an observer), and sees the focus-mode screen: a big centered card picker with a slim sidebar of who is in the room and who has voted.

Votes stay private until anyone presses "Reveal cards." On reveal, the picker is replaced by a very large result, either the story points or "Discuss," followed by a strip of everyone's cards. When the result is "Discuss," the lowest and highest cards are highlighted so the group knows whom to ask first. Anyone can press "New round" to clear the votes and go again. There are no accounts, no story tracking, no history and no average. The app shows only the story-point value or "Discuss."

The visual and interaction design is **prototype C ("Focus mode")**, chosen by the user over prototype B (roster list). It lives with the other prototypes in the repo and is a throwaway reference for look and behavior. The real app is built fresh from it.

## User Stories

1. As a facilitator, I want to open the home page and get a new room with a random link, so that I can start a session in seconds.
2. As a facilitator, I want each room to have an unguessable URL, so that nobody stumbles into an old or unrelated session.
3. As a facilitator, I want to copy the room link easily, so that I can paste it into the meeting chat.
4. As a team member, I want to join by opening a link and typing a display name, so that I don't need an account or password.
5. As a team member, I want my browser to remember my name and seat, so that a page refresh doesn't lose my place or my vote.
6. As a team member, I want to join as an observer, so that a PM or stakeholder can watch without voting.
7. As an observer, I want to see the room and the reveal, so that I can follow the estimate.
8. As an observer, I want to press Reveal and New round, so that I can help run the session.
9. As a team member, I want to pick a card from 1, 2, 3, 5, 8, 13 or coffee, so that I can cast my estimate.
10. As a team member, I want my selected card to look clearly selected, so that I know what I voted.
11. As a team member, I want to change my vote any time before the reveal, so that I can adjust after thinking.
12. As a team member, I want other people's votes to stay hidden until the reveal, so that I'm not influenced by them.
13. As a team member, I want to see only "voted" or "waiting" for others during voting, so that I know when everyone is ready.
14. As a team member, I want to see how many people have voted, so that I know how close we are to revealing.
15. As a team member, I want observers shown as observing and not counted as voters, so that they never hold up the round.
16. As any participant, I want to press "Reveal cards" at any time, so that a missing person doesn't block the room.
17. As any participant, I want a warning like "2 people haven't voted" on reveal, so that I know the result is based on partial votes.
18. As any participant, I want people who didn't vote shown as "no vote" on reveal, so that it's obvious who is missing.
19. As a team member, I want everyone's cards shown together on reveal, so that we can see where the group stands.
20. As a team member, I want cards locked after the reveal, so that votes can't be changed under the group's eyes.
21. As a team member, I want one big result after the reveal, so that the outcome is unmistakable on a screen share.
22. As a team member, I want the result to be the larger value when all numeric votes are within one step, so that we follow our team rule. For example, 3, 5, 3, 3 gives 5.
23. As a team member, I want "within one step" measured by position in the sequence 1, 2, 3, 5, 8, 13, so that 3 to 5, 5 to 8 and 8 to 13 count as adjacent.
24. As a team member, I want the result to be "Discuss" when the lowest and highest numeric votes are more than one step apart, so that we stop and talk. For example, 3, 5, 3, 8 gives Discuss.
25. As a team member, I want the lowest and highest cards highlighted on a "Discuss" result, so that we know whom to ask first.
26. As a facilitator, I want coffee votes shown but ignored in the result, so that I can vote coffee as a placeholder without forcing "Discuss."
27. As a team member, I want "Discuss" when there are no numeric votes, such as everyone choosing coffee, so that we don't report a false estimate.
28. As any participant, I want a single "New round" button that clears all votes, so that re-voting after a discussion and moving to the next story are the same action.
29. As a team member, I want people who close the tab or lose connection to drop off the list after about 30 seconds, so that the roster stays accurate without removing someone on a quick refresh.
30. As a team member, I want to rejoin the same room after a brief disconnect with my vote intact, so that flaky connections don't disrupt the session.
31. As a team member, I want the screen to update in real time when others vote, join or leave, so that I never need to refresh.
32. As a facilitator, I want idle rooms cleaned up automatically after about 12 hours, so that the server doesn't accumulate stale state.
33. As a team member, I want a clear message when I open a link to a room that no longer exists, so that I know to ask for a fresh link.
34. As a facilitator, I want the app to work well in a half-screen browser window beside a video call, so that it is comfortable during meetings.
35. As the person deploying this, I want a plain Dockerfile and a `PORT` environment variable, so that I can host it on a free tier and move it later.
36. As the person deploying this, I want no database or external services, so that hosting stays free and simple.

## Implementation Decisions

**Product rules**
- Cards: 1, 2, 3, 5, 8, 13 and coffee.
- Result rule: take the numeric votes (coffee, non-votes and observers excluded) and map each to its position in the sequence. If there are no numeric votes, the result is "Discuss." If the highest position minus the lowest position is 1 or less, the result is the highest vote. Otherwise the result is "Discuss," and the lowest and highest values are reported so the UI can highlight them.
- Coffee never forces "Discuss" on its own. It is the facilitator's placeholder vote.
- No average, no tally, no story title or ticket field, no history. Only the story-point value or "Discuss" is shown.
- Anyone can reveal and reset, including observers. There is no facilitator role.
- Reveal is allowed at any time, including with missing votes. Missing voters show as "no vote" with a warning, and they are ignored in the result.
- Votes can be changed until the reveal and are locked after it.
- Observers do not vote and do not count toward "everyone voted" or the voted count.
- "New round" clears all votes and hides the cards.

**Rooms and identity**
- The home page creates a room with a short random, unguessable id. The room URL contains the id.
- Joining requires a display name and an optional observer flag. There are no accounts.
- The client stores a generated participant token and the name locally so a refresh reclaims the same seat and vote.
- A disconnected participant stays listed for a grace period of about 30 seconds, then is removed. Reconnecting within the grace period resumes the seat.
- Rooms are deleted after about 12 hours of inactivity.

**Architecture**
- A single Node.js and TypeScript server hosts both a WebSocket endpoint and the static frontend. State lives in memory, with no database. A server restart clears all rooms, which is accepted.
- The server is the source of truth. Clients send intents (join, vote, reveal, new round). The server broadcasts room state.
- **Privacy is enforced on the server.** Before reveal, the state sent to each client contains only whether each participant has voted, plus that client's own vote. Other participants' card values are never sent until the reveal. Hiding votes in the UI alone is not acceptable.
- The result is computed on the server at reveal time and sent with the revealed state, so every client shows the same outcome.
- The frontend is a small React app built with Vite and styled by hand, with no component library. It follows prototype C: a dark theme, a big centered card picker with a sidebar roster before the reveal, and a very large result plus a strip of everyone's cards with outliers highlighted after it.
- It is laptop-only, designed for a half-screen window beside a video call. Mobile layout is not a goal, though it should not break completely.
- Deployment is a single container image built from a plain Dockerfile and configured by a `PORT` environment variable. The first target is Render's free tier, which sleeps after about 15 idle minutes and takes about a minute to wake. Google Cloud Run is the fallback and would need a single-instance setting because of the in-memory rooms.
- The project lives in its own git repository, separate from the NinjaOne monorepo.

**Prototype-derived decision**
The result rule was prototyped in the throwaway prototype and is reproduced here as the reference behavior. It came from a prototype and is trimmed to the decision-rich part:

```js
const SEQ = [1, 2, 3, 5, 8, 13];
function computeResult(players) {
  const nums = players.filter(p => !p.observer && p.vote && p.vote !== '☕').map(p => Number(p.vote));
  if (!nums.length) return { discuss: true, reason: 'No numeric votes' };
  const idx = nums.map(n => SEQ.indexOf(n));
  const lo = Math.min(...idx), hi = Math.max(...idx);
  if (hi - lo <= 1) return { points: SEQ[hi] };
  return { discuss: true, lo: SEQ[lo], hi: SEQ[hi] };
}
```

## Testing Decisions

**What makes a good test:** it checks externally observable behavior through the app's real interface, not internal structure. Tests should survive a refactor of the room and rule internals.

**Proposed seam (please confirm):** there is exactly one seam, the **room server's WebSocket interface**. Tests start the real server in-process on a free port, connect real WebSocket clients, and drive the whole flow (join, vote, reveal, new round, disconnect, reconnect) while asserting on the messages each client receives. This one seam covers the rules, privacy, room lifecycle and reconnection at once. The result rule and its edge cases are tested through it, not through a separate unit-test seam.

**Behaviors to cover through the seam**
- Result rule: adjacent values give the larger value (3, 5, 3, 3 gives 5, and 8, 13 gives 13). Values more than one step apart give "Discuss" with the lowest and highest reported (3, 5, 3, 8, and 5 with 13). Coffee is ignored (3, 5, coffee gives 5). All-coffee and no-votes give "Discuss." Observers and non-voters are excluded.
- Privacy: before reveal, no client receives another participant's card value, only voted or waiting. A client receives its own vote, and after reveal everyone receives everyone's.
- Voting: votes can be changed before the reveal and are rejected after it. "New round" clears all votes.
- Reveal with missing voters: it succeeds and reports who didn't vote.
- Observers: they can reveal and reset, are excluded from voter counts, and cannot vote.
- Lifecycle: reconnecting within the grace period resumes the seat and vote, and a participant is removed after the grace period. Idle rooms are removed after the idle timeout. Both use injectable time, and fake timers are fine here. Joining a missing room returns a clear error.

**Prior art:** none, since this is a new repository. The throwaway prototype demonstrates the intended behavior but is not a test suite.

**Not tested automatically:** the visual layout. It is checked manually against prototype C.

## Out of Scope

- Accounts, passwords and any access control beyond the unguessable room link.
- Story or ticket titles, Jira integration, vote history and exports.
- The average or any tally of votes.
- A facilitator or admin role, or permissions on who can reveal and reset.
- Persistence and a database, since a server restart clearing rooms is accepted.
- Multi-instance scaling or sharing room state across servers.
- Mobile-optimized layout.
- Custom card decks and configurable rules. The deck and the one-step rule are fixed.
- Prototype B and the dropped prototype A.

## Further Notes

- Prototype C and the unused prototype B are kept in the repository as throwaway visual references and are not part of the shipped app.
- Free-tier hosting sleeps after about 15 idle minutes on Render and loses the in-memory rooms. The practical habit is to open the link a few minutes before the meeting and share a fresh link each sprint.
- The decision log behind this spec was a design interview. Key choices: sequence-position adjacency, coffee as a placeholder (not "Discuss"), no average, anyone can reveal and reset, random room URLs, and hosting in the free cloud rather than on a laptop with a tunnel.
- **Open item for the user:** the spec was written before the single-seam proposal above was confirmed. Confirm that the WebSocket interface is the right testing seam, or say where it should move.
