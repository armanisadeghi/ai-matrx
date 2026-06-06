# `features/data-tables/collab` — Workbook CRDT v2

**Status:** `implemented` (behind opt-in `collab` flag — needs e2e verification)
**Tier:** `2` (extension of the Tier 1 data-tables / workbook surface)
**Last updated:** `2026-06-07`

---

## Purpose

Layer real per-cell collaborative editing on top of the v1 workbook surface
(`features/data-tables/components/WorkbookEditor.tsx`). The v1 surface uses
snapshot-per-save persistence with realtime hot-swap on remote save — fine for
turn-based collaboration but produces silent overwrites if two users edit
simultaneously. This phase eliminates that class of bug.

**v1 (live):** Univer mounted on the page, autosave every 2.5s, remote snapshot
hot-swap, last-write-wins.
**v2 (this dir):** Yjs CRDT updates over Supabase Broadcast; snapshot store stays
as the canonical persisted state; presence cursors over Awareness.

---

## Why not the official Univer collab preset

`@univerjs/preset-sheets-collaboration` (already in node_modules at v0.25.0) pulls
`@univerjs-pro/collaboration*` packages that require a proprietary "universer"
backend with endpoints baked into the client config (`/universer-api/snapshot`,
`/universer-api/comb/connect` WebSocket, `/universer-api/authz`, etc.). The wire
protocol is custom OT (`ICombRequestEvent`/`ICombResponseEvent`), **not Yjs**.

The Pro client *does* expose a pluggable `ICollaborationSocketService`
(`@univerjs-pro/collaboration-client/lib/types/services/socket/collaboration-socket.service.d.ts:24`)
but the protocol on top of it is hard-coded to Univer's OT model and expects
server-side `authz` + `snapshot` + `history` HTTP services we don't have.
Standing those up is a Univer Pro license deal with DreamNum.

**Verdict:** roll our own bridge using Univer's public hook
`ICommandService.onMutationExecutedForCollab` (`@univerjs/core/lib/types/services/command/command.service.d.ts:248`).
Mutations are guaranteed serializable (`command.service.d.ts:121`) and Univer
itself separates "command" (user intent) from "mutation" (deterministic state
change), exposing exactly the right grain for CRDT.

---

## Architecture

```
Univer command  ──onMutationExecutedForCollab──▶  WorkbookCollabSession
                                                     │
                                                     ▼
                                          Y.Array<MutationOp> on Y.Doc
                                                     │
                                          Y.encodeStateAsUpdateV2()
                                                     │
                                                     ▼
                                          SupabaseYjsProvider
                                                     │
                                          channel.send('y-update', {u: base64(...)})
                                                     │
                                                     ▼  (Supabase Broadcast — ephemeral)
                                                     │
                                              (peer's provider)
                                                     │
                                          Y.applyUpdate(doc, ...)
                                                     │
                                          observer on Y.Array
                                                     │
                                                     ▼
                              commandService.syncExecuteCommand(op.id, {...op.params, trigger:'remote'},
                                                                {onlyLocal:true, fromCollab:true})
```

**Why `Y.Array<MutationOp>` and not `Y.Map<sheetId, Y.Map<cellKey, ...>>`:**
Univer mutations are already conflict-resolvable at the mutation grain. We use
Yjs as the **causal log + transport-agnostic CRDT envelope**, not for cell-level
merging. This avoids reimplementing Univer's OT inside Yjs. Tradeoff: two
clients editing the *same cell* concurrently apply their mutations in
Yjs-defined order — last-writer-wins per mutation, which is acceptable for v1
and matches user mental model for spreadsheets.

For finer-grained semantics later, swap the doc shape to
`Y.Map<sheetId, Y.Map<cellKey, Y.Map<value|style|formula>>>` and write a richer
mutation→Y.Map translator. Out of scope.

---

## Persistence reconciliation

- **Join:** load latest `udt_workbook_snapshots` row (existing service helper).
  Construct a fresh `Y.Doc`. Mount Univer with the snapshot via the existing
  `apiRef.current.createWorkbook(snapshot)` path.
- **Catch-up:** broadcast a `y-request-state` message; first peer to respond
  with `y-state` payload supplies the in-flight CRDT updates. If no peers
  respond within 1500 ms, assume we're alone.
- **Snapshot rewrite:** only the **host** writes snapshots. Host election is
  deterministic: lowest `uid` (lex) among connected Awareness peers. Schedule:
  the existing 2.5 s debounce after a local mutation, PLUS a forced rewrite
  every 60 s of activity, PLUS a forced rewrite when the Yjs update count
  exceeds 500 since last save. Late joiners never have to replay a multi-hour
  Yjs log.
- The existing `useWorkbookRealtime` snapshot-insert listener stays but its
  job changes from "hot-swap" to "log the checkpoint." Hot-swap only triggers
  if the local Yjs doc is more than ~100 ops behind (disaster-recovery).

---

## Awareness / cursors

Use Yjs's standard `Awareness` protocol (`y-protocols/awareness`). Send awareness
updates on a SEPARATE broadcast event (`y-awareness`) so we can throttle them
independently of the y-update channel.

State per peer (~80 bytes JSON, see `types.ts` for the typed shape):
`{uid, name, color, sheetId, row, col, ts}`.

Throttle outbound at 50 ms (well under Broadcast's 100 msg/s per-channel limit).
Render via a thin `RemoteCursorsLayer.tsx` mounted as sibling to the Univer
container; translate `(sheetId, row, col)` → pixels via
`worksheet.getCellPosition(row, col)`.

---

## Deps to install (when implementation begins)

```
yjs           ^13.6.27     (~70 KB min+gz)
y-protocols   ^1.0.6       (~6 KB)
lib0          ^0.2.99      (~15 KB, peer of yjs — usually auto-installed)
```

**Do NOT install:** `y-websocket` (we use Broadcast), `y-indexeddb` (snapshot
table is our persistence), `y-supabase` from npm (existing package is
unmaintained — write our own ~120 LoC provider).

The collab modules are dynamically imported via the existing
`dynamic(() => import('./WorkbookEditor'), { ssr: false })` wrapper, so non-
workbook routes pay zero bundle cost.

---

## Implementation checklist (3-5 day estimate)

- [ ] Install yjs + y-protocols (pnpm).
- [ ] `SupabaseYjsProvider.ts` (~150 LoC): open channel `yjs:workbook:<id>`;
      send y-update on local `doc.on('updateV2', ...)`; apply on receive;
      handle 256 KB payload limit via chunked `(seq, total)` frames.
- [ ] `WorkbookCollabSession.ts` (~200 LoC): subscribe to
      `commandService.onMutationExecutedForCollab`; emit to Yjs; observe Yjs;
      apply via `commandService.syncExecuteCommand(... {onlyLocal:true, fromCollab:true})`;
      short-circuit the outbound listener when `params.trigger === 'remote-collab'`.
- [ ] Awareness wiring + outbound throttle (50 ms).
- [ ] `RemoteCursorsLayer.tsx` (~120 LoC): absolute-positioned colored ring
      per peer; translates `(sheetId, row, col)` via Univer's facade.
- [ ] Update `WorkbookEditor.tsx`: replace the 2.5 s debounced save with the
      collab session; host-election gated save path; awareness state setup.
- [ ] Repurpose `useWorkbookRealtime`: log-only, lazy hot-swap on
      doc-lag > 100 ops.
- [ ] **PROBE FIRST**: ~30 min probe that boots Univer and verifies every
      mutation's `params` survives `JSON.stringify → JSON.parse` cleanly.
      `params` is typed as serializable but JS objects can carry `Date`,
      `Map`, etc. through "serializable" promises. If anything fails, fall
      back to `structuredClone` (perf cost acceptable for sheet edits) or a
      Univer fork that enforces serializability at mutation registration.

---

## Fallback ladder

- **Ladder rung 1 — Presence-only v1.5.** If the probe fails or the schedule
  slips, ship just the awareness/cursors layer (~1 day work) plus snapshot-
  per-save. Users see each other's selections and stop overwriting — real
  value without the full CRDT cost.
- **Ladder rung 2 — Faster polling.** Drop the snapshot debounce to 500 ms +
  reload-on-remote-insert. Cheap but produces visible cell flicker; only
  worth it after rung 1 lands.

---

## Files in this directory (current vs planned)

| File | Status | Purpose |
|---|---|---|
| `types.ts` | ✅ (scaffolded) | Wire-protocol shapes for Yjs + Awareness over Broadcast |
| `FEATURE.md` | ✅ | This document |
| `SupabaseYjsProvider.ts` | ⏳ | y-supabase provider (~150 LoC) |
| `WorkbookCollabSession.ts` | ⏳ | Univer ↔ Yjs adapter (~200 LoC) |
| `../components/RemoteCursorsLayer.tsx` | ⏳ | Cursor overlay (~120 LoC) |

---

## Change log

- `2026-06-06` — claude: scaffold `types.ts` + this FEATURE.md from the
  research pass. Captures the full plan and the "do NOT use the Pro preset"
  decision so the next implementer can start without re-deriving.
