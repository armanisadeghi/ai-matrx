# P3 Mobile-Friendly UI Patrol

- **Run date:** 2026-08-13 (America/Los_Angeles)
- **Run kind:** structural-novelty pass + ledger verification + full viewport-unit detector
- **Outcome:** 46 live plain-`vh` tokens verified; 37 auto-fixed in two certified 15-file batches and 9 excluded runtime/window/config tokens remain. Structural review added four Tier-R mobile findings.
- **Certifier verdict:** **CERTIFIED** for both Tier-M batches; no batch was rejected or paused.
- **Delivery:** **INFRASTRUCTURE BLOCKED** after preservation commit. The isolated
  patrol worktree is on `codex/p3-mobile-friendly-ui-20260813`, while
  `release.sh` hard-requires the local branch named `main`; `main` is checked
  out by the shared checkout, which this patrol may not mutate or commandeer.
  The certified branch is pushed for retry through the serialized lane; no raw
  push to `origin/main` and no release-script bypass was used.

## Scope scanned

The isolated worktree was fast-forwarded cleanly to `origin/main`
`b4b5464f26fcfa367fbbd2d2cd940704f47f7bc9` (`v0.4.561`) before the immutable
baseline. Worktree-local dependencies were installed with
`pnpm install --offline --frozen-lockfile`; no shared `node_modules` symlink was
used.

Structural novelty since the stored baseline commit
`24a25f61878d6e60310eb4a907df3928afc7eaf6`:

- 5 new route leaves, all under `(core)`:
  `/crm/campaigns`, `/crm/campaigns/[campaignId]`,
  `/crm/campaigns/[campaignId]/dial`, `/crm/import`, and
  `/marketing/ai-visibility/runs/[runId]`
- 27 newly added direct client `.tsx` files
- 0 new top-level feature directories
- the open P3 ledger entry
- a full P3 viewport-unit and fixed-bottom pass

Current structural baseline:

- 1,003 route leaves; SHA-256
  `b9a7802bc8e293d79f7aea2910ec5a846ec0346f5289db8cb295276bbdcb8835`
- 4,962 direct client `.tsx` files; SHA-256
  `bda76b2ac8ab791d1df9a176c3e5c5e3b82d7c9f628e33a56a4c4bcafa95d091`
- 121 top-level feature directories; SHA-256
  `b7fe66d584074bd0df19cd37f41cb65f8b4ae6415e7864ca558fe6592a0cb52a`

## Detector results and false-positive triage

The exact `h-screen|100vh` detector remains clean in runtime code; its only
matches are explanatory comments in `app/globals.css`.

The full numeric-unit detector started at 57 raw tokens on 56 lines in 41 files.
Triage excluded five comment-only tokens and six expressions in the confirmed
zero-consumer `components/matrx/resizable/panel-config.ts`, leaving 46 live
tokens. The two certified batches removed 37. The final raw detector has 20
lines in 11 files: 9 live excluded tokens, five comments, and six zero-consumer
prototype expressions.

Durable detector:

```bash
rg --pcre2 -n --glob '*.{ts,tsx,js,jsx,css,scss}' \
  '(?:\d+(?:\.\d+)?|\})vh\b' \
  app components features hooks lib providers styles utils
```

The fixed-bottom detector returned 32 candidates. Context review found no new
safe-area violation: candidates already carry `pb-safe`/`env(...)`, delegate
safe padding to their body/footer/nav, are full-height sidebars/backdrops, or
belong to the same zero-consumer prototypes. The canonical drawer remains
protected by the 2026-08-12 certified `pb-safe` repair.

## Auto-fixed now

Two batches, each exactly 15 files, applied only the registry-approved direct
literal CSS/Tailwind/inline-style `vh`→`dvh` transform. Numeric values, every
other class/property, source order, logic, interaction, theme behavior, and
chunk entry remained identical.

### Batch 1 — 20 tokens / 15 files — CERTIFIED

- shared canvas lens, flashcard source lists, application config/catalog diff
  panes, scraper bookmark list
- admin breadcrumb/navigation menus
- legal case loading/empty states
- canonical entity/crumb header option menus
- RAG source inspector mobile pane
- canonical header bottom-sheet CSS

Scoped old-`vh` detector: 20→0. Independent adversarial verdict:
**CERTIFIED**.

### Batch 2 — 17 tokens / 15 files — CERTIFIED

- research activity feed, sidebar admin menus, layered table filter builder
- War Room loading skeleton, backlink JSON inspector, content-plan legend
- knowledge-graph low-quality section, SQL result inspector, surface role list
- scope breadcrumb, canonical SVG/diff render blocks, toast cap
- smart-input context-doc menu and HTML inline preview

Scoped old-`vh` detector: 16 lines / 17 tokens→0. Independent adversarial
verdict: **CERTIFIED**.

For both batches, `pnpm type-check` stayed PASS→PASS; page-header warnings
stayed 8→8; tsconfig stayed PASS with the same two notes; doctrine stayed exit
0 with the same 11 unrelated warnings; UI-primitives stayed exit 0 with the
same 19 warnings. Scoped ESLint diagnostics were unchanged from their exact
pre-edit baselines, and `git diff --check` was clean.

The managed preview lease was owned by the shared checkout at 29.3 GB RSS, so
this worktree correctly refused to reuse or stop it. Per the patrol
constitution, both certifiers completed bounded static/component evidence by
risk class: menus/scrollers, full/min-height states, panes/previews, inline
styles, and shared CSS. Desktop values/properties remain equivalent; mobile
heights now follow browser chrome.

## Manual approval requested

### 1. Nine excluded runtime/window/config `vh` tokens

These are certain P3 doctrine violations but are outside the auto-approval
gate because the string crosses a component/config boundary instead of being
consumed at the literal source. Approve a bounded unit-only batch after tracing
each consumer:

- `features/window-panels/windows/seo/KeywordResearchWindow.tsx:162`
- `features/window-panels/windows/marketing/SiteCommandRunWindow.tsx:40`
- `features/window-panels/windows/agents/LiveRunWindow.tsx:66`
- `features/window-panels/windows/projects/CreateProjectWindow.tsx:119`
- `features/agents/components/inputs/smart-input/PlusAttachMenu.tsx:76`
- `features/marketing/seo/public-tools/AiVisibilityTool.tsx:105,328`
- `features/agents/components/agent-widgets/AgentFlexiblePanel.tsx:10`
- `features/marketing/content-plan/components/NodePanel.tsx:602`

Why it matters: mobile browser chrome changes the usable height; `vh` can make
floating windows and menus extend below the reachable viewport. Safe intended
fix: trace the consumer, prove the value reaches CSS unchanged, then substitute
only `vh`→`dvh` and certify desktop/mobile.

### 2. CRM mobile controls below the 16px / 44pt minima

Production `v0.4.561` at 375×812 verified:

- `/crm/import`: organization select and pasted-CSV textarea compute to 12px;
  People, Companies, organization, Template, and Use-pasted-text controls are
  28–32px tall.
- `/crm/campaigns` → **New campaign**: name/description compute to 14px and
  Cancel/Create are 28px tall.
- matching source classes occur in `CampaignCreateDialog.tsx:96,137`,
  `AddMembersDialog.tsx:206`, `AddToCampaignDialog.tsx:210`,
  `CallQueuePage.tsx:515`, and `ImportWizard.tsx:294,348,449`.

Why it matters: iOS zooms sub-16px form controls, and undersized targets are
hard to tap. Safe intended fix: mobile `text-base` inputs and `h-10`/`h-11`
controls while retaining the current compact desktop classes at the desktop
breakpoint; certify every distinct dialog/form risk class.

### 3. New collection-run core route keeps identity/share chrome in the body

`features/marketing/seo/ai-visibility/CollectionRunView.tsx:38-54` renders a
page-title/share toolbar inside the page body. The new `(core)` route
`/marketing/ai-visibility/runs/[runId]` supplies no `PageHeader`/`RouteHeader`.

Why it matters: body chrome duplicates the shell row and can collide with the
glass header on narrow screens. Safe intended fix: move route identity and
Share into the canonical AppShell header, retain report content in the
`h-full` body, and certify desktop/intermediate/mobile in both themes.

## Backlog retained

### CRM campaign empty state is centered outside the mobile viewport

At production `/crm/campaigns` on 375×812, the table correctly owns horizontal
scroll and the document itself does not overflow, but the empty-state cell is
791px wide. Its centered message/action render mostly offscreen. The defect is
certain; a safe fix is not yet proven because `MatrxDataTable` is a shared
primitive and changing empty-state anchoring can affect every consumer. Retain
for a focused responsive table audit that inventories the primitive's mobile
consumers before implementation.

The nine runtime/window/config tokens above are not exceptions and remain open
until Arman approves or rejects the proposed bounded batch. No exception was
proposed, added, suppressed, or allowlisted.

## Cadence health and candidates

The preceding month contains only the 2026-08-12 first/full run and this run;
the patrol is not in an all-clean streak, so no longer cadence is proposed.
Both current batches certified, so mutation is not paused. No recurring
unregistered class was established; the additional findings are existing P3
doctrine classes.
