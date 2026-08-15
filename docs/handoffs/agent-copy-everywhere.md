---
status: active
updated: 2026-08-15
repos: [matrx-frontend]
vision: [.claude/skills/agent-copy/SKILL.md, components/agent-copy/README.md]
---

# Agent-copy everywhere — copy / JSON / Copy-for-AI / export on every data surface

## Vision — Arman's words

> "Our entire application is highly AI driven. And so having copy icons everywhere and copy for AI icons everywhere is an absolute must."

> "We should never display any data where we don't properly allow the user to copy individual parts, individual lines, individual entries, or all of them as a whole and then have the copy for AI icon, which also provides XML-ish style formatting to make it easy for pasting directly to AI."

Per-page expectation (stated for the backlinks reference page, generalizes to any data-heavy page):
> "Each card and each item needs a normal copy as well as the for-AI. The table needs more than just that and then the window panel will definitely need more. And then you need one for the entire page and that's where you get into needing to render a dedicated window panel for grooming the AI copy with different variations and some automated options to reduce the size but where you know it's OK to cut."

Refinements he added along the way — each is now doctrine, with the why:

- **THE WHAT-I-SEE LAW** (2026-08-12, in anger — the most important one): the payload is **the rendered surface converted to data**, never a raw record dump. Errors and warnings verbatim, the page's leading KPIs mirrored into every payload on that page, LIVE form state rather than the saved row. A payload that dumps 50k chars of adjacent data while missing the red error the user is staring at is a defect.
- **Truncated lists must offer the rest.** "We're only showing the top 8. But what if the user wants to see the rest of it? … it wouldn't be hard for us to just make that data available, but someone has to say it." → agents doing big work are expected to *notice* this class themselves.
- **Export is mandatory.** "There's no export feature. And if there's no export feature, then it's just text that's sitting here."
- **Copy as JSON** joins the flavors: "When you have data, you wanna also have copy as JSON in addition to the normal copies."
- **UI integrity is part of the job.** Titles in user words ("these are just backlinks", never "stored backlink rows"), counts never in prime real estate pushing the search, header/footer must read as one card with the table, copy icons share existing rows instead of spawning their own. "Be on the lookout for things like that always."
- **The Groomer window is a reusable primitive**: "I love the window panel component you made… that can easily be a reusable component across a lot of different pages."
- **Sized to data.** Graded `aiVariants` + `aiCustom` belong on medium/massive surfaces; a small bounded page correctly keeps the plain pair. Choosing the size is part of the job, not a default.
- **The skill must be Sonnet-executable** — rollout fleets run on Sonnet to prove the skill carries the quality.
- **Do not merge this skill with `surface-authoring`** — deliberate; they cross-point instead.

## Resources

- **Doctrine + how-to (read first):** `.claude/skills/agent-copy/SKILL.md` (MISSION section, then the module-audit protocol), `components/agent-copy/README.md`.
- **Primitives:** `components/agent-copy/` — `CopyButtons.tsx` (sizes xs/icon/sm, `json`, `aiVariants`, `aiCustom`), `AiCopyMenu.tsx` (graded variants dropdown + custom-preview dialog; kept in step with aidream `apps/dashboard/src/components/agent-copy/AiCopyMenu.tsx`), `buildAgentPayload.ts`, `ExportMenu.tsx` + `export.ts`, `AgentCopyGroomerWindow/Launcher` + `groomer-types.ts` (incl. `groomerPresetVariants` / `buildGroomerPresetPayload`), shared `clipboard.ts`.
- **Built-in integrations:** `MatrxDataTable` `copy` config → row/view/window/field copy + toolbar ExportMenu + `copy.aiVariants/aiCustom`; `JsonInspector` `agentCopy`; marketing `MetricCell` `copy`; marketing payload helpers `features/marketing/lib/copy-payloads.ts` (`webCopy`, `keyFieldsAiVariant` — extend, don't fork).
- **Reference pages:** `features/marketing/components/backlinks/BacklinksWorkspace.tsx` + `format.ts` — every pattern in one file (granularities, groomer sections, graded variants, the `copy.showToolbar:false` rule). `features/marketing/components/audit/AuditWorkspace.tsx` — the **show-all + full-data export + page-KPI** reference (`ShowAllToggle`, render-only preview constants, `auditPageKpis` threaded into every payload).
- **Testing:** dev server → `/api/dev-login?token=$DEV_LOGIN_TOKEN&next=/…`. Real data route: `/marketing/brands/1c71e366-143c-4692-8e9a-1b59bdfe114a/sites/7853b973-be56-47cd-bdf3-a55fad9dd0e4/backlinks` (aimatrx.com, `admin@admin.com`).

**Known traps:**
- `pnpm type-check` covers the whole repo and often carries OTHER sessions' in-flight errors — gate on zero errors *in files you touched*. (It was fully green repo-wide on 2026-08-15.)
- Adding a `copy` config to `MatrxDataTable` makes its toolbar render; on pages with their own header row set `copy.showToolbar:false` and host view-copy + ExportMenu in that row, or you recreate the orphan-toolbar-row mess Arman flagged.
- **Shared checkout is the designed workflow** (CLAUDE.md § Shared checkout): stage your own files, commit early and often, never tree-wide destructive git, never ask for your own branch/worktree. The old "prefer worktree isolation for fleets" advice here is superseded — it is now ruled against.
- A payload name must match the surface manifest's vocabulary. The audit page shipped `gone_pages` for a COUNT while the manifest uses `gone_pages` for the LIST and `pages_gone` for the count; an agent reading both then disagrees with itself. Fixed 2026-08-15 — check your names against the manifest.
- Vercel builds only `release:`-prefixed commits — plain pushes never deploy.

## Remaining work

### In flight — 7 chips fired 2026-08-15 (each carries its own file list and doctrine brief)

| Chip | Scope | Session |
|---|---|---|
| system-agents detail panels | `AgentWidgetsPage` (463 L), `AgentShortcutsPanel` (424 L), `AgentVersionDiffPage` (426 L) — all zero-copy | `session_013zeU9ocv31tyhiUiaZafzf` |
| ContentBlocksManager | `components/admin/ContentBlocksManager.tsx` (2,578 L, zero copy, mounted at TWO routes) | `session_01Qrb2QoRGxccu8afJdcGg3M` |
| Form-heavy + what-I-see audit | `AgentAppSettingsContent` (641 L), `agent-apps/edit/[id]` (589 L); audit `FeedbackDetailDialog` (2,771 L) + mcp tool editors for live-state violations | `session_01HexSXPJ4EyPxpY4cxwpWAM` |
| Access + sharing | `SiteAccessWorkspace` (225 L) + `features/sharing/*` — **the largest zero-coverage hole left**; shared components, so every consumer benefits | `session_01QhBtmWNmuaW9MHoCJnNQ5D` |
| content-plan module | Zero agent-copy imports module-wide; `NodePanel` (record detail) first, `BriefEditor` under the live-state rule | `session_017DNU1tqsZCKfYJbq53Yapw` |
| Small verified gaps | `SiteCommandFeed.tsx:279` warnings `.slice(0,10)` with no show-all/export (**hard violation, errors-first class**); `SitesPortfolio.tsx:614` `MatrxDataTable` with no `copy` config | `session_01WZXQcgqYiiXKCLcHrt174Y` |
| Graded variants + groomers | Crawl URLs/Logs/Snapshots/Reports tables, `PageWorkspace` (5-section record page), `BrandWorkspace` (1,322 L, 4 sections) | `session_01Yc11TPkXCxYWvdV53kuvNJ` |

**Read their reports before re-chipping any of it.** Each was told to update the skill's Rollout status and to name what it deliberately skipped.

### Not yet chipped

1. **Marketing tab partials** — real gaps, but each is small enough to be boy-scout work for whoever next touches the file:
   - `components/site/SiteOverview.tsx` — has 4 card pairs; **no ExportMenu, no groomer, no variants**; no per-item copy on the attention list (`:1023`), workspace entries (`:1232`), connection chips (`:1299`). Multi-section page → doctrine wants a groomer.
   - `components/integrations/SiteIntegrationsWorkspace.tsx` — header + per-provider pairs only; no export/groomer/variants; Google connections & resources rows have no per-row copy.
   - `components/settings/SiteStrategyCard.tsx` — **zero copy** despite rendering interview results + open questions (`:130`). (The rest of the settings tab is wired, and its identity card correctly builds from live form state.)
2. **The what-I-see payload debt** — everything wired before 2026-08-12 carries raw-dump payloads (the skill's own "Known debt"). The form-heavy slice is chipped above; the remainder is step 4 of the module-audit protocol and is best paid down opportunistically: upgrade the payload of any surface you touch.
3. **Roadmap (design-gated, don't start without Arman):** `buildAgentPayload` auto-folding the active surface manifest's values into `<context>`; screenshot attach (`hooks/useScreenCapture.ts`); Copy-for-AI flipping from clipboard to live agent handoff (keep `kind` slugs stable — they become the tool vocabulary).
4. **Release:** this work sits on `main` unreleased — ships via `./scripts/release.sh` on the next scheduled frontend release.

Correctly left alone: `MarketingHub.tsx` (a nav map — non-record, plain pair is the right size), builders/composers (`LiveBuilder`, `AutoCreateAgentAppForm`, `[id]/code`), and `PageLinksCard` (truncates, but already states "+N more … in the copied and exported data" and ships a real ExportMenu).

## Done

- **Audit rollup — closed 2026-08-15.** `buildSiteAuditRollup` aggregates completely; `topIssues`/`worstPages` carry every ranked entry and truncation happens only at render (`AuditWorkspace`, preview constants + show-all toggles + JSON/CSV exports over ALL rows). The doctrine survived two later rearchitectures by other sessions: aggregation moved into Postgres (`web.site_audit_rollup` / `web.site_audit_trend`, `migrations/web_site_audit_rollup_server_side.sql`) with **no LIMIT anywhere in the SQL**, and gone-pages reporting was added following the same complete-then-truncate shape (`GONE_PAGE_PREVIEW`). The TS twin is now the executable spec — CHANGE ONE, CHANGE BOTH. 11 unit tests green, incl. a 6,200-page case.
- **Audit page payloads brought under the what-I-see law** (2026-08-15): one `auditPageKpis(rollup)` feeds metric cells, all three section copies, all three row kinds, and both page-level payloads, so a copied issue row always arrives with the totals the user is looking at.
- **Catalogue analysis stopped discarding data** (2026-08-15): `CatalogueAnalysisPanel` rendered `openByItem.slice(0, 8)` with no show-all and no export — now previews 8 with an "all N" toggle plus JSON + CSV over every open item. The upstream 5,000-finding sampling stays disclosed, and the JSON export carries `rollupTruncated`/`openFindingsTotal`.
- **`AiCopyMenu` / graded variants** (PR #59): `aiVariants`/`aiCustom` on `CopyButtons` and `MatrxDataTable`, `groomerPresetVariants`, `keyFieldsAiVariant`. Live on 10 marketing surfaces + 12 non-marketing.
- **Skill rewrite done** — module-audit protocol, sized-to-data doctrine, and the MISSION/what-I-see section folded in.
- **App-wide rollout landed**: `tool-registry/mcp-admin` + `mcp-tools`, `feedback` (4 tabs + detail), `system-agents/*` (partial — gaps chipped above), `agent-apps/*` (partial — forms chipped above). None of these modules uses `MatrxDataTable`, so every addition is hand-wiring against each module's existing `format.ts`.
- **Marketing**: backlinks reference page; 11 fleet-shipped site tabs; Pages tab + all five CrawlSubnav sub-routes (the earlier "no copy layer yet" note was wrong); brands portfolio; surface manifests verified.

## Decisions needed

**None open.** Both prior items were ruled and are recorded here so they are not re-asked:

- *Org membership for the real accounts* — RULED (FOUND_DEFECTS D133, 2026-08-11): AccessGate now splits denied / deleted / missing / signed-out and names the owner; aimatrx.com moved to the shared org; the outsider test account stays memberless by design. The only remainder is a product path to move a site between orgs, tracked as open D133 — not an agent-copy concern.
- *Worktree isolation for fleets* — RULED against by CLAUDE.md § Shared checkout: one checkout, many agents, commit early and often. Do not re-propose it.
