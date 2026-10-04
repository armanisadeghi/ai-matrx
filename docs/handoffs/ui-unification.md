# Handoff — UI unification (owner: the 2026-10-01 → 10-03 UI-unification session)

**Read this first if you are continuing this work.** Evidence: `docs/ui-drift-audit.md`. Plan and rules: `docs/ui-unification-plan.md` (§1b one control, §1c round-2 rules, §1d sets). Decision board: `/demos/ui-unification` (demos.aimatrx.com). Settled-system page: `/demos/ui-unification/system`. Sample pages: `/demos/ui-unification/samples/{agents-all,project-settings,user-settings}`. THE controls now live in `@ai-matrx/design-system/controls` (≥0.61.3; package FEATURE.md § THE ONE CONTROL) and every demo page renders them; the board's rejected options are the same components with one token moved (`Alt` in `_components/one-control.tsx`). Guards: ESLint `matrx/one-control`, `pnpm check:one-control`, the package's `controls-geometry.test.tsx`.

## SETTLED (owner accepted)
- **One control at 28px visible height:** buttons, fields, selects, segmented controls, tabs and tap buttons, all with the capsule shape. Labels 13px/500, glyphs 16px. Inner padding is matched: a glyph sits 6px from the edge, text about 10px. Every control carries a 3px half-gap of its own, and containers add no gap.
- **One size, no size props.** Agents get no choice. An exception is a separate component (`FeatureButton`) behind a `// ui-exception:` comment.
- **Touch** uses an invisible 44px hit area; the layout never grows.
- **Type:** 13px titles and controls, 12px secondary, 11px meta.
- **Surfaces:**
  - one surface level; rows about 36px with hairlines between them; 8px radius; bordered card skin;
  - never a card inside a card; phone gutters 12px;
  - space goes between groups, never padding inside padding (Apple HIG).
- **Badges:** outline shape, small, status tints from tokens.
- **Row actions:** quiet, muted until hover.
- **Delete:** three tiers — quiet trash glyph, a confirm that names the cost, a danger zone.
- **Tabs:** underline for page sections, capsule for filters.
- **Dialogs:** default width md.
- **Loading:** a skeleton shaped like each region; a spinner only inside a busy control.
- **Empty state:** tinted icon disc, 13px title, one line, 28px button.
- **Toast:** four layers in one component — message + close + copy-for-AI always, a peek popover, a window panel, a new-tab link. An error's copy affordance is the Alchemy menu. The message is clamped to 2 lines; below 300px the extra controls fold into "More".
- **THE TAP PLACEMENT RULES** (design-system ≥0.53.1; the guard draws a dashed red outline):
  - glass only floats (a sticky or fixed bar over moving content);
  - all glass or none;
  - a 3px half-gap beside any tap button, a container's edge included.
- **Shell header:** no glass, no border, one 8px fade owned by the shell. Guard: `features/shell/__tests__/header-top-boundary.test.ts`.
- **Daily check APPROVED** (owner, 2026-10-03): the in-app schedule "UI drift check — daily".

## OWNER FEEDBACK 2026-10-03 (to act on)
1. **Row actions must not reserve an empty slot.** Hover-revealed actions sit LEFT of the status chips, so hiding them leaves no gap. The current "trash tier 1, More › Delete tier 2" layout reserves a big empty slot, which is wrong.
2. **CURSOR LAW** (owner's text; to be written as law and baked into the base layer, never per component):
   - The cursor always tells the truth about what a press will do. It is set once in the base layer and inherited.
   - `pointer` on every enabled interactive element: links, buttons, `[role=button]`, summaries, labels, selects, clickable rows and cards.
   - Disabled controls get `not-allowed`. Mark them `aria-disabled`, never `pointer-events: none`, which swallows the cursor.
   - `text` on fields and contenteditable; `auto` on plain text.
   - `grab` on draggables, and `grabbing` set on `<html>` for the whole drag, so it never flickers.
   - Directional resize cursors on splitters and handles: `col-resize`, `row-resize`, `ew-resize`, `ns-resize`, `nwse-resize`.
   - `zoom-in` / `zoom-out` on images that zoom on click.
   - `progress` on a busy area that still accepts input; `wait` only for a truly blocked surface.
   - No custom cursor images.
3. **Density:** right for a specific set of things, too dense for a whole page. Put space BETWEEN big blocks. The top of a functional page must not feel overwhelming. Use page-top variety:
   - promo cards that link to features (on agents: Orchestras, Agent Battles, Templates, plus a rotating card for Shortcuts, Skills, Connections and more);
   - a KPI row;
   - a single-feature promo banner, compact (the kits page has the concept; its pill, title and description run too long);
   - a few more variants, so each page has its own feel. Never junk description text.
4. **Honest comparisons only.** The agents sample HID real features: filters, sort, the drift notice, dimensions, links to Orchestras. Never hide features to make a page look better; reuse the real components.
5. **Canonical table regression.** The owner prefers how the real agents table looked before. Find what was lost (the list-shell change `9b2e343d8f` / `8bbb87d643`, or overrides) and restore it without overrides.
6. **Breadcrumbs everywhere.** One header crumb pattern sitewide, the org/scopes one (back chevron + crumbs + a sibling menu per level; it also drives the /demos tree header). Every page top uses it.
7. **Pages to rebuild as honest demos** (always state the OLD url):
   - /agents/all — the template for hundreds of list pages;
   - /education/overview — currently horrible; a hub one level up the tree that lists many dimensions, like agents + orchestras + skills + tools together;
   - /education/kits/db38865c-f89a-47e9-ae02-0ae98565fee3 — a good single-feature promo top, but too big, and its buttons are badly sized;
   - /education/flashcards/a55a0b20-a6e9-47e4-a47d-bf4c74677cc3 — a great feature page; improve it with the primitives;
   - /agents/506a20fc-34a9-4038-b38b-6c71ab09b173/build — **FORBIDDEN to change in the real app without the owner's explicit approval**; pixel-perfect by design. Propose improvements as a demo copy only.

## DONE 2026-10-03 (after the feedback above)
- Cursor law: common-docs/policies/cursor-law.md; design-system 0.60.0 base layer; `pnpm check:cursor-law` (baseline ~51 disabled pointer-events-none sites, shrink-only).
- Daily check: `scripts/ui-drift/check-ui-drift.mjs` (row `ui-drift`), one item per rule+file with count ratchet (~12.1k), paged ingest via `ops.check_items_seed_page` (migration applies on next release). OPEN: signed-in non-admins can read all ops check runs/findings on the clone — asked Arman whether to lock to admins.
- Table: toolbar gaps/radius/padding/search width restored in lib/entity-list; design-system 0.60.1 actions column fits its controls. Pager solid-dot + joined header row kept (deliberate) — Arman to say if those are what he misses.
- Honest samples live: samples/{agents-all,education-overview,education-kit,education-flashcards,agent-builder}; page-top kit in samples/_components/page-top/{feature-cards,kpi-row,promo-banner}.tsx. Builder: 8 proposals in the demo, awaiting Arman's pick — real builder untouched.

## OWNER FEEDBACK 2026-10-04 (in flight)
- Kit sample DESTROYED a page he called beautiful: restore the real page; only header, 5 top buttons → below banner and identical, drop "Your study path" pill, drop the progress-provenance sentence. Inviting pages are NOT packed — density is for functional pages.
- Flashcards "Also made from": sentence-length pills. Class = long text in a pill; fix the real component + clamp in package + dev guard + findings check.
- Table: the list shell modifies the canonical table; rows must never join; saved-view tabs far left. Guard page-level customization of canonical components (ESLint + findings), loudly.
- Pill buttons: left inset too small / off-centre on samples + real pages. Root-cause + symmetry test + dev guard.
- No "Replaces…" line on samples (done); classic-view notice hidden on the agents sample (done).
- Stay in lane: never raise other lanes' problems (security etc.) to him until this UI is perfect.

## OPEN / NEXT
- **The rollout, after the owner finalises the pages above:**
  - DONE 2026-10-04: the system is in `@ai-matrx/design-system/controls`, locked in `matrx-tap-lock`; `ControlScope` stands in for the tap tokens' 28/34 flip until it lands app-wide;
  - remove size props; a codemod across the app; the geometry lock;
  - tap buttons get a SURFACE-CONTEXT default (plain on solid, glass only inside a declared floating bar), which fixes ~370 page-injected glass header buttons.
- **Page-top templates** — inventory in this session's scratch:
  - marketing: `PublicHeader` + `ModuleLanding`;
  - module home: `EntityListPage`;
  - internal: `RouteHeader` (118), `EntityModeHeader` (25), `CrumbTrailHeader` (18), and 233 raw `PageHeader`s with no template;
  - full-bleed: six groups, each opting out differently.
- **Custom data:** brief in `common-docs/operations/for-arman/2026-10-02/custom-data-requirements.md` and a task chip. The board keeps localStorage until `useAppTable` exists.
- **Census leftovers:** glass on table pagination ("Page 1"), the chat history sidebar refresh, and the tasks quick-add neighbour within 3px. Fix them in the rollout.
