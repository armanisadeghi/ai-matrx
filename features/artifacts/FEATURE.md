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
- **Library cards open materialized artifacts in Canvas by pointer.** The dedicated `/artifacts/[id]`
  page remains an explicit action and accepts either the `chat.artifact` id or its `canvas_items` id;
  artifacts without a materialized canvas row continue to open the page.

**Keep-docs-live:** a change to the discovery index's identity, ownership, or route surface updates
the node's `STATE.md` in the same session.

## Change log

- `2026-09-19` — **Content Library is a Finder/Drive list, not a card grid.** The padded tiles (tinted icon chip, single-line truncated titles, status badges on every published item) are gone. Rows are name-first: 16px Lucide glyph with no background, the full title wrapping in the name column, kind and date as quiet columns, and status only when it is not published. Archive is hidden unless that status is chosen. Delete names the consequence and uses `confirm()`. Champion: Apple Files + Google Drive list.

- `2026-09-17` — **The artifacts route's upsert carries the validated organization, not `?? null`.** `app/api/artifacts/route.ts` already refused a create with no `organizationId`, but the value it put in the payload was typed `string | null`, so the write still read as a possible NULL — and `chat.artifact` carries `public._stamp_org_default`, which files a NULL in the WRITER'S personal workspace. The validated id is now a plain non-empty string and the refusal is unchanged (400 `organization_context_required`, with the sentence that tells the person to choose an organization). Guard: `pnpm check:organization-context`.

- 2026-09-17 — An artifact is filed in the organization the person selected, or it is not saved.
  `POST /api/artifacts` (`action: "create"`) wrote `organization_id: organizationId ?? null` into
  `chat.artifact`, which carries `public._stamp_org_default` — so "no organization" was silently a
  misfile into the writer's PERSONAL organization, not a null. The route now refuses a create with
  no organization (400, with the remedy in the person's words), and `registerArtifactThunk`
  (`lib/redux/thunks/artifactThunks.ts`) throws the one typed
  `OrganizationContextError("organization_context_required")` BEFORE the network when nothing is
  selected, so surfaces render `OrganizationRequiredNotice` instead of a raw sentence. Law:
  `../../common-docs/policies/context-is-carried-never-rebuilt.md`.

- 2026-08-27 — Bounded the dedicated library detail host for diagram workspace rendering so the
  canonical full-height renderer receives a non-zero viewport.
