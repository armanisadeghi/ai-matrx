# Pattern Patrol P5 — Copy everywhere

**Run:** 2026-08-12 (America/Los_Angeles)  
**Authority:** Tier R — count, rank, and report only  
**Baseline:** first run; no prior report or automation memory existed  
**Certification:** not applicable — no Tier M batch and no product-code mutation

## Outcome

- **101 confirmed missing-adoption surfaces**: 28 production `MatrxDataTable` instances without `copy`, 10 raw-JSON displays without the canonical AI payload path, and 63 production native-table instances without a canonical copy marker.
- **0 fixed.** The readiness guard requires report-only operation until P5 has a patrol-specific detector/fix recipe. The repo now has the broader `agent-copy` implementation skill, but there is still no dedicated P5 `copy-for-ai` patrol skill or detector that safely classifies lists, detail panes, and code/preformatted output.
- **Certifier verdict: NOT APPLICABLE.** No Tier M batch was created.
- Ledger: there were no open P5 hints to verify. One open P5 summary entry now points to this baseline.

The findings count is an honest floor, not an estimate of every missing list/detail affordance. Broad heuristics that cannot distinguish records from editors, visualizers, content-renderer internals, or component demos are recorded separately and are not inflated into the confirmed total.

## Scope scanned

First/full pass, required because no prior `copy-everywhere.md` existed:

- all **6,957** `.tsx` files under `app/`, `components/`, `features/`, and `lib/`;
- all **1,047** route leaves and **121** top-level feature directories for the structural baseline;
- all JSX `MatrxDataTable`, native `<table>`, `JsonInspector`, and `<pre>` instances;
- `.map(...)` list/detail heuristics, ranked only where the surface semantics were strong enough;
- canonical adoption markers: `CopyButtons`, `CopyForAiButton`/`CopyForAiIcon`, `ContentActionBar`, `AssistantActionBar`/`UserActionBar`, `MatrxDataTable.copy`, `JsonInspector.agentCopy`, and `ExportMenu`;
- all P5 ledger entries (none open before this run);
- preceding-month P5 reports and automation memory (none; cadence health cannot yet be evaluated).

The scan reflects the working tree as found. Unrelated pre-existing modifications were not changed, staged, reverted, or counted as patrol fixes.

## Adoption and detector baseline

| Signal | Current baseline | Assessment |
| --- | ---: | --- |
| `CopyButtons` importer files | 94 | canonical primitive has meaningful but partial adoption |
| `CopyForAiButton` importer files | 6 | direct AI-only primitive is intentionally narrower |
| `CopyForAiIcon` importer files | 10 | low-level icon adoption; not sufficient alone to prove both actions |
| `ContentActionBar` importer files | 18 | canonical markdown/content false-positive class |
| `MatrxDataTable` JSX instances | 111 | 75 have `copy`; 36 do not |
| Production `MatrxDataTable` gaps | 28 | confirmed after excluding 7 tests and 1 component demo |
| Native `<table>` instances | 131 | 63 confirmed gaps; 7 sit in files with canonical markers; 61 are excluded renderer/editor/demo/primitive classes |
| `JsonInspector` JSX instances | 33 | 10 confirmed gaps; 3 already pass `agentCopy`; 20 excluded after context review |
| `<pre>` instances | 504 in 338 files | broad signature only; 300 files lack a same-file canonical marker |
| `.map(...)` files | 2,883 | broad signature only; not every mapping renders copyable data |
| list/detail filename heuristic | 417 production candidates | review queue only; no safe detector exists yet |

## Rank 1 — canonical table config missing (28 findings)

These are the strongest P5 findings because `MatrxDataTable` has a documented, built-in `copy` config that supplies row/view/window/field copy, AI payloads, and export without bespoke controls.

- `features/marketing/competitors/CompetitorAutopsyWorkspace.tsx:348,369,396`
- `features/marketing/change-tracking/SeoChangeTrackingWorkspace.tsx:1639`
- `features/marketing/authority/AuthorityRouterWorkspace.tsx:619`
- `features/marketing/seo/ai-visibility/AiVisibilityWorkspace.tsx:766,790,821,846`
- `features/marketing/seo/keyword-research/components/KeywordResearchWorkbench.tsx:632`
- `features/marketing/components/backlinks/BacklinkAnchorProfile.tsx:235,252,266`
- `features/marketing/components/backlinks/ReferringDomainIntelligenceTable.tsx:285`
- `features/marketing/components/pages/SnapshotCompare.tsx:289`
- `features/marketing/components/pages/cards/PageSearchConsoleCard.tsx:262`
- `features/marketing/components/performance/SitePerformanceWorkspace.tsx:228,527,683`
- `features/marketing/components/ranks/RanksWorkspace.tsx:486,507,890`
- `features/marketing/components/settings/SiteAnalyticsCard.tsx:220`
- `features/marketing/components/operations/SeoSpendPanel.tsx:183`
- `features/marketing/components/sites/SitesPortfolio.tsx:507`
- `features/marketing/search-console/components/insights/ClassInsights.tsx:274`
- `features/marketing/search-console/components/classification/ImportExportMenu.tsx:514`
- `features/marketing/search-console/components/classification/BrandIdentityPanel.tsx:224`

Excluded from this rank: seven `MatrxDataTable.controlled.test.tsx` test instances and the official component-display demo at `app/(admin)/administration/ui/official-components/component-displays/matrx-data-table.tsx:145`.

## Rank 2 — raw JSON lacks Copy for AI (10 findings)

These `JsonInspector` surfaces display bounded record/diagnostic data and do not pass the documented `agentCopy` input or render an equivalent canonical pair at the surface.

- `features/tool-call-visualization/result-fields/ResultJson.tsx:28`
- `components/admin/server-logs/CoolifyLogViewer.tsx:1471`
- `features/rag/components/search/RagSearchExperience.tsx:2242,2247,2633`
- `features/content-ir/admin/KindRegistryAdminClient.tsx:583`
- `features/agents/route/AgentViewContent.tsx:917`
- `features/code/views/sandboxes/SandboxDiagnosticsPanel.tsx:935`
- `features/agents/components/context-slots-display/ContextValueBody.tsx:83`
- `features/window-panels/windows/agents/AgentContentWindow.tsx:505`

Excluded after context review: one `ToolTabBodies` inspector already has an adjacent canonical `CopyButtons` pair; two edit-only JSON inputs; four state/debug visualizers; one canonical structured-content renderer; six SQL/API workbench outputs explicitly excluded by the `agent-copy` skill; and six dev-demo instances.

## Rank 3 — production native tables lack canonical copy controls (63 findings)

These are rendered data tables outside the canonical table component. The rank is lower because the future fix may be conversion to `MatrxDataTable`, a shared host-level copy config, or a surface-specific canonical pair; P5 must not improvise that decision.

- `components/matrx/matrx-record-list/basic-auto-table.tsx:82`
- `features/reports/components/agent-drift/RollupTable.tsx:118`
- `features/agent-comparison/components/RunsComparisonTable.tsx:899`
- `components/diff/views/SummaryView.tsx:61`
- `components/diff/text/TextDiff.tsx:493`
- `components/diff/adapters/InlineTextDiff.tsx:146`
- `components/admin/applet-admin/AppletConfigViewer.tsx:429`
- `features/action-catalog/components/ActionCatalogGrid.tsx:149,228`
- `features/scopes/components/management/ScopesHub.tsx:364`
- `features/organizations/components/OrgModuleSettings.tsx:175`
- `features/file-analysis/content/TablesContent.tsx:103`
- `features/file-analysis/content/MetadataContent.tsx:43`
- `features/page-extraction/data-review/ExtractionCatalogClient.tsx:255`
- `features/scraper/parts/RemovalDetails.tsx:182`
- `features/cms/components/PageListView.tsx:258`
- `features/content-ir/admin/KindRegistryAdminClient.tsx:408`
- `features/content-ir/admin/KindStatusBoard.tsx:190`
- `features/content-ir/admin/KindInputsTab.tsx:365`
- `features/content-ir/admin/KindSchemaTab.tsx:125`
- `features/content-ir/admin/KindAssetsTab.tsx:377,441`
- `features/surfaces/admin-detail/SurfaceAdminDetailPage.tsx:1186`
- `features/legal/wc/pd-ratings/components/workspace/RatingBreakdownTable.tsx:315`
- `features/legal/wc/pd-ratings/components/workspace/InjuriesTable.tsx:103`
- `features/surfaces/components/SurfacesTable.tsx:165`
- `features/kg-suggestions/components/manager/SuggestionsTable.tsx:110`
- `features/admin/relationships/components/ChooserBucketsManager.tsx:75`
- `features/code/terminal/PortsTab.tsx:166`
- `features/notes/components/diff/NoteVersionHistoryPanel.tsx:556`
- `features/agent-shortcuts/components/batch/BatchGrid.tsx:100`
- `features/rag/components/library-catalog/LibraryCatalogPage.tsx:425`
- `features/podcasts/components/admin/ShowsClient.tsx:172`
- `features/podcasts/components/admin/PodcastsTable.tsx:164`
- `features/rag/components/data-stores/RichMemberTable.tsx:142`
- `features/rag/components/data-stores/DataStoresPage.tsx:1028`
- `features/rag/components/search/RagPageReferences.tsx:1110`
- `features/rag/components/library/TableRowsViewer.tsx:257`
- `features/research/components/sources/SourceResultsTable.tsx:347`
- `features/research/components/sources/SourceList.tsx:1348`
- `features/cx-dashboard/components/UsageContent.tsx:175`
- `features/research/components/curation/CurationTable.tsx:624`
- `features/research/components/costs/CostDashboard.tsx:312,402,486`
- `components/image/cloud/CloudFilesBrowserTable.tsx:265`
- `features/html-pages/components/HtmlPageListView.tsx:416`
- `app/(admin)/administration/database/sql-functions/components/SqlFunctionDetail.tsx:216`
- `features/content-manager/components/PageListView.tsx:252`
- `features/ai-models/audit/AuditOverviewTab.tsx:205`
- `features/ai-models/audit/AuditTableShell.tsx:78`
- `features/ai-models/components/DeprecatedModelsAudit.tsx:594`
- `features/ai-models/components/aliases/AliasesContainer.tsx:322`
- `features/ai-models/components/ModelUsageAudit.tsx:371`
- `features/education/classes/components/ClassProgressPanel.tsx:108`
- `features/ai-models/components/providers/ProviderTable.tsx:242`
- `features/ai-models/components/endpoints/EndpointsApisContainer.tsx:459`
- `features/ai-models/components/settings/SettingTable.tsx:187`
- `features/files/components/surfaces/desktop/FileTable.tsx:417`
- `features/files/components/core/FilePreview/previewers/DataPreview.tsx:437`
- `features/agents/components/diff/VersionHistoryTimeline.tsx:122,344`
- `features/agents/components/observational-memory/components/MemoryCostCard.tsx:178`

The remaining 61 unmarked native-table instances were excluded from the confirmed total because they are skeletons, import/edit/selection controls, debug-only panels, dev/component demos, public static comparison content, app-builder field editors, or internals of the canonical markdown/content/tool-result rendering pipelines.

## Broad review queue — not counted as findings

The first pass also measured signatures that need a real P5 detector before they can be called violations:

- **300 files** render `<pre>` without a same-file canonical marker. Many are code editors, debug output, rich-content renderer internals, or demos; the signature alone cannot decide whether the displayed value is a copyable record.
- **417 production files** match the list/detail filename heuristic, render a table/pre/JSON/map signature, and lack a same-file canonical marker. Parent-level actions, shared shells, selection lists, and composers make file-local classification unsafe.
- **2,883 files** contain `.map(...)`; raw mapping is not proof of a rendered data list.

Next P5 system work should create a dedicated detector/skill that understands canonical enclosing action bars and classifies at least: table/list, record/detail, field group/metric, whole page, markdown/content pipeline, editor/composer, visualizer, selection control, demo/test, and primitive implementation. Until then, these candidates remain visible here and Tier R must not manufacture controls from grep output.

## Structural baseline for the next run

Scan-start repository commit: `0f2075d2af66feb70cc5bccf87d39d310e20b6f7`.

- Route leaves: **1,047**; sorted-list SHA-256 `9eb3a522b7e2ae50b7f43d3b8b0b0266c4d5108cdc755b06428dc61a4982ceb3`.
- Route groups: `(admin)` 176, `(auth-pages)` 6, `(core)` 501, `(dev)` 236, `(oauth-review)` 1, `(popup)` 1, `(public)` 36, `(transitional)` 82, non-grouped 8.
- Feature directories: **121**; sorted-list SHA-256 `d25355a0e82f7df49202e002da613534940e50cd6ea45b28d52f087ee8cd197f`.
- `MatrxDataTable` signature files: 85; SHA-256 `27c17acc6655b130467c31bb4e3c2a4fbb9561683557b9fec2c8e249274f2d42`.
- Native-table signature files: 122; SHA-256 `2fd04b2f60bc33538ce037dd592ef67497313c28115d73fbcea6a54cd924c29d`.
- `JsonInspector` signature files: 27; SHA-256 `d7f81b151d993e588133a7ce27110f78393a6a69ef6285c2bb9e914d826fc301`.
- `<pre>` signature files: 345; SHA-256 `0e478cd988c85aa6ab1aea3a33c74f28b56e868618585230e92ecfa1216e6dfb`.
- `.map(...)` signature files: 2,883; SHA-256 `ca73115a8d64bf296ce8341272f7ac80511cc0399b09ea713a8fb2ca0f1d04b4`.

Reconstruct the route baseline with `git ls-tree -r --name-only 0f2075d2af66feb70cc5bccf87d39d310e20b6f7 app | rg '/page(\\.dev)?\\.tsx$' | sort`. Future non-full runs compare structural novelty, the open ledger summary, and newly matching data-surface signatures—not raw git churn. The required periodic full-pass interval is not yet specified in the P5 registry row; until it is, retain a full inventory at least monthly.

Feature-directory baseline:

```text
access-gate, action-catalog, admin, administration, agent-apps,
agent-comparison, agent-connections, agent-context, agent-settings,
agent-shortcuts, agents, ai-models, ai-runs, api-integrations, applet,
artifacts, assists, audio, auth, canvas, cms, code, code-editor, code-files,
comments, content-ir, content-manager, context-menu-v3, conversation, crm,
cx-chat, cx-conversation, cx-dashboard, dashboard, data-tables, dictionary,
dynamic-react, education, email, entitlements, expertise, feature-docs,
feedback, file-analysis, files, flashcards, gallery, google-workspace,
growth-loop, html-pages, image-manager, image-studio, industries, invitations,
item-presentation, kg-graph, kg-suggestions, knowledge, landing, legal,
marketing, math, matrx-envelope, media-capture, media-devices, memory,
message-templates, messaging, news, notes, organizations, overlays,
page-extraction, pdf, pdf-demo, pdf-extractor, podcasts, pricing, projects,
public-chat, quick-actions, rag, recipes, registered-results, reports,
request-recovery, research, resizable-panels, resource-manager, rich-document,
rich-text-editor, scheduling, scope-system, scopes, scraper, secrets,
server-logs, settings, sharing, shell, skills, sms, ssr-trials,
structured-lists, surfaces, tasks, text-counter, text-diff,
tool-call-visualization, tool-registry, transcript-studio,
transcription-cleanup, transcripts, tts, user-lists, user-profile,
voice-agent, war-room, whatsapp-clone, window-panels, workflow-emit
```

## Loop health and candidates

- No prior P5 report or automation memory exists in the preceding month. A longer cadence cannot be proposed from one run; retain the current cadence until a month of clean runs exists.
- No Tier M batch exists, so there are no rejected batches and no mutation pause.
- No recurring unregistered class was observed. The adoption gaps belong to P5 itself, so no Candidate-bench nomination was added.
- No exception was proposed or approved.

## Verification

- Required reading completed in order: patrol constitution, P5 registry row, repo doctrine, patrol skill/operator template, canonical agent-copy skill/README and named primitives, ledger, then prior report check.
- Full AST/signature inventory completed across 6,957 `.tsx` files.
- Report/source integrity check passed: all 101 ranked file/line entries still point to the expected `MatrxDataTable`, `JsonInspector`, or native `<table>` opening in the current working tree.
- Every open P5 ledger sighting was checked: none existed.
- `pnpm type-check` ran and is red on two pre-existing/concurrent product-code errors outside this report-only change: `features/marketing/components/pages/PageWorkspace.tsx:314` (three arguments passed to a two-argument function) and `features/marketing/seo/keyword-research/components/KeywordResearchWorkbench.tsx:678` (overlay close action returned where `void | Promise<void>` is required). No suppression or off-mission fix was made.
- `pnpm check:migrations` completed with one existing non-blocking drift warning for `web_audit_rollup_gone_pages.sql`; no migration was changed or applied by P5.
- `git diff --check -- .matrx/PATROL_SIGHTINGS.md .matrx/patrol-reports/copy-everywhere.md` passed.
- Product fixes: none.
- Adversarial certification: **N/A (Tier R report-only)**.
