# agent-copy rollout — data / knowledge-pipeline cluster

Module audit per the `agent-copy` skill's **module-audit protocol** (steps 1–5).
This table is emitted BEFORE any wiring; batches below are wired against it.

**Baseline coverage on `main` (verified by grep for `CopyButtons` /
`AgentCopyGroomerLauncher` / `ExportMenu` / `buildAgentPayload`):**

| Feature | Files with any agent-copy primitive | Real state |
|---|---|---|
| `features/research` | 3 | **No `CopyButtons` anywhere.** The three hits are bespoke authority-export dropdowns (`AuthorityExportButton`, `CondensedAuthorityExportButton`) + `utils/tagInputExport.ts`; they call `buildAgentPayload` directly at the callsite (the anti-pattern the primitive replaced) |
| `features/rag` | 2 | `components/search/ragAiCopy.ts` (a real, well-built bundle builder) + `LibraryDocDetailSheet` |
| `features/api-integrations` | 0 | **Pointer-only card — 0 code files.** Real MCP UI lives in `features/settings` + `features/agents` |
| `features/cms` | 0 | Nothing |

**Cluster does NOT use `MatrxDataTable`** — every list here is hand-rolled, so
the table's built-in `copy` config is unavailable and each list needs explicit
row pair + view copy + `ExportMenu`.

---

## 1. `features/research` — the pipeline (richest surface)

Routes under `app/(core)/research/`; ~30 sub-routes on `topics/[topicId]`.

| Surface (route) | Rendered element | Class | Current | Planned control |
|---|---|---|---|---|
| `topics/[topicId]` overview | `LastRunSummary` receipt lines (keywords / sources / pages / analyses / syntheses / report / cost) | **field group** | none | `xs` hover pairs + these KPIs become the cluster-wide envelope |
| `topics/[topicId]` overview | `ResultsHeroMetrics` **stat-square rail** (6 tiles, `buildHeroMetrics`) | **field group / metric cards** | none | `xs` hover pair per tile + rail-level pair |
| `topics/[topicId]` overview | **whole page** | **whole page** | none | quick pair + **`AgentCopyGroomerLauncher`** (Backlinks-style, sections = receipt · hero metrics · top sources · media · keywords · sources · analyses · syntheses) + `groomerPresetVariants` |
| `topics/[topicId]` overview | `TopSourcesGrid`, `ResultsMediaBand` | list | none | row pair + view copy + `ExportMenu` |
| `.../sources` | `SourceList` `pagedSources.map` (1819 LOC; filters, bulk bar) | **list/table** | bespoke authority export only | row pair + view copy + `ExportMenu` + `aiVariants` |
| `.../sources/[sourceId]` | `SourceDetail` | **record/detail** | none | header pair + per-field |
| `.../keywords` | `KeywordManager` `filtered.map`; **`visibleResults.map` is truncated** | **list/table** | none | row pair + view copy + `ExportMenu`; **show-all defect → fix** |
| `.../keywords` | `tiles.map` KPI rail (L709) | field group | none | `xs` pairs |
| `.../keywords/[keywordId]` | `KeywordDetailView` `synthList.map` | record + list | none | header pair + row pairs |
| `.../analysis` | `AnalysisList` / `AnalysisCard` (result clipped to 200 chars in card) | **list/table** | none | row pair + view copy + `ExportMenu` + `aiVariants` (card text is a preview, payload carries full result) |
| `.../synthesis` | `SynthesisList` — `topicSyntheses.map` + `keywordSyntheses.map`; text clipped at 20 000 chars | **list + record** | none | row pair + view copy + `ExportMenu` + **`aiCustom`** (per-synthesis char cap; 20k clip is lossy) |
| `.../synthesis` | `SynthesisVersionHistory` | list | none | row pair + view copy |
| `.../document` | `DocumentViewer`, `VersionHistory`, `VersionDiff` | **record/detail** | none | header pair + `aiVariants` |
| `.../curate` | `CurationTable` + `CurationBatchBar` | **list/table** | none | row pair + view copy + `ExportMenu` |
| `.../experts` | `TopicExperts` — **`candidate.evidence.slice(0, 2)`** | list | none | row pair + view copy + `ExportMenu`; **show-all defect → fix** |
| `.../tags`, `.../tags/[tagId]` | tag lists | list | none | row pair + view copy + `ExportMenu` |
| `.../costs` | cost breakdown | list + field group | none | view copy + `ExportMenu` |
| `.../content`, `.../media`, `.../youtube`, `.../tasks`, `.../agents` | lists | list | none | row pair + view copy + `ExportMenu` |
| `.../context` (Context Builder) | resource catalog + token cost | list | none | view copy + `ExportMenu` |
| `.../outputs` (Outputs Studio) | publishing formats | **non-record tool** | none | **SKIP** |
| overview `live-pipeline/` stage views | `active.slice(0,8)` / `completed.slice(0,24)` / `ActivityFeed` `slice(0,100)` | live telemetry | none | **SKIP for row pairs** (ephemeral stream state, not records); the *run* is captured by the page Groomer instead |
| `topics/new` wizard, `TemplatePicker` | composer | **non-record tool** | none | **SKIP** |

**Existing-payload defects (protocol step 4):** `AuthorityExportButton` and
`CondensedAuthorityExportButton` hand-roll `buildAgentPayload` at the callsite
instead of going through `CopyButtons`; they are raw-dump payloads that carry
none of the page's KPIs. Boy-scout: route them through the shared builders and
keep the existing download affordances (never remove a working feature).

---

## 2. `features/rag` — stores / sources / chunks / search

| Surface (route) | Rendered element | Class | Current | Planned control |
|---|---|---|---|---|
| `/rag/data-stores` | `list.stores.map` (L180) | **list/table** | none | row pair + view copy + `ExportMenu` |
| `/rag/data-stores` | `members.map` (L1047) — store members | **list** | none | row pair + view copy + `ExportMenu` |
| `/rag/library` | `LibraryPage` doc list | **list/table** | none | row pair + view copy + `ExportMenu` + `aiVariants` |
| `/rag/library/[id]/preview` | `LibraryPreviewPage` | **record/detail** | none | header pair |
| library detail sheet | `LibraryDocDetailSheet` | record/detail | **partial** | audit + upgrade to what-I-see |
| `/rag/viewer/[id]` | `DocumentViewer` | **record/detail** | none | header pair |
| chunks | `ChunkList` — `ChunksOnPage`, `DerivativeChunkList` (`rows.map`) | **list — MASSIVE** | none | row pair + view copy + `ExportMenu` + **`aiCustom` with a chars-per-chunk lever** |
| `/rag/search` | `RagSearchExperience` hits; `entity_map.slice(0,12)` (L1469); snippet clipped 1500 (L1916) | **list — MASSIVE** | `ragAiCopy.ts` bundle | reuse existing bundle; add `ExportMenu`; **show-all defect on entity_map → fix** |
| `/rag/search` | `RagPageReferences` — `rows.slice(0,12)` (L129), `group.chunks.slice(0,12)` (L1067) | **list** | none | row pair + view copy + `ExportMenu`; **two show-all defects → fix** |
| `/rag/hit-card` | `RagHitCard` — **`view.entities.slice(0, 8)`** (L216) | record/detail | none | header pair; **show-all defect → fix** |
| `/rag/library-catalog` | `LibraryCatalogPage` | list | none | row pair + view copy + `ExportMenu` |
| `/rag/repositories` | `RepositoriesPage` | list | none | row pair + view copy + `ExportMenu` |
| `/rag/visualization`, `/rag/flow` | `RagFlowVisualizationImpl`, `IngestFlowAnimationImpl`, `StageAnimations` | **non-record tool** (visualizer) | none | **SKIP** |
| `ProcessingProgressDialog`, `ProcessingJobView`, `ActiveJobsStrip` | job telemetry | live telemetry | none | job **record** pair only (no per-tick rows) |

---

## 3. `api-integrations` / MCP — sanitized

`features/api-integrations` is a pointer-only card (no code). Real surfaces:

| Surface | Rendered element | Class | Current | Planned control |
|---|---|---|---|---|
| `features/settings/pages/IntegrationsSettingsPage.tsx` | connection list | **list/table** | none | row pair + view copy + `ExportMenu` — **sanitized** |
| `features/settings/tabs/IntegrationsTab.tsx` | tab host | wrapper | none | delegate |
| `features/agents/components/tools-management/AgentToolsManager.tsx` | discovered tools + connections | **list/table** | none | row pair + view copy + `ExportMenu` — **sanitized** |
| `features/agents/components/diff/adapters/McpServersAdapter.tsx` | server diff | record | none | header pair — **sanitized** |

**Sanitization contract (non-negotiable).** Follow the allowlist-projection
pattern already proven in `features/tool-registry/mcp-admin/format.ts`
(`serverMeta`) and `features/tool-call-visualization/admin/mcp-tools/format.ts`
("definition metadata only; no MCP endpoint URLs, auth strategies, OAuth ids").
Payloads project an explicit field allowlist — **never spread a raw row** —
and must never emit endpoint URLs, OAuth client ids, vault credential ids, or
tokens.

> Note: the task referenced `features/tool-registry/mcp-tools/format.ts`; that
> exact path does not exist. The two real files above are the references.

**Known state:** FOUND_DEFECTS **D128** — MCP user connections have not
connected successfully since the vault cutover (all `tool.mcp_user_conn` rows
expired, zero `mcp_discovered` tools). These lists may render empty in practice;
copy controls are guarded on `length > 0`, so that is safe, but it also means
these surfaces cannot be meaningfully exercised until D128 is fixed.

---

## 4. `features/cms` — sites / pages / collections

| Surface (route) | Rendered element | Class | Current | Planned control |
|---|---|---|---|---|
| `/cms` | `sites.map` (`app/(core)/cms/page.tsx` L378) | **list/table** | none | row pair + view copy + `ExportMenu` |
| `/cms/[siteId]` | `PageListView` page list | **list/table** | none | row pair + view copy + `ExportMenu` |
| `/cms/[siteId]/collections` | `collections.map` (L351) + `PolicyBadges` | **list/table** | none | row pair + view copy + `ExportMenu` |
| `/cms/[siteId]/collections` | `SiteDataKeyCard` (masked key) | field group | masked + copy | **SKIP the key itself** — never widen; leave existing masked-copy alone |
| `/cms/[siteId]/collections/[collectionId]` | items viewer (schema-driven, CSV export exists) | **list/table** | CSV export only | row pair + view copy + **add JSON to the existing** `ExportMenu` |
| `/cms/[siteId]/pages/[pageId]` | `PageEditor` (7 URL-synced tabs: Preview/Code[HTML·CSS·JS]/Plan/SEO/Measure/Settings/History) | **record/detail** | none | header pair from **LIVE editor state** + `unsaved_changes` diff |
| `/cms/[siteId]/components` | component CRUD list | list | none | row pair + view copy + `ExportMenu` |
| `/cms/[siteId]/settings` | `SiteAdvancedSettings`, `SiteDomainSettings` | field group | none | `xs` pairs from live form state |
| `/cms/admin` | `ActivityFeedPanel`, `ApprovalsQueuePanel`, `SitePageTreePanel`, `AssetsPanel` | **list/table** ×4 | none | row pair + view copy + `ExportMenu` |
| `/cms/html-pages` | html page list | list | none | row pair + view copy + `ExportMenu` |
| `PageEditor` Preview / `CmsPageMeasure` | tool | **non-record tool** | none | **SKIP** |

---

## Shared-primitive contract (do not fork)

- `components/agent-copy/groomer-types.ts` → `groomerPresetVariants`,
  `buildGroomerPresetPayload`, `applyGroomerPreset`, `defaultGroomerSelections`
- `features/marketing/lib/copy-payloads.ts` → `keyFieldsAiVariant`, `webCopy`,
  `humanLines`, `webLocation`
- Every list gets `ExportMenu` (JSON + CSV). Truncated lists get show-all, and
  copy/export always cover **ALL** rows, never the visible slice.

## Show-all defects found (must fix while wiring)

1. `features/rag/components/hit-card/RagHitCard.tsx:216` — `entities.slice(0, 8)`
2. `features/rag/components/search/RagPageReferences.tsx:129` — `rows.slice(0, 12)`
3. `features/rag/components/search/RagPageReferences.tsx:1067` — `group.chunks.slice(0, 12)`
4. `features/rag/components/search/RagSearchExperience.tsx:1469` — `entity_map.slice(0, 12)`
5. `features/research/components/experts/TopicExperts.tsx:124` — `evidence.slice(0, 2)`
