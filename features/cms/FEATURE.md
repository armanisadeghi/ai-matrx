# FEATURE.md — `cms`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-07-10`

---

## Purpose

Admin UI + secured write API for the AI Matrx CMS platform: full multi-page client sites
(`client_*` tables) and standalone quick-publish HTML pages (`html_pages`, `features/html-pages/`,
documented separately but same DB). This repo owns the only properly-authenticated write paths for
both. Also ships the fleet-wide agent-activity visibility surface — see
`common-docs/systems/cms-system/FEATURE.md` for the full cross-repo picture (aidream's agent tool layer,
my-matrx's public renderer) and `aidream/docs/cms_agent_authoring/README.md` for the multi-agent
build plan this feature is part of (project P5).

---

## Entry points

**Routes**
- `app/(core)/cms/page.tsx` — site list (owner-scoped)
- `app/(core)/cms/[siteId]/page.tsx` — page list for a site
- `app/(core)/cms/[siteId]/settings/page.tsx` — site settings + delete (danger zone)
- `app/(core)/cms/[siteId]/components/page.tsx` — header/footer/etc. component CRUD
- `app/(core)/cms/[siteId]/collections/page.tsx` — W2-C collections list (policy badges, live counts) + editor dialog + Site Data Key block (masked/copy/rotate)
- `app/(core)/cms/[siteId]/collections/[collectionId]/page.tsx` — items viewer (schema-driven columns, unread/spam/archived filters, search, row+bulk triage, CSV export, **Add item / per-row edit**)
- `features/cms/components/collections/CollectionItemEditorDialog.tsx` — schema-driven create/edit for one item (correct input per field type, required markers, raw-JSON escape hatch for undeclared keys, route errors pinned to the offending inputs); Drawer on mobile, Dialog on desktop
- `features/cms/collections/validateItem.ts` — the canonical item-validator TWIN (see Doctrine)
- `app/(core)/cms/[siteId]/pages/[pageId]/page.tsx`, `.../pages/new/page.tsx` — page editor
- `app/(core)/cms/html-pages/**` — standalone `html_pages` management (see `features/html-pages/FEATURE.md`... not yet split out; documented in `features/html-pages/README.md`)
- `app/(admin)/administration/knowledge/cms-agents/page.tsx` — **agent visibility surface** (super-admin gated by the `(admin)` layout): live activity feed, per-site page tree, agent-write-policy editor, validation-exception approvals queue

**Services**
- `features/cms/services/cmsService.ts` — `CmsSiteService` / `CmsPageService` / `CmsVersionService` / `CmsComponentService` / `CmsApprovalsService` / `CmsAssetService` / `CmsCollectionService`, all POST `{action}` dispatch against `/api/cms/*` (`CmsAssetService.deleteAsset` throws `AssetInUseError` carrying the live usage detail on a 409)

**Hooks**
- `features/cms/hooks/useCmsSites.ts`, `useCmsPages.ts`, `useCmsVersions.ts` — owner-scoped CRUD hooks
- `features/cms/hooks/useCmsAdminActivity.ts` — polls the admin activity feed (8s interval)

**API endpoints** (all single-POST `{action, ...}` dispatch, secret key `SUPABASE_HTML_SECRET_KEY` bypasses RLS — ownership enforced in app code)
- `POST /api/cms/sites` — `list/get/create/update/delete` (owner-scoped) + `admin_list_sites/admin_update_policy/admin_list_activity` (requireSuperAdmin)
- `POST /api/cms/pages` — `list/get/create/promote/update/save-draft/publish/discard-draft/rollback/delete` (owner-scoped) + `admin_list` (requireSuperAdmin). `promote` (W2-A) copies an owned `html_pages` row onto an owned site as a NEW draft page: converter split per the my-matrx `/p/[id]` renderer via `features/html-pages/utils/promoteConvert.ts` (TS twin of aidream `services/cms/convert.py`; both test byte-identically against the shared `promote-convert-fixtures.json` — change semantics ⇒ change both), content lands ONLY in `_draft` twins (never auto-published), provenance both directions (`client_pages.source_*` cols, CMS migration 0008 / `html_pages.context_metadata.promotions[]`), idempotent per `(client_id, source_html_page_id)` unless `forceNew`.
- `POST /api/cms/components` — `list/get/create/update/delete` (owner-scoped)
- `POST /api/cms/versions` — `list/get` (read-only, owner-scoped)
- `POST /api/cms/approvals` — `list/approve/reject` (requireSuperAdmin) — F3 exception queue, degrades gracefully until P1's store table exists
- `POST /api/cms/assets` — `list/get/create/update/usage/delete` (owner-scoped) + `admin_list` (requireSuperAdmin). W2-B asset library over `client_assets`. **Bytes never pass through this route** — the client uploads through the canonical `fileHandler.upload({preset:'web', visibility:'public'})` → aidream `POST /assets` (durable public CDN URL), then `create` registers the metadata row. `create` re-enforces the durability doctrine (second layer): refuses a `file_path` that isn't absolute https or that carries a signed/expiring-link signature (`isSignedExpiringUrl`, mirrors aidream's validator). `delete` LIVE-scans pages+components (live + draft columns) and returns 409 `asset_in_use` with the exact reference list unless `force`; `usage` returns the same scan and re-syncs `used_in_pages`. aidream twin: `services/cms_assets/`.
- `POST /api/cms/collections` — W2-C collections (CMS migration 0015): `list` (per site, with live item/unread counts) / `get` / `create` / `update` / `archive` / `delete` (soft) / `rotate_key` (owner-scoped) + item ops `items_list` (filters + search + pagination) / `items_get` / `items_set_flags` (seen/spam/archive, row or bulk) / `items_delete` (soft) / `items_create` + `items_update` (ADMIN AUTHORING — see below) / `items_export` (rows for client-side CSV; stops on EITHER cap — 10,000 rows or ~3.5 MB serialized, returning `{truncated, reason}` because a row cap alone never bounded unbounded jsonb under Vercel's 4.5 MB response limit) + `admin_list` (requireSuperAdmin). Server rules mirrored in-route: slug `^[a-z0-9][a-z0-9_-]{0,62}$`; a field_schema containing `richtext` is REJECTED while `public_write` is true (checked on the MERGED result on update). First collection create mints `client_sites.data_api_key` (`'mk_' + 32 hex`); `rotate_key` re-mints it (old key dies immediately, published pages pick the new one up at next SSR render). Search on non-searchable collections is a capped in-route scan (2,000 newest; `searchTruncated` flag) — PostgREST cannot ilike a jsonb column; searchable collections use `textSearch` on `search_vector`.
  Flipping `searchable` false→true calls `backfill_collection_search_vectors` (CMS migration 0019) — the tsvector trigger only fires on insert/`UPDATE OF data`, so existing rows were silently unfindable; the row count rides back on `searchBackfill` and screams at the cap.
  **Admin item authoring (`items_create` / `items_update`)** — Arman's ruling is that client sites RENDER collection data (events, testimonials, FAQ entries, practitioner profiles) "curated by a human OR authored by an agent"; these are the human half, twinning aidream's `collection_item_service.create/update` (CONTRACT §CW2). They run the SAME canonical validator as the visitor path (`features/cms/collections/validateItem.ts`), so a `strict` collection refuses an admin-authored item for exactly the reasons it refuses a visitor's — 422 with field-level `validationErrors`; advisory warnings ride back on success. The route is the size authority (CW3): 65,536 bytes default, `settings.max_item_bytes` override, 524,288 ceiling, 200 keys after flatten. Quota is a QUARANTINE, never a rejection — at `settings.max_items` the row lands `status='archived'`.
  **These MUST NOT use the `submit_collection_item` RPC.** That is the visitor path: it carries the rate windows, quota quarantine and the `visitor_write_at` stamp the limiter counts (`visitor_write_at > now() - interval '1 hour'`). Admin writes are plain inserts, so an admin adding 30 events cannot burn the window and 429 the site's public contact form. Admin rows carry NO visitor provenance (no ip/user_agent/source_url), are never `is_spam`, and record `submitted_by`.
- `POST /api/html-pages` — standalone `html_pages` CRUD (see `features/html-pages/README.md`)

**Shared server helpers**
- `app/api/cms/_lib/cmsDb.ts` — `getCmsClient()`, `verifySiteOwnership`, `verifyPageOwnership`, `verifyComponentOwnership`, `verifyAssetOwnership`, `verifyCollectionOwnership`
- `app/api/cms/_lib/activityLog.ts` — `logCmsActivity()`, the C6 contract writer

**Redux slice(s)**
- None. This feature intentionally has no Redux slice — every route fetches directly via the service layer (small dataset, no cross-route shared state today). If a future addition needs shared state, extend an existing slice per repo doctrine before adding one.

---

## Agent surfaces (Surface Values)

Five `ui_surface` rows under `matrx-user/` give every CMS/HTML-page route a canonical v3 right-click
context menu with live agent context — see the `surface-authoring` and `surface-pro-rollout` skills
for the general contract this section instantiates.

| Surface | Route(s) | Menu | Notes |
|---|---|---|---|
| `matrx-user/cms` | `/cms` | `NonEditableContextMenu` (page + per-card) | List/entry hub — `owned_sites_summary`, no `site_structure` |
| `matrx-user/cms-site` | `/cms/[siteId]` | `NonEditableContextMenu` | Page-list workspace; first surface to emit `site_structure` |
| `matrx-user/cms-page` | `/cms/[siteId]/pages/[pageId]`, `.../pages/new` | `EditableContextMenu` + `ProTextarea` on HTML/CSS/JS tabs | **Primary editor** — `agentRoles`: `page_editor`, `seo_editor`, `publish_reviewer` |
| `matrx-user/cms-component` | `/cms/[siteId]/components` | `EditableContextMenu` + `ProTextarea` (HTML/CSS) + `NonEditableContextMenu` (cards) | Shared header/footer editor |
| `matrx-user/html-page` | `/cms/html-pages`, `/cms/html-pages/[pageId]` | `EditableContextMenu` (meta description `ProTextarea` + Monaco body) + `NonEditableContextMenu` (preview) | Standalone quick-publish — `html_pages_structure`, not `site_structure`; `agentRoles`: `html_page_editor` |

**The framing idea:** every website surface (`cms-site`/`cms-page`/`cms-component`) emits the *same*
compact `site_structure` XML — `features/cms/utils/buildSiteStructureXml.ts` (pure, size-capped at
12KB, collapses non-current pages under load). `matrx-user/html-page` emits the smaller, distinct
`html_pages_structure` (`features/html-pages/utils/buildHtmlPagesStructureXml.ts`) — a flat sibling
list, never the site tree; the two content systems never share a framing shape. `SiteLayoutClient`
(`app/(core)/cms/[siteId]/SiteLayoutClient.tsx`) caches `pages`/`components` per site so every child
route rebuilds the XML from the same in-memory list instead of refetching on every keystroke —
`refreshPages()`/`refreshComponents()` after any create/update/delete/publish/discard/rollback.

**Per-surface agent-context files** live under `features/cms/agent-context/` (`features/html-pages/agent-context/`
for the standalone system): `build<Surface>ContextData.ts` (pure `contextData` builder →
`create<Surface>Scope(...)`), `<surface>ContextMenuProps.ts` (`sourceFeature`/`surfaceName` identity),
`<surface>ExtraSections.ts` (real Save/Publish/Discard/Navigate handlers, never toast stubs). Each has
a matching `use<Surface>SurfaceScope` hook under `features/cms/hooks/` /
`features/html-pages/hooks/` returning `() => SurfaceScopePayload` so menus read live editor state at
click time, not a stale snapshot.

**Agent skill:** `skill.definition` row `cms-authoring` (migration `migrations/cms_surfaces_seed.sql`)
teaches CMS-bound agents the two-content-system model, draft/publish twins, `site_structure`/
`html_pages_structure`, URL rules, `agent_write_policy`, and the aidream CMS tool map. Opt-in via
`skill_config.included` on system agents — never auto-attached. Builder checklist for extending any
of the five surfaces: `features/cms/SKILL.md`.

---

## Admin map

- **Map config:** `app/(core)/cms/admin/page.tsx`
- **Live URL:** `/cms/admin`

---

## Data model

**Database:** Supabase project **`viyklljfdhtidwecakwx`** — a completely separate project from the
main AI Matrx DB (`txzxabzwovsujtloxrus`), separate Auth domain, separate RLS. Never point the
Supabase MCP at the wrong project for this feature.

**Tables**
- `client_sites` — one row per site. `settings` jsonb holds `agent_write_policy` (`blocked | draft_only | full`, F4) and `policy_overrides` — no dedicated columns.
- `client_pages` — draft/publish twin columns (`*_draft`), `has_draft`, `is_published`, category/slug routing fields.
- `client_components` — header/footer/etc., same draft-twin pattern.
- `history.row_versions` — the canonical append-only version log (aidream CMS migrations `0002` +
  `0005`). EVERY change to a versioned row is captured by its `_history` trigger with a full jsonb
  snapshot + an incrementing `version` (bumped by `_touch`). **SIX entities are versioned** —
  `client_sites`, `client_pages`, `client_components`, `client_assets`, `html_pages`,
  `site_collections`. The append-only tables (`client_activity_log`, `form_submissions`,
  `site_collection_items`) are NOT, mirroring the main DB.
  Don't trust this list — ask the DB: `select * from platform.versioning_audit()`. Not reachable
  over PostgREST directly — see the version RPCs below. Legacy `client_page_versions` was retired
  (migration `0004`) and archived as `graveyard.client_page_versions`.
- `client_assets` — the asset library (W2-B, shipped 2026-07-15). `file_path` = durable public CDN URL, `file_id` = main-project `cld_files` id (migration `cms/0013`). Service: `CmsAssetService` (`features/cms/services/cmsService.ts`) → `/api/cms/assets`; UI: `AssetsPanel` tab on `/administration/knowledge/cms-agents`. aidream owns the agent path (`cms_asset` tool + `services/cms_assets/`).
- `client_activity_log` — the C6 contract. Every mutation writes one row; `changes` jsonb always carries `actor: "agent"|"human"|"system"` + optional `metadata` (e.g. `capture_media_refs[]` from P4's verification loop).
- `html_pages` — standalone quick-publish pages, no site/draft concept.
- `site_collections` / `site_collection_items` — W2-C per-site data collections (CMS migration
  `0015`; design: `aidream/docs/cms_agent_authoring/W2C-design.md`). The definition is a versioned
  content entity (token `site_collection`); items are append-heavy visitor/agent rows (soft-delete
  via `deleted_at`, triage via `is_spam`/`seen_at`/`status`, conditional tsvector when `searchable`).
  `field_schema` is validator DATA, never DDL. `client_sites.data_api_key` (dedicated column, NOT in
  the settings jsonb) is the public write key — ships in page HTML, not a secret; rotation is the
  kill-switch. Turnstile/CAPTCHA was CUT from v1 — no UI, no settings seam.
- `client_content_exceptions` — **does not exist yet.** P1 owns creating it (schema shape: P3's `matrx_content_guard.models.ContentException` + `Violation`, `packages/matrx-content-guard/matrx_content_guard/models.py`). `/api/cms/approvals` and `ApprovalsQueuePanel` are built against that shape and self-report `available: false` until the table lands.

**Version RPCs (aidream CMS migrations `0003` + `0006`).** `history` and `platform` are not exposed
to PostgREST, so the routes reach the version system through a `public` façade that mirrors the main
DB's names: `version_list(p_token, p_id, …)`, `version_get(p_token, p_version_id)`,
`version_snapshot(p_token, p_id, p_version)`, `version_restore(p_token, p_id, p_version)`. `p_token`
is a `platform.entity_types` token — one of the five versioned entities, not just `'client_page'`.

They are SECURITY DEFINER with **EXECUTE locked to `service_role`** and carry **no in-DB access
gate** (this project has no `iam`): the route MUST verify ownership before returning or restoring
anything. `app/api/cms/versions/route.ts` holds that boundary as an explicit `OWNERSHIP` map from
entity token → check (site → `owner_user_id`; page/component/asset → site → owner; `html_page` → its
direct `user_id`). **An entity absent from that map is unreachable, by construction** — a `400`, not
a leak.

`version_restore` restores content columns only and is itself a versioned change — history is
appended to, never rewritten. Each entity declares the identity/ownership columns a restore must
never touch (`platform.entity_types.restore_exclude_columns`), so a rollback can never rewrite
`client_sites.owner_user_id` or `html_pages.user_id`.

**FK cascade (verified live 2026-07-10):** `client_pages`, `client_components`, `client_assets`,
`client_activity_log` → `client_sites` are all `ON DELETE CASCADE`. Site delete is a single
`DELETE FROM client_sites` — no manual fan-out needed. `history.row_versions` has no FK and does not
cascade: the log outlives the rows it describes.

**Key types** (`features/cms/types.ts`) — `ClientSite`, `ClientSiteSettings`, `AgentWritePolicy`,
`ClientPage`, `ClientPageSummary`, `ClientEntityVersion`, `ClientEntityVersionDetail`,
`CmsEntityType`, `VersionOperation`, `PageVersionContent`, `ClientComponent`, `ClientActivityLog`,
`ClientActivityChanges`, `ContentException`, `SiteCollection`, `SiteCollectionSummary`,
`SiteCollectionItem`, `CollectionFieldDef`, `CollectionFieldType`, `SiteCollectionSettings`,
`CollectionItemFilter`. No generated types exist for this project (it's not
`txzxabzwovsujtloxrus`) — these are hand-maintained; keep them in sync with live schema by hand.

**C4 URL builder:** `features/cms/utils/pageUrls.ts` — TS twin of my-matrx's routing rules, derived
directly from `my-matrx/pages/c/[client]/[[...slug]].js` (P1's committed `url-rules.json` fixture,
the intended drift guard, had not landed as of 2026-07-09 — re-derive against it once it exists).

---

## Key flows

### 1. Human edits a page (owner-scoped)
`app/(core)/cms/[siteId]/pages/[pageId]/page.tsx` → `CmsPageService.saveDraft/updatePage` →
`POST /api/cms/pages {action: "save-draft"|"update"}` → ownership check
(`verifyPageOwnership`) → DB write → `logCmsActivity(actor: "human")`. Publish goes through the
`publish_page_draft` RPC the same way; discard likewise. Rollback goes through `version_restore`.

### 1b. Human reads / restores a version
`PageEditor` "History" tab → `useCmsVersions` → `CmsVersionService.listVersions(rowId, entityType)` →
`POST /api/cms/versions {action:"list"}` → ownership check → `version_list` RPC. `entityType`
defaults to `client_page`, and `list` still accepts the legacy `pageId` param. Every change shows
(`operation`: INSERT/UPDATE/DELETE), the live one carries `is_current` and its Restore button is
disabled. Restore → `POST /api/cms/pages {action:"rollback"}` → `version_restore`, then the list is
refetched because the restore added a version.

`get` returns the raw row snapshot as `data` — deliberately not flattened, since the columns differ
per entity; `features/cms/utils/pageVersionContent.ts` is the typed reader for `client_page`.
**This is the same log, in the same shape, that aidream's `version_service` and the `versions` tool
action return** — matched field for field (`services/cms/dtos.py::VersionSummary`/`VersionRead`).
Change one, change both.

### 2. Arman watches agent activity (visibility surface)
`/administration/knowledge/cms-agents` → `CmsAgentsAdminClient` fetches `admin_list_sites` once, then each
tab polls independently: `ActivityFeedPanel` polls `admin_list_activity` every 8s (filterable by
site/entity/actor, agent rows visually distinct via `changes.actor`); `SitePageTreePanel` reads
`admin_list` pages + activity metadata for capture links; both require `requireSuperAdmin` server-side
on every request, independent of the `(admin)` layout gate.

### 3. Site delete (guarded, cascading)
Settings page → `TextInputDialog` requires typing the exact slug → `CmsSiteService.deleteSite(id,
force=false)` → route counts `client_pages`; if non-empty and not forced, 409s with `pageCount` →
UI catches `SiteNotEmptyError`, re-prompts via `ConfirmDialog` with `force=true` → single cascading
`DELETE FROM client_sites`. `logCmsActivity` fires with `siteId: null` (the row must outlive the
site it describes).

### 4. Agent-write-policy change (F4)
`PolicyEditorPanel` → `CmsSiteService.adminUpdatePolicy(siteId, {agentWritePolicy})` →
`admin_update_policy` merges into `client_sites.settings` (never overwrites the whole jsonb blob) →
logged. **This route only edits the setting — enforcement is P1's service-layer hook
(`can_access`/policy check), not this UI.**

---

## Invariants & gotchas

- **The collection-item validator is a TWIN — never edit its rules alone.** Three implementations of
  the CW3 semantics exist and must agree byte-for-byte: aidream
  `services/cms/collection_validation.py` (CANONICAL), my-matrx `lib/collections/validateItem.js`
  (visitor path), and `features/cms/collections/validateItem.ts` (admin path). They are pinned ONLY
  by the shared fixture `collection-validation-rules.json`, copied verbatim from aidream into each
  repo. Changing a rule means changing all three, changing the fixture, and running every suite.
  `pnpm check:collection-validator` runs the whole fixture here (plus the byte counters), treats an
  unreadable fixture as a FAILURE (an unpinned twin is the dangerous state, not a pass), and
  checksums the local copy against a co-located aidream checkout so a stale copy screams. It has
  already caught one real upstream drift.
- **Admin item writes never go through `submit_collection_item`.** That RPC is the visitor path and
  stamps `visitor_write_at`, which is exactly what the hourly rate limiter counts. Routing admin
  authoring through it would let an admin adding 30 events 429 the site's own public forms. Admin
  rows are plain inserts with no visitor provenance and `is_spam=false`.
- **Never call the Python backend for CMS data.** This whole feature is the documented exception to
  the repo's "client → Supabase direct" doctrine: the CMS project has a separate Auth domain and the
  secret key must never reach the browser, so the `/api/cms/*` routes ARE the canonical path — do
  not "fix" this by adding a direct browser Supabase client (that's exactly the dead architecture
  `features/html-pages/lib/supabase-html.ts` implemented; removed 2026-07-09, zero callers).
- **No first-claim.** `sites` `list` used to silently assign any unowned site to whoever listed
  first — removed 2026-07-09 (master plan F2: "tools never first-claim"). An unowned site now just
  doesn't appear in anyone's list; the route logs loudly (`console.warn`) if it ever finds one,
  rather than mutating on a read.
- **`admin_*` actions bypass ownership, not auth.** They still require a valid session AND
  `requireSuperAdmin()` — never reachable by a normal owner, even for their own sites.
- **Activity log `actor` lives inside `changes` jsonb**, not a column — filter/read via
  `row.changes?.actor`, never add an `actor` column.
- **`client_content_exceptions` does not exist.** `/api/cms/approvals` will 42P01 gracefully
  (`available: false`) until P1 creates it — this is expected, not a bug, until Convergence A.
- **Polling, not Realtime, for the activity feed** — deliberate (browser has no Supabase client for
  this project; Realtime needs one). Do not "upgrade" this to Postgres Changes without first solving
  the anon-key/RLS story for this project.

---

## Related features

- Cross-links: `common-docs/systems/cms-system/FEATURE.md` (system-of-record, cross-repo), `features/html-pages/README.md` (the sibling quick-publish system, same DB), `aidream/docs/cms_agent_authoring/README.md` (the 5-project agent-authoring build this feature's P5 half belongs to), `aidream/packages/matrx-content-guard/matrx_content_guard/models.py` (F3 exception shape this feature's approvals queue is built against), `features/surfaces/FEATURE.md` (Surface Values contract the five CMS surfaces implement), `features/context-menu-v3/FEATURE.md` (canonical v3 menu every CMS route mounts), `features/cms/SKILL.md` (builder checklist for the surfaces + skill)

---

## Doctrine compliance

**Primitives reused** — `ConfirmDialog`, `TextInputDialog` (destructive/typed confirms, no
`window.confirm`), `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableCell`, `Tabs`, `Select`,
`Badge`, `Button` (design system), `requireSuperAdmin`/`checkIsSuperAdmin` (admin gate — no new
gate primitive), `toast` from `sonner`, `date-fns` `formatDistanceToNow`, the `(admin)` route
group's server-side super-admin layout gate.

**Primitives introduced**
- `app/api/cms/_lib/cmsDb.ts` / `activityLog.ts` (`getCmsClient`, ownership checks, `logCmsActivity`) — Why: was previously copy-pasted verbatim across 4 route files; extracted so every new `/api/cms/*` route (and the new admin/approvals routes) shares one client factory and one C6-shape writer instead of re-forking both. Considered extending: nothing existed to extend — this is the extraction itself.
- `features/cms/utils/pageUrls.ts` (C4) — Why: no TS implementation of my-matrx's routing rules existed anywhere in this repo; the visibility surface needs it to link out to live/preview URLs. Considered extending: none — genuinely new, and explicitly named as a day-1 contract (C4) in the master plan.

If this list grows past two on a future change, re-read `PRINCIPLES.md` before merging.

---

## Current work / migration state

Built 2026-07-09 as project P5 of the CMS Agent Authoring Layer (`aidream/docs/cms_agent_authoring/README.md`).
Convergence A/B (an agent authoring + verifying content through this same DB) depends on P1–P4,
which were building in parallel — the approvals queue and the `agent_write_policy` enforcement are
UI-complete here but only take effect once P1's service layer reads them.

---

## Change log

- `2026-07-27` — **`cms-page` / `cms-component` / `html-page` surfaces driven from `stub` to
  `verified`.** Full completeness audit of the three manifests against the live routes: curated
  value groups, `intro` blocks, honest `alwaysAvailable`, real `typicalCharCount`, and empty-case
  descriptions everywhere (counts are surface-specific values, excluding baselines). cms-page 21 → 43 (SEO keywords/OG/canonical, the Settings-tab
  fields, page layout/timestamps/provenance, site name/domain/global CSS/profile, version history +
  latest restorable version, `page_seo`/`page_settings` composites); cms-component 10 → 20 (site
  framing, component record, components list, create-dialog draft); html-page 9 → 19 (full
  `html_content`, active tab, dirty flag, provenance/context-metadata, prev/next nav, `page_seo`
  composite). Every new value is emitted — `buildCmsPageContextData` / `buildCmsComponentContextData`
  / `buildHtmlPageContextData` + `buildHtmlPagesListContextData` and their hooks and call sites
  (`PageEditor`, `/cms/[siteId]/components`, `HtmlPageEditor`) were extended in the same change.
  Big bodies (`html_content` on html-page, site global CSS, composites, history) are
  `autoContext: false` — declared and bindable, not auto-shipped. DB sync (`ui_surface_value` rows)
  still pending.

- `2026-07-24` — **Collections admin: item authoring + an adversarial-findings pass.** Added
  `items_create` / `items_update` (twinning aidream `collection_item_service`, CONTRACT §CW2) and a
  schema-driven `CollectionItemEditorDialog`, closing the vision gap where an admin could triage but
  could not add an event or fix a typo in a testimonial without asking an agent. Ported the
  canonical CW3 validator as `features/cms/collections/validateItem.ts` with the
  `pnpm check:collection-validator` drift guard (149/149 fixture cases). Also fixed 12 verified
  adversarial findings on this surface: the `searchable` false→true backfill (existing rows were
  silently unfindable), the unread badge disagreeing with the Unread tab, an unbounded `items_export`
  that exceeded Vercel's response limit, an unbounded search-scan, the richtext block that disabled
  the very toggle it told you to turn off, CSV formula injection from visitor-submitted values,
  unvalidated name/description, `select` fields accepted with zero options, a false 403 on duplicate
  item ids, a 500 on malformed JSON bodies, prototype-shadowing item data, and click-only rows with
  no keyboard path. Verified live on `dev-website` (throwaway collections, cleaned up): strict
  rejects with field-level errors while advisory warns, an admin burst of 10 creates left
  `visitor_write_at` NULL on every row (zero visitor-window burn) with no spam flag and no fake
  provenance, and the authored rows render through the anonymous public GET with only the declared
  `public_read_fields`.

- `2026-07-23` — **W2-C Collections admin surface shipped.** New `/api/cms/collections` route (see
  API list), `CmsCollectionService`, `verifyCollectionOwnership`, `site_collection` added to the
  versions-route `OWNERSHIP` map (six versioned entities now), `collection`/`collection_item` added
  to the C6 `entityType` union + the Activity Feed filter. UI: 4th **Collections** mode on
  `SiteLayoutClient` → `/cms/[siteId]/collections` (list + `CollectionEditorDialog` field-schema
  builder + Site Data Key card) and `/cms/[siteId]/collections/[collectionId]` (items viewer:
  schema-driven columns, unread/spam/archived triage, CSV export). `ClientSite` gained
  `data_api_key`.

- `2026-07-17` — **Header dedup: `SiteLayoutClient` now consumes `EntityModeHeader`** (the templated
  agents-pattern header) instead of a hand-rolled `RouteHeader` + `CmsSiteSwitcher` composition.
  Site-switch dropdown, mode nav, and actions are behavior-identical (switch keeps sub-view suffix);
  mobile collapses to back + name + one `…` bottom drawer for free. Deleted `CmsSiteSwitcher.tsx`
  (no other importers). Fixed a template bug found along the way: `EntityModeHeader`'s mobile drawer
  routed every action through `router.push`, which silently mis-navigates on `http(s)/mailto/tel`
  hrefs (e.g. "Open live site") — now `window.open`s external hrefs. Browser-verified desktop +
  mobile (Pages/Components/Settings nav, dropdown, drawer, live-site link).
- `2026-07-15` — **W2-B asset library shipped.** New `/api/cms/assets` route (see API list) +
  `CmsAssetService` + `AssetsPanel` tab on `/administration/knowledge/cms-agents` (upload via
  `fileHandler.upload({preset:'web', visibility:'public'})` → durable CDN URL, grid, alt-text edit,
  copy-URL, delete-with-usage-guard dialog that lists exactly which pages break). C6 `entityType`
  union (`activityLog.ts`) + the Activity Feed filter gained `asset`; the feed's Media column renders
  asset thumbnails via `InlineMediaRef` for free. `ClientAsset` gained `file_id`; added `AssetUsage`
  types. Twin of aidream's `services/cms_assets/` + `cms_asset` tool. Browser-verified end-to-end
  (upload, delete-guard listing the referencing page, activity rows with thumbnails).
- `2026-07-15` — **W2-A "Promote to site" bridge shipped.** New `promote` action on `/api/cms/pages`
  (see API list above) + `CmsPageService.promoteFromHtmlPage` + `PromoteToSiteDialog`
  (`features/html-pages/components/`), launched from the html-pages list row menu ("Promote to
  site…") and the editor toolbar (`UploadTapButton`). `ClientPage` gained the four `source_*`
  provenance fields; success view links the CMS page editor + the public `?preview=true` URL.
  Browser-verified end-to-end. Twin of aidream's `promote_service`. NOTE: like every other FE CMS
  write, `promote` does NOT run P3 content validation (aidream-only enforcement).

- `2026-07-13` — **Whole CMS route family on the gold-standard header** (round 2 of the `core-route-headers` reference fix). Hub level: `CmsHubHeader` (`features/cms/components/CmsHubHeader.tsx`) injects `RouteHeader` + `RouteModeNav` **Sites | Pages** on both `/cms` and `/cms/html-pages` — no title text, New Site / New Page are right-slot tap targets. Site level: `SiteLayoutClient` now injects the layout-level header — back chevron + `CmsSiteSwitcher` (agents-style entity dropdown, keeps sub-view on switch) + **Pages | Components | Settings** center nav + open-live/new-page tap targets; deleted the bordered in-body breadcrumb bar, the dashboard's stacked sub-header (Settings/Components/"+ New Page" buttons), and the settings/components in-body `<h2>` title rows; all `h-[calc(100dvh-…)]` → `h-full` + `pt-[var(--shell-header-h)]`. Also fixed `RouteModeNav` (w-full measurement trap: compact first paint locked it in "menu" forever).
- `2026-07-10` — CMS Surfaces Rollout gap-closing: (1) `/cms/html-pages` LIST route now mounts the
  `matrx-user/html-page` v3 menu — outer chrome (`NonEditableContextMenu` in `page.tsx`) plus per-row
  (table) and per-card (grid) menus via the new reusable `HtmlPagesContextMenu`; both emit
  `html_pages_structure` (new `buildHtmlPagesListContextData.ts`) with list-appropriate actions (New /
  Open / Copy URL / Open Live / Back to hub — new `htmlPagesListExtraSections.ts`). Table rows pass
  `enableFloatingIcon={false}` (a hidden `<span>` sibling is invalid inside `<tbody>`). (2) `PageEditor`
  Preview tab now mounts a dedicated `NonEditableContextMenu` (read-only) while every other tab stays on
  `EditableContextMenu`, same surface identity + `extraSections` + live `contextData`. (3) `cms-page`
  menu gained a "Restore Previous Version" item (`cmsPageExtraSections.ts`) that drives the existing
  rollback `ConfirmDialog` → `onRollback` for the latest non-current version. (4) SEO tab text fields
  are now Pro (`ProInput` for title/keywords, `ProTextarea` for the meta description with
  `surfaceName` + `getApplicationScope`); `buildCmsPageContextData` now binds `content`/`selection` to
  the meta description when `activeTab === "seo"`. (5) Noted in `surface-candidates.ts` that the five
  CMS surfaces are live via seed and intentionally not candidates. No re-seed, no new docs.

- `2026-07-09` — P5 agent: component-delete bug fixed (route was missing the `delete` case — live
  400); site delete shipped (guarded, cascading, throwaway-site tested); `client_activity_log`
  writes added to every mutation (`actor: "human"`, C6 shape); first-claim side effect removed
  (F2); dead `features/html-pages/lib/supabase-html.ts` removed + README rewritten; agent
  visibility surface shipped at `/administration/knowledge/cms-agents` (activity feed, page tree,
  agent-write-policy editor, approvals queue); C4 URL builder (`pageUrls.ts`) added; this
  FEATURE.md created (feature predated the doctrine).

- `2026-07-10` — CMS Surfaces Rollout: five `ui_surface` rows (`matrx-user/cms`, `cms-site`,
  `cms-page`, `cms-component`, `html-page`) authored, seeded live (`migrations/cms_surfaces_seed.sql`,
  applied + ledgered), and pro-rolled-out with canonical v3 context menus (`EditableContextMenu`/
  `NonEditableContextMenu`) + `ProTextarea` on every HTML/CSS/JS/meta-description editor. New
  `buildSiteStructureXml`/`buildHtmlPagesStructureXml` framing utils give every website surface the
  same size-capped "big picture" XML regardless of where the user is. `SiteLayoutClient` now caches
  `pages`/`components` per site (`useSiteContext()`) so the framing XML never drifts from what a
  sibling route just saved. `skill.definition` row `cms-authoring` + `features/cms/SKILL.md` teach
  bound agents the model. `pnpm check:surface-drift` and `pnpm type-check` clean.

- `2026-07-10` — Verification pass on the CMS Surfaces Rollout: right-clicked every mounted region
  across all five surfaces live (`/cms`, `/cms/[siteId]`, page editor HTML/CSS/JS/SEO tabs, component
  editor, `/cms/html-pages` list + editor) confirming the v3 menu, surface footer, and `site_structure`/
  `html_pages_structure` appear with no `VALUE MAPPING GAP` diagnostics. Found and fixed a real bug in
  `matrx-user/html-page`: `content`/`selection`/`text_before`/`text_after` were always bound to the
  full HTML buffer regardless of active tab, so the Metadata tab's menu leaked the entire HTML document
  into `content` instead of the meta description — fixed by gating on `activeTab`
  (`buildHtmlPageContextData.ts`, `useHtmlPageSurfaceScope.ts`), mirroring `cms-page`'s existing
  `activeTabContent` pattern. Documented (not fixed — shared-component blast radius) that Monaco's
  native context menu wins over the v3 menu when right-clicking directly on HTML-tab code lines; see
  `features/html-pages/README.md` → "Agent surface". `pnpm check:surface-drift` (33 surfaces, 576
  values) and `pnpm type-check` both clean on every touched file.

- `2026-07-10` — Version system cut over to the canonical `history.row_versions` log. `/api/cms/versions`
  `list`/`get` now call the `version_list` / `version_get` RPCs; `/api/cms/pages` `rollback` calls
  `version_restore` (audit-preserving) instead of the retired `rollback_to_version`. `ClientPageVersion`
  rewritten to mirror aidream's `VersionSummary` 1:1 (+ new `ClientPageVersionDetail`); phantom
  `change_summary` / `version_label` fields deleted (never populated by anything). History tab now shows
  every change with a "Current" badge. Legacy `client_page_versions` + `page_version_on_publish` +
  `create_page_version()` + `rollback_to_version()` retired in aidream CMS migration `0004`
  (table archived to `graveyard.client_page_versions`; `last_published_at` write moved into
  `publish_page_draft`). Verified live end-to-end on `dev-website`. Closes the
  `cms-versioning-fe-cutover` handoff.

- `2026-07-10` — Versioning extended from pages to EVERY CMS content entity (aidream CMS migrations
  `0005` + `0006`): `client_sites`, `client_components`, `client_assets` and `html_pages` now carry a
  `version` column and the canonical `_touch` + `_history` triggers. The public façade went generic
  (`page_id` → `row_id`, `published_by` → `actor_id`, new `entity_type`), so `ClientPageVersion` →
  `ClientEntityVersion` / `ClientEntityVersionDetail` (raw `data` snapshot + `pageVersionContent()`
  reader). `/api/cms/versions` takes an `entityType` token and enforces a per-entity `OWNERSHIP` map
  (new `verifyAssetOwnership` / `verifyHtmlPageOwnership` in `_lib/cmsDb.ts`); an unknown token is a
  400. Verified live end-to-end: site/page/component/html_page history reads, a raw-snapshot `get`,
  and 403 on every entity for rows the caller does not own. Also graveyarded the orphan CMS
  `dashboard_saved_views` (0 rows; the real one is on the main project).

- `2026-07-14` — Convergence punch item 4 (MediaRef link-outs): verification screenshots
  (`changes.metadata.capture_media_refs`) moved from a non-clickable count span on the Sites & Pages
  tree to the Activity Feed where they belong — a new Media column renders each ref as a clickable
  thumbnail (`InlineMediaRef`, canonical file handler) that opens the standard file-preview
  WindowPanel (`openFilePreview`). `SitePageTreePanel` no longer fetches activity at all. Also:
  `LogCmsActivityParams.entityType` + the feed filter gained `html_page`, completing the normalized
  C6 vocabulary (site|page|component|version|exception|html_page — see aidream
  `services/cms/CONTRACT.md`; historical `client_page` rows backfilled by CMS migration `0007`).
  Verified live in the browser as admin: 24 thumbnails on the feed, click opens preview; approvals
  queue approve flow also verified end-to-end against the new `client_content_exceptions` store
  (aidream CMS migration `0011`).
