# Kind → frontend component ledger

**Mission (Army: FE kind component routes).** Every ACTIVE, non-contract-artifact kind in
`content_ir.kind_definition` must have a REGISTERED frontend route — a
`content_ir.kind_component` row for `(kind_definition_id, platform='web', role='output')`.
No kind may reach the generic viewer by *silent fallback*
(`applyIrKindRoute` → `routeToGeneric`, marker `by:'generic', unverified:true`). Where no
bespoke component is warranted, the generic structured renderer is registered as an
**EXPLICIT basic route** (`component_key='generic_structured'`, `source='bundled'`,
`is_active=true`) — the resolver then answers `by:'db'` and the shape is claimed on purpose.

Canonical spec: `common-docs/systems/content-ir-system/KINDS_EVERYWHERE_PLAN.md` (§4, §6, §9,
§12, and the *wire-is-block* finding). Precedent to copy exactly:
[`migrations/content_ir_generic_structured_roots.sql`](../migrations/content_ir_generic_structured_roots.sql).

## Counts (live, refresh on every edit)

- Active non-contract-artifact kinds: **211**
- Already routed (web/output row exists): **211** — live recount 2026-08-20
- **Missing a route: 0** ✅ every active non-contract-artifact kind now resolves a registered `(kind,'web','output')` component — no kind reaches a reader by silent fallback.
- Individual rows (46 total): unclaimed **0** · claimed **0** · done **45** · blocked **1** · plus the 83-kind `web_*_v1` family row (copy-C, **done**) — recounted from the rows 2026-08-20 by army-fe-wd1 after flipping the last 8 (the SEO cluster). Re-counted 2026-08-20 by army-fe-wd2 after folding the malformed stray `markdown` row (added by `86f3863d4`, appended after the change log and mis-columned) into this table. **Every individual row is now `done` except the one `blocked` row (`claim_evidence`, blocked on its EXAMPLE, not its route).**

**Companion gap — `role='input'` (found by copy-C, live recount 2026-08-20):** **66** active
non-contract-artifact kinds have no `(kind,'web','input')` row. For the `agent_io` (16) and
`workflow_io` (12) machine-contract families that absence is CORRECT by classification
(`decideKindInputPath` refuses them on `dataOnly` regardless of any row). The other **38**
— 25 unfamilied, 8 `search`, 4 `primitive`, 1 `structured_output` — are candidates for the
same gap copy-C fixed for `web_analysis_item`: the compiled input floor only reaches COMPILED
kinds, so a DB-registered kind's `/shapes/<kind>/test` refuses, and for a kind with no
canonical example that is the only way to verify its route. Check `role='input'` when you
claim rows; do not blanket-insert (verify the kind is not a machine contract first).

> Contract artifacts are **EVICTED, not merely quarantined** (2026-08-20). All 986 rows moved
> to `content_ir.io_contract` and were soft-deleted out of `content_ir.kind_definition`
> (KINDS_EVERYWHERE_PLAN.md §10b item 5), so they no longer appear in any count here and
> cannot be claimed. Do not register routes for them — a type signature has no renderer.

## Rules for every agent working this ledger

1. **Claim before you work. Push the claim immediately — the push IS the lock.** If your push
   is rejected, `git pull --rebase` and claim rows nobody took in the meantime.
2. **Claim ≤ 8 rows.** A **family row** (a set of kinds proven to share ONE shape and therefore
   ONE component) counts as a single row — splitting a family across agents produces N
   conflicting components and is forbidden.
3. **Reuse → Extend → Compose → Create.** Search for a component that already renders the
   family before writing one. State what you searched in your summary.
4. **Explicit, never silent.** A kind you decide needs no bespoke view still gets a real
   `kind_component` row pointing at `generic_structured`.
5. **Nested kinds render by recursion through the registry** — never hand-render a child kind.
6. **Verify for real:** the kind's canonical `content_ir.kind_example` rendered through
   `KindInstanceRender`. A kind with **0 examples** needs its canonical example authored first
   (validated against the LIVE `emitted_json_schema` via `validateStructuralLeg`, with a
   negative control) — same as the precedent migration.
7. **`pnpm type-check` clean** and `features/content-ir` tests green before you flip a row to
   `done`.
8. **NO LEGACY.** A bespoke display of the same data gets repointed at the registered route and
   **deleted**. If deletion needs a ruling, mark the row `blocked` and write ONE line why.
9. **Maturity is NOT promoted by this work.** `metadata.maturity` stays exactly as it is —
   `placeholder` stays `placeholder`. Only the separate verification pass awards `verified`.
10. Kind resolution lives ONLY in `features/content-ir/core/kind-parser.ts`. Do not add a
    second resolver anywhere.

Status vocabulary: `unclaimed` · `claimed` · `done` · `blocked`.

---

## Family rows

A family is one shape ⇒ one component ⇒ one claim.

| Family | Kinds | Shared shape | Component | Claim | Status |
|---|---|---|---|---|---|
| `web_*_v1` — site-audit check results (`metadata.family = 'web_analysis_item'`) | 83 | `summary`, `checked`, `issues_found`, `evidence[]`, `recommendations[]` (+ per-check scalars) — verified identical core across all 83 | `web_analysis_item` | **copy-C** | **done** ✅ |

### Family: `web_*_v1` site-audit check results — DONE (copy-C, 2026-08-20)

copy-D claimed this family, found it already in flight, and released it; copy-C owned and
finished it. **All 83 kinds now carry an ACTIVE `(kind,'web','output')` row pointing at
`web_analysis_item`** — verified live in the registry, not from an apply report.

- **Component:** [`components/mardown-display/blocks/web-analysis/WebAnalysisItemBlock.tsx`](../components/mardown-display/blocks/web-analysis/WebAnalysisItemBlock.tsx),
  wired into `block-dispatch.tsx` (`ShapeBlockType` + `SHAPE_BLOCK_DISPATCH` + the
  FE-synthesized list in its test). It contributes only the audit verdict, the check name
  (derived from the kind slug — no 83 hardcoded titles), and the fix list; evidence and prose
  reuse `ResultValue` / `ResultMarkdown`.
- **Guard:** [`features/content-ir/__tests__/kind-web-analysis-item-family.test.tsx`](../features/content-ir/__tests__/kind-web-analysis-item-family.test.tsx)
  — proves the before/after (silent `by:'generic'` → registered `by:'db'`), a failing check,
  a passing check, ragged evidence, and the never-swallow backstop.
- **Live verification:** `/shapes/web_broken_images_v1/test`, rendered through the real
  production path (2026-08-20).

**Two findings from this family, both acted on:**

1. **The `role='input'` floor does not reach DB-registered kinds.** The compiled bootstrap
   (`features/content-ir/registry/system-components.ts`) gives EVERY compiled kind a
   `role='input'` / `generic_structured` row, so `/shapes/<kind>/test` works. Kinds that live
   only in the DB get nothing, and the Test tab refuses — *"No input component is registered …
   add the kind_component row, never a guessed form."* For a kind with **no canonical example**
   that surface is the ONLY way to verify a route, so the gap blocks verification outright.
   copy-C registered the same D1 floor row for all 83 (they are honest data kinds, not
   data-only machine contracts). ⚠️ **The same gap almost certainly affects every other
   DB-registered kind in this ledger** — check `role='input'` when you claim rows.
2. **Media-shaped evidence rendered as a wall of failed-load boxes.** `detectResultShape`
   embeds any image-extension URL as media, so a *broken images* audit — where every evidence
   URL is broken by definition — filled the table with red "Image failed to load" panels and
   buried the finding. Fixed at the seam: `detectResultShape` / `ResultValue` / `ResultTable` /
   `KeyValueGrid` gained an **`embedMedia` opt-out (default `true`, nothing else changes)**;
   the family component passes `false`, so an evidence URL renders as a chip that still opens
   it. Our own signed storage URLs stay on the media path on purpose.

**Still open for this family (NOT copy-C's lane):**

- **No canonical examples.** None of the 83 carries a `kind_example` row or `sample_data`.
  The route and component are proven against schema-derived payloads, which is enough for a
  ROUTE and explicitly **not** enough for `verified` maturity. Maturity was not promoted.
- Spun off as a chip: in a results table where every row shares a host, `UrlChip` renders
  identical domain-only labels, so evidence rows cannot be told apart.

| Kind | Label |
|---|---|
| `web_a11y_lab_basics_v1` | Accessibility Basics (Lab) Result |
| `web_anchor_text_descriptiveness_v1` | Anchor Text Descriptiveness Result |
| `web_asset_delivery_v1` | Asset Delivery Optimization Result |
| `web_broken_external_links_v1` | Broken External Links Result |
| `web_broken_images_v1` | Broken Images Result |
| `web_broken_internal_links_v1` | Broken Internal Links Result |
| `web_broken_page_4xx_v1` | Broken Pages (4xx) Result |
| `web_caching_policy_v1` | Static Asset Caching Result |
| `web_canonical_conflicts_v1` | Canonical Conflicts Result |
| `web_canonical_presence_v1` | Canonical Tag Presence & Validity Result |
| `web_content_depth_v1` | Content Depth & Word Count Result |
| `web_content_freshness_v1` | Content Freshness Result |
| `web_content_quality_eeat_v1` | Content Quality & E-E-A-T Signals (AI) Result |
| `web_crawl_depth_v1` | Crawl Depth from Home Result |
| `web_cwv_cls_v1` | Cumulative Layout Shift (Lab) Result |
| `web_cwv_inp_tbt_v1` | Interactivity - TBT/INP Proxy (Lab) Result |
| `web_cwv_lcp_v1` | Largest Contentful Paint (Lab) Result |
| `web_duplicate_content_exact_v1` | Exact Duplicate Pages Result |
| `web_excessive_outlinks_v1` | Excessive On-Page Links Result |
| `web_grammar_spelling_v1` | Grammar & Spelling (AI) Result |
| `web_gsc_ctr_opportunity_v1` | GSC CTR Opportunity Result |
| `web_gsc_index_coverage_v1` | GSC Index Coverage Result |
| `web_gsc_keyword_cannibalization_v1` | GSC Keyword Cannibalization Result |
| `web_gsc_performance_decay_v1` | GSC Performance Decay Result |
| `web_h1_presence_v1` | H1 Presence & Uniqueness Result |
| `web_heading_hierarchy_v1` | Heading Hierarchy & Structure Result |
| `web_host_protocol_consistency_v1` | Host & Protocol Consistency Result |
| `web_hreflang_reciprocity_v1` | Hreflang Return Tags Result |
| `web_hreflang_validity_v1` | Hreflang Validity Result |
| `web_hsts_policy_v1` | HSTS Policy Result |
| `web_html_lang_validity_v1` | HTML Lang Attribute Result |
| `web_https_enforcement_v1` | HTTPS Enforcement Result |
| `web_image_alt_presence_v1` | Image Alt Text Presence Result |
| `web_image_alt_quality_v1` | Image Alt Text Quality (AI) Result |
| `web_image_dimension_attrs_v1` | Image Dimension Attributes Result |
| `web_image_lazy_loading_v1` | Image Lazy Loading Result |
| `web_image_modern_format_v1` | Modern Image Formats Result |
| `web_image_oversized_v1` | Oversized Images Result |
| `web_internal_inlink_coverage_v1` | Internal Inlink Coverage Result |
| `web_internal_link_equity_v1` | Internal Link Equity Distribution Result |
| `web_internal_redirect_links_v1` | Internal Links to Redirects Result |
| `web_intrusive_interstitials_v1` | Intrusive Interstitials (AI Vision) Result |
| `web_keyword_topical_coverage_v1` | On-Page Keyword & Topical Coverage (AI) Result |
| `web_local_business_markup_v1` | Local Business & Organization Markup Result |
| `web_meta_description_duplication_v1` | Duplicate Meta Descriptions Result |
| `web_meta_description_length_v1` | Meta Description Length Result |
| `web_meta_description_presence_v1` | Meta Description Presence Result |
| `web_meta_refresh_redirect_v1` | Meta Refresh & JS Redirects Result |
| `web_meta_robots_conflicts_v1` | Meta Robots & X-Robots Directives Result |
| `web_mixed_content_v1` | Mixed Content Result |
| `web_mobile_render_quality_v1` | Mobile Render Quality (AI Vision) Result |
| `web_mobile_usability_lab_v1` | Mobile Usability (Lab) Result |
| `web_near_duplicate_content_v1` | Near-Duplicate Content Result |
| `web_nofollow_internal_links_v1` | Nofollowed Internal Links Result |
| `web_og_image_validity_v1` | Social Share Image Validity Result |
| `web_orphan_pages_v1` | Orphan Pages Result |
| `web_page_weight_v1` | Total Page Weight Result |
| `web_pagination_markup_v1` | Pagination Markup Result |
| `web_readability_v1` | Readability Result |
| `web_redirect_chain_v1` | Redirect Chains Result |
| `web_redirect_loop_v1` | Redirect Loops Result |
| `web_robots_txt_health_v1` | Robots.txt Health Result |
| `web_search_intent_alignment_v1` | Search Intent Alignment (AI) Result |
| `web_security_headers_v1` | Security Headers Result |
| `web_serp_snippet_quality_v1` | SERP Snippet Quality (AI) Result |
| `web_server_error_5xx_v1` | Server Errors (5xx) Result |
| `web_sitemap_coverage_v1` | Sitemap vs Crawl Coverage Result |
| `web_sitemap_health_v1` | XML Sitemap Health Result |
| `web_social_meta_completeness_v1` | Open Graph & Twitter Card Completeness Result |
| `web_soft_404_detection_v1` | Soft 404 Detection Result |
| `web_structured_data_coverage_v1` | Structured Data Coverage (AI) Result |
| `web_structured_data_validity_v1` | Structured Data Validity Result |
| `web_temporary_redirect_usage_v1` | Temporary Redirect Usage (302/307) Result |
| `web_text_html_ratio_v1` | Text-to-HTML Ratio Result |
| `web_thin_content_v1` | Thin Content Result |
| `web_title_duplication_v1` | Duplicate Titles Across Pages Result |
| `web_title_keyword_alignment_v1` | Title Keyword Alignment Result |
| `web_title_length_v1` | Title Length & Truncation Result |
| `web_title_presence_v1` | Title Tag Presence Result |
| `web_tls_certificate_v1` | TLS Certificate Health Result |
| `web_ttfb_server_response_v1` | Server Response Time (TTFB) Result |
| `web_url_design_quality_v1` | URL Design Quality Result |
| `web_viewport_meta_v1` | Viewport Meta Tag Result |

---

## Individual rows (46)

`Ex` = canonical `kind_example` count; **0 means you must author one first.**

| Kind | Label | Maturity | Ex | Component | Status | Claim | Notes |
|---|---|---|---|---|---|---|---|
| `boolean` | Boolean | — | 1 | `generic_structured` | **done** | copy-D | explicit basic route; live + tested |
| `branch_result` | Branch Result | — | 1 | `generic_structured` | done | copy-B | explicit basic route LIVE (copy-B, migrations/content_ir_workflow_result_output_routes.sql) — no kind reaches the reader by silent fallback any more. copy-E claimed these for an engine-result family component AFTER the route landed; that work is an UPGRADE of component_key on these same rows, not a new registration. |
| `bulk_result` | Bulk Result (partial-failure batch) | — | 1 | `generic_structured` | done | copy-B | explicit basic route LIVE (copy-B, migrations/content_ir_workflow_result_output_routes.sql) — no kind reaches the reader by silent fallback any more. copy-E claimed these for an engine-result family component AFTER the route landed; that work is an UPGRADE of component_key on these same rows, not a new registration. |
| `claim_evidence` | Claim Evidence | — | 0 | `generic_structured` | blocked | copy-B | ROUTE IS LIVE (renders, incl. nested `evidence_source`). Blocked on the EXAMPLE only. **The producer-side defect is FIXED 2026-08-21** — its `emitted_json_schema` referenced `#/$defs/EvidenceSource` with no `$defs` block, so it could not compile; repaired from the pydantic contract by `aidream/scripts/repair_dangling_kind_defs.py` and verified live (a real payload validates, a missing `sourceTitle` is rejected). The schema can now be validated against, so the canonical example is authorable — this row is unblocked WORK, no longer a defect. |
| `competitor_opportunity_autopsy_v1` | Competitor Opportunity Autopsy | — | 1 | `generic_structured` | **done** | army-fe-wd1 | explicit basic route LIVE + verified in the registry (migration by copy-D; claim taken over and verified by army-fe-wd1). `role='input'` correctly absent — `metadata.family='agent_io'` ⇒ `dataOnly` refuses first. |
| `competitor_page_autopsy_v1` | Competitor Page Autopsy | — | 1 | `generic_structured` | **done** | army-fe-wd1 | explicit basic route LIVE + verified in the registry (migration by copy-D; claim taken over and verified by army-fe-wd1). `role='input'` correctly absent — `metadata.family='agent_io'` ⇒ `dataOnly` refuses first. |
| `criteria_gate_result` | Criteria Gate Result | — | 1 | `generic_structured` | done | copy-B | explicit basic route LIVE (copy-B, migrations/content_ir_workflow_result_output_routes.sql) — no kind reaches the reader by silent fallback any more. copy-E claimed these for an engine-result family component AFTER the route landed; that work is an UPGRADE of component_key on these same rows, not a new registration. |
| `digital_pr_reputation_brief_v1` | Digital PR & Reputation Brief | — | 1 | `generic_structured` | **done** | army-fe-wd1 | explicit basic route LIVE + verified in the registry (migration by copy-D; claim taken over and verified by army-fe-wd1). `role='input'` correctly absent — `metadata.family='agent_io'` ⇒ `dataOnly` refuses first. |
| `entity_mention` | Entity Mention | — | 1 | `generic_structured` | done | copy-B | explicit basic route; canonical example authored + validated where it was missing |
| `evidence_source` | Evidence Source | — | 1 | `generic_structured` | done | copy-B | explicit basic route; canonical example authored + validated where it was missing |
| `gather_result` | Gather Result | — | 1 | `generic_structured` | done | copy-B | explicit basic route LIVE (copy-B, migrations/content_ir_workflow_result_output_routes.sql) — no kind reaches the reader by silent fallback any more. copy-E claimed these for an engine-result family component AFTER the route landed; that work is an UPGRADE of component_key on these same rows, not a new registration. |
| `gsc_site_intake_bundle` | GSC Site Intake Bundle | — | 1 | `generic_structured` | **done** | copy-D | explicit basic route; live + tested |
| `gsc_site_intake_proposal` | GSC Site Intake Proposal | — | 1 | `generic_structured` | **done** | copy-D | explicit basic route; live + tested |
| `http_response` | HTTP Response | — | 1 | `generic_structured` | done | copy-B | explicit basic route; canonical example already present and rendered in verification |
| `items` | Items (list result) | — | 1 | `generic_structured` | **done** | copy-D | explicit basic route; live + tested |
| `json` | JSON (any value) | — | 1 | `generic_structured` | **done** | copy-D | explicit basic route; live + tested |
| `keyword_classification_batch_v1` | SEO Keyword Classification Batch | — | 1 | `keyword_classification_batch` | **done** | army-fe-wd1 | registry lie corrected: the row now names the REAL component the compiled bridge already renders (`KeywordClassificationBatchBlock`). LIVE + verified (migration by copy-D; verified by army-fe-wd1). `role='input'` correctly absent — `agent_io` ⇒ `dataOnly` refuses first. |
| `map_result` | Map Result | — | 1 | `generic_structured` | done | copy-B | explicit basic route LIVE (copy-B, migrations/content_ir_workflow_result_output_routes.sql) — no kind reaches the reader by silent fallback any more. copy-E claimed these for an engine-result family component AFTER the route landed; that work is an UPGRADE of component_key on these same rows, not a new registration. |
| `markdown` | Markdown | distilled | 1 | `markdown_stream` | **done** | army-fe-wd2 | THE STREAMING MARKDOWN RENDERER, registered. `(markdown,'web','output') → markdown_stream` LIVE ([`content_ir_markdown_kind_route.sql`](../migrations/content_ir_markdown_kind_route.sql)); `role='input'` D1 floor row registered too (family `primitive`, not a machine contract). Verified in the browser on `/shapes/markdown/test` (2026-08-20). Kind is still `is_active=false` and that is CORRECT — see the change log; activation is a separate governed act and the route does not need it. |
| `notable_timestamp` | Notable Timestamp | — | 1 | `generic_structured` | done | copy-B | explicit basic route; canonical example authored + validated where it was missing |
| `number` | Number | — | 1 | `generic_structured` | **done** | copy-D | explicit basic route; live + tested |
| `office_extraction_result` | Office Extraction Result | — | 1 | `generic_structured` | done | copy-B | explicit basic route; canonical example already present and rendered in verification |
| `office_file_result` | Office File Result | — | 1 | `generic_structured` | done | copy-B | explicit basic route; canonical example already present and rendered in verification |
| `operation_result` | Operation Result (action receipt) | — | 1 | `generic_structured` | done | copy-B | explicit basic route LIVE (copy-B, migrations/content_ir_workflow_result_output_routes.sql) — no kind reaches the reader by silent fallback any more. copy-E claimed these for an engine-result family component AFTER the route landed; that work is an UPGRADE of component_key on these same rows, not a new registration. |
| `page` | Page (paginated window) | — | 1 | `generic_structured` | done | copy-B | explicit basic route; canonical example already present and rendered in verification |
| `page_keyword_analysis_v1` | Page Keyword Analysis | — | 1 | `generic_structured` | **done** | army-fe-wd1 | explicit basic route LIVE + verified in the registry (migration by copy-D; claim taken over and verified by army-fe-wd1). `role='input'` correctly absent — `metadata.family='agent_io'` ⇒ `dataOnly` refuses first. |
| `page_keyword_map_v1` | Page Keyword Map | — | 1 | `generic_structured` | **done** | army-fe-wd1 | explicit basic route LIVE + verified in the registry (migration by copy-D; claim taken over and verified by army-fe-wd1). `role='input'` correctly absent — `metadata.family='agent_io'` ⇒ `dataOnly` refuses first. |
| `regex_extract_result` | Regex Extract Result | — | 1 | `generic_structured` | done | copy-B | explicit basic route; canonical example already present and rendered in verification |
| `rendered_text` | Rendered Text | — | 1 | `generic_structured` | done | copy-E | explicit basic route LIVE — migrations/content_ir_rendered_text_output_route.sql, applied + verified in the DB. Reuse-first: nothing in the compiled bootstrap or the block dispatch registry renders `{text, rendered, truncated}`. UPGRADE PATH: `text` IS markdown, so a component streaming it through MarkdownStream (with rendered/truncated as chrome) beats the JSON tree view — a one-line component_key swap on this same row. Route case belongs in features/content-ir/__tests__/kind-explicit-basic-routes.test.tsx (copy-B's file, in flight at the time). |
| `research_cross_cutting_tags` | Research Cross-Cutting Tags | — | 1 | `generic_structured` | done | copy-B | explicit basic route; canonical example authored + validated where it was missing |
| `research_page_analysis` | Research Page Analysis | — | 1 | `generic_structured` | done | copy-B | explicit basic route; canonical example already present and rendered in verification |
| `research_setup_suggestion` | Research Setup Suggestion | — | 1 | `generic_structured` | done | copy-B | explicit basic route; canonical example already present and rendered in verification |
| `research_tag_suggestions` | Research Tag Suggestions | — | 1 | `generic_structured` | done | copy-B | explicit basic route; canonical example authored + validated where it was missing |
| `saved_row` | Saved Row | — | 1 | `generic_structured` | done | copy-B | explicit basic route; no bespoke display existed |
| `scraped_page` | Scraped Page | — | 1 | `generic_structured` | done | copy-B | explicit basic route; canonical example already present and rendered in verification |
| `seo_authority_route_analysis` | SEO Authority Route Analysis | — | 1 | `generic_structured` | **done** | army-fe-wd1 | explicit basic route LIVE + verified in the registry (migration by copy-D; claim taken over and verified by army-fe-wd1). `role='input'` correctly absent — `metadata.family='agent_io'` ⇒ `dataOnly` refuses first. |
| `seo_finding_fix_context` | SEO Finding Fix Context | — | 1 | `generic_structured` | **done** | copy-D | explicit basic route; live + tested |
| `seo_finding_fix_proposal` | SEO Finding Fix Proposal | — | 1 | `generic_structured` | **done** | copy-D | explicit basic route; live + tested |
| `string_list` | String List | — | 1 | `generic_structured` | **done** | copy-D | explicit basic route; live + tested |
| `table_rows` | Table Rows | — | 1 | `generic_structured` | **done** | copy-D | explicit basic route; live + tested |
| `text` | Text | — | 1 | `generic_structured` | **done** | copy-D | explicit basic route; live + tested |
| `topic_assignment_batch_v1` | SEO Topic Assignment Batch | — | 1 | `generic_structured` | **done** | army-fe-wd1 | explicit basic route LIVE + verified in the registry (migration by copy-D; claim taken over and verified by army-fe-wd1). `role='input'` correctly absent — `metadata.family='agent_io'` ⇒ `dataOnly` refuses first. |
| `topic_relevance` | Topic Relevance | — | 1 | `generic_structured` | done | copy-B | explicit basic route; canonical example authored + validated where it was missing |
| `transcript_usage` | Transcript Usage | — | 1 | `generic_structured` | done | copy-B | explicit basic route; canonical example authored + validated where it was missing |
| `value` | Value (single result) | — | 1 | `generic_structured` | **done** | copy-D | explicit basic route; live + tested |
| `workflow_run_result` | Workflow Run Result | — | 1 | `generic_structured` | done | copy-B | explicit basic route LIVE (copy-B, migrations/content_ir_workflow_result_output_routes.sql) — no kind reaches the reader by silent fallback any more. copy-E claimed these for an engine-result family component AFTER the route landed; that work is an UPGRADE of component_key on these same rows, not a new registration. |

## Change log

- 2026-08-20 — Ledger generated from the live registry (project `brsgrqvjdzwihsvnfqkf`).
  128 kinds missing a `(kind, 'web', 'output')` row. copy-D claimed the `web_*_v1` family
  (83 kinds, one proven shared shape ⇒ one component).
- 2026-08-20 — copy-D **released** the `web_*_v1` family: a parallel copy already had
  `WebAnalysisItemBlock` + the dispatch wiring uncommitted in the shared checkout.
  copy-D re-claimed the 8 primitive kinds instead (`boolean`, `items`, `json`, `number`,
  `string_list`, `table_rows`, `text`, `value`).
- 2026-08-20 — copy-E claims the 8 engine-result kinds (`branch_result`, `bulk_result`,
  `criteria_gate_result`, `gather_result`, `map_result`, `operation_result`, `rendered_text`,
  `workflow_run_result`) — chosen by LIVE traffic: they are the top unrouted kinds in
  `workflow.node_events` over the last 30 days. copy-E also owns the runtime-impact slice
  (wire-is-block consumer sweep + the workflow run page readout).
- 2026-08-20 — copy-B claims 8 runtime result-wrapper rows: `branch_result`,
  `bulk_result`, `criteria_gate_result`, `gather_result`, `map_result`, `operation_result`,
  `workflow_run_result`, `saved_row`.
- 2026-08-20 — copy-B **done**: all 8 runtime result-wrapper kinds (`branch_result`,
  `bulk_result`, `criteria_gate_result`, `gather_result`, `map_result`, `operation_result`,
  `saved_row`, `workflow_run_result`) now carry a REGISTERED `(kind,'web','output')` row →
  `generic_structured`, applied live and ledgered in `public._schema_migrations`. Verified by
  rendering each kind's LIVE canonical `kind_example` through the render seam
  (`features/content-ir/__tests__/kind-workflow-result-routes.test.tsx`, 9 tests). Reuse search
  found no component for a workflow runtime result and NO bespoke display of any of the eight,
  so nothing legacy was retired. No maturity promoted.
  ⚠ Shared-checkout note: copy-E re-claimed 7 of these rows in the working tree after the claim
  was pushed. The rows are registered either way — a bespoke engine-result component would
  update `component_key` on the SAME rows.
- 2026-08-20 — copy-B claims batch 2 (research/evidence cluster): `claim_evidence`,
  `entity_mention`, `evidence_source`, `notable_timestamp`, `topic_relevance`,
  `transcript_usage`, `research_cross_cutting_tags`, `research_tag_suggestions`.
  Six of the eight have **0** canonical examples — those must be authored and validated first.
- 2026-08-21 — copy-D **done**: `boolean`, `number`, `text`, `string_list`, `json`, `items`,
  `value`, `table_rows` — the Python engine's workflow I/O primitives. All eight reached the
  generic viewer by *silent fallback*; each now carries an explicit
  `(kind,'web','output') → generic_structured` row
  ([`migrations/content_ir_primitive_kind_routes.sql`](../migrations/content_ir_primitive_kind_routes.sql),
  applied live + recorded in `public._schema_migrations`). Reuse was checked first — nothing in
  the repo renders "a number", "a string", or the `{archetype, …}` envelopes, and no bespoke
  display of these primitives exists to repoint or delete. Verified by
  [`features/content-ir/__tests__/kind-primitive-routes.test.tsx`](../features/content-ir/__tests__/kind-primitive-routes.test.tsx)
  (14 tests, each rendering the kind's LIVE canonical example through the production path;
  negative controls confirmed the assertions bite). `pnpm type-check` clean;
  `features/content-ir` 840/840 green. Maturity untouched.

  **Finding for the verification pass — the honest ceiling of a basic route.** Five of these
  kinds (`boolean`, `number`, `text`, `string_list`, and `json` when its value is scalar) are
  BARE scalars/arrays. A bare scalar has nowhere to put `__kind`, so it never forms a
  kind-carrying region and `applyIrKindRoute` can never claim it — *no block-level route will
  ever fire for them, whatever row is registered.* What the row does buy is real:
  `kindIsRoutable()` in `KindInstanceRender` now answers true, so the workflow readout stops
  showing the amber "no custom component" note for a value the platform HAS chosen a renderer
  for; the value itself renders on the same floor (`StructuredValueView`) either way. This is
  recorded, not papered over — if the platform ever wants a scalar kind to reach a real
  component, `KindInstanceRender`'s `isRecordValue(value)` guard
  (features/content-ir/studio/components/KindInstanceRender.tsx) is the seam that would have to
  consult the resolver. That is a deliberate design change, not this mission's to make.

  Re-run the counts with:
  ```sql
  select count(*) filter (where not exists (
           select 1 from content_ir.kind_component c
           where c.kind_definition_id = d.id and c.platform='web'
             and c.role='output' and c.deleted_at is null)) as still_missing
  from content_ir.kind_definition d
  where d.is_active and d.deleted_at is null and d.is_contract_artifact = false;
  ```
- 2026-08-20 — copy-E **done**: `rendered_text` registered (the 8th engine-result kind;
  copy-B's concurrent `content_ir_workflow_result_output_routes.sql` covered the other seven, so
  copy-E's migration was reduced from 8 kinds to 1 rather than left as a duplicate).
  copy-E also landed the RUNTIME-IMPACT slice: the workflow run page now routes node outputs on
  the payload's in-band `__kind` (falling back to the out-of-band `output_kind` declaration), and
  the engine's `output_kind_ok` drift verdict — which had NO consumer anywhere in the UI — is now
  surfaced in the readout. Measured baseline on the live DB (30d, 2,728 `node_completed`):
  0 payloads carry `__kind` yet, 41 events carry no `output_kind` at all.
  **FINDING for whoever owns the contract-artifact quarantine:** `output_kind` on live events can
  name a kind that does NOT exist in `kind_definition` —
  `action_io_action_ai_util_parse_llm_json_98c46b15_output` fired 12 times in 30 days against no
  registered kind. That is declaration drift, not a missing component.
- 2026-08-20 — copy-B **batch 2 done**: the research/evidence cluster is routed (`migrations/content_ir_research_evidence_kind_routes.sql`, applied live + ledgered). Five missing canonical examples authored and validated against the LIVE schemas with negative controls. `claim_evidence` is **blocked on its example only** — its schema carries a dangling `#/$defs/EvidenceSource` with no `$defs` and cannot compile (FOUND_DEFECTS **D219**, a class of 5 active kinds incl. all four `plan_page_*`); its route is live and verified.
- 2026-08-20 — copy-B claims batch 3: `http_response`, `office_extraction_result`, `office_file_result`, `page`, `regex_extract_result`, `scraped_page`, `research_page_analysis`, `research_setup_suggestion`.
- 2026-08-20 — copy-B **batch 3 done**: `http_response`, `office_extraction_result`, `office_file_result`, `page`, `regex_extract_result`, `scraped_page`, `research_page_analysis`, `research_setup_suggestion` routed (`migrations/content_ir_io_result_kind_routes.sql`, applied live + ledgered). 25 verification tests now render every copy-B kind's LIVE canonical example through the seam.
- 2026-08-20 — **LIVE RECOUNT: 211 / 211 routed, 0 missing.** Verified directly against `content_ir.kind_component` (project `brsgrqvjdzwihsvnfqkf`) after copy-B/C/D/E batches landed. Rows still reading `claimed` below are routed in the DB; their owners flip the status. Open follow-ups: `claim_evidence` blocked on its EXAMPLE (FOUND_DEFECTS **D219** — 5 active kinds carry an uncompilable `emitted_json_schema`), and contract artifacts remain quarantined and deliberately out of scope.
- 2026-08-21 — copy-D **done**, batches 3 + final: the SEO analysis cluster
  (`competitor_opportunity_autopsy_v1`, `competitor_page_autopsy_v1`,
  `digital_pr_reputation_brief_v1`, `keyword_classification_batch_v1`,
  `page_keyword_analysis_v1`, `page_keyword_map_v1`, `seo_authority_route_analysis`,
  `topic_assignment_batch_v1`) and the final four (`gsc_site_intake_bundle`,
  `gsc_site_intake_proposal`, `seo_finding_fix_context`, `seo_finding_fix_proposal`).
  Migrations [`content_ir_seo_analysis_kind_routes.sql`](../migrations/content_ir_seo_analysis_kind_routes.sql)
  and [`content_ir_final_kind_routes.sql`](../migrations/content_ir_final_kind_routes.sql),
  applied live + recorded in `public._schema_migrations`. Verified live: **0 of 211**
  active non-contract-artifact kinds are missing a route. `pnpm type-check` clean;
  `features/content-ir` 890/890 green (stable across five runs incl. `--runInBand`).

  **The one registry lie found:** `keyword_classification_batch_v1` already HAD a real
  component — `features/content-ir/kinds/keyword-research.ts` declares
  `legacyBlockType: "keyword_classification_batch"` — so it was never a silent fallback.
  The missing row meant the DATABASE did not record the component the platform actually
  renders. Its row now names the real component; the compiled bridge still wins the route
  and nothing about its rendering changed. Worth checking for elsewhere: a missing
  `kind_component` row does not always mean a missing renderer.

  **Two rendering findings, pinned as tests rather than hidden** — both are the honest
  ceiling of a *basic* route and neither is fixed here (a basic route does not get to
  invent a renderer, and maturity is not promoted by this work):
  1. `gsc_site_intake_bundle` is a TABULAR payload expressed as
     `{columns: string[], rows: unknown[][]}` blocks. `StructuredValueView` tables uniform
     arrays of OBJECTS, not arrays of ARRAYS, so `columns` renders as a bullet list and no
     cell value reaches the document at all. **This is the clearest earned case for a real
     component in copy-D's whole claim** — handing it to the distillation pass.
  2. An object nested inside a TABLE cell collapses behind an `{n fields}` Expand control,
     so `page_keyword_map_v1`'s proposed page TITLE is one click away, not on screen.

  **One question left open, deliberately:** `FindingFixCard`
  (features/marketing/components/analysis/) already consumes `seo_finding_fix_proposal`,
  but as an interactive APPLY surface (before/after, confirm dialog, CMS-draft writeback)
  that cannot render from a kind envelope alone — so it is NOT a competing renderer and was
  not repointed or deleted. Whether a STREAMED proposal should render as a read-only twin
  of that card is product semantics, not a route decision.

- 2026-08-20 — **army-fe-wd1**: claim of the 8 SEO-analysis-cluster rows taken over from `copy-D`
  as ABANDONED per the army watchdog. **The watchdog was half right.** copy-D's work was not
  missing — it was COMMITTED and applied
  ([`content_ir_seo_analysis_kind_routes.sql`](../migrations/content_ir_seo_analysis_kind_routes.sql),
  [`kind-seo-analysis-routes.test.tsx`](../features/content-ir/__tests__/kind-seo-analysis-routes.test.tsx),
  commit `5d2cf9c3d`) and its change-log entry was already written. What copy-D never did was
  **flip the eight table rows**, so the ledger's own rows contradicted its own change log for
  70+ minutes and the watchdog read the stale rows as abandoned work. army-fe-wd1 re-verified
  from scratch rather than trusting either, and duplicated nothing.
  **Live re-verification (2026-08-20, project `brsgrqvjdzwihsvnfqkf`):** all 8 carry an ACTIVE
  `(kind,'web','output')` row — seven `generic_structured`, `keyword_classification_batch_v1`
  naming its real component — each with exactly 1 canonical example at
  `validation_status='passed'`. `features/content-ir` 890/890 green; `pnpm type-check` clean.
  Rows flipped to **done**.

  **`role='input'` — the answer for this whole cluster is DO NOT INSERT.** All eight carry
  `metadata.family = 'agent_io'`, one of the four `GENERATED_CONTRACT_FAMILY_VALUES`
  (`features/content-ir/registry/schema-source-kind-tables.ts`), so `isDataOnlyKindMetadata`
  returns true and `decideKindInputPath` refuses on `dataOnly` **before it ever consults the
  resolver**. Their missing input rows are the CORRECT absence the companion-gap note
  describes, not the copy-C gap: `kind-input-resolution.ts` states in its own contract that a
  stray input-role row on a machine contract "is a registry defect, not a license to render."
  Registering the D1 floor here would have planted eight such defects for zero behaviour change.

  **One thing copy-D did not flag — a near-miss on the NO-LEGACY rule, resolved as keep.**
  `features/marketing/components/reputation/ReputationWorkspace.tsx` (937 lines) DOES consume
  `digital_pr_reputation_brief_v1` (via `features/marketing/data/reputation-{types,queries}.ts`)
  and renders the brief's verdict, quality scores, limitations, narratives and publication
  opportunities. It is **not** a competing renderer and was **not** deleted: it is an
  interactive workspace with side effects (live-run trigger, CRM fold, outreach dialogs,
  `isReputationOutreachVerdict` gating) that cannot render from a kind envelope alone — the
  identical shape as the `FindingFixCard` question copy-D left open. Whether the read-only
  brief PANE inside it should become a twin of the registered route is product semantics for
  the distillation pass, not a route decision. Recorded here so it is not rediscovered as a
  duplicate.
- 2026-08-20 — **army-fe-wd2** claims the `markdown` row and folds it into the individual-rows
  table (it had been appended after the change log, in the wrong column schema). Counts line
  re-counted from the rows: 46 individual rows.
- 2026-08-20 — army-fe-wd2 **done**: `markdown` routes to THE STREAMING MARKDOWN RENDERER.
  `(markdown,'web','output') → markdown_stream`, applied live + ledgered in
  `public._schema_migrations`
  ([`content_ir_markdown_kind_route.sql`](../migrations/content_ir_markdown_kind_route.sql)).
  `markdown` is `{ text: string }` — the shape the agent output contract folds prose into (99% of
  every agent result is `content = [one markdown instance]`) — and it had NO output row, so it
  reached the reader by silent fallback and the generic viewer printed the field label "Text"
  above the reader's own document, markdown source unrendered.

  **Reuse, not invention.** Searched: `MarkdownStream` / `StreamingMarkdown` / `markdown-stream`
  across `components`, `features`, `app`, `lib`; the `markdown*` block directories; every
  `SHAPE_BLOCK_DISPATCH` entry; and the vocabulary crosswalk for a `markdown` render-block row
  (none — the name was free). Three candidates, one right answer:
  `MarkdownPreviewBlock` is a code-fence viewer with its own Preview/Source chrome (wrong — a
  kind instance is a document, not a fence); `BasicMarkdownContent` is an internal of the engine;
  **`MarkdownStream` is the engine itself**, and `WORKFLOW_KINDS_DESIGN.md` §4 already named it
  ("The `markdown` kind's active web component IS MarkdownStream"). So the new file is a 40-line
  adapter, not a renderer:
  [`MarkdownKindBlock.tsx`](../components/mardown-display/blocks/markdown/MarkdownKindBlock.tsx)
  reads `text` off the envelope and hands it to MarkdownStream (the documented import for "bare
  rendering with no actions"), wired into `block-dispatch.tsx` (`ShapeBlockType` +
  `SHAPE_BLOCK_DISPATCH` + the FE-synthesized list in its test). Prose renders as prose, and a
  kind payload fenced INSIDE that prose routes to its own component through the same pipeline —
  which is the whole point of collapsing the render law.

  **The row's own claim, checked against live code — it was HALF right.**
  *Right:* the render leg was the only missing leg. `content_ir.evaluate_kind_activation` now
  returns `would_activate: true, structural_ok: true, render_ok: true, reasons: []` (the
  canonical example already passed the structural leg). *Wrong:* registering does NOT activate.
  `is_active` only moves through `content_ir.set_kind_activation`, which requires `auth.uid()`
  and an owner/super-admin — direct `is_active` writes are revoked from `authenticated` behind a
  guard trigger — and every kind migration in this directory says the same thing in its own
  words: *activation belongs to the dual gate.* **Not forced here.** It is now one click for the
  owner at `/shapes/markdown` (the Activate button is live), and its consequence is beyond this
  route: activation is what makes a kind BINDABLE to an agent's structured output
  (`isKindBindable`), and it moves the kind into the active scope this ledger counts (211 → 212).
  *And the route never needed it:* the FE kind registry does not filter on `is_active`
  (`schema-source-kind-tables.ts` says so in its own contract) and `applyIrKindRoute` reads the
  COMPONENT row's `is_active`, never the definition's — proven live below, with the kind still
  inactive.

  **`role='input'`: INSERTED, deliberately (copy-C's gap, not copy-D's exception).** `markdown`
  carries `metadata.family = 'primitive'` — NOT one of the `GENERATED_CONTRACT_FAMILY_VALUES`
  (`workflow_io`/`tool_io`/`action_io`/`agent_io`), so `decideKindInputPath` does not refuse it on
  `dataOnly`. It is DB-only, so the compiled input floor never reached it and `/shapes/markdown/test`
  refused — the exact gap copy-C fixed for the 83. A human can honestly author a block of prose,
  so the D1 floor row is a floor, not a registry defect. It resolves `instance-json` (the kind
  stores no field list) and the Test tab now works.

  **Live verification (browser, `/shapes/markdown/test`, 2026-08-20):** the canonical example
  submitted through the real form renders a real `<h2>Findings</h2>` and `<strong>3 warnings</strong>`
  — no `__kind`, no JSON wrapper, no "unverified shape" note, no amber "no custom component" line.
  Pinned by [`kind-markdown-route.test.tsx`](../features/content-ir/__tests__/kind-markdown-route.test.tsx)
  (6 tests): the before/after (silent `by:'generic'` → registered `by:'db'`), the LIVE canonical
  example re-validated through `validateStructuralLeg` against the LIVE `emitted_json_schema`
  **with a negative control**, the verbatim hand-off to the streaming renderer, a partial
  instance, and the never-swallow backstop. `pnpm type-check` clean; `features/content-ir` +
  block-registry **903/903** green. Maturity untouched (`distilled`).

  **NO LEGACY — nothing to delete.** Searched every `"markdown"` occurrence in `features/content-ir`,
  `features/workflow-runtime` and `features/agents`: every hit is the unrelated markdown INPUT
  widget / editor-tab vocabulary. No bespoke display of a `{__kind:'markdown', text}` instance
  exists.

  **One honesty defect fixed on the way out.** `ShapeActivationControl` told every inactive kind's
  owner *"Renders through the generic JSON viewer and cannot be bound to an agent."* The first
  clause is false for any kind with a registered component — `markdown` is the live counterexample
  — so the line now keys on the verdict's render leg and reserves the generic-viewer sentence for
  the kinds where it is genuinely true.
