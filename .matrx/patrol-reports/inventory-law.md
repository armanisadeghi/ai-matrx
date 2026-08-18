# Pattern Patrol P2 — Inventory Law

**Run:** 2026-08-18 weekly structural-novelty + full detector pass (America/Los_Angeles)
**Authority:** Tier C/R catalogue plus a bounded two-file Tier-M standing-authority repair
**Base:** `4f0e491c03460506c9ee440e0cff3140d4c3ba61`
**Candidate:** `2f491773093442f46036fe14cbb266fe79466311`
**Certification:** **CERTIFIED** — exact candidate `2f491773093442f46036fe14cbb266fe79466311`

## Outcome

- **4 detector-verified findings this run:** two bounded canonical-agent-door repairs, one blind-comparison product decision, and one skill-resource item blocked on missing populated evidence.
- **2 fixed in this run:** the summary sub-agent in `ContextPolicyDetailSheet` and selected agent in `SurfaceAgentBindPanel` now use canonical `EntityRef` doors. Both preserve the current work by opening the label in a new tab and expose the registered agent peek.
- `pnpm check:dead-ends --rule=no-doors-in-file`: **9 → 7**; both changed files cleared. The remaining seven alerts are two verified findings plus five reverified false positives.
- **30 open catalogue units:** 2 detector findings + 28 manual conversions (8 list-shell, 9 action-authority, 4 peek/window, 7 assist-adoption tasks).
- **3 total delivered repairs across P2:** the prior Master Input repair plus this run's two candidates once certified/integrated.
- `pnpm check:reuse-index` exits zero but loudly reports four stale Primitives Index paths (`services/message_templates`, its FEATURE, `services/outreach_single_send`, and its FEATURE). This is baseline documentation debt, not P2 product evidence.
- No exception was proposed or approved.

## Prior delivered repair — 2026-08-12

Arman approved a narrow repair attempt based on two concrete examples rather than approving the full catalogue.

1. **Master Input agent labels:** verified as a real dead end. The attempted repair used the canonical `EntityRef` with a new-tab route, preserved inert unconfigured columns, and deliberately disabled Quick Look after the shared preview action failed inside the floating window. Focused ESLint, `git diff --check`, `pnpm type-check`, and the dead-end detector passed in the primary run; the detector removed this file from its findings.
2. **Skill resource filenames:** excluded before shipping. A live read of `platform.associations` found zero `code_file` → `skill` resource rows, so there was no populated user surface on which to prove the change was useful and behavior-preserving. The experimental change was fully reverted.

The original reviews called the batch rejected when Quick Look failed and the
browser matrix could not finish. The certification policy was subsequently
corrected: infrastructure failure is not a product rejection, and rejection
requires a concrete batch-caused defect. The approved Master Input-only repair
was therefore recovered in an isolated worktree and recertified below.

## Recovery and certification — 2026-08-12

- Reapplied only the approved Master Input repair. Configured agent names use
  `EntityRef token="agent"` with `openInNewTab`; `disablePeek` prevents the
  previously observed broken Quick Look path in this floating window.
- Preserved inert `Unconfigured` labels, mapping values, select handlers,
  disabled behavior, and semantic styling.
- Pre-edit baseline: `pnpm type-check` passed; the P2 detector reported 11
  alerts including `MasterInputWindow.tsx`.
- Post-edit: `pnpm type-check`, focused ESLint, and `git diff --check` passed;
  the detector reported 10 alerts and no longer included Master Input.
- The adversarial certifier independently reproduced the clean delta and ran
  the canonical `EntityRef` tests (5/5 pass). Static/component proof confirmed
  `/agents/{id}`, `target="_blank"`, no Quick Look, and the unchanged
  unconfigured/mapping branches.
- One bounded representative preview attempt reached the authenticated
  dashboard, but the managed Next process died during route compilation before
  Master Input rendered. This is recorded as infrastructure limitation, not a
  product defect. Under the corrected risk-based fallback rule, the certifier
  returned **CERTIFIED** because the one-file change is non-shared,
  non-layout, and non-theme and its equivalent component/delta proof passed.
- Released from an isolated `main` checkout through `./scripts/release.sh` as
  `v0.4.550` (`9419ff9bd`). The atomic `origin/main` + tag push succeeded.
- Production verification: Vercel deployment `dpl_C9bwWNG9fJZqdhzpwnnbFQF61c45`
  built commit `9419ff9`, reached `READY`, attached the canonical
  `www.aimatrx.com` aliases, and `/agents/battle` returned HTTP 200.
- The 22-check post-push advisory suite completed: 17 checks were clean; five
  unrelated repository-wide advisory categories remained loud (agent-sync
  parser/snapshot drift, access guards, visibility vocabulary, docs guards,
  and the broader dead-end backlog). The batch-specific type, focused lint,
  diff, migration, doctrine, doc-claim, and P2 detector results stayed clean.

## Scope scanned

Weekly structural-novelty scope plus a full detector pass:

- full `app/`, `features/`, `components/`, and `lib/` detector scan;
- all 1,057 current route leaves and all 129 top-level feature directories, compared structurally with the prior exact Git-tree baseline;
- the Primitives Index against live importer counts;
- the standing inventory worklist, reverified against current source rather than trusted as fact;
- hand-rolled list shells, action registries, preview/window paths, and assist adoption;
- the open P2 ledger entry and every previously routed catalogue unit;
- the prior P2 report, permanent lifecycle projection, and automation memory.

## Mechanical detector triage

### Confirmed — current routes

1. **Human decision:** `features/agent-comparison/components/RunsComparisonTable.tsx:912` names each revealed agent but `ColumnStats` drops `agentId`. A repair must carry the id only in revealed mode and guarantee that no identity-bearing href, peek, title, or accessible text enters the blind DOM. This remains Tier C because anonymity behavior is product-sensitive.
2. **Missing evidence:** `features/skills/components/SkillResourcesPanel.tsx:293` renders a real `code_file` filename inertly, but the prior live read found zero populated `code_file` → `skill` resource associations. Keep the focused task open until a populated relationship or dedicated fixture can prove drag/edit/delete and editor-state behavior.
3. **Fixed and certified this run:** `features/agents/components/context-policies-display/ContextPolicyDetailSheet.tsx` now renders the summary sub-agent through `EntityRef`, preserves the full wrapping UUID, opens the label in a new tab, and exposes the registered agent peek.
4. **Fixed and certified this run:** `features/surfaces/components/bind/SurfaceAgentBindPanel.tsx` now renders the selected agent through `EntityRef` without changing locked/unlocked selection, mapping, scope, reset, seeding, or save behavior.
5. **Previously fixed:** `features/agent-comparison/components/MasterInputWindow.tsx` uses the canonical new-tab `EntityRef` for configured agents while preserving inert unconfigured labels and mapping state.

### False positives — excluded from the findings total

1. `features/agents/route/AgentViewContent.tsx` is the current agent’s own detail page; the id control copies the page subject rather than referring to a foreign record.
2. `features/agents/components/inputs/smart-input/RunSkillPicker.tsx` is a selection surface; its rows toggle run injection and expand descriptions. Selection controls are an explicit detector exclusion, and `skill` has no `hrefFor`.
3. `features/scopes/components/entity-context/EntityScopeTagger.tsx` is a selection/tagging surface; clicking a scope chip performs the surface’s primary action.
4. `features/code/views/library/LibraryTreeNode.tsx` gives the folder name the correct tree-node door (expand/collapse) and uses the canonical v3 context menu; `code_folder` has no detail route.
5. `features/agents/ui-first-tools/ui/lists/TaskPanel.tsx` edits a `chat.agent_task`, not the canonical task entity reached by the registry’s `task` route. Treating the ids as interchangeable would fabricate a wrong door.

## Primitive adoption baseline

Counts are live importer-file counts, excluding the primitive’s own implementation where practical:

| Primitive | Importers | Assessment |
| --- | ---: | --- |
| `EntityRef` | 127 | healthy growth from 77; this pass still found two bounded gaps and two routed gaps |
| `EntityListPage` | 9 surface consumers / 22 referencing files | strong growth from 3; the eight older bespoke hubs below remain |
| `useAgentRowActions` | 2 | strong registry, still isolated to canonical agent browse consumers |
| `ItemMenuConfig` | 34 | adopted unevenly; several entities still build private menus |
| `useListViewPrefs` | 16 | healthy; the four old localStorage copies remain gone |
| `ResourcePeekHost` | 13 | healthy core, but the shared dialog still exposes no window door |
| `hasPeek` | 3 | low direct count is expected because `EntityRef` centralizes it |
| v3 editable/non-editable context menu | 77 | healthy growth; old “45 consumers” worklist count is stale |
| `AssistStrip` | 28 referencing files | growing, still absent from shared empty/error primitives |
| assist-producer signatures | 10 files | growing, still below the number of explicit friction states |
| `EmptyStateCard` | 2 consumers | shared but still has no assist slot |

Stale worklist claims closed during triage:

- `EntityListPage` now has 9 surface consumers, not the prior report's 3; new adoption includes `ai-work`, `masterwork`, and `vision-interview`.
- `useListViewPrefs` has no surviving hand-rolled list-style localStorage copies in the four named surfaces.
- the seven `features/overlays/openers/*Window` files are canonical re-export/controller façades over the hand-written window hooks, not rival implementations; do not delete them as duplicates.
- `DocumentSearch` now has a real new-tab Knowledge Search door, and `OverlayErrorFallback` now has canonical Copy/Copy-for-AI controls. Those old worklist claims are not findings.
- `/notes` is not a missing list: its route page intentionally returns `null` because the route layout renders `NotesRouteBody` and the complete `NotesView`. The prior catalogue item was factually wrong and is removed.
- zero-import overlays are not automatically “dead residue.” Under the Unfinished Work Alarm they route to the `check:unwired` finish-the-wiring workflow unless Arman explicitly retires them. The prior deletion item was doctrinally invalid and is removed from P2.

## Ranked manual catalogue and conversion prompts

Each numbered item is one Tier-C task unit. Do not combine ranks into a big-bang refactor. Any implementation must invoke the relevant named skill and receive adversarial certification before shipping.

### Rank 1 — canonical list shell (8 open findings)

1. **`/marketing/sites` — `SitesPortfolio.tsx`.** Convert the route to an `EntityListPage` config, keeping server paging/filter counts, card/table behavior, inline edit, copy payloads, and all seven site actions. Extract the site action registry first so the shell, cards, rows, and right-click share it. Verify every visible column sorts and filters server-side.
2. **`/schedules` — `ScheduleList.tsx` + `ScheduleRow.tsx`.** Build the scoped page/count/facet service required by `EntityListPage`, then replace the bespoke roster. Preserve the surface runtime scope emitter, error Retry, New schedule path, and schedule-specific status/action behavior.
3. **`/agents/orchestras` — `OrchestrasBrowser.tsx` + `OrchestraCard.tsx`.** Add an Orchestra list config and one Orchestra action registry. Preserve Generate orchestrator/Create Orchestra dialogs, search semantics, card presentation, and the canonical `orchestratorId` identity.
4. **`/documents` — `DocumentsHubTable.tsx`.** Move the hub onto the canonical shell and its controlled table path. Preserve document-kind routing, existing `EntityRef` behavior, copy/export actions, and the persisted view mapping; do not collapse distinct document entity tokens.
5. **`/workbooks` — `app/(core)/workbooks/page.tsx`.** Extract service, columns, and row actions before adopting the shell. Preserve import/create flows and workbook-specific file handling; do not route browser-readable DB work through Python or a Next route.
7. **`/projects` — `ProjectsHub.tsx`.** Plan this as a large conversion: inventory its 1,445 lines, preserve org/personal scope, inline edits, view preferences, and project actions, then move shared behavior into config/service/registry seams before deleting the bespoke shell.
8. **`/files/all` — `FileTable`/grid/list.** Do not flatten the hierarchy blindly. First decide and build the canonical shell seam for hierarchical folder navigation, then have table/grid/list consume one file/folder action registry and one server-scoped service.
9. **`/crm` — `CrmListPage.tsx`.** Prerequisites first: add the canonical scoped page/count/facet RPC trio, shell `presentation` support, the surface-runtime slot, and the non-scope segmented-control seam. Only then replace the bespoke page. Preserve People/Companies, archive/trash semantics, inline edit, and agent surface values.

### Rank 2 — one action authority per entity (9 findings)

10. **`AgentListDropdown.tsx`.** It now has 45 importing surfaces and still does not consume `useAgentRowActions`. Decide the singleton-host contract first (page-owned host or provider); do not instantiate dialog hosts per row/dropdown. Adapt its row shape, then feed the canonical registry without changing selection behavior.
11. **`AgentActionModal.tsx`.** Replace its seven hard-coded actions with the same canonical agent menu used by table/cards/rows. Preserve the modal as a chooser when that is the primary click; delete only actions made redundant by the registry.
12. **`SitesPortfolio.tsx` + `PlanSitesList.tsx`.** Build one `buildSiteMenu`/`useSiteRowActions` authority. Keep each surface’s unique section (portfolio management vs plan navigation) while sharing copy, Copy for AI, edit, delete, peek, and live-site actions. Mount dialog hosts once.
13. **`CrmListPage.tsx`.** Extract its inline `ItemMenuConfig` into the CRM entity registry created with the list-shell conversion; table, cards, rows, and right-click must consume the same config.
14. **`KeywordResearchWorkbench.tsx`.** Extract the inline menu builder into a keyword-research entity action registry and reuse it from every keyword row presentation; retain workbench-only actions as an appended section.
15. **`SiteKeywordPerformanceWorkspace.tsx`.** Extract `rowMenuConfig` into the same keyword/site-performance authority used by sibling performance surfaces; verify action availability against server capabilities.
16. **Three message registries.** Consolidate `features/agents/.../message-options/messageActionRegistry.ts` (2,004 lines), `features/cx-chat/actions/messageActionRegistry.ts` (710), and `features/messaging/actions/messageActionRegistry.tsx` (205). Inventory unique actions first, choose the production chat registry as the core, add adapters for genuinely different message shapes, then delete overlapping implementations.
17. **File/folder actions.** Inventory the four current vocabularies (including the 29-item `FileContextMenu`) and build one file/folder `ItemMenuConfig` authority. Table, grid, list, right-click, and picker contexts may filter/append actions but may not privately reimplement them.
18. **Parallel action schemas.** Convert `components/generic-table/GenericDataTable.tsx::ActionConfig` and `tool-call-visualization/.../_shared-entity/EntityCard.tsx::EntityAction` to thin adapters over the canonical item action model where behavior overlaps. Preserve tool-result card presentation; do not force actions that are not record actions.

### Rank 3 — window and preview inventory (4 open findings)

19. **All 19 registered peeks.** Add a canonical “Open as window” path at `features/organizations/peek/PeekDialog.tsx`/`ResourcePeekHost`, so the fourth Door Law door is available beside the work. This changes a shared overlay entry and must use the overlay/window-panel and code-splitting skills; preserve mobile Drawer/Dialog behavior and the single existing dynamic edge.
20. **Existing modal/window twins.** Convert callers of `AgentSettingsModal`, task details, and `UserTableViewer` to offer their existing `agentSettingsWindow`, `taskEditorWindow`, and `userTableWindow` twins. Preserve the modal path when it is still useful; this is additive door inventory, not a blanket swap.
21. **Agent preview direct consumers.** Route list/card quick-look entry points through the canonical agent peek/window interface. `AgentSneakPeekModal` remains the content implementation used by `AgentPeek`; remove only direct surface ownership that bypasses the registered host. Do not change its dynamic boundary without the code-splitting skill.
22. **Large blocking viewers.** Author registered WindowPanel paths for `AdvancedTranscriptViewer`, the RAG `DocumentViewer`, and `FeedbackDetailDialog`, then offer them beside the work. Keep existing mobile behavior and do not delete the blocking presentation until consumers are migrated and certified.

### Rank 4 — assists already built but unused (7 findings)

24. **`lib/coming-soon/announce.ts`.** Extend the canonical announcement path with an intentional-action assist (“Do it with AI now”) derived from the registered promise. Keep acknowledgement-only semantics and the confirm host; do not create a second chip or accept handler.
25. **`MarketingComingSoon.tsx`.** Mount an in-place canonical assist for each reserved marketing task while keeping live sibling links and the permanent route. The assist action must be real and prefilled from the registry row.
26. **`lib/entity-list/config.tsx::emptyState`.** Add an optional canonical assist field/slot to the shared list shell so all present and future list pages can expose an AI path without forking empty-state markup.
27. **`RagSearchHits.tsx`.** Replace the zero-result instruction to rewrite/process by hand with an in-place assist that can broaden/reframe the search or launch the correct ingestion path. Keep the deterministic advice as supporting copy.
28. **`OverlayErrorFallback.tsx`.** It already has Copy/Copy-for-AI; add an intentional-action assist that actually launches a repair/debug flow from the same diagnostics payload. Keep Reset and Close as deterministic actions.
29. **Error Inspector.** Add a canonical per-error “Fix this” assist producer/action while preserving the existing Copy-for-AI export and admin-only diagnostics rules.
30. **`EmptyStateCard.tsx`.** Add an optional canonical assist slot and migrate its two current consumers where an AI action is meaningful. Preserve existing primary/secondary buttons and do not auto-run on chip click.

## Structural novelty and next baseline

Compared the exact route and top-level feature inventories at the prior baseline commit `60d5e91a3617aab1a6cfe28efc34464b398a1428` with this run's base. This is structural novelty, not raw source churn.

- Route leaves: **1,057 current** versus 1,040 prior; **92 added / 75 removed**. Current sorted-list SHA-256: `e9cde32a067bf14e6a6b93fed58b149588d3807f73582bbf6551f7e85effea7e`.
- Feature directories: **129 current** versus 121 prior; **13 added / 5 removed**. Current sorted-list SHA-256: `98ac1f953179a47d1869a5b7c9612d36b3dc60aafe0dd4f618f9bcdf264e7c64`.
- Added features: `access-gate`, `ai-work`, `change-policy`, `directive-catalog`, `github-integration`, `hindsight`, `masterwork`, `matrx-local-download`, `purpose`, `review-walk`, `source-onboarding`, `vision-interview`, `workflow-runtime`.
- Removed features: `action-catalog`, `applet`, `brokers`, `content-manager`, `expertise`.
- Current route groups: `(admin)` 182, `(auth-pages)` 6, `(core)` 555, `(dev)` 234, `(oauth-review)` 1, `(popup)` 1, `(public)` 44, `(transitional)` 26, non-grouped 8.
- The prior report's feature hash was not reproducible because its recipe did not read the `features` tree object correctly. The reproducible prior count is still 121, with sorted hash `55eb39f6c3ec0c300fe39d18884dde94665eee90e99d92b1527959b2ee998c7b` from `git ls-tree -d --name-only <sha>:features | sort`.

Structural surface-signature review found no new clearly poorer duplicate outside the existing catalogue. The added feature set contains strong canonical adoption: `ai-work`, `masterwork`, and `vision-interview` consume `EntityListPage`; `change-policy` and `workflow-runtime` consume `MatrxDataTable`; `access-gate`, `review-walk`, `ai-work`, and `masterwork` consume canonical entity doors; `masterwork` also consumes assists and v3 context menus. Custom tables in directive-catalog/hindsight are comparison or aggregate displays rather than interchangeable entity lists.

## Loop health and candidates

- This is the second scheduled P2 pass. The patrol still has 30 routed catalogue units, so retain the weekly cadence.
- The two unambiguous canonical-door repairs executed under standing authority and certified. The remaining detector findings are correctly separated into one genuine product decision and one missing-evidence task rather than a generic report-only bucket.
- No new patrol candidate was nominated. The recurring classes found here are already P2 Inventory Law classes, and the hydration-mount-gate candidate was already nominated in the ledger on 2026-08-09.
- **Recursive learning:** structural baselines must store the exact feature-list reconstruction command (`git ls-tree <sha>:features`) rather than only a count/hash; the previous hash was not reproducible even though its count was right.

## Verification

- `pnpm check:patrol-contracts` — passed: 12 product patrols plus live automation configuration match the typed manifest.
- `pnpm check:dead-ends --rule=no-doors-in-file` — full pass completed over 6,866 files; **9 → 7** after the batch. Each baseline alert was inspected; 4 were verified and 5 excluded with exact reasons.
- Focused detector on both changed files — zero findings and zero exceptions.
- `pnpm type-check` — red before and after on the same unrelated `context_slots` / `shared_context_slots` schema-migration debt; neither changed file appears.
- Focused ESLint — `ContextPolicyDetailSheet` clean; `SurfaceAgentBindPanel` retains two pre-existing `set-state-in-effect` errors at unchanged lines 186/211. No candidate-line lint issue.
- `pnpm exec jest components/official/entity-ref/__tests__/entity-ref-doors.test.tsx --runInBand` — **5/5 passed**.
- `git diff --check` — passed.
- Preview/browser proof was not run because another checkout owns the enforced lease; the candidate did not reuse it. The certifier found the bounded static/component proof sufficient for these non-layout, non-theme references.
- Product fixes this run: **2**.
- Independent verdict for exact candidate `2f491773093442f46036fe14cbb266fe79466311`: **CERTIFIED**. No concrete batch-caused defect was found.
