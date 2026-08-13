# Pattern Patrol P2 — Inventory Law

**Run:** 2026-08-11 first/full pass; 2026-08-12 human-approval follow-up (America/Los_Angeles)
**Authority:** Tier C/R baseline plus one manually approved Tier M repair
**Baseline:** first run (no prior `inventory-law.md`)  
**Certification:** **CERTIFIED** — bounded fallback proof found no batch-caused defect

## Outcome

- **35 baseline findings**: 5 detector-confirmed doorless surfaces plus 30 manual conversion task units.
- **1 fixed and certified; release pending:** configured agent labels in Master Input now open the canonical agent route in a new tab.
- `pnpm check:dead-ends --rule=no-doors-in-file`: baseline 11 alerts → post-edit 10; `MasterInputWindow.tsx` cleared.
- Triage: 5 true positives, 6 verified false positives.
- `pnpm check:reuse-index`: clean; all 115 indexed paths exist.
- Ledger: no open P2 sightings existed, so there were no P2 checkboxes to change.

## Human-approval follow-up — 2026-08-12

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

## Scope scanned

First/full pass, as required because no prior report existed:

- full `app/`, `features/`, `components/`, and `lib/` detector scan;
- all 1,040 route leaves and all 121 top-level feature directories for the structural baseline;
- the Primitives Index against live importer counts;
- the standing inventory worklist, reverified against current source rather than trusted as fact;
- hand-rolled list shells, action registries, preview/window paths, and assist adoption;
- all P2 ledger entries (none open);
- preceding-month P2 reports (none; cadence health cannot yet be evaluated).

## Mechanical detector triage

### Confirmed — rank 1

1. `features/agent-comparison/components/RunsComparisonTable.tsx:912` — the comparison header names each agent but `ColumnStats` drops `agentId`. Preserve blind-test anonymity: carry the id only for revealed mode and render no identity-bearing href, peek, title, or accessible text while blind.
2. **Fixed and certified 2026-08-12:** `features/agent-comparison/components/MasterInputWindow.tsx` now uses the canonical new-tab `EntityRef` for configured agents while preserving inert unconfigured labels and mapping state.
3. `features/agents/components/context-slots-display/ContextSlotDetailSheet.tsx:170` — `summary_agent_id` is a bare id inside a side sheet. Use `EntityRef token="agent"`, preserve the full wrapping id, and open in a new tab.
4. `features/skills/components/SkillResourcesPanel.tsx:293` — every resource is a real `code_file` (`ResourceRow.id` equals the code-file id) but its filename is inert. Use `EntityRef token="code_file"`; preserve drag, edit, delete, truncation, and the skill editor’s current state.
5. `features/surfaces/components/bind/SurfaceAgentBindPanel.tsx:384` — the selected agent is inert in the bind panel, including the locked-agent case. Add the canonical agent door without changing picker/back behavior.

### False positives — excluded from the findings total

1. `features/agents/components/usages/NotifyOwnerDialog.tsx` already renders `EntityDoorControls` beside the shortened id; the detector does not recognize that canonical door primitive.
2. `features/agents/route/AgentViewContent.tsx` is the current agent’s own detail page; the id control copies the page subject rather than referring to a foreign record.
3. `features/agents/components/inputs/smart-input/RunSkillPicker.tsx` is a selection surface; its rows toggle run injection and expand descriptions. Selection controls are an explicit detector exclusion, and `skill` has no `hrefFor`.
4. `features/scopes/components/entity-context/EntityScopeTagger.tsx` is a selection/tagging surface; clicking a scope chip performs the surface’s primary action.
5. `features/code/views/library/LibraryTreeNode.tsx` gives the folder name the correct tree-node door (expand/collapse) and uses the canonical v3 context menu; `code_folder` has no detail route.
6. `features/agents/ui-first-tools/ui/lists/TaskPanel.tsx` edits a `chat.agent_task`, not the canonical task entity reached by the registry’s `task` route. Treating the ids as interchangeable would fabricate a wrong door.

## Primitive adoption baseline

Counts are live importer-file counts, excluding the primitive’s own implementation where practical:

| Primitive | Importers | Assessment |
| --- | ---: | --- |
| `EntityRef` | 77 | healthy adoption; the detector still found five real gaps |
| `EntityListPage` | 3 | strong, still drastically under-adopted (`agents`, `expertise`, `transcripts`) |
| `useAgentRowActions` | 1 | strong registry, still isolated to the canonical agent list |
| `ItemMenuConfig` | 20 | adopted unevenly; several entities still build private menus |
| `useListViewPrefs` | 11 | healthy; the four old localStorage copies are gone |
| `ResourcePeekHost` | 9 | healthy core, but the shared dialog exposes no window door |
| `hasPeek` | 3 | low direct count is expected because `EntityRef` centralizes it |
| v3 editable/non-editable context menu | 62 | healthy; old “45 consumers” worklist count is stale |
| `AssistStrip` | 8 files / 4 surface families | growing, still absent from shared empty/error primitives |
| assist producers | 7 | growing, still far below the number of explicit friction states |
| `EmptyStateCard` | 12 | shared but has no assist slot |

Stale worklist claims closed during triage:

- `EntityListPage` has 3 consumers, not 2 (`expertise` is the third).
- `useListViewPrefs` has no surviving hand-rolled list-style localStorage copies in the four named surfaces.
- the seven `features/overlays/openers/*Window` files are canonical re-export/controller façades over the hand-written window hooks, not rival implementations; do not delete them as duplicates.
- `DocumentSearch` now has a real new-tab Knowledge Search door, and `OverlayErrorFallback` now has canonical Copy/Copy-for-AI controls. Those old worklist claims are not findings.

## Ranked manual catalogue and conversion prompts

Each numbered item is one Tier-C task unit. Do not combine ranks into a big-bang refactor. Any implementation must invoke the relevant named skill and receive adversarial certification before shipping.

### Rank 1 — canonical list shell (9 findings)

1. **`/marketing/sites` — `SitesPortfolio.tsx`.** Convert the route to an `EntityListPage` config, keeping server paging/filter counts, card/table behavior, inline edit, copy payloads, and all seven site actions. Extract the site action registry first so the shell, cards, rows, and right-click share it. Verify every visible column sorts and filters server-side.
2. **`/schedules` — `ScheduleList.tsx` + `ScheduleRow.tsx`.** Build the scoped page/count/facet service required by `EntityListPage`, then replace the bespoke roster. Preserve the surface runtime scope emitter, error Retry, New schedule path, and schedule-specific status/action behavior.
3. **`/agents/sets` — `AgentSetsBrowser.tsx` + `AgentSetCard.tsx`.** Add an agent-set list config and one set action registry. Preserve Generate orchestrator/Create set dialogs, search semantics, card presentation, and the canonical `orchestratorId` identity.
4. **`/documents` — `DocumentsHubTable.tsx`.** Move the hub onto the canonical shell and its controlled table path. Preserve document-kind routing, existing `EntityRef` behavior, copy/export actions, and the persisted view mapping; do not collapse distinct document entity tokens.
5. **`/workbooks` — `app/(core)/workbooks/page.tsx`.** Extract service, columns, and row actions before adopting the shell. Preserve import/create flows and workbook-specific file handling; do not route browser-readable DB work through Python or a Next route.
6. **`/notes` — `app/(core)/notes/page.tsx`.** Replace the current `return null` with the missing note entry list. Reuse `noteMenuRegistry` and existing note row primitives; add scoped list/count/facet service so the feature home is a list rather than a forced workspace.
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

### Rank 3 — window and preview inventory (5 findings)

19. **All 19 registered peeks.** Add a canonical “Open as window” path at `features/organizations/peek/PeekDialog.tsx`/`ResourcePeekHost`, so the fourth Door Law door is available beside the work. This changes a shared overlay entry and must use the overlay/window-panel and code-splitting skills; preserve mobile Drawer/Dialog behavior and the single existing dynamic edge.
20. **Existing modal/window twins.** Convert callers of `AgentSettingsModal`, task details, and `UserTableViewer` to offer their existing `agentSettingsWindow`, `taskEditorWindow`, and `userTableWindow` twins. Preserve the modal path when it is still useful; this is additive door inventory, not a blanket swap.
21. **Agent preview direct consumers.** Route list/card quick-look entry points through the canonical agent peek/window interface. `AgentSneakPeekModal` remains the content implementation used by `AgentPeek`; remove only direct surface ownership that bypasses the registered host. Do not change its dynamic boundary without the code-splitting skill.
22. **Large blocking viewers.** Author registered WindowPanel paths for `AdvancedTranscriptViewer`, the RAG `DocumentViewer`, and `FeedbackDetailDialog`, then offer them beside the work. Keep existing mobile behavior and do not delete the blocking presentation until consumers are migrated and certified.
23. **Dead overlay/modal residue.** In a dedicated removal batch, verify and retire zero-call-site registrations (`brokerState`, `saveToNotesFullscreen`, `structuredListManagerV1Window`, `resourcePickerWindow`) and zero-import modal implementations (`AICodeEditorModal`, `ContextAwareCodeEditorModal`, `SmartCodeEditorModal`, both `ChatDebugModal` copies, plus the unconsumed `TemplatePreviewDrawer`). Use the remove-window-panel skill; this is deletion, not conversion, and needs exact registry-site verification.

### Rank 4 — assists already built but unused (7 findings)

24. **`lib/coming-soon/announce.ts`.** Extend the canonical announcement path with an intentional-action assist (“Do it with AI now”) derived from the registered promise. Keep acknowledgement-only semantics and the confirm host; do not create a second chip or accept handler.
25. **`MarketingComingSoon.tsx`.** Mount an in-place canonical assist for each reserved marketing task while keeping live sibling links and the permanent route. The assist action must be real and prefilled from the registry row.
26. **`lib/entity-list/config.tsx::emptyState`.** Add an optional canonical assist field/slot to the shared list shell so all present and future list pages can expose an AI path without forking empty-state markup.
27. **`RagSearchHits.tsx`.** Replace the zero-result instruction to rewrite/process by hand with an in-place assist that can broaden/reframe the search or launch the correct ingestion path. Keep the deterministic advice as supporting copy.
28. **`OverlayErrorFallback.tsx`.** It already has Copy/Copy-for-AI; add an intentional-action assist that actually launches a repair/debug flow from the same diagnostics payload. Keep Reset and Close as deterministic actions.
29. **Error Inspector.** Add a canonical per-error “Fix this” assist producer/action while preserving the existing Copy-for-AI export and admin-only diagnostics rules.
30. **`EmptyStateCard.tsx`.** Add an optional canonical assist slot and migrate its 12 consumers where an AI action is meaningful. Preserve existing primary/secondary buttons and do not auto-run on chip click.

## Structural baselines for the next run

The first run cannot compute novelty, so it records an exact reproducible baseline at repository commit `60d5e91a3617aab1a6cfe28efc34464b398a1428`.

- Route leaves: **1,040**; sorted-list SHA-256 `d7945e804596dc2c09f6020b232da717d7c8bba98587dcdc44c7219fcf729beb`.
- Feature directories: **121**; sorted-list SHA-256 `6551f707a6287df9ae10085dbadd379d4425bbda8c9a944a77124646ae2bd361`.
- Route groups: `(admin)` 174, `(auth-pages)` 6, `(core)` 497, `(dev)` 236, `(oauth-review)` 1, `(popup)` 1, `(public)` 35, `(transitional)` 82, non-grouped 8.
- Reconstruct the exact prior route list with `git ls-tree -r --name-only 60d5e91a3617aab1a6cfe28efc34464b398a1428 app | rg '/page(\.dev)?\.tsx$' | sort`; compare that list to the current route tree. This is structural novelty, not raw churn.
- Reconstruct feature directories from that commit’s `features/*` tree and compare only top-level directories.

Feature-directory baseline:

```text
action-catalog, admin, administration, agent-apps, agent-comparison,
agent-connections, agent-context, agent-settings, agent-shortcuts, agents,
ai-models, ai-runs, api-integrations, applet, artifacts, assists, audio, auth,
brokers, canvas, cms, code, code-editor, code-files, comments, content-ir,
content-manager, context-menu-v3, conversation, crm, cx-chat, cx-conversation,
cx-dashboard, dashboard, data-tables, dictionary, dynamic-react, education,
email, entitlements, expertise, feature-docs, feedback, file-analysis, files,
flashcards, gallery, google-workspace, growth-loop, html-pages, image-manager,
image-studio, industries, invitations, item-presentation, kg-graph,
kg-suggestions, knowledge, landing, legal, marketing, math, matrx-envelope,
media-capture, media-devices, memory, message-templates, messaging, news, notes,
organizations, overlays, page-extraction, pdf, pdf-demo, pdf-extractor,
podcasts, pricing, projects, public-chat, quick-actions, rag, recipes,
registered-results, reports, request-recovery, research, resizable-panels,
resource-manager, rich-document, rich-text-editor, scheduling, scope-system,
scopes, scraper, secrets, server-logs, settings, sharing, shell, skills, sms,
ssr-trials, structured-lists, surfaces, tasks, text-counter, text-diff,
tool-call-visualization, tool-registry, transcript-studio,
transcription-cleanup, transcripts, tts, user-lists, user-profile, voice-agent,
war-room, whatsapp-clone, window-panels, workflow-emit
```

## Loop health and candidates

- No prior P2 reports exist in the preceding month. A longer cadence cannot be proposed from one run; retain the current weekly cadence until a month of clean runs exists.
- P2 mutation resumed under isolated, baseline-delta certification. The first
  manually approved repair certified; continue routing the remaining certain,
  safe repairs through item-scoped approval.
- No new patrol candidate was nominated. The recurring classes found here are already P2 Inventory Law classes, and the hydration-mount-gate candidate was already nominated in the ledger on 2026-08-09.

## Verification

- `pnpm check:dead-ends --rule=no-doors-in-file` — completed, 11 alerts.
- Each alert was inspected in source; 5 confirmed and 6 excluded with reasons above.
- `pnpm check:reuse-index` — passed, 115 indexed paths resolve.
- `pnpm type-check` — **red with 13 existing/unrelated error lines**: 1 in the concurrently modified `active-requests.selectors.ts`, 11 across broker RPC/type files, and 1 missing `vitest` type in `packages/matrx-agents`. This patrol changed markdown only and did not suppress or repair them.
- Human-approved follow-up: primary `pnpm type-check` passed; the certifier's later rerun was red only in unrelated concurrently edited API routes. Focused ESLint and `git diff --check` passed, and the detector removed `MasterInputWindow.tsx` while the repair was present.
- Product fixes: **1** (`MasterInputWindow.tsx`).
- Certifier verdict: **CERTIFIED** under the corrected baseline-delta and
  bounded-fallback policy. No concrete batch-caused defect was found.
