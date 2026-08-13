---
status: active
updated: 2026-08-12
repos: [matrx-frontend, aidream, my-matrx]
---

# Website Factory — bug dispatch board

Defects found during the 2026-07-30 content-plan / CMS readiness audit. Each entry is a
self-contained assignment: paste the whole block to an agent and it has everything it needs.
Update **Status** in place (`UNASSIGNED · ASSIGNED(<who>) · IN PROGRESS · DONE · WON'T FIX`).
Vision-level gaps (templates, content record, pipeline steps) are NOT here — they live in
[website-factory-vision.md](./website-factory-vision.md).

---

## WF-1 — Renderer ignores `theme_config`; theme edits change nothing

**Status:** DONE (was already wired in my-matrx c866e98; 2026-08-07 closed the residue: starter kit no longer bakes tokens into global_css — theme_config is live single source, 4 baked sites migrated + prod-verified) · **Repo:** my-matrx · **Severity:** HIGH

The my-matrx public renderer has `lib/render/themeCss.js` (twin of aidream
`aidream/services/cms/theme_css.py`) but nothing imports it — pages are styled only by
`client_sites.global_css`. Themes only work today because `starter_kit` bakes the `:root{}`
token block into `global_css` at setup; any later edit to `client_sites.theme_config` (by agent
or human) has zero visible effect. Already filed in aidream `FOUND_DEFECTS.md` (2026-07-27).
**Fix:** import and apply `themeConfigToCss` in `my-matrx/lib/render/clientSiteRenderer.js`
(emit after `global_css` so tokens win), verify against a live site, then remove or keep the
starter-kit baking deliberately (document which). Close the aidream FOUND_DEFECTS entry.

## WF-2 — Plan statuses don't reflect CMS reality (812 "planned", 1 "published" vs 42 published pages)

**Status:** DONE (2026-08-07 — page_service.publish advances the linked node from EVERY path, forward-only; live check found 0 stale nodes to backfill) · **Repo:** aidream + matrx-frontend · **Severity:** HIGH

The only producer of `plan.node` status `published` is `cms_align` (manual). Live data: 28
CMS pages carry `plan_node_id` and 42 are published, but exactly 1 plan node reads `published`.
The plan is blind to what shipped. **Fix:** make the CMS publish path (`aidream/services/cms/pages.py`
publish + `publish_many`, and the bridge `cms_publish`) write plan status forward automatically
when `plan_node_id` is set (respecting the forward-only rule in
`aidream/services/content_plan/cms_reconciler.py` rule 6), and backfill the 27 stale nodes.

## WF-3 — Frontend CMS writes bypass content validation

**Status:** UNASSIGNED · **Repo:** matrx-frontend · **Severity:** HIGH

`packages/matrx-content-guard` (validates, blocks bad/dangerous content) runs only on the
aidream write path. Every `/app/api/cms/*` route and the `promote` flow in matrx-frontend write
HTML/CSS/JS to the CMS DB with no validation — an asymmetric quality/safety gate. **Fix:**
decide the enforcement point (recommended: a validation RPC or endpoint on aidream that the FE
API routes call before write; do NOT re-implement the guard in TS — one canonical validator),
wire it into `app/api/cms/_lib/` so all page/component writes pass through, with a loud
structured error on rejection.

## WF-4 — Duplicate header/footer components make the render nondeterministic

**Status:** DONE (shipped 2026-08-07 as CMS migration `0035` — partial unique index
`client_components_one_active_shell` verified live 2026-08-12 + actionable service error;
this board entry was stale) · **Repo:** aidream (+ CMS DB) · **Severity:** MEDIUM

## WF-5 — `use_client_header` / `use_client_footer` exposed nowhere in the UI

**Status:** DONE (2026-08-07 — PageEditor Settings toggles) · **Repo:** matrx-frontend · **Severity:** MEDIUM

Per-page opt-out of the shared header/footer exists as columns (default true) and in the API
(`app/api/cms/pages/route.ts:199-200`) but no UI reads or writes it — humans can't see or change
what agents can. **Fix:** add both toggles to the PageEditor Settings tab
(`features/cms/components/PageEditor.tsx`), persisted through the existing page update action.

## WF-6 — Site settings page: theme, navigation, footer are read-only JSON

**Status:** DONE (2026-08-07 — SiteAdvancedSettings editors) · **Repo:** matrx-frontend · **Severity:** MEDIUM

`/cms/[siteId]/settings` (`app/(core)/cms/[siteId]/settings/page.tsx:236-256`) shows
`theme_config`, `navigation`, `footer_config` as a read-only preview labeled "editable here in a
future update." Agents can write these; humans can't. **Fix:** real editors — theme token form
(colors/fonts → the documented `--color-*` naming in `aidream/services/cms/theme_css.py`), nav
list editor (labels, order, external links), footer config editor. Depends on WF-1 for theme
edits to actually render.

## WF-7 — Starter kit has zero UI exposure

**Status:** DONE (2026-08-07 — POST /content-plan/cms-sites/{id}/starter-kit + Install button with dry-run preview and force confirm on /cms settings) · **Repo:** matrx-frontend · **Severity:** MEDIUM

`cms_site starter_kit` (seeds theme CSS + header with nav token + footer + navigation;
`aidream/services/cms/starter_kit.py`) is agent-tool-only. A human creating a site at `/cms`
gets a bare site with no shell. **Fix:** "Install starter kit" action after site creation and on
`/cms/[siteId]/settings` — call through an aidream endpoint or an `/app/api/cms` action that
delegates to the service (don't reimplement seeding in TS); respect the non-empty-site `force`
guard with a confirm dialog.

## WF-8 — CMS fill durable queue has never run and has no chaos test

**Status:** DONE (2026-08-08 — the queue had never run because it COULD not: cms_fill.py imported
a nonexistent starter_kit constant and boot-resumed jobs had no AppContext for LLM calls; both
fixed + deployed aidream v0.1.717, root-cause detail in `content_plan/FEATURE.md` Change Log.
Chaos test added: `aidream/services/cms/tests/test_cms_fill_chaos_live.py` — real SIGKILL
mid-fill, boot-resume, zero dropped/duplicated; passed live twice. Real fill run end-to-end from
the Setup rung 4 on cosmeticinjectables. Minor UX residue: rung 4 buttons enable even with zero
fillable drafts — server refusal is loud and names the fix) · **Repo:** aidream · **Severity:** MEDIUM

## WF-9 — Doc drift: FE CMS FEATURE.md denies `client_content_exceptions` exists

**Status:** DONE (2026-08-07 — FEATURE.md corrected) · **Repo:** matrx-frontend · **Severity:** LOW

`features/cms/FEATURE.md` (~line 147) claims the exceptions table doesn't exist; it shipped in
CMS migration 0011 and the approvals queue UI reads it
(`features/cms/components/admin/CmsAgentsAdminClient.tsx`). **Fix:** correct the doc (invoke the
`context-docs` skill; full-document review while in there) and sweep the same file for other
stale claims against live code.

## WF-10 — Site→vertical binding is a buried settings convention

**Status:** UNASSIGNED · **Repo:** aidream + matrx-frontend · **Severity:** LOW

The content-plan vertical lives at `web.site.settings.content_plan.vertical` (jsonb convention),
so `plan.profile` (attribute schemas, cadences driving the signals sweep) binds ambiguously for
multi-profile orgs and the FE needs a manual picker. **Fix:** promote to a real column/FK on
`web.site` (main project, via Supabase MCP + `pnpm db-types` + aidream `db/generate.py`), migrate
existing settings values, update `aidream/services/content_plan/` readers and the FE setup view.

## WF-11 — Plan UI never shows the CMS page a node became

**Status:** DONE (2026-08-07 — cms-pages read + tree/table badges + NodePanel card) · **Repo:** matrx-frontend · **Severity:** MEDIUM

`client_pages.plan_node_id` links 28 live pages to nodes, but `NodePanel`, `PlanNodesTable`,
`PlanTree`, and `PillarMap` show nothing — no "has page / published / open it" affordance
anywhere (FEATURE.md lists badges as follow-ups). The FE cannot query the CMS project directly
(deliberate invariant). **Fix:** extend the bridge (`features/marketing/content-plan/setup/bridge.ts`
+ the aidream `/content-plan/*` router) with a per-site "node→page map" read, then render a
badge/column in tree + table and a linked-page card with open/edit links in `NodePanel.tsx`.

## WF-12 — Brand cockpit and CMS don't know about each other

**Status:** DONE (2026-08-07 — Quick work links + CMS settings pairing card) · **Repo:** matrx-frontend · **Severity:** LOW

The pairing `client_sites.web_site_id` is written only by `bridgeReconcile({cmsSite})` from the
content-plan Setup view; `/marketing/brands/[brandId]` and `/cms/[siteId]` show no cross-link in
either direction. **Fix:** show the paired CMS site (with link) on the brand site workspace, and
the paired `web.site`/brand on `/cms/[siteId]/settings`, using the existing bridge reads.

---

**Assignment tips:** the only remaining open items are WF-3 (HIGH) and WF-10 (LOW) —
independent and parallelizable. Everything else is DONE.
