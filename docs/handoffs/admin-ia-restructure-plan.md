# Administration IA restructure — findings + proposed plan

**Status:** proposal awaiting Arman's decision. Nothing implemented.
**Scope:** the `/administration` route tree and the menu registry that renders it.
**The registry that owns this today:** `features/admin/constants/admin-navigation.ts` (hierarchy + route ownership) and `features/admin/constants/admin-categories.ts` (title/description/icon only).

---

## 1. Measured baseline

| Fact | Value |
|---|---|
| Pages under `app/(admin)/administration` | 216 |
| Declared destinations (menu rows) | 156 |
| Declared but hidden (`ownedRoutes`) | 47 (36 dynamic leaves, 11 static) |
| Top-level domains | 20 (+ Launchpad) |
| Registry ↔ filesystem drift | 0 — `check:admin-catalog` holds them in exact parity |
| Registry consumers | 8 files, all read the same registry |

Domain size today (visible rows): Agents 29 · Database 26 · Users 14 · Utilities 14 · Knowledge 11 · AI 10 · Automation 8 · Reporting 8 · UI 7 · Applications 5 · Chat 5 · Compute 5 · Documentation 4 · HR 3 · Marketing 2 · Scopes & Context 2 · **Mandates 1 · Shared Knowledge 1 · Preview 1**.

## 2. Root cause — it is not just bad grouping

`features/admin/FEATURE.md` carries this invariant:

> The expanded Administration route sidebar has exactly two visual levels: separated all-caps domain headers and full-size clickable destination rows. … must not add a third, non-clickable label layer.

`AdminRouteSidebarMenu.tsx` implements it: each domain is a `<details>`, and `domain.sections.flatMap(...)` **discards the section level entirely**. The registry has three tiers; the sidebar renders two.

Consequence, and it explains everything the sprawl looks like:

- A domain with real internal structure (Agents' 6 sections, Database's 5) collapses into an undifferentiated wall of 26–29 rows.
- The only way to make something *findable* became **promoting it to a top-level domain**. That is exactly how Mandates (1 row), Shared Knowledge (1 row) and Preview (1 row) each got a primary slot, and why Knowledge/Shared Knowledge and Knowledge/Marketing split apart.

So the fix has two halves: **regroup** (below) **and restore the section tier in the sidebar**. Regrouping alone just moves the wall.

## 3. Defects found (independent of any regrouping)

1. **Dead menu row.** `/legacy/administration/schema-manager` is a declared, rendered Database destination. No such page exists anywhere in `app/` and no rewrite produces it. Referenced in `constants/favicon-route-data.ts:179`, `admin-categories.ts:1436`, `admin-navigation.ts:363`.
2. **Byte-level duplicate route.** `/administration/utilities/content-blocks` and `/administration/agents/system-agents/content-blocks` both render the same `ContentBlocksManager`.
3. **Two doors to one feature.** `/administration/database/schema-visualizer` and `.../schema-visualizer-enhanced` are two entry points into the same `features/administration/schema-visualizer` folder. The Database hub's own description already admits it ("duplicates marked Dup").
4. **Overlapping analytics.** `/administration/users/usage` is described in the catalog as "the CX usage analytics surfaced inside user management" — the same job as `/administration/chat/cx-dashboard/usage`.
5. **Five legacy redirect stubs** under `/administration/agents/system-agents/shortcuts/{agents,apps,categories,content-blocks,lineage}` — 14-line `redirect()` pages, hidden from the menu. Shims; the no-legacy policy says delete.
6. **Hub-of-one.** `/administration/utilities/utils` exists only to hold `text-cleaner`.
7. **Seven dead intermediate URLs** — truncating any of these 404s: `/administration/agents/relationships`, `/administration/agents/reports`, `/administration/agents/agent-apps/edit`, `/administration/agents/system-agents/edit`, `/administration/documentation/feature-docs/view`, `/administration/ui/official-components/to-be-added`, `/administration/utilities/kind-registry/findings`. The first two are invented nesting holding exactly one leaf each.
8. **A query-string row.** `/administration/ui/surfaces?drift=1` is a second menu row onto the same page.
9. **24 admin surfaces are unreachable from the admin panel.** Every Tier 1 feature ships an admin map at `/[feature]/admin` (`features/admin/FEATURE.md` documents them), and **not one** is linked from the administration registry: `/agents/admin`, `/camera/admin`, `/cms/admin`, `/commerce/intake/admin`, `/commerce/review/admin`, `/crm/admin`, `/dictionary/admin`, `/education/admin`, `/education/flashcards/admin`, `/education/learn/admin`, `/files/admin`, `/knowledge/extractions/admin`, `/marketing/admin`, `/masterwork/admin`, `/messages/admin`, `/rag/admin`, `/reports/admin`, `/shapes/admin`, `/tool-call-visualization/admin`, `/tools/pdf-extractor/admin`, `/tools/product-capture/admin`, `/transcripts/admin`, `/war-room/admin`, `/work/admin`. This is the "missing routes" gap.

10. **The dashboard and Launchpad already render sections** (`AdminDomainSection.tsx`, `AdminLaunchpad.tsx` — as of 2026-09-08; the file was `AdminDomainDirectory.tsx` when this was written). Only the sidebar drops them. The section tier is fully authored — names and icons already exist — it is simply thrown away in one component.

## 4. Migration-cost reality (why menu ≠ route here)

211 files outside the registry hardcode a `/administration/...` string. The most-referenced paths are exactly the ones a naive regroup would move:

| Path | Hardcoded refs |
|---|---|
| `/administration/agents/system-agents/agents` | 29 |
| `/administration/mandates` | 21 |
| `/administration/users` | 10 |
| `/administration/utilities/kind-registry` | 8 |
| `/administration/agents/agent-apps/apps` | 8 |
| `/administration/chat/cx-dashboard` | 7 |

`getAdminNavigationArchitectureErrors()` currently requires every destination to equal or descend from `/administration/<domain-slug>`, so **any** cross-domain regroup forces a physical route move today. That invariant is the single thing that makes this restructure expensive.

## 5. Adversarial validation — what survived, what did not

Two independent reviewers attacked the first draft. Corrections adopted:

| Draft claim | Verdict | Correction |
|---|---|---|
| `users/usage` duplicates `cx-dashboard/usage` | **REFUTED** | `UsageTableClient.tsx:3-8` is per-USER grain over `chat.user_request`; the CX page is recharts over `analytics.by_model`. Deliberate replacement, 4 live cross-links. **Keep both**, rename to "Usage by user" / "Usage by model". |
| `schema-visualizer-enhanced` is a dup, delete it | **HALF-TRUE, backwards** | `-enhanced` renders `SchemaVisualizerLayout`, a strict superset (resizable layout + actions + details + `?selected=` hydration) around the same canvas. **Keep the richer one** at `/schema-visualizer`; redirect `-enhanced`. |
| Delete `agents/system-agents/content-blocks` | **WRONG TARGET** | That route is the live target of `shortcuts/content-blocks`'s redirect and what the System Agents hub links to. **Retire `/administration/utilities/content-blocks` instead.** The draft also listed this path in both the placement map and the merge list — a self-contradiction, now fixed. |
| `/legacy/administration/schema-manager` is dead | **CONFIRMED** | One reviewer objected, citing `next.config.js:765`. That line is a *comment* describing a historical move; there is no redirect rule and `find` over the whole repo returns no file or directory of that name. It is dead. |
| Mandates → a section of Automation | **REJECTED** | `admin-navigation.ts:206-209` records a dated decision ("PEER of Agents, not a child", 2026-08-30) and `features/mandates/FEATURE.md` rule 8 makes the admin route the authoring home. A mandate is a binding layer, not scheduled work. **Moved into Agents** (which matches the peer reasoning) or left top-level — Arman's call. |
| HR under Knowledge | **REJECTED** | HR is a product module with ten `(core)` route families, five CI guards and its own `(kiosk)` group. Knowledge is defined by `admin-knowledge.manifest.ts:4-8` as an AI-substrate domain. **HR stays its own domain.** |
| Scopes & Context under Knowledge | **REJECTED** | `system-context` is a super-admin write surface configuring what every agent receives → **Agents**. `context-inspector` is a debugger → **Diagnostics**. |
| One "Operations" domain (CX + AI tasks + executions + compute + clients + caches) | **REJECTED as a junk drawer** | Split. CX stays its own domain; `ai-tasks` stays in AI; `agent-apps/executions` **stays in Agents** (it is one tab of a tabbed hub — `agent-apps/layout.tsx` — moving it lands the user on a page wearing the Agents tab strip); `proof-runs` is assurance, not a run log → **Insights**. What remains — Infrastructure + Shipped Clients + Diagnostics — is coherent. |
| `message-templates` under "Content & Rendering" | **REJECTED** | Its consumer is the email/outreach flow (`features/message-templates/FEATURE.md`) → **Users › Communications**. |
| `kind-registry` under "Content & Rendering" | **REJECTED** | It is the Shape System registry with its own manifest, deliberately excluded from Utilities. Put it with the other registry (`taxonomy`) → **Registries & Docs**. |
| `persistence-test` + `unified-management` as "Windowing & Preview" | **REJECTED** | Grouped on a pun. `persistence-test` is a diagnostic → **Diagnostics**. `unified-management` previews a Job Board unifying mandates/bindings/shortcuts → **Agents**, and it must be reconciled with this restructure, not filed under it. |
| Draft dropped `utils/text-cleaner` | **CONFIRMED BUG** | It appeared only in the merge list, in no section — it would have become an undeclared page. Now placed. |
| 216 page files vs 215 discovered routes | **NOT A DEFECT** | `normalizeCatalogLink` strips the `/administration` prefix and `.filter(Boolean)` drops the resulting empty string, i.e. the root page. No scanner drift. |

## 6. The blocking decision — sections must become visible

Every attempt to reach a *small* number of top-level menus runs into the same wall: with sections invisible, a 25-row domain is as unusable as today's 29-row Agents. The reviewers reached this independently.

- To keep menus small **without** sections you need ~16–18 domains of ≤10 rows — barely better than today's 20.
- To get a genuinely small top level you need the section tier rendered.

`AdminRouteSidebarMenu.tsx:175` is the enforcement point (`domain.sections.flatMap(...)`), and `FEATURE.md:117-122` forbids the third layer — a decision deliberately taken on 2026-07-27 (`FEATURE.md:372-375`) after someone tried it. **This is Arman's ruling to make, not an agent's.** `AdminMobileMenu` needs the matching change or desktop and mobile diverge. Note the dashboard, the Launchpad and the header tree already render sections — only the sidebar throws them away, so the section names and icons are already authored.

**Secondary:** do not name a domain "Overview" — `AdminRouteSidebarMenu.tsx:101-103` already renders a hardcoded all-caps `Overview` header, and the Launchpad domain's slug is special-cased twice for new-tab behavior (lines 69-71, 152). Keep the slug `launchpad`.

## 7. Proposed structure (assuming sections render)

Governing rule, so this cannot rot again: **a top-level domain is a distinct operator job with at least 3 destinations; anything smaller is a section.** That rule alone forbids the Mandates / Shared Knowledge / Preview single-row domains that caused this review.

14 domains, down from 20. Physical route moves in brackets.

1. **Launchpad** `launchpad` — Dashboard, Launchpad, All Routes, Experimental Routes *[2 moves]*
2. **AI** `ai` — Models (6) · Health (3) · Operations: ai-tasks *[0]*
3. **Agents** `agents` — Agents · Shortcuts & Blocks · Agent Apps (incl. Executions) · Skills · Tools & MCP · Health & Drift · **Mandates** (list/new/advanced + unified-management preview) · **Context** (system-context) *[3 moves]*
4. **Automation** `automation` — Scheduling (8) *[0]*
5. **Chat & CX** `chat` — CX Conversations (5) *[0]*
6. **Knowledge** `knowledge` — Knowledge Graph (2) · Research (1) · Podcasts (3) · Shared Knowledge (1) *[1 move]*
7. **Marketing** `marketing` — Engines (run-console, seo-operations) · Vocabulary & Value (3 seo-*) · Sites (cms-agents) · Coverage (growth-loop) *[5 moves — already demanded by CLAUDE.md's "all marketing/SEO under /marketing/*" rule]*
8. **Database** `database` — SQL & Schema (6) · Relationships & Access Graph (8) · Canonicalization (8) · Integrity (1) *[0]*
9. **Users & Access** `users` — Accounts (6) · Entitlements & Limits (3) · Communications (5, +message-templates) *[1 move]*
10. **UI** `ui` — Surfaces (2) · Component Lab (3) · Content & Rendering (content-blocks, markdown-tester) *[2 moves]*
11. **Operations** `compute` — Infrastructure (4) · Shipped Clients (5) · Diagnostics (system-errors, capture-inspector, context-inspector, persistence-test, server-cache, blob-cache, local-storage) *[12 moves]*
12. **Registries & Docs** `documentation` — Registries (taxonomy, kind-registry, build) · Feature Docs (4) *[3 moves]*
13. **Insights** `reporting` — Reports (reports, events, grounding, producer-yield) · Coverage & Debt (dead-ends, unwired, lint-debt, public-exposure) · Assurance (proof-runs) *[1 move]*
14. **HR** `hr` — Employment Law (3) *[0]*

Retired domains: Mandates, Shared Knowledge, Preview, Scopes & Context, Utilities, Documentation→Registries & Docs, Compute→Operations, Applications→Operations, Marketing absorbs Knowledge's SEO wing.

**Optional further merges, Arman's call:** HR → a "Product Modules" domain with Podcasts/Research/CMS; Chat & CX → Insights; UI → Operations. Each would take the count to 13/12/11 and each has a real argument against it.

## 8. Route work required (independent of grouping)

- Delete the dead `/legacy/administration/schema-manager` row from `admin-navigation.ts:363`, `admin-categories.ts:1436`, `constants/favicon-route-data.ts:179`.
- Extend `getAdminNavigationArchitectureErrors()` to reject any destination link not under `/administration` — that class hid for months precisely because the check skips foreign prefixes (`admin-navigation.ts:754`).
- Merge the two schema visualizers onto one URL rendering `SchemaVisualizerLayout`.
- Retire `/administration/utilities/content-blocks` in favor of the agents route.
- Delete the 5 redirect stubs under `agents/system-agents/shortcuts/*`.
- Delete the `utilities/utils` hub-of-one; move `text-cleaner` up one level.
- Give `/administration/agents/relationships` and `/administration/agents/reports` real pages or flatten their single leaves up (they 404 today).
- Drop the `?drift=1` duplicate row; make it a tab on the surfaces page.
- **Add a "Feature admin maps" destination** listing the 24 `/[feature]/admin` routes. This is the largest discoverability gap in the panel.

## 9. Migration constraints (must be honored)

1. **Menu placement and physical route are welded together today.** `getAdminNavigationArchitectureErrors()` requires every destination *and every `ownedRoute`* to sit under `/administration/<domain-slug>`. So every cross-domain move above is a `git mv`, not a registry edit. The alternative — relaxing that invariant so the menu can group freely — is worth putting to Arman, because 211 files hardcode `/administration/...` URLs and the live DB holds 113 `agent.review_queue` rows and 44 `ui.ui_surface.url_pattern` rows pointing at these paths.
2. **`admin-navigation.ts:57-62` throws at module evaluation** on a link with no metadata, and the module is imported by the shared AppShell. A single missed rename in `admin-categories.ts` takes down the whole signed-in app, not just `/administration`.
3. **The audit is exact-match with no prefix inference and a 0-issue baseline.** There is no green intermediate state unless a domain's folder move and its registry edit land in the same commit. **One domain per commit** is the only safe unit.
4. Each move must also ship: the `ownedRoutes` patterns, the `features/surfaces/manifests/*` `urlPattern` (29 manifests; 8 live DB rows on moving prefixes) plus a manifest re-sync, permanent redirects, route metadata, and regenerated dead-ends/unwired/lint-debt report JSONs.
5. **22 existing redirects in `utils/next-config/adminRouteRedirects.js` point into moving subtrees** and would 404. Two of them target `/administration/utilities`, a page this plan deletes. Redirects are the sanctioned mechanism here (that file did this exact migration once before, 52 families, `permanent: true`) — but ordering matters and the repo is inconsistent about `permanent`.
6. **Nothing gets deleted until Arman names it dead in writing** (unfinished-work alarm). Sections 3 and 8 are nominations, not authorizations.
