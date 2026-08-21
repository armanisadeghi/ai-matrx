# Kind → FE component route ledger

**Mission (ARMY: FE kind component routes).** Every ACTIVE, non-contract-artifact kind in
`content_ir.kind_definition` must have a REGISTERED frontend route — a
`content_ir.kind_component` row for `(kind, platform='web', role='output')`. A kind with no row
today still renders (R6 generic fallback in
[`features/content-ir/react/kind-route.ts`](../features/content-ir/react/kind-route.ts)) but does
so as an UNVERIFIED SILENT FALLBACK (`__ir_route.by='generic'`, `unverified: true`). This army
converts every silent fallback into an explicit, registered decision.

Canonical mission spec: `common-docs/systems/content-ir-system/KINDS_EVERYWHERE_PLAN.md` §4, §6,
§9, §12 (+ the "wire IS block" finding). Kind resolution lives ONLY in
[`features/content-ir/core/kind-parser.ts`](../features/content-ir/core/kind-parser.ts).

## The rules

1. **REUSE first.** If a component already renders this family, point the row at it. A second
   renderer for the same shape is a defect even if it works (THE CANONICAL COMPONENT LAW).
2. **Otherwise register the generic structured renderer EXPLICITLY** — a row with
   `component_key = 'generic_structured'`. Explicit basic route, never silent fallback. The
   difference is visible at runtime: `__ir_route.by = 'db'` instead of `'generic'`.
3. **Nested kinds render by recursion** through the registry — never a bespoke child renderer.
4. **NO LEGACY.** A bespoke display of the same data gets repointed at the registered route and
   DELETED. Needs a ruling → mark the row `blocked` with ONE line of why.
5. **Maturity is NOT promoted by this work.** `kind_definition.metadata.maturity` stays
   `placeholder`. Only the separate verification pass awards `verified` (plan §7.8).
6. **Verify** each with the kind's canonical example through `KindInstanceRender`; `pnpm
   type-check` clean; `features/content-ir` tests green.

## Claiming (parallel-safe)

Many agent copies work this ledger at once. **The push IS the lock.** Claim ≤8 `todo` rows by
setting `Status = claimed` and `Claimed by = <your agent id>`, commit, and **push immediately**
before doing any work. Rejected push → `git pull --rebase`, re-read, claim from the CURRENT file.
Flip to `done` and push often.

## Counts

**128 total · 0 done · 8 claimed · 120 todo · 0 blocked** (last updated 2026-08-20, copy C)

## Shared components registered by this army

| Component key | Covers | Where |
|---|---|---|
| `generic_structured` | any kind with no family renderer — the explicit basic route | `components/mardown-display/blocks/generic/GenericStructuredBlock.tsx` |

## Families

- **`web-audit-check` (85)** — the `web_*_v1` site-audit checks. Verified identical shape:
  `{ checked:int, summary:string, issues_found:int, evidence:object[], recommendations:string[] }`
  with only `evidence[]` item properties varying per check. ONE component covers all 85.
  ⚠️ None of these 85 carry a canonical `kind_example` or `sample_data` — flagged for the
  distillation/verification passes; route registration does not need one, but `verified` cannot
  be awarded until they have real payloads.
- **`engine-primitive` (23)** — workflow/tool engine result wrappers and scalars (`text`,
  `number`, `items`, `map_result`, `http_response`, …). All carry canonical examples.
- **`seo-research` (20)** — SEO/research analysis shapes. Mixed; 6 lack canonical examples.

## Rows

| Kind | Family | Canonical example | Status | Claimed by | Route decision | Notes |
|---|---|---|---|---|---|---|
| `boolean` | engine-primitive | yes | todo | — | — | — |
| `branch_result` | engine-primitive | yes | todo | — | — | — |
| `bulk_result` | engine-primitive | yes | todo | — | — | — |
| `criteria_gate_result` | engine-primitive | yes | todo | — | — | — |
| `gather_result` | engine-primitive | yes | todo | — | — | — |
| `http_response` | engine-primitive | yes | todo | — | — | — |
| `items` | engine-primitive | yes | todo | — | — | — |
| `json` | engine-primitive | yes | todo | — | — | — |
| `map_result` | engine-primitive | yes | todo | — | — | — |
| `number` | engine-primitive | yes | todo | — | — | — |
| `office_extraction_result` | engine-primitive | yes | todo | — | — | — |
| `office_file_result` | engine-primitive | yes | todo | — | — | — |
| `operation_result` | engine-primitive | yes | todo | — | — | — |
| `page` | engine-primitive | yes | todo | — | — | — |
| `regex_extract_result` | engine-primitive | yes | todo | — | — | — |
| `rendered_text` | engine-primitive | yes | todo | — | — | — |
| `saved_row` | engine-primitive | yes | todo | — | — | — |
| `scraped_page` | engine-primitive | yes | todo | — | — | — |
| `string_list` | engine-primitive | yes | todo | — | — | — |
| `table_rows` | engine-primitive | yes | todo | — | — | — |
| `text` | engine-primitive | yes | todo | — | — | — |
| `value` | engine-primitive | yes | todo | — | — | — |
| `workflow_run_result` | engine-primitive | yes | todo | — | — | — |
| `claim_evidence` | seo-research | NO | todo | — | — | — |
| `competitor_opportunity_autopsy_v1` | seo-research | yes | todo | — | — | — |
| `competitor_page_autopsy_v1` | seo-research | yes | todo | — | — | — |
| `digital_pr_reputation_brief_v1` | seo-research | yes | todo | — | — | — |
| `entity_mention` | seo-research | NO | todo | — | — | — |
| `evidence_source` | seo-research | NO | todo | — | — | — |
| `gsc_site_intake_bundle` | seo-research | yes | todo | — | — | — |
| `gsc_site_intake_proposal` | seo-research | yes | todo | — | — | — |
| `keyword_classification_batch_v1` | seo-research | yes | todo | — | — | — |
| `notable_timestamp` | seo-research | NO | todo | — | — | — |
| `page_keyword_analysis_v1` | seo-research | yes | todo | — | — | — |
| `page_keyword_map_v1` | seo-research | yes | todo | — | — | — |
| `research_cross_cutting_tags` | seo-research | yes | todo | — | — | — |
| `research_page_analysis` | seo-research | yes | todo | — | — | — |
| `research_setup_suggestion` | seo-research | yes | todo | — | — | — |
| `research_tag_suggestions` | seo-research | yes | todo | — | — | — |
| `seo_authority_route_analysis` | seo-research | yes | todo | — | — | — |
| `seo_finding_fix_context` | seo-research | yes | todo | — | — | — |
| `seo_finding_fix_proposal` | seo-research | yes | todo | — | — | — |
| `topic_assignment_batch_v1` | seo-research | yes | todo | — | — | — |
| `topic_relevance` | seo-research | NO | todo | — | — | — |
| `transcript_usage` | seo-research | NO | todo | — | — | — |
| `web_a11y_lab_basics_v1` | web-audit-check | NO | claimed | copy-C | web_audit_check_result | family component (in build) |
| `web_anchor_text_descriptiveness_v1` | web-audit-check | NO | claimed | copy-C | web_audit_check_result | family component (in build) |
| `web_asset_delivery_v1` | web-audit-check | NO | claimed | copy-C | web_audit_check_result | family component (in build) |
| `web_broken_external_links_v1` | web-audit-check | NO | claimed | copy-C | web_audit_check_result | family component (in build) |
| `web_broken_images_v1` | web-audit-check | NO | claimed | copy-C | web_audit_check_result | family component (in build) |
| `web_broken_internal_links_v1` | web-audit-check | NO | claimed | copy-C | web_audit_check_result | family component (in build) |
| `web_broken_page_4xx_v1` | web-audit-check | NO | claimed | copy-C | web_audit_check_result | family component (in build) |
| `web_caching_policy_v1` | web-audit-check | NO | claimed | copy-C | web_audit_check_result | family component (in build) |
| `web_canonical_conflicts_v1` | web-audit-check | NO | todo | — | — | — |
| `web_canonical_presence_v1` | web-audit-check | NO | todo | — | — | — |
| `web_content_depth_v1` | web-audit-check | NO | todo | — | — | — |
| `web_content_freshness_v1` | web-audit-check | NO | todo | — | — | — |
| `web_content_quality_eeat_v1` | web-audit-check | NO | todo | — | — | — |
| `web_crawl_depth_v1` | web-audit-check | NO | todo | — | — | — |
| `web_cwv_cls_v1` | web-audit-check | NO | todo | — | — | — |
| `web_cwv_inp_tbt_v1` | web-audit-check | NO | todo | — | — | — |
| `web_cwv_lcp_v1` | web-audit-check | NO | todo | — | — | — |
| `web_duplicate_content_exact_v1` | web-audit-check | NO | todo | — | — | — |
| `web_excessive_outlinks_v1` | web-audit-check | NO | todo | — | — | — |
| `web_grammar_spelling_v1` | web-audit-check | NO | todo | — | — | — |
| `web_gsc_ctr_opportunity_v1` | web-audit-check | NO | todo | — | — | — |
| `web_gsc_index_coverage_v1` | web-audit-check | NO | todo | — | — | — |
| `web_gsc_keyword_cannibalization_v1` | web-audit-check | NO | todo | — | — | — |
| `web_gsc_performance_decay_v1` | web-audit-check | NO | todo | — | — | — |
| `web_h1_presence_v1` | web-audit-check | NO | todo | — | — | — |
| `web_heading_hierarchy_v1` | web-audit-check | NO | todo | — | — | — |
| `web_host_protocol_consistency_v1` | web-audit-check | NO | todo | — | — | — |
| `web_hreflang_reciprocity_v1` | web-audit-check | NO | todo | — | — | — |
| `web_hreflang_validity_v1` | web-audit-check | NO | todo | — | — | — |
| `web_hsts_policy_v1` | web-audit-check | NO | todo | — | — | — |
| `web_html_lang_validity_v1` | web-audit-check | NO | todo | — | — | — |
| `web_https_enforcement_v1` | web-audit-check | NO | todo | — | — | — |
| `web_image_alt_presence_v1` | web-audit-check | NO | todo | — | — | — |
| `web_image_alt_quality_v1` | web-audit-check | NO | todo | — | — | — |
| `web_image_dimension_attrs_v1` | web-audit-check | NO | todo | — | — | — |
| `web_image_lazy_loading_v1` | web-audit-check | NO | todo | — | — | — |
| `web_image_modern_format_v1` | web-audit-check | NO | todo | — | — | — |
| `web_image_oversized_v1` | web-audit-check | NO | todo | — | — | — |
| `web_internal_inlink_coverage_v1` | web-audit-check | NO | todo | — | — | — |
| `web_internal_link_equity_v1` | web-audit-check | NO | todo | — | — | — |
| `web_internal_redirect_links_v1` | web-audit-check | NO | todo | — | — | — |
| `web_intrusive_interstitials_v1` | web-audit-check | NO | todo | — | — | — |
| `web_keyword_topical_coverage_v1` | web-audit-check | NO | todo | — | — | — |
| `web_local_business_markup_v1` | web-audit-check | NO | todo | — | — | — |
| `web_meta_description_duplication_v1` | web-audit-check | NO | todo | — | — | — |
| `web_meta_description_length_v1` | web-audit-check | NO | todo | — | — | — |
| `web_meta_description_presence_v1` | web-audit-check | NO | todo | — | — | — |
| `web_meta_refresh_redirect_v1` | web-audit-check | NO | todo | — | — | — |
| `web_meta_robots_conflicts_v1` | web-audit-check | NO | todo | — | — | — |
| `web_mixed_content_v1` | web-audit-check | NO | todo | — | — | — |
| `web_mobile_render_quality_v1` | web-audit-check | NO | todo | — | — | — |
| `web_mobile_usability_lab_v1` | web-audit-check | NO | todo | — | — | — |
| `web_near_duplicate_content_v1` | web-audit-check | NO | todo | — | — | — |
| `web_nofollow_internal_links_v1` | web-audit-check | NO | todo | — | — | — |
| `web_og_image_validity_v1` | web-audit-check | NO | todo | — | — | — |
| `web_orphan_pages_v1` | web-audit-check | NO | todo | — | — | — |
| `web_page_weight_v1` | web-audit-check | NO | todo | — | — | — |
| `web_pagination_markup_v1` | web-audit-check | NO | todo | — | — | — |
| `web_readability_v1` | web-audit-check | NO | todo | — | — | — |
| `web_redirect_chain_v1` | web-audit-check | NO | todo | — | — | — |
| `web_redirect_loop_v1` | web-audit-check | NO | todo | — | — | — |
| `web_robots_txt_health_v1` | web-audit-check | NO | todo | — | — | — |
| `web_search_intent_alignment_v1` | web-audit-check | NO | todo | — | — | — |
| `web_security_headers_v1` | web-audit-check | NO | todo | — | — | — |
| `web_serp_snippet_quality_v1` | web-audit-check | NO | todo | — | — | — |
| `web_server_error_5xx_v1` | web-audit-check | NO | todo | — | — | — |
| `web_sitemap_coverage_v1` | web-audit-check | NO | todo | — | — | — |
| `web_sitemap_health_v1` | web-audit-check | NO | todo | — | — | — |
| `web_social_meta_completeness_v1` | web-audit-check | NO | todo | — | — | — |
| `web_soft_404_detection_v1` | web-audit-check | NO | todo | — | — | — |
| `web_structured_data_coverage_v1` | web-audit-check | NO | todo | — | — | — |
| `web_structured_data_validity_v1` | web-audit-check | NO | todo | — | — | — |
| `web_temporary_redirect_usage_v1` | web-audit-check | NO | todo | — | — | — |
| `web_text_html_ratio_v1` | web-audit-check | NO | todo | — | — | — |
| `web_thin_content_v1` | web-audit-check | NO | todo | — | — | — |
| `web_title_duplication_v1` | web-audit-check | NO | todo | — | — | — |
| `web_title_keyword_alignment_v1` | web-audit-check | NO | todo | — | — | — |
| `web_title_length_v1` | web-audit-check | NO | todo | — | — | — |
| `web_title_presence_v1` | web-audit-check | NO | todo | — | — | — |
| `web_tls_certificate_v1` | web-audit-check | NO | todo | — | — | — |
| `web_ttfb_server_response_v1` | web-audit-check | NO | todo | — | — | — |
| `web_url_design_quality_v1` | web-audit-check | NO | todo | — | — | — |
| `web_viewport_meta_v1` | web-audit-check | NO | todo | — | — | — |
