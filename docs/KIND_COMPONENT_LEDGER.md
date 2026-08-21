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
- Already routed (web/output row exists): **83**
- **Missing a route: 128** — 45 individual + 83 in the `web_*_v1` audit-check family
- Claimed: **91** (1 family row + 8 individual) · Done: **0** · Blocked: **0**

> Contract artifacts (`is_contract_artifact = true`, 774 active) are quarantined per §7.8 and
> are OUT of scope for this mission. Do not register routes for them.

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
| `web_*_v1` — site-audit check results | 83 | `summary`, `checked`, `issues_found`, `evidence[]`, `recommendations[]` (+ per-check scalars) — verified identical core across all 83 | `web_audit_check_result` | **another copy (in flight)** | claimed |

### Family: `web_*_v1` site-audit check results — ALREADY IN FLIGHT, DO NOT TOUCH

copy-D claimed this family, then found it **already being built** by a parallel copy:
uncommitted work in the shared checkout (`components/mardown-display/blocks/web-audit/
WebAuditCheckResultBlock.tsx` + the `web_audit_check_result` key wired into
`block-dispatch.tsx`'s `ShapeBlockType` / `FeSynthesizedBlockType` / `SHAPE_BLOCK_DISPATCH`
and its test). copy-D **released the claim** rather than duplicate it, and moved to the
primitive kinds below. Whoever owns that work: flip this row to `done` when the 83
`kind_component` rows and canonical examples land.

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

## Individual rows (45)

`Ex` = canonical `kind_example` count; **0 means you must author one first.**

| Kind | Label | Maturity | Ex | Component | Status | Claim | Notes |
|---|---|---|---|---|---|---|---|
| `boolean` | Boolean | — | 1 | `generic_structured` | **done** | copy-D | explicit basic route; live + tested |
| `branch_result` | Branch Result | — | 1 | `generic_structured` | done | copy-B | explicit basic route LIVE (copy-B, migrations/content_ir_workflow_result_output_routes.sql) — no kind reaches the reader by silent fallback any more. copy-E claimed these for an engine-result family component AFTER the route landed; that work is an UPGRADE of component_key on these same rows, not a new registration. |
| `bulk_result` | Bulk Result (partial-failure batch) | — | 1 | `generic_structured` | done | copy-B | explicit basic route LIVE (copy-B, migrations/content_ir_workflow_result_output_routes.sql) — no kind reaches the reader by silent fallback any more. copy-E claimed these for an engine-result family component AFTER the route landed; that work is an UPGRADE of component_key on these same rows, not a new registration. |
| `claim_evidence` | Claim Evidence | — | 0 | | claimed | copy-B | research/evidence cluster — batch 2 |
| `competitor_opportunity_autopsy_v1` | Competitor Opportunity Autopsy | — | 1 | | claimed | copy-D | SEO analysis cluster — batch 3 |
| `competitor_page_autopsy_v1` | Competitor Page Autopsy | — | 1 | | claimed | copy-D | SEO analysis cluster — batch 3 |
| `criteria_gate_result` | Criteria Gate Result | — | 1 | `generic_structured` | done | copy-B | explicit basic route LIVE (copy-B, migrations/content_ir_workflow_result_output_routes.sql) — no kind reaches the reader by silent fallback any more. copy-E claimed these for an engine-result family component AFTER the route landed; that work is an UPGRADE of component_key on these same rows, not a new registration. |
| `digital_pr_reputation_brief_v1` | Digital PR & Reputation Brief | — | 1 | | claimed | copy-D | SEO analysis cluster — batch 3 |
| `entity_mention` | Entity Mention | — | 0 | | claimed | copy-B | research/evidence cluster — batch 2 |
| `evidence_source` | Evidence Source | — | 0 | | claimed | copy-B | research/evidence cluster — batch 2 |
| `gather_result` | Gather Result | — | 1 | `generic_structured` | done | copy-B | explicit basic route LIVE (copy-B, migrations/content_ir_workflow_result_output_routes.sql) — no kind reaches the reader by silent fallback any more. copy-E claimed these for an engine-result family component AFTER the route landed; that work is an UPGRADE of component_key on these same rows, not a new registration. |
| `gsc_site_intake_bundle` | GSC Site Intake Bundle | — | 1 | | unclaimed | | |
| `gsc_site_intake_proposal` | GSC Site Intake Proposal | — | 1 | | unclaimed | | |
| `http_response` | HTTP Response | — | 1 | | unclaimed | | |
| `items` | Items (list result) | — | 1 | `generic_structured` | **done** | copy-D | explicit basic route; live + tested |
| `json` | JSON (any value) | — | 1 | `generic_structured` | **done** | copy-D | explicit basic route; live + tested |
| `keyword_classification_batch_v1` | SEO Keyword Classification Batch | — | 1 | | claimed | copy-D | SEO analysis cluster — batch 3 |
| `map_result` | Map Result | — | 1 | `generic_structured` | done | copy-B | explicit basic route LIVE (copy-B, migrations/content_ir_workflow_result_output_routes.sql) — no kind reaches the reader by silent fallback any more. copy-E claimed these for an engine-result family component AFTER the route landed; that work is an UPGRADE of component_key on these same rows, not a new registration. |
| `notable_timestamp` | Notable Timestamp | — | 0 | | claimed | copy-B | research/evidence cluster — batch 2 |
| `number` | Number | — | 1 | `generic_structured` | **done** | copy-D | explicit basic route; live + tested |
| `office_extraction_result` | Office Extraction Result | — | 1 | | unclaimed | | |
| `office_file_result` | Office File Result | — | 1 | | unclaimed | | |
| `operation_result` | Operation Result (action receipt) | — | 1 | `generic_structured` | done | copy-B | explicit basic route LIVE (copy-B, migrations/content_ir_workflow_result_output_routes.sql) — no kind reaches the reader by silent fallback any more. copy-E claimed these for an engine-result family component AFTER the route landed; that work is an UPGRADE of component_key on these same rows, not a new registration. |
| `page` | Page (paginated window) | — | 1 | | unclaimed | | |
| `page_keyword_analysis_v1` | Page Keyword Analysis | — | 1 | | claimed | copy-D | SEO analysis cluster — batch 3 |
| `page_keyword_map_v1` | Page Keyword Map | — | 1 | | claimed | copy-D | SEO analysis cluster — batch 3 |
| `regex_extract_result` | Regex Extract Result | — | 1 | | unclaimed | | |
| `rendered_text` | Rendered Text | — | 1 | | claimed | copy-E | engine-result family (one shape family, one component); 16 live events |
| `research_cross_cutting_tags` | Research Cross-Cutting Tags | — | 1 | | claimed | copy-B | research/evidence cluster — batch 2 |
| `research_page_analysis` | Research Page Analysis | — | 1 | | unclaimed | | |
| `research_setup_suggestion` | Research Setup Suggestion | — | 1 | | unclaimed | | |
| `research_tag_suggestions` | Research Tag Suggestions | — | 1 | | claimed | copy-B | research/evidence cluster — batch 2 |
| `saved_row` | Saved Row | — | 1 | `generic_structured` | done | copy-B | explicit basic route; no bespoke display existed |
| `scraped_page` | Scraped Page | — | 1 | | unclaimed | | |
| `seo_authority_route_analysis` | SEO Authority Route Analysis | — | 1 | | claimed | copy-D | SEO analysis cluster — batch 3 |
| `seo_finding_fix_context` | SEO Finding Fix Context | — | 1 | | unclaimed | | |
| `seo_finding_fix_proposal` | SEO Finding Fix Proposal | — | 1 | | unclaimed | | |
| `string_list` | String List | — | 1 | `generic_structured` | **done** | copy-D | explicit basic route; live + tested |
| `table_rows` | Table Rows | — | 1 | `generic_structured` | **done** | copy-D | explicit basic route; live + tested |
| `text` | Text | — | 1 | `generic_structured` | **done** | copy-D | explicit basic route; live + tested |
| `topic_assignment_batch_v1` | SEO Topic Assignment Batch | — | 1 | | claimed | copy-D | SEO analysis cluster — batch 3 |
| `topic_relevance` | Topic Relevance | — | 0 | | claimed | copy-B | research/evidence cluster — batch 2 |
| `transcript_usage` | Transcript Usage | — | 0 | | claimed | copy-B | research/evidence cluster — batch 2 |
| `value` | Value (single result) | — | 1 | `generic_structured` | **done** | copy-D | explicit basic route; live + tested |
| `workflow_run_result` | Workflow Run Result | — | 1 | `generic_structured` | done | copy-B | explicit basic route LIVE (copy-B, migrations/content_ir_workflow_result_output_routes.sql) — no kind reaches the reader by silent fallback any more. copy-E claimed these for an engine-result family component AFTER the route landed; that work is an UPGRADE of component_key on these same rows, not a new registration. |

## Change log

- 2026-08-20 — Ledger generated from the live registry (project `brsgrqvjdzwihsvnfqkf`).
  128 kinds missing a `(kind, 'web', 'output')` row. copy-D claimed the `web_*_v1` family
  (83 kinds, one proven shared shape ⇒ one component).
- 2026-08-20 — copy-D **released** the `web_*_v1` family: a parallel copy already had
  `WebAuditCheckResultBlock` + the dispatch wiring uncommitted in the shared checkout.
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
