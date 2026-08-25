# FEATURE.md — `artifacts` (local mechanics)

> Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/workspace/artifacts-canvas/STATE.md` — read it before touching this feature in ANY repo.

Everything about *what* artifacts are, why they exist, how materialization works, the wire
contract, the data model, the decisions, and the open work lives in that node's doc kit
(`STATE.md`, `ARTIFACT-WIRE-CONTRACT.md`, `TWO-WAY-BINDING.md`, `CANVAS-DATA-MODEL.md`,
`DECISIONS.md`, `HANDOFF.md`, `VISION.md`). This file holds only what an agent editing THIS
directory must not get wrong.

## What lives here

`features/artifacts/` is thin — the `chat.artifact` discovery layer only:

- `types.ts` — `cx_artifact` row/record types + the `ArtifactType` enum
- `components/CmsArtifactList.tsx` / `CmsArtifactDetail.tsx` — the `/artifacts` library surface
- `migrations/` — `001_cx_artifact.sql`, `002_html_pages_context_columns.sql`

> The type **registry, one-renderer-per-type, materialization, and persistence adapters** live in
> `features/canvas/artifact-types/` + `features/canvas/materialization/` — **not here.**

## Rules for this directory

- **`chat.artifact`'s remaining `user_id` write is deliberate and pinned.** `user_id` is the LEAD
  column of `uq_cx_artifact_source_natural_key` (`NULLS NOT DISTINCT`), the index this
  `ON CONFLICT DO NOTHING` upsert infers. Removing the write before that index is rebuilt on
  `created_by` makes every existing row invisible to the conflict arbiter and reintroduces the
  duplicate-artifact bug. The write and the `onConflict` string come out together, in the change
  that lands the new index.
- **Every ownership READ keys on `created_by`**, never `user_id`. `project_id` is gone end-to-end —
  do not reintroduce it.
- `chat.artifact` create/upsert must stay atomic (`upsert` with `ignoreDuplicates`), and the
  conflict-recovery branch must **revive** archived rows (`status='published'`, `deleted_at=null`)
  rather than returning a dead one — the natural-key index spans soft-deleted rows.
- Normalize `external_system` (`"" → null`) once, so the write and the recovery read agree.
- `app/api/artifacts/route.ts` is a middle tier queued for deletion — do not add to it.

**Keep-docs-live:** a change to the discovery index's identity, ownership, or route surface updates
the node's `STATE.md` in the same session.
