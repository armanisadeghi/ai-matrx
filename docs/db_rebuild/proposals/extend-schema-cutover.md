# Proposal — Chrome-extension tables → `extend` schema + canonicalization

**Date:** 2026-06-27 · **Project:** Matrx Main (`txzxabzwovsujtloxrus`) · **Status:** executing during scheduled downtime.

## Scope
Move the Chrome-extension (matrx-extend) tables out of `public` into the pre-planned **`extend`** schema
(already in aidream `db/matrx_orm.yaml` as the "matrx-extend Chrome product tables" domain) and bring them
onto the platform standard. **All 8 tables are empty (0 rows) → zero data-loss risk.**

| Table | Action | Canonical end state |
|---|---|---|
| `wbx_capture` | move + full canonical | `entity` RLS, `visibility`, `created_by`, no `user_id` |
| `wbx_seo_audit` | move + full canonical | `entity` RLS, `visibility`, `created_by`, no `user_id` |
| `wbx_screenshot` | move + full canonical | `entity` RLS, `visibility`, `created_by`, no `user_id` |
| `wbx_pattern` | move + full canonical | `entity` RLS, `visibility`, `created_by`, no `user_id`; UNIQUE→`(created_by,domain,name)` |
| `wbx_highlight` | move + canonical (owner RLS) | `created_by`+`visibility`; **keeps `is_deleted`** (app-level soft-delete), owner RLS by `created_by` |
| `wbx_guidance` | move + canonical (owner RLS) | `created_by`+`visibility`; **keeps `is_deleted`** (cross-machine **tombstone** that must stay readable), owner RLS by `created_by` |
| `wbx_recipe` | move only | global read-all reference catalog (no owner) — not a base entity |
| `extension_auth_codes` | move only | ephemeral OAuth-handshake plumbing — keeps `user_id` owner RLS |

**Excluded** (not primarily the extension): `extractor` (generic PDF/scraper config), `user_bookmarks`
(canvas bookmarks, FK→`public.shared_canvas_items`, an app feature — registered entity `user_bookmark`).

## Key decisions
1. **`is_deleted` kept on `wbx_guidance` + `wbx_highlight`.** Canonical `entity` RLS hard-filters
   `deleted_at IS NULL`, which would **hide guidance tombstones** that the sync layer must read to propagate
   deletes across machines (`cloud-sync.ts` reads `row.is_deleted`). Forcing `deleted_at` here = behavior bug.
   These two get hand-written owner RLS (`created_by = auth.uid()`, no `deleted_at` filter); app keeps filtering
   `is_deleted` itself. They retain the `legacy_is_deleted` WARN by design.
2. **`extension_auth_codes` + `wbx_recipe` are not base entities** — ephemeral auth plumbing / global reference
   data. Moved as-is with their existing policies (don't force a bad shape).
3. **`user_id` dropped** from the 6 `wbx_` entity tables (owner = canonical `created_by`, stamped by
   `_stamp_actor`). Indexes recreated on `created_by`. Inserts already omit `user_id` except `wbx_highlight`
   (payload repointed) — zod schemas updated (`wbx_pattern`, `wbx_highlight`).

## ⛔ The one blocker I cannot do via MCP: PostgREST exposure
The extension + two matrx-frontend API routes read these tables via supabase-js (PostgREST). `extend` MUST be
added to the project's **Exposed Schemas** (Supabase dashboard → Settings → API, *append* `extend` to the list —
do not replace it) **and** to the `pnpm db-types` `--schema` flags. Until exposed, every read 404s — acceptable
because the whole system (and the extension) is down. **User action required to bring the extension back.**

## Consumers repointed
- matrx-extend: `src/lib/supabase/queries.ts`, `src/lib/highlights/queries.ts` (+ `types.ts`), `src/lib/data-pattern/recipes.ts` → `.schema('extend')`.
- matrx-frontend: `app/api/auth/extension/{exchange,generate-code}/route.ts` → `.schema('extend')`.
- aidream: no references (Python backend does not touch these tables). ORM `extend` block already present.
