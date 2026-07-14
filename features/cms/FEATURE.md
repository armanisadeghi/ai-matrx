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
`common-docs/cms-system/FEATURE.md` for the full cross-repo picture (aidream's agent tool layer,
my-matrx's public renderer) and `aidream/docs/cms_agent_authoring/README.md` for the multi-agent
build plan this feature is part of (project P5).

---

## Entry points

**Routes**
- `app/(core)/cms/page.tsx` — site list (owner-scoped)
- `app/(core)/cms/[siteId]/page.tsx` — page list for a site
- `app/(core)/cms/[siteId]/settings/page.tsx` — site settings + delete (danger zone)
- `app/(core)/cms/[siteId]/components/page.tsx` — header/footer/etc. component CRUD
- `app/(core)/cms/[siteId]/pages/[pageId]/page.tsx`, `.../pages/new/page.tsx` — page editor
- `app/(core)/cms/html-pages/**` — standalone `html_pages` management (see `features/html-pages/FEATURE.md`... not yet split out; documented in `features/html-pages/README.md`)
- `app/(admin)/administration/cms-agents/page.tsx` — **agent visibility surface** (super-admin gated by the `(admin)` layout): live activity feed, per-site page tree, agent-write-policy editor, validation-exception approvals queue

**Services**
- `features/cms/services/cmsService.ts` — `CmsSiteService` / `CmsPageService` / `CmsVersionService` / `CmsComponentService` / `CmsApprovalsService`, all POST `{action}` dispatch against `/api/cms/*`

**Hooks**
- `features/cms/hooks/useCmsSites.ts`, `useCmsPages.ts`, `useCmsVersions.ts` — owner-scoped CRUD hooks
- `features/cms/hooks/useCmsAdminActivity.ts` — polls the admin activity feed (8s interval)

**API endpoints** (all single-POST `{action, ...}` dispatch, secret key `SUPABASE_HTML_SECRET_KEY` bypasses RLS — ownership enforced in app code)
- `POST /api/cms/sites` — `list/get/create/update/delete` (owner-scoped) + `admin_list_sites/admin_update_policy/admin_list_activity` (requireSuperAdmin)
- `POST /api/cms/pages` — `list/get/create/update/save-draft/publish/discard-draft/rollback/delete` (owner-scoped) + `admin_list` (requireSuperAdmin)
- `POST /api/cms/components` — `list/get/create/update/delete` (owner-scoped)
- `POST /api/cms/versions` — `list/get` (read-only, owner-scoped)
- `POST /api/cms/approvals` — `list/approve/reject` (requireSuperAdmin) — F3 exception queue, degrades gracefully until P1's store table exists
- `POST /api/html-pages` — standalone `html_pages` CRUD (see `features/html-pages/README.md`)

**Shared server helpers**
- `app/api/cms/_lib/cmsDb.ts` — `getCmsClient()`, `verifySiteOwnership`, `verifyPageOwnership`, `verifyComponentOwnership`
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
  snapshot + an incrementing `version` (bumped by `_touch`). **FIVE entities are versioned** —
  `client_sites`, `client_pages`, `client_components`, `client_assets`, `html_pages`. The
  append-only tables (`client_activity_log`, `form_submissions`) are NOT, mirroring the main DB.
  Don't trust this list — ask the DB: `select * from platform.versioning_audit()`. Not reachable
  over PostgREST directly — see the version RPCs below. Legacy `client_page_versions` was retired
  (migration `0004`) and archived as `graveyard.client_page_versions`.
- `client_assets` — schema only, no service (Wave 2, out of scope here).
- `client_activity_log` — the C6 contract. Every mutation writes one row; `changes` jsonb always carries `actor: "agent"|"human"|"system"` + optional `metadata` (e.g. `capture_media_refs[]` from P4's verification loop).
- `html_pages` — standalone quick-publish pages, no site/draft concept.
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
`ClientActivityChanges`, `ContentException`. No generated types exist for this project (it's not
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
`/administration/cms-agents` → `CmsAgentsAdminClient` fetches `admin_list_sites` once, then each
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

- Cross-links: `common-docs/cms-system/FEATURE.md` (system-of-record, cross-repo), `features/html-pages/README.md` (the sibling quick-publish system, same DB), `aidream/docs/cms_agent_authoring/README.md` (the 5-project agent-authoring build this feature's P5 half belongs to), `aidream/packages/matrx-content-guard/matrx_content_guard/models.py` (F3 exception shape this feature's approvals queue is built against), `features/surfaces/FEATURE.md` (Surface Values contract the five CMS surfaces implement), `features/context-menu-v3/FEATURE.md` (canonical v3 menu every CMS route mounts), `features/cms/SKILL.md` (builder checklist for the surfaces + skill)

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
  visibility surface shipped at `/administration/cms-agents` (activity feed, page tree,
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
