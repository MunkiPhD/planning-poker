# T2 Room server core

Status: done
Blocked by: T1

Spec: docs/specs/planning-poker.md

Create room (random unguessable id), join (name, observer, token), vote, reveal, new round over WebSocket. Server-side privacy filtering and result rule per spec. Tests via the WebSocket seam (real in-process server + real ws clients). Define the message protocol in a shared types file.
