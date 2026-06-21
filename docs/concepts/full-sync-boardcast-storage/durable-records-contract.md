# Durable Records — the canonical persistence contract

Single source of truth for how any feature record is **edited, dirty-tracked, saved, versioned, and soft-deleted**. One declaration, one drop-in hook, one set of guarantees — from "never lose a keystroke" (notes) to "save only when I click Save" (agent builder), and every point between.

Status: `agreed` — direction + the four core decisions locked (§10). First consumer: **Tasks + Projects**. **The code is the hard part — that is where effort goes; the DB scaffolding is the easy, well-trodden part.**
Last updated: 2026-06-21.

This **realizes and extends decisions.md D3** ("all per-feature auto-save hooks/middleware are replaced by a single `autoSave` capability"). D3 shipped the engine in Phase 5 but never wired a consumer, and never covered baseline-diff dirty tracking, the manual/hybrid spectrum, versioning, or soft-delete. This doc closes that gap.

Related: [`decisions.md`](./decisions.md) · [`phase-5-plan.md`](./phase-5-plan.md) · [`phase-5-status.md`](./phase-5-status.md). Engine: `lib/sync/`. Reference consumers studied: `features/notes/`, `features/agents/redux/agent-definition/`. DB versioning dispatcher + `features/versioning/`. Diff engine: `components/diff/`.

---

## 0. The one insight

The two gold-standard systems are the **same engine with one knob**.

- **Notes** (`features/notes/`) — never-lose autosave: local buffer → tiny debounce → Redux → long debounce → partial write, plus boundary flushes.
- **Agent builder** (`features/agents/redux/agent-definition/`) — manual, dirty-gated save with baseline-diff tracking, undo/redo, and an unsaved-changes diff.

They share an identical data model and differ in **exactly one dimension: when the write fires.** That dimension is the spectrum. This contract makes it a single config field on one shared primitive.

---

## 1. Non-negotiables (inherit decisions.md N1–N8)

- **ONE state, edited live (locked, D-A).** There is no separate "draft" copy of a record. Edits write **directly into the single canonical Redux slice** every feature already reads. `isDirty` means only "this differs from the server." **Recovery is one action that re-pulls from the server** — the sole source of truth — and clears dirty. Spinning up a parallel/shadow draft store is forbidden; it is exactly the duplication the move-everything-to-Redux effort eliminated.
- **One system.** No new parallel autosave. This **extends `lib/sync`** (the existing `autoSave` capability + scheduler), it does not sit beside it.
- **Drop-in.** A feature adds durability by declaring one policy + consuming one hook. No bespoke middleware, no per-feature save hook. (decisions.md N3, O5.)
- **All Redux.** Dirty state, baseline, undo, save lifecycle live in the slice. The commit scheduler is middleware (matches `lib/sync` + notes). Thunks for explicit save / create / delete / restore / promote. **Sagas only** for genuinely long-running orchestration — never reached for by default.
- **The unsaved-changes modal is mandatory everywhere (locked, D-D).** Any attempt to navigate away or close the page while a record is dirty MUST raise a modal that names **exactly what will be lost** (which fields/changes), not a generic warning. Whether a feature *also* auto-flushes on leave is per-feature; the warning modal is universal.
- **Net-negative code.** Each migration deletes the feature's bespoke autosave/dirty/version/diff code (decisions.md N6). Notes' `autoSaveMiddleware` + `useAutoSave`, agents' duplicate version/timeline code are the named deletion targets.

---

## 2. The spectrum — `commit.mode`

One field selects where a record sits between the extremes. Set per **feature / route / table** (and overridable per record where a feature needs it).

| `mode` | Normal save cadence | Auto-flush dirty on leave (`flushOnHide`) | Reference |
|---|---|---|---|
| `auto` | Debounced write while editing (content-adaptive) | On | Notes |
| `hybrid` | **No** write while editing; user clicks Save | Per-feature (default on) | Tasks/Projects (first consumer) |
| `manual` | User clicks Save only | Per-feature (default off) | Agent builder |

`hybrid` is the "in between" — the dirty indicator + Save button feel of the agent builder, with notes' optional safety net. It is the default recommendation for form-like records (tasks, projects, settings rows).

**`flushOnHide` is per-feature (locked, D-D)** — each feature picks whether leaving the page silently rescues unsaved work. **Independently and universally, the unsaved-changes warning modal (§4.4) always fires** and enumerates exactly what is unsaved. Auto-flush is a convenience; the modal is the guarantee.

**Debounce** (`auto`/`hybrid` flush timing) reuses the proven content-adaptive tiers from notes (`features/notes/redux/notes.types.ts`): `<1k chars → 3s`, `<10k → 5s`, `≥10k → 10s`. Constant or `(record,id)=>number`, per `AutoSaveConfig.debounceMs` (`lib/sync/types.ts`).

---

## 3. The canonical record model

Every durable slice is `Record<id, T & RecordTracking>`. The tracking fields and the edit reducer are **lifted from the agent-builder model** (`features/agents/redux/agent-definition/slice.ts#applyFieldEdit`) — it is the better of the two implementations and the standard.

### 3.1 Tracking fields (`RecordTracking`)

```
_dirty: boolean              // derived: fieldFlagsSize(_dirtyFields) > 0
_dirtyFields: FieldFlags     // serializable presence-map, NOT a Set
_fieldHistory: FieldSnapshot // per-field baseline (last clean value), only for dirty fields
_saving: boolean
_error: string | null        // doubles as the "conflict" sentinel
_loading: boolean
_fetchStatus: ... | null     // list | full | versionSnapshot — gates readiness
_undoPast / _undoFuture      // undo stacks (coalesced, byte-bounded)
```

**`FieldFlags` (`features/agents/redux/shared/field-flags.ts`), never `Set`.** `Set` is not JSON-serializable — it blocks persistence, devtools time-travel, and broadcast. Notes' `_dirtyFields: Set` is the one thing the migration drops.

### 3.2 `applyFieldEdit` — the dirty-tracking core

On every user edit, in one reducer:

1. **Baseline once per clean cycle** — snapshot the prior value into `_fieldHistory[field]` only on the *first* edit since clean. The baseline anchors to the last save/fetch, never to intermediate keystrokes.
2. **Push an undo entry** (coalesced within `UNDO_COALESCE_MS`).
3. **Set the new value.**
4. **Deep-equality reconcile** — if the new value `isEqual` to the baseline, **clear** the dirty flag + history entry (edit-back-to-original auto-cleans). Else mark dirty.
5. **Derive `_dirty`** from `_dirtyFields` — it can never drift.

This precision (no false-positive dirty) is what the agent builder has and notes lacks. It is mandatory in the shared kit.

**Baseline + recovery (locked, D-A).** `_fieldHistory` (the per-field last-saved value) is tracking metadata **on the canonical record itself** — it is not a second copy of the record, just the "before" anchor for dirty/diff. **Revert = one action:** clear `_dirtyFields`/`_fieldHistory` and re-pull the record from the server (`fetchTask`-style), since the server is the single source of truth. No shadow draft, no client-side "original record" cache.

### 3.3 Nested / related entities

Tracked at **top-level-field granularity** (the whole `tools: string[]`, the whole `settings` object), edited atomically. Sub-entity detail is rendered by the **diff adapters** (§5), not by per-sub-entity dirty flags. This is the agent-builder model — keep it.

---

## 4. Public API — the drop-in surface

Four pieces. A feature touches only these.

### 4.1 `definePersistencePolicy(...)` — one declaration per table

Extends `lib/sync` `definePolicy` (`preset: "warm-cache"`, `autoSave` block). Adds the durable-record fields:

```
definePersistencePolicy<TState, TRecord>({
  sliceName, version,
  recordsKey,                         // the Record<id,T> map key
  commit: {
    mode: "auto" | "hybrid" | "manual",
    debounceMs?: number | ((r,id)=>number),   // auto/hybrid; default = notes tiers
    triggerActions: string[],                  // edit actions that mark dirty
    write: (ctx) => Promise<Row>,              // partial-field write (only _dirtyFields)
    flushOnHide?: boolean,                     // manual default false; auto/hybrid true
    optimistic?: { onStart, onSuccess, onError },
  },
  versioning?: {                      // §5 — fold-in
    entityType: VersionEntityType,    // dispatcher key
    snapshotColumns: string[],        // tracked columns
  },
  softDelete?: {                      // §6 — fold-in
    column: "deleted_at",             // canonical
  },
})
```

`auto`/`hybrid` ride the existing `autoSaveScheduler` (`lib/sync/engine/autoSaveScheduler.ts`) — debounce, abort-on-supersede, `pagehide` flush, optimistic dispatches, echo suppression. `manual` registers the policy but schedules no write; the Save button calls `write` directly. **Same write contract for all three modes.**

### 4.2 A record slice-kit — the reducer/selector factory

Generates the canonical reducers (`applyFieldEdit` wrappers, `markSaving` / `markSaved` / `markSaveError`, undo/redo, `upsertFromServer` with dirty-preserving merge) and the memoized per-property + per-field-dirty selectors. A feature defines its `T`, its field setters, and its `write`; the kit supplies everything else. This kills the copy-paste between notes and agents.

### 4.3 `useDurableRecord(sliceName, id)` — the one hook

Returns a stable object: `{ value, patch(field, v), isDirty, isSaving, error, save(), canUndo, undo(), redo(), diff, version, softDelete(), restore() }`. This is the entire surface a component needs. No effect wiring at the call site.

### 4.4 UI primitives

- **`<SaveStatus>`** — dirty dot → "Saving…" → "Saved", with a manual Save affordance. One component, every surface.
- **`useUnsavedChangesGuard({ isDirty, changes })`** — in-app router block + `beforeunload`, raising a **mandatory modal that lists exactly what is unsaved** (the dirty fields / change summary), never a generic "you have unsaved changes." **The missing primitive** — no nav guard exists in the repo today. Required on every durable surface (locked, D-D). The `changes` summary is derived from `_dirtyFields` + `_fieldHistory` by the same diff engine that powers §5, so "what you'll lose" and "what changed" are one computation.
- **`<VersionTimeline>`** — §5.

---

## 5. Versioning folds in (declaration-level)

Versioning is **DB-trigger-driven and orthogonal to commit timing** — folding it in costs the frontend nothing at runtime and cannot be bypassed.

- **DB is already ~canonical:** an 8-entity "snapshot-on-write" trigger family (3 triggers: `set_initial_version` BEFORE INSERT, `create_v1_snapshot` AFTER INSERT, `snapshot_version` BEFORE UPDATE with an `app.skip_version_snapshot` guard + `IS NOT DISTINCT FROM` dirty-check) feeding one dispatcher RPC set: `get_version_history` / `get_version_snapshot` / `get_version_diff` / `promote_version` / `restore_version` / `purge_old_versions`, keyed by `entity_type`. `note_versions` is the richest reference shape (`change_source`, `change_type`, `diff_metadata`).
- **Frontend is already generic:** `features/versioning/` (hooks + `useVersionHistory`) over those RPCs, and the entity-agnostic structured diff engine `components/diff/engine` + adapter registry. The diff "before" side is the record's `_fieldHistory` baseline (unsaved) or a fetched snapshot (historical) — same engine.
- **The policy declaring `versioning` provides:** the snapshot column set + `entity_type`. History / diff / restore / promote come automatically via `useVersionHistory` + a new shared **`<VersionTimeline>`** (collapses the duplicated `VersionHistoryTimeline` (agents) and `NoteVersionHistoryPanel` (notes) into one).
- **Model the agents (`agx_*`) DB mechanism (locked, D-C).** Create auto-makes v1; **history always holds every snapshot including v1 and the current version**; the DB triggers do the work. **No pruning/retention is built now** — keep all versions. Reference-aware purging is a later concern. The DB side here is the *easy* part; effort goes into the frontend code.
- **Gaps to close in the generalization phase:** `features/versioning` `VersionEntityType` is stale (3 of 8 supported); the per-entity dispatcher `ELSIF` ladder should become a metadata-driven registry; notes' `restore_note_version` reconciles onto the generic set.

---

## 6. Soft-delete folds in (declaration-level)

- **Canonical column: `deleted_at timestamptz null`** (22 tables today, the modern pattern) + a **partial index** `WHERE deleted_at IS NULL`. `is_deleted` (13 tables) is legacy and migrates; `is_archived` is a **separate** "hide but keep, not deleted" concept and stays distinct.
- **Canonical RPC trio (generalize the `cld_*` reference):** `<base>_soft_delete(id)` (idempotent, cascades), `<base>_restore(id)`, `<base>_list_trash(...)`. No triggers — soft-delete is an explicit RPC.
- **The policy declaring `softDelete` provides:** `softDelete()` / `restore()` on `useDurableRecord`, list filtering (`deleted_at IS NULL`), and a trash view. **Never hard-delete** durable records — version history (FK) and recoverability depend on it.

---

## 7. Safety invariants (the hard requirements)

- **No re-render storms** — local typing buffer keeps keystrokes out of Redux until debounce (notes pattern); per-property + per-field-dirty memoized `createSelector`s (both references); edits are plain Immer mutations. Components subscribe to one scalar each.
- **No loops** — `markSaved` is **never** a `triggerActions` entry; baseline reconciliation cannot oscillate `_dirty`; rehydrate + broadcast-echo actions are excluded from the trigger/persist path; realtime echoes suppressed via `isPendingEcho`.
- **Never-lose** — layered flush (debounce → boundary flush → `pagehide`); retry keeps the record `_dirty` on write failure; **partial-field writes** (only `_dirtyFields`) so concurrent edits to different fields never clobber; the DB version snapshot is the ultimate recovery; soft-delete (never hard) is recoverable from trash.
- **Conflict — deliberately minimal (locked, D-B).** With one canonical Redux state and one server source of truth, **Redux applies actions in arrival order**; there is no second draft to reconcile against. No heavy notes-style resolver, no DB optimistic lock. Dirty edits are preserved over incoming server data; recovery is the one-action server re-pull. A rich compare-and-choose resolver may be added **per high-collision table later** — it is not built now.
- **Identity-scoped** — all caches + in-flight writes purge on identity swap (inherited from `lib/sync`).

---

## 8. First consumer — Tasks + Projects (the proof)

`ctx_tasks` / `ctx_projects` move off the manual `useState` + Save button (`features/tasks/components/TaskDetailPage.tsx`, `TaskDetailsPanel.tsx`) onto the kit in **`hybrid`** mode:

- **Tracking fields + `applyFieldEdit` added directly onto the existing shared `agent-context/tasks` (and projects) slice** — no separate draft store (D-A). Every existing reader keeps reading the same slice. Revert re-pulls from the server.
- `<SaveStatus>` + `useUnsavedChangesGuard` (mandatory modal listing the dirty fields).
- DB (the easy part — do it, don't dwell): add `ctx_tasks` / `ctx_projects` to the versioning dispatcher (snapshot table + 3 triggers + `entity_type`, agx-modeled: auto v1 on create, keep all) and add `deleted_at` + the soft-delete RPC trio. Migrations via Supabase MCP, verified live, ledger-recorded, `db-types` regenerated (per CLAUDE.md migration law).

---

## 9. Phased plan

1. **Contract** (this doc) — agreed.
2. **Engine + kit** — record slice-kit, `definePersistencePolicy`, `useDurableRecord`, `<SaveStatus>`, `useUnsavedChangesGuard`, `<VersionTimeline>`. Wire `manual`/`hybrid` onto `autoSaveScheduler`.
3. **Tasks + Projects** — first consumer, hybrid, full versioning + soft-delete (§8).
4. **Notes migration** — never-lose extreme; delete `autoSaveMiddleware` + `useAutoSave`; unify on `FieldFlags`; single realtime path.
5. **Agent builder migration** — manual extreme; adopt the kit + shared timeline; delete duplicate diff/version code.
6. **Generalize** — metadata-driven version dispatcher; generic soft-delete RPC trio; fold notes-only `features/text-diff` version service into `features/versioning`; one `<VersionTimeline>`.

Each phase ships a real consumer and a real deletion. No phase leaves two systems running for the same slice.

---

## 10. Locked decisions

- **D-A — One state, edited live.** Edits write directly into the single canonical Redux slice; no draft/shadow store. `isDirty` = "differs from server"; revert = one action that re-pulls from the server. `_fieldHistory` is per-field baseline metadata on the record, not a copy.
- **D-B — Minimal conflict handling.** One source of truth + Redux action ordering is the model. No heavy resolver, no optimistic lock now; per-table resolver possible later.
- **D-C — No pruning now; model the `agx_*` DB mechanism.** Auto v1 on create, keep every version (incl. v1 + current). DB is the easy part — **effort goes into the frontend code.**
- **D-D — `flushOnHide` is per-feature; the unsaved-changes modal is universal and mandatory.** The modal must state exactly which changes/fields will be lost.
