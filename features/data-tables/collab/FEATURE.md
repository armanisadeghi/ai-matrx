# `features/data-tables/collab` — Workbook CRDT v2

**Status:** `live` — verified by `verify-collab.ts` (10/10 incl. real-Broadcast e2e); `collab` flag ON at `/workbooks/[id]`
**Tier:** `2` (extension of the Tier 1 data-tables / workbook surface)
**Last updated:** `2026-06-12`

> **Before changing the provider or session, run the gate:**
> `npx tsx features/data-tables/collab/verify-collab.ts`
> (needs `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
> for Stage B; Stage A runs offline). It caught three shipped-silent bugs on
> first run — treat it as mandatory, not optional.

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
- [x] Awareness wiring + outbound throttle (50 ms).
- [x] `RemoteCursorsLayer.tsx` — shipped as a toolbar presence strip
      (color + name + cell coords). Pixel-positioned overlay rings over the
      actual cell remain a v2.1 polish item (scroll + freeze translation).
- [x] `WorkbookEditor.tsx` wired behind the `collab` prop; host-election
      gated autosave; awareness → cursor strip.
- [x] ~~PROBE FIRST~~ → **superseded by a structural guard.**
      `handleLocalMutation` JSON-round-trips params before pushing into Yjs;
      non-encodable mutations are skipped with a loud console warning instead
      of corrupting the shared doc. Corruption is now structurally impossible;
      the residual failure mode is one skipped (logged) edit. Verified by
      harness test A4 with a circular-reference payload.
- [ ] (v2.1) Repurpose `useWorkbookRealtime`: log-only, lazy hot-swap on
      doc-lag > 100 ops. Currently it still hot-swaps on remote snapshot —
      harmless overlap with CRDT (host is the only writer) but redundant.

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

## Files in this directory

| File | Status | Purpose |
|---|---|---|
| `types.ts` | ✅ | Wire-protocol shapes for Yjs + Awareness over Broadcast |
| `FEATURE.md` | ✅ | This document |
| `SupabaseYjsProvider.ts` | ✅ | Broadcast transport: chunked V2 y-updates, throttled awareness, state-sync on join, subscribe timeout → solo degrade. Accepts an injected `SupabaseClient` (defaults to app singleton) |
| `WorkbookCollabSession.ts` | ✅ | Univer ↔ Yjs adapter: `Y.Array<MutationOp>` causal log, `__matrxRemote` sentinel, local-transaction guard, JSON-normalize guard, deterministic host election. Transport-agnostic via `CollabProviderLike` |
| `verify-collab.ts` | ✅ | **The verification gate.** Stage A: loopback bridge contract (5 assertions, offline). Stage B: real two-socket Broadcast e2e (3 assertions). Run before any change here |
| `../components/RemoteCursorsLayer.tsx` | ✅ | Toolbar presence strip (peer color/name/cell). Pixel overlay = v2.1 |

---

## Change log

- `2026-06-12` — claude: **verified + flag flipped ON.** Built `verify-collab.ts`
  (loopback + real-Broadcast e2e, 10/10 passing). The gate caught three real bugs,
  all fixed: (1) Y.Array observer applied the originator's own pushes → every local
  edit double-applied; fixed with `event.transaction.local` guard. (2) `connect()`
  hung forever on a blocked WebSocket; fixed with terminal-status handling +
  8s timeout → solo-mode degrade. (3) outbound updates were V2-encoded
  (`updateV2` / `encodeStateAsUpdateV2`) but applied with the V1 decoder
  (`Y.applyUpdate`) → transport silently dead; fixed with `Y.applyUpdateV2` at
  both apply sites. Also: JSON-normalize guard at the mutation push site
  (supersedes the planned browser probe — corruption now structurally
  impossible), `CollabProviderLike` structural transport seam, injectable
  `SupabaseClient`. `collab` prop enabled on `/workbooks/[id]`.
- `2026-06-06` — claude: full implementation pass (provider, session, cursor
  strip, WorkbookEditor wiring behind the `collab` flag).
- `2026-06-06` — claude: scaffold `types.ts` + this FEATURE.md from the
  research pass. Captures the full plan and the "do NOT use the Pro preset"
  decision so the next implementer can start without re-deriving.
