---
type: Ledger
title: Kind → frontend component route ledger (KINDS EVERYWHERE, army mission)
description: The claims ledger for giving every active Content IR kind an EXPLICIT registered frontend output route. Parallel-safe — claim rows, push the claim, work, flip to done.
tags: [content-ir, kinds, kind_component, army, ledger]
timestamp: 2026-08-20
status: ACTIVE
---

# Kind → frontend component route ledger

**Counts (regenerate whenever you finish a batch):** total active kinds `985` · already routed
`83` · **this ledger `902`** · claimed `0` · done `0` · blocked `0`
*(source of truth is the DB — see "Recount" below; this line is a convenience, keep it current.)*

## The mission

Give **every active kind lacking a `(kind, 'web', 'output')` row in `content_ir.kind_component`**
a registered frontend route. Canonical spec:
`common-docs/systems/content-ir-system/KINDS_EVERYWHERE_PLAN.md` §4, §6, §9, §12 (+ the
"wire IS block" finding, 2026-08-20). Required reading before you touch anything:
`matrx-frontend/CLAUDE.md`.

### Rules (non-negotiable)

1. **REUSE first.** If a component already renders this family, point the row at it. A second
   implementation of something we own is a defect even if it works.
2. **Otherwise register the generic structured renderer as an EXPLICIT BASIC ROUTE** —
   `component_key = 'generic_structured'`, `source = 'bundled'`. Never leave a kind on the
   silent `no-component` fallback. (Precedent already in the registry: `office_document`,
   `office_presentation`, `office_spreadsheet`, `q_and_a_set`, `schema_showcase`.)
3. **Nested kinds render by recursion through the registry** — never re-render a child inline.
4. **Kind resolution lives ONLY in `features/content-ir/core/kind-parser.ts`.** No second parser,
   no second detector, no second registry.
5. **Verify for real.** Render the kind's canonical example through `KindInstanceRender`.
   `pnpm type-check` clean. `features/content-ir` tests green. No screenshot of a mock counts.
6. **NO LEGACY.** A bespoke display rendering the same data gets repointed at the registry and
   DELETED. If deleting needs a product ruling, mark the row `blocked` with ONE line saying what
   the ruling is, and move on.
7. **Maturity is NOT promoted by this work.** `metadata.maturity` stays exactly as it is —
   placeholder stays placeholder. Only the separate verification pass awards `verified`.

### How to claim (the claim IS the lock)

- Claim **≤ 8 rows** at a time: set `status` to `claimed` and put your copy id in `who`.
- **Push the claim immediately.** `git pull --rebase` → commit **only this file** → push.
  If the push is rejected, `git pull --rebase` and re-pick rows that are still `open`.
- Work the batch, flip rows to `done` (or `blocked`), push often. Keep the counts line current.
- Never edit a row you do not own.

### Recount

```sql
select count(*) from content_ir.kind_definition d
where d.is_active and d.deleted_at is null
  and not exists (select 1 from content_ir.kind_component c
                  where c.kind_definition_id = d.id and c.platform = 'web'
                    and c.role = 'output' and c.is_active and c.deleted_at is null);
```

### Families in this ledger

| family | count | what it is | expected route |
|---|---|---|---|
| `core` | 45 | real product/runtime shapes (primitives, result wrappers, research + SEO analysis) | judgement per kind — reuse or explicit generic |
| `seo-check` | 83 | `web_*_v1` site-audit check results — ONE shape family | build/reuse ONE check-result component, point all 83 at it |
| `contract:action_io` | 180 | auto-generated action input/output contract artifacts | explicit generic route (bulk) |
| `contract:agent_io` | 164 | auto-generated agent output contract artifacts | explicit generic route (bulk) |
| `contract:tool_io` | 344 | auto-generated tool input/output contract artifacts | explicit generic route (bulk) |
| `contract:other` | 86 | other `is_contract_artifact` kinds | explicit generic route (bulk) |

---

## Rows

| kind | label | family | status | who | component_key | notes |
|---|---|---|---|---|---|---|
| `boolean` | Boolean | core | open |  |  |  |
| `branch_result` | Branch Result | core | open |  |  |  |
| `bulk_result` | Bulk Result (partial-failure batch) | core | open |  |  |  |
| `claim_evidence` | Claim Evidence | core | open |  |  |  |
| `competitor_opportunity_autopsy_v1` | Competitor Opportunity Autopsy | core | open |  |  |  |
| `competitor_page_autopsy_v1` | Competitor Page Autopsy | core | open |  |  |  |
| `criteria_gate_result` | Criteria Gate Result | core | open |  |  |  |
| `digital_pr_reputation_brief_v1` | Digital PR & Reputation Brief | core | open |  |  |  |
| `entity_mention` | Entity Mention | core | open |  |  |  |
| `evidence_source` | Evidence Source | core | open |  |  |  |
| `gather_result` | Gather Result | core | open |  |  |  |
| `gsc_site_intake_bundle` | GSC Site Intake Bundle | core | open |  |  |  |
| `gsc_site_intake_proposal` | GSC Site Intake Proposal | core | open |  |  |  |
| `http_response` | HTTP Response | core | open |  |  |  |
| `items` | Items (list result) | core | open |  |  |  |
| `json` | JSON (any value) | core | open |  |  |  |
| `keyword_classification_batch_v1` | SEO Keyword Classification Batch | core | open |  |  |  |
| `map_result` | Map Result | core | open |  |  |  |
| `notable_timestamp` | Notable Timestamp | core | open |  |  |  |
| `number` | Number | core | open |  |  |  |
| `office_extraction_result` | Office Extraction Result | core | open |  |  |  |
| `office_file_result` | Office File Result | core | open |  |  |  |
| `operation_result` | Operation Result (action receipt) | core | open |  |  |  |
| `page` | Page (paginated window) | core | open |  |  |  |
| `page_keyword_analysis_v1` | Page Keyword Analysis | core | open |  |  |  |
| `page_keyword_map_v1` | Page Keyword Map | core | open |  |  |  |
| `regex_extract_result` | Regex Extract Result | core | open |  |  |  |
| `rendered_text` | Rendered Text | core | open |  |  |  |
| `research_cross_cutting_tags` | Research Cross-Cutting Tags | core | open |  |  |  |
| `research_page_analysis` | Research Page Analysis | core | open |  |  |  |
| `research_setup_suggestion` | Research Setup Suggestion | core | open |  |  |  |
| `research_tag_suggestions` | Research Tag Suggestions | core | open |  |  |  |
| `saved_row` | Saved Row | core | open |  |  |  |
| `scraped_page` | Scraped Page | core | open |  |  |  |
| `seo_authority_route_analysis` | SEO Authority Route Analysis | core | open |  |  |  |
| `seo_finding_fix_context` | SEO Finding Fix Context | core | open |  |  |  |
| `seo_finding_fix_proposal` | SEO Finding Fix Proposal | core | open |  |  |  |
| `string_list` | String List | core | open |  |  |  |
| `table_rows` | Table Rows | core | open |  |  |  |
| `text` | Text | core | open |  |  |  |
| `topic_assignment_batch_v1` | SEO Topic Assignment Batch | core | open |  |  |  |
| `topic_relevance` | Topic Relevance | core | open |  |  |  |
| `transcript_usage` | Transcript Usage | core | open |  |  |  |
| `value` | Value (single result) | core | open |  |  |  |
| `workflow_run_result` | Workflow Run Result | core | open |  |  |  |
| `web_a11y_lab_basics_v1` | Accessibility Basics (Lab) Result | seo-check | open |  |  |  |
| `web_anchor_text_descriptiveness_v1` | Anchor Text Descriptiveness Result | seo-check | open |  |  |  |
| `web_asset_delivery_v1` | Asset Delivery Optimization Result | seo-check | open |  |  |  |
| `web_broken_external_links_v1` | Broken External Links Result | seo-check | open |  |  |  |
| `web_broken_images_v1` | Broken Images Result | seo-check | open |  |  |  |
| `web_broken_internal_links_v1` | Broken Internal Links Result | seo-check | open |  |  |  |
| `web_broken_page_4xx_v1` | Broken Pages (4xx) Result | seo-check | open |  |  |  |
| `web_caching_policy_v1` | Static Asset Caching Result | seo-check | open |  |  |  |
| `web_canonical_conflicts_v1` | Canonical Conflicts Result | seo-check | open |  |  |  |
| `web_canonical_presence_v1` | Canonical Tag Presence & Validity Result | seo-check | open |  |  |  |
| `web_content_depth_v1` | Content Depth & Word Count Result | seo-check | open |  |  |  |
| `web_content_freshness_v1` | Content Freshness Result | seo-check | open |  |  |  |
| `web_content_quality_eeat_v1` | Content Quality & E-E-A-T Signals (AI) Result | seo-check | open |  |  |  |
| `web_crawl_depth_v1` | Crawl Depth from Home Result | seo-check | open |  |  |  |
| `web_cwv_cls_v1` | Cumulative Layout Shift (Lab) Result | seo-check | open |  |  |  |
| `web_cwv_inp_tbt_v1` | Interactivity - TBT/INP Proxy (Lab) Result | seo-check | open |  |  |  |
| `web_cwv_lcp_v1` | Largest Contentful Paint (Lab) Result | seo-check | open |  |  |  |
| `web_duplicate_content_exact_v1` | Exact Duplicate Pages Result | seo-check | open |  |  |  |
| `web_excessive_outlinks_v1` | Excessive On-Page Links Result | seo-check | open |  |  |  |
| `web_grammar_spelling_v1` | Grammar & Spelling (AI) Result | seo-check | open |  |  |  |
| `web_gsc_ctr_opportunity_v1` | GSC CTR Opportunity Result | seo-check | open |  |  |  |
| `web_gsc_index_coverage_v1` | GSC Index Coverage Result | seo-check | open |  |  |  |
| `web_gsc_keyword_cannibalization_v1` | GSC Keyword Cannibalization Result | seo-check | open |  |  |  |
| `web_gsc_performance_decay_v1` | GSC Performance Decay Result | seo-check | open |  |  |  |
| `web_h1_presence_v1` | H1 Presence & Uniqueness Result | seo-check | open |  |  |  |
| `web_heading_hierarchy_v1` | Heading Hierarchy & Structure Result | seo-check | open |  |  |  |
| `web_host_protocol_consistency_v1` | Host & Protocol Consistency Result | seo-check | open |  |  |  |
| `web_hreflang_reciprocity_v1` | Hreflang Return Tags Result | seo-check | open |  |  |  |
| `web_hreflang_validity_v1` | Hreflang Validity Result | seo-check | open |  |  |  |
| `web_hsts_policy_v1` | HSTS Policy Result | seo-check | open |  |  |  |
| `web_html_lang_validity_v1` | HTML Lang Attribute Result | seo-check | open |  |  |  |
| `web_https_enforcement_v1` | HTTPS Enforcement Result | seo-check | open |  |  |  |
| `web_image_alt_presence_v1` | Image Alt Text Presence Result | seo-check | open |  |  |  |
| `web_image_alt_quality_v1` | Image Alt Text Quality (AI) Result | seo-check | open |  |  |  |
| `web_image_dimension_attrs_v1` | Image Dimension Attributes Result | seo-check | open |  |  |  |
| `web_image_lazy_loading_v1` | Image Lazy Loading Result | seo-check | open |  |  |  |
| `web_image_modern_format_v1` | Modern Image Formats Result | seo-check | open |  |  |  |
| `web_image_oversized_v1` | Oversized Images Result | seo-check | open |  |  |  |
| `web_internal_inlink_coverage_v1` | Internal Inlink Coverage Result | seo-check | open |  |  |  |
| `web_internal_link_equity_v1` | Internal Link Equity Distribution Result | seo-check | open |  |  |  |
| `web_internal_redirect_links_v1` | Internal Links to Redirects Result | seo-check | open |  |  |  |
| `web_intrusive_interstitials_v1` | Intrusive Interstitials (AI Vision) Result | seo-check | open |  |  |  |
| `web_keyword_topical_coverage_v1` | On-Page Keyword & Topical Coverage (AI) Result | seo-check | open |  |  |  |
| `web_local_business_markup_v1` | Local Business & Organization Markup Result | seo-check | open |  |  |  |
| `web_meta_description_duplication_v1` | Duplicate Meta Descriptions Result | seo-check | open |  |  |  |
| `web_meta_description_length_v1` | Meta Description Length Result | seo-check | open |  |  |  |
| `web_meta_description_presence_v1` | Meta Description Presence Result | seo-check | open |  |  |  |
| `web_meta_refresh_redirect_v1` | Meta Refresh & JS Redirects Result | seo-check | open |  |  |  |
| `web_meta_robots_conflicts_v1` | Meta Robots & X-Robots Directives Result | seo-check | open |  |  |  |
| `web_mixed_content_v1` | Mixed Content Result | seo-check | open |  |  |  |
| `web_mobile_render_quality_v1` | Mobile Render Quality (AI Vision) Result | seo-check | open |  |  |  |
| `web_mobile_usability_lab_v1` | Mobile Usability (Lab) Result | seo-check | open |  |  |  |
| `web_near_duplicate_content_v1` | Near-Duplicate Content Result | seo-check | open |  |  |  |
| `web_nofollow_internal_links_v1` | Nofollowed Internal Links Result | seo-check | open |  |  |  |
| `web_og_image_validity_v1` | Social Share Image Validity Result | seo-check | open |  |  |  |
| `web_orphan_pages_v1` | Orphan Pages Result | seo-check | open |  |  |  |
| `web_page_weight_v1` | Total Page Weight Result | seo-check | open |  |  |  |
| `web_pagination_markup_v1` | Pagination Markup Result | seo-check | open |  |  |  |
| `web_readability_v1` | Readability Result | seo-check | open |  |  |  |
| `web_redirect_chain_v1` | Redirect Chains Result | seo-check | open |  |  |  |
| `web_redirect_loop_v1` | Redirect Loops Result | seo-check | open |  |  |  |
| `web_robots_txt_health_v1` | Robots.txt Health Result | seo-check | open |  |  |  |
| `web_search_intent_alignment_v1` | Search Intent Alignment (AI) Result | seo-check | open |  |  |  |
| `web_security_headers_v1` | Security Headers Result | seo-check | open |  |  |  |
| `web_serp_snippet_quality_v1` | SERP Snippet Quality (AI) Result | seo-check | open |  |  |  |
| `web_server_error_5xx_v1` | Server Errors (5xx) Result | seo-check | open |  |  |  |
| `web_sitemap_coverage_v1` | Sitemap vs Crawl Coverage Result | seo-check | open |  |  |  |
| `web_sitemap_health_v1` | XML Sitemap Health Result | seo-check | open |  |  |  |
| `web_social_meta_completeness_v1` | Open Graph & Twitter Card Completeness Result | seo-check | open |  |  |  |
| `web_soft_404_detection_v1` | Soft 404 Detection Result | seo-check | open |  |  |  |
| `web_structured_data_coverage_v1` | Structured Data Coverage (AI) Result | seo-check | open |  |  |  |
| `web_structured_data_validity_v1` | Structured Data Validity Result | seo-check | open |  |  |  |
| `web_temporary_redirect_usage_v1` | Temporary Redirect Usage (302/307) Result | seo-check | open |  |  |  |
| `web_text_html_ratio_v1` | Text-to-HTML Ratio Result | seo-check | open |  |  |  |
| `web_thin_content_v1` | Thin Content Result | seo-check | open |  |  |  |
| `web_title_duplication_v1` | Duplicate Titles Across Pages Result | seo-check | open |  |  |  |
| `web_title_keyword_alignment_v1` | Title Keyword Alignment Result | seo-check | open |  |  |  |
| `web_title_length_v1` | Title Length & Truncation Result | seo-check | open |  |  |  |
| `web_title_presence_v1` | Title Tag Presence Result | seo-check | open |  |  |  |
| `web_tls_certificate_v1` | TLS Certificate Health Result | seo-check | open |  |  |  |
| `web_ttfb_server_response_v1` | Server Response Time (TTFB) Result | seo-check | open |  |  |  |
| `web_url_design_quality_v1` | URL Design Quality Result | seo-check | open |  |  |  |
| `web_viewport_meta_v1` | Viewport Meta Tag Result | seo-check | open |  |  |  |
| `action_io_admin_dev_discover_files_59d7821b_input` | admin.dev.discover_files input | contract:action_io | open |  |  |  |
| `action_io_admin_dev_discover_files_59d7821b_output` | admin.dev.discover_files output | contract:action_io | open |  |  |  |
| `action_io_admin_dev_filetree_2db345a8_input` | admin.dev.filetree input | contract:action_io | open |  |  |  |
| `action_io_admin_dev_filetree_2db345a8_output` | admin.dev.filetree output | contract:action_io | open |  |  |  |
| `action_io_admin_sql_delete_08dc40e5_input` | admin.sql.delete input | contract:action_io | open |  |  |  |
| `action_io_admin_sql_delete_08dc40e5_output` | admin.sql.delete output | contract:action_io | open |  |  |  |
| `action_io_admin_sql_insert_323a9bd1_input` | admin.sql.insert input | contract:action_io | open |  |  |  |
| `action_io_admin_sql_insert_323a9bd1_output` | admin.sql.insert output | contract:action_io | open |  |  |  |
| `action_io_admin_sql_raw_sql_e0a84107_input` | admin.sql.raw_sql input | contract:action_io | open |  |  |  |
| `action_io_admin_sql_raw_sql_e0a84107_output` | admin.sql.raw_sql output | contract:action_io | open |  |  |  |
| `action_io_admin_sql_select_6e29c462_input` | admin.sql.select input | contract:action_io | open |  |  |  |
| `action_io_admin_sql_select_6e29c462_output` | admin.sql.select output | contract:action_io | open |  |  |  |
| `action_io_admin_sql_update_b130284b_input` | admin.sql.update input | contract:action_io | open |  |  |  |
| `action_io_admin_sql_update_b130284b_output` | admin.sql.update output | contract:action_io | open |  |  |  |
| `action_io_ai_agent_assignment_batch_606b9fc6_output` | ai.agent.assignment_batch output | contract:action_io | open |  |  |  |
| `action_io_ai_agent_react_31ce3a62_input` | ai.agent.react input | contract:action_io | open |  |  |  |
| `action_io_ai_agent_react_31ce3a62_output` | ai.agent.react output | contract:action_io | open |  |  |  |
| `action_io_ai_agent_start_8b1062cb_input` | ai.agent.start input | contract:action_io | open |  |  |  |
| `action_io_ai_agent_start_8b1062cb_output` | ai.agent.start output | contract:action_io | open |  |  |  |
| `action_io_ai_agent_tool_calling_87ddb1df_input` | ai.agent.tool_calling input | contract:action_io | open |  |  |  |
| `action_io_ai_agent_tool_calling_87ddb1df_output` | ai.agent.tool_calling output | contract:action_io | open |  |  |  |
| `action_io_ai_chat_manual_36026f8b_input` | ai.chat.manual input | contract:action_io | open |  |  |  |
| `action_io_ai_chat_manual_36026f8b_output` | ai.chat.manual output | contract:action_io | open |  |  |  |
| `action_io_ai_conversation_continue_3f7ea8b9_input` | ai.conversation.continue input | contract:action_io | open |  |  |  |
| `action_io_ai_conversation_continue_3f7ea8b9_output` | ai.conversation.continue output | contract:action_io | open |  |  |  |
| `action_io_ai_edit_video_aa30103a_input` | ai.edit_video input | contract:action_io | open |  |  |  |
| `action_io_ai_edit_video_aa30103a_output` | ai.edit_video output | contract:action_io | open |  |  |  |
| `action_io_ai_extend_video_83b6bc40_input` | ai.extend_video input | contract:action_io | open |  |  |  |
| `action_io_ai_extend_video_83b6bc40_output` | ai.extend_video output | contract:action_io | open |  |  |  |
| `action_io_ai_extract_06ab58a1_input` | ai.extract input | contract:action_io | open |  |  |  |
| `action_io_ai_extract_06ab58a1_output` | ai.extract output | contract:action_io | open |  |  |  |
| `action_io_ai_generate_image_325b6e38_input` | ai.generate_image input | contract:action_io | open |  |  |  |
| `action_io_ai_generate_image_325b6e38_output` | ai.generate_image output | contract:action_io | open |  |  |  |
| `action_io_ai_generate_video_00a4572f_input` | ai.generate_video input | contract:action_io | open |  |  |  |
| `action_io_ai_generate_video_00a4572f_output` | ai.generate_video output | contract:action_io | open |  |  |  |
| `action_io_ai_image_concept_generate_9f82c615_input` | ai.image.concept_generate input | contract:action_io | open |  |  |  |
| `action_io_ai_image_concept_generate_9f82c615_output` | ai.image.concept_generate output | contract:action_io | open |  |  |  |
| `action_io_ai_image_prompt_write_3d4ebea3_input` | ai.image.prompt_write input | contract:action_io | open |  |  |  |
| `action_io_ai_image_prompt_write_3d4ebea3_output` | ai.image.prompt_write output | contract:action_io | open |  |  |  |
| `action_io_ai_image_qc_judge_6d25a145_input` | ai.image.qc_judge input | contract:action_io | open |  |  |  |
| `action_io_ai_image_qc_judge_6d25a145_output` | ai.image.qc_judge output | contract:action_io | open |  |  |  |
| `action_io_ai_llm_chat_8b0e5a6b_input` | ai.llm.chat input | contract:action_io | open |  |  |  |
| `action_io_ai_llm_chat_8b0e5a6b_output` | ai.llm.chat output | contract:action_io | open |  |  |  |
| `action_io_ai_scrape_web_b8600ff0_input` | ai.scrape.web input | contract:action_io | open |  |  |  |
| `action_io_ai_scrape_web_b8600ff0_output` | ai.scrape.web output | contract:action_io | open |  |  |  |
| `action_io_ai_search_brave_0dbc7202_input` | ai.search.brave input | contract:action_io | open |  |  |  |
| `action_io_ai_search_brave_0dbc7202_output` | ai.search.brave output | contract:action_io | open |  |  |  |
| `action_io_ai_text_to_speech_9e34ea7d_input` | ai.text_to_speech input | contract:action_io | open |  |  |  |
| `action_io_ai_text_to_speech_9e34ea7d_output` | ai.text_to_speech output | contract:action_io | open |  |  |  |
| `action_io_ai_transcribe_29c36757_input` | ai.transcribe input | contract:action_io | open |  |  |  |
| `action_io_ai_transcribe_29c36757_output` | ai.transcribe output | contract:action_io | open |  |  |  |
| `action_io_ai_util_cost_summary_d3ee1b20_input` | ai.util.cost_summary input | contract:action_io | open |  |  |  |
| `action_io_ai_util_cost_summary_d3ee1b20_output` | ai.util.cost_summary output | contract:action_io | open |  |  |  |
| `action_io_ai_util_extract_search_urls_6b989983_input` | ai.util.extract_search_urls input | contract:action_io | open |  |  |  |
| `action_io_ai_util_extract_search_urls_6b989983_output` | ai.util.extract_search_urls output | contract:action_io | open |  |  |  |
| `action_io_ai_util_format_scraped_content_7d984d15_input` | ai.util.format_scraped_content input | contract:action_io | open |  |  |  |
| `action_io_ai_util_format_scraped_content_7d984d15_output` | ai.util.format_scraped_content output | contract:action_io | open |  |  |  |
| `action_io_ai_util_parse_llm_json_6ed13c53_input` | ai.util.parse_llm_json input | contract:action_io | open |  |  |  |
| `action_io_ai_util_parse_llm_json_6ed13c53_output` | ai.util.parse_llm_json output | contract:action_io | open |  |  |  |
| `action_io_assets_upload_c8c770b7_input` | assets.upload input | contract:action_io | open |  |  |  |
| `action_io_assets_upload_c8c770b7_output` | assets.upload output | contract:action_io | open |  |  |  |
| `action_io_data_table_lookup_6c4c0e07_input` | data.table.lookup input | contract:action_io | open |  |  |  |
| `action_io_data_table_lookup_6c4c0e07_output` | data.table.lookup output | contract:action_io | open |  |  |  |
| `action_io_data_table_upsert_742f2612_input` | data.table.upsert input | contract:action_io | open |  |  |  |
| `action_io_data_table_upsert_742f2612_output` | data.table.upsert output | contract:action_io | open |  |  |  |
| `action_io_docproc_content_structure_ca95e03e_input` | docproc.content.structure input | contract:action_io | open |  |  |  |
| `action_io_docproc_content_structure_ca95e03e_output` | docproc.content.structure output | contract:action_io | open |  |  |  |
| `action_io_docproc_ingest_from_media_refs_c6ee91fc_input` | docproc.ingest.from_media_refs input | contract:action_io | open |  |  |  |
| `action_io_docproc_ingest_from_media_refs_c6ee91fc_output` | docproc.ingest.from_media_refs output | contract:action_io | open |  |  |  |
| `action_io_docproc_pdf_chunk_text_7447c236_input` | docproc.pdf.chunk_text input | contract:action_io | open |  |  |  |
| `action_io_docproc_pdf_chunk_text_7447c236_output` | docproc.pdf.chunk_text output | contract:action_io | open |  |  |  |
| `action_io_docproc_pdf_extract_tables_4e35c00a_input` | docproc.pdf.extract_tables input | contract:action_io | open |  |  |  |
| `action_io_docproc_pdf_extract_tables_4e35c00a_output` | docproc.pdf.extract_tables output | contract:action_io | open |  |  |  |
| `action_io_docproc_pdf_extract_text_02e57f2d_input` | docproc.pdf.extract_text input | contract:action_io | open |  |  |  |
| `action_io_docproc_pdf_extract_text_02e57f2d_output` | docproc.pdf.extract_text output | contract:action_io | open |  |  |  |
| `action_io_files_download_3f838108_input` | files.download input | contract:action_io | open |  |  |  |
| `action_io_files_download_3f838108_output` | files.download output | contract:action_io | open |  |  |  |
| `action_io_files_read_bytes_b64_d14f5003_input` | files.read_bytes_b64 input | contract:action_io | open |  |  |  |
| `action_io_files_read_bytes_b64_d14f5003_output` | files.read_bytes_b64 output | contract:action_io | open |  |  |  |
| `action_io_files_read_text_aaae5b06_input` | files.read_text input | contract:action_io | open |  |  |  |
| `action_io_files_read_text_aaae5b06_output` | files.read_text output | contract:action_io | open |  |  |  |
| `action_io_files_upload_0bc6ac70_input` | files.upload input | contract:action_io | open |  |  |  |
| `action_io_files_upload_0bc6ac70_output` | files.upload output | contract:action_io | open |  |  |  |
| `action_io_growth_loop_stage_dispatch_9e47c2c1_input` | growth_loop.stage.dispatch input | contract:action_io | open |  |  |  |
| `action_io_human_input_ad6d0833_input` | human.input input | contract:action_io | open |  |  |  |
| `action_io_human_input_ad6d0833_output` | human.input output | contract:action_io | open |  |  |  |
| `action_io_image_edit_apply_968ab349_input` | image.edit.apply input | contract:action_io | open |  |  |  |
| `action_io_image_edit_apply_968ab349_output` | image.edit.apply output | contract:action_io | open |  |  |  |
| `action_io_image_edit_detect_document_691da357_input` | image.edit.detect_document input | contract:action_io | open |  |  |  |
| `action_io_image_edit_detect_document_691da357_output` | image.edit.detect_document output | contract:action_io | open |  |  |  |
| `action_io_interview_finalize_2dbcf60e_input` | interview.finalize input | contract:action_io | open |  |  |  |
| `action_io_interview_finalize_2dbcf60e_output` | interview.finalize output | contract:action_io | open |  |  |  |
| `action_io_interview_gate_3e76edc2_input` | interview.gate input | contract:action_io | open |  |  |  |
| `action_io_interview_gate_3e76edc2_output` | interview.gate output | contract:action_io | open |  |  |  |
| `action_io_interview_hydrate_ad9434d1_input` | interview.hydrate input | contract:action_io | open |  |  |  |
| `action_io_interview_hydrate_ad9434d1_output` | interview.hydrate output | contract:action_io | open |  |  |  |
| `action_io_interview_route_2fb9b144_input` | interview.route input | contract:action_io | open |  |  |  |
| `action_io_interview_route_2fb9b144_output` | interview.route output | contract:action_io | open |  |  |  |
| `action_io_interview_scribe_apply_3bb7be36_input` | interview.scribe_apply input | contract:action_io | open |  |  |  |
| `action_io_interview_scribe_apply_3bb7be36_output` | interview.scribe_apply output | contract:action_io | open |  |  |  |
| `action_io_interview_tracker_apply_7ecae300_input` | interview.tracker_apply input | contract:action_io | open |  |  |  |
| `action_io_interview_tracker_apply_7ecae300_output` | interview.tracker_apply output | contract:action_io | open |  |  |  |
| `action_io_kg_entity_mentions_d10f43a4_input` | kg.entity.mentions input | contract:action_io | open |  |  |  |
| `action_io_kg_entity_mentions_d10f43a4_output` | kg.entity.mentions output | contract:action_io | open |  |  |  |
| `action_io_kg_graph_neighborhood_07c342b1_input` | kg.graph.neighborhood input | contract:action_io | open |  |  |  |
| `action_io_kg_graph_neighborhood_07c342b1_output` | kg.graph.neighborhood output | contract:action_io | open |  |  |  |
| `action_io_media_stock_image_search_8e556c93_input` | media.stock_image.search input | contract:action_io | open |  |  |  |
| `action_io_media_stock_image_search_8e556c93_output` | media.stock_image.search output | contract:action_io | open |  |  |  |
| `action_io_office_extract_e6542d57_input` | office.extract input | contract:action_io | open |  |  |  |
| `action_io_office_extract_e6542d57_output` | office.extract output | contract:action_io | open |  |  |  |
| `action_io_office_generate_document_ff9ee7f4_input` | office.generate_document input | contract:action_io | open |  |  |  |
| `action_io_office_generate_document_ff9ee7f4_output` | office.generate_document output | contract:action_io | open |  |  |  |
| `action_io_office_generate_presentation_f90b750a_input` | office.generate_presentation input | contract:action_io | open |  |  |  |
| `action_io_office_generate_presentation_f90b750a_output` | office.generate_presentation output | contract:action_io | open |  |  |  |
| `action_io_office_generate_spreadsheet_75426639_input` | office.generate_spreadsheet input | contract:action_io | open |  |  |  |
| `action_io_office_generate_spreadsheet_75426639_output` | office.generate_spreadsheet output | contract:action_io | open |  |  |  |
| `action_io_page_extraction_run_0fc30c9a_input` | page_extraction.run input | contract:action_io | open |  |  |  |
| `action_io_page_extraction_run_0fc30c9a_output` | page_extraction.run output | contract:action_io | open |  |  |  |
| `action_io_page_extraction_validate_5b456b69_input` | page_extraction.validate input | contract:action_io | open |  |  |  |
| `action_io_page_extraction_validate_5b456b69_output` | page_extraction.validate output | contract:action_io | open |  |  |  |
| `action_io_podcast_cast_preview_152d1d8e_input` | podcast.cast.preview input | contract:action_io | open |  |  |  |
| `action_io_podcast_cast_preview_152d1d8e_output` | podcast.cast.preview output | contract:action_io | open |  |  |  |
| `action_io_podcast_episode_generate_91822e48_input` | podcast.episode.generate input | contract:action_io | open |  |  |  |
| `action_io_podcast_episode_generate_91822e48_output` | podcast.episode.generate output | contract:action_io | open |  |  |  |
| `action_io_podcast_video_compose_8f5407f3_input` | podcast.video.compose input | contract:action_io | open |  |  |  |
| `action_io_podcast_video_compose_8f5407f3_output` | podcast.video.compose output | contract:action_io | open |  |  |  |
| `action_io_rag_audit_21179b3c_input` | rag.audit input | contract:action_io | open |  |  |  |
| `action_io_rag_audit_21179b3c_output` | rag.audit output | contract:action_io | open |  |  |  |
| `action_io_rag_chunk_58771355_input` | rag.chunk input | contract:action_io | open |  |  |  |
| `action_io_rag_chunk_58771355_output` | rag.chunk output | contract:action_io | open |  |  |  |
| `action_io_rag_classify_17ebe87f_input` | rag.classify input | contract:action_io | open |  |  |  |
| `action_io_rag_classify_17ebe87f_output` | rag.classify output | contract:action_io | open |  |  |  |
| `action_io_rag_embed_bdc7d642_input` | rag.embed input | contract:action_io | open |  |  |  |
| `action_io_rag_embed_bdc7d642_output` | rag.embed output | contract:action_io | open |  |  |  |
| `action_io_rag_enrich_f9b2cd26_input` | rag.enrich input | contract:action_io | open |  |  |  |
| `action_io_rag_enrich_f9b2cd26_output` | rag.enrich output | contract:action_io | open |  |  |  |
| `action_io_rag_ingest_source_9a5100c5_input` | rag.ingest_source input | contract:action_io | open |  |  |  |
| `action_io_rag_ingest_source_9a5100c5_output` | rag.ingest_source output | contract:action_io | open |  |  |  |
| `action_io_rag_library_ingest_pdf_6590b7e5_input` | rag.library.ingest_pdf input | contract:action_io | open |  |  |  |
| `action_io_rag_library_ingest_pdf_6590b7e5_output` | rag.library.ingest_pdf output | contract:action_io | open |  |  |  |
| `action_io_rag_library_upsert_8ad736af_input` | rag.library.upsert input | contract:action_io | open |  |  |  |
| `action_io_rag_library_upsert_8ad736af_output` | rag.library.upsert output | contract:action_io | open |  |  |  |
| `action_io_rag_parse_398e781d_input` | rag.parse input | contract:action_io | open |  |  |  |
| `action_io_rag_parse_398e781d_output` | rag.parse output | contract:action_io | open |  |  |  |
| `action_io_rag_repo_ingest_efd7522b_input` | rag.repo.ingest input | contract:action_io | open |  |  |  |
| `action_io_rag_repo_ingest_efd7522b_output` | rag.repo.ingest output | contract:action_io | open |  |  |  |
| `action_io_rag_resolve_ca6f3a55_input` | rag.resolve input | contract:action_io | open |  |  |  |
| `action_io_rag_resolve_ca6f3a55_output` | rag.resolve output | contract:action_io | open |  |  |  |
| `action_io_rag_search_a68bd166_input` | rag.search input | contract:action_io | open |  |  |  |
| `action_io_rag_search_a68bd166_output` | rag.search output | contract:action_io | open |  |  |  |
| `action_io_rag_search_cross_doc_5a47b815_input` | rag.search_cross_doc input | contract:action_io | open |  |  |  |
| `action_io_rag_search_cross_doc_5a47b815_output` | rag.search_cross_doc output | contract:action_io | open |  |  |  |
| `action_io_rag_synthesize_4a0cc763_input` | rag.synthesize input | contract:action_io | open |  |  |  |
| `action_io_rag_synthesize_4a0cc763_output` | rag.synthesize output | contract:action_io | open |  |  |  |
| `action_io_rag_upsert_521cfce9_input` | rag.upsert input | contract:action_io | open |  |  |  |
| `action_io_rag_upsert_521cfce9_output` | rag.upsert output | contract:action_io | open |  |  |  |
| `action_io_rag_verify_254c60df_input` | rag.verify input | contract:action_io | open |  |  |  |
| `action_io_rag_verify_254c60df_output` | rag.verify output | contract:action_io | open |  |  |  |
| `action_io_scraper_crawl_site_9cb2a946_input` | scraper.crawl_site input | contract:action_io | open |  |  |  |
| `action_io_scraper_crawl_site_9cb2a946_output` | scraper.crawl_site output | contract:action_io | open |  |  |  |
| `action_io_scraper_scrape_7a95ce82_input` | scraper.scrape input | contract:action_io | open |  |  |  |
| `action_io_scraper_scrape_7a95ce82_output` | scraper.scrape output | contract:action_io | open |  |  |  |
| `action_io_scraper_scrape_many_1e7755dc_input` | scraper.scrape_many input | contract:action_io | open |  |  |  |
| `action_io_scraper_scrape_many_1e7755dc_output` | scraper.scrape_many output | contract:action_io | open |  |  |  |
| `action_io_seo_gsc_search_performance_sync_2c7ab933_input` | seo.gsc.search_performance.sync input | contract:action_io | open |  |  |  |
| `action_io_seo_gsc_search_performance_sync_2c7ab933_output` | seo.gsc.search_performance.sync output | contract:action_io | open |  |  |  |
| `action_io_text_extract_field_ec2ae7d6_input` | text.extract_field input | contract:action_io | open |  |  |  |
| `action_io_text_extract_field_ec2ae7d6_output` | text.extract_field output | contract:action_io | open |  |  |  |
| `action_io_text_quality_check_60db518e_input` | text.quality_check input | contract:action_io | open |  |  |  |
| `action_io_text_quality_check_60db518e_output` | text.quality_check output | contract:action_io | open |  |  |  |
| `action_io_web_brave_search_31ea498c_input` | web.brave.search input | contract:action_io | open |  |  |  |
| `action_io_web_brave_search_31ea498c_output` | web.brave.search output | contract:action_io | open |  |  |  |
| `action_io_web_google_image_search_361a0c4b_input` | web.google.image_search input | contract:action_io | open |  |  |  |
| `action_io_web_google_image_search_361a0c4b_output` | web.google.image_search output | contract:action_io | open |  |  |  |
| `action_io_web_google_search_28ea57b6_input` | web.google.search input | contract:action_io | open |  |  |  |
| `action_io_web_google_search_28ea57b6_output` | web.google.search output | contract:action_io | open |  |  |  |
| `action_io_web_news_everything_f94c7020_input` | web.news.everything input | contract:action_io | open |  |  |  |
| `action_io_web_news_everything_f94c7020_output` | web.news.everything output | contract:action_io | open |  |  |  |
| `action_io_web_news_top_headlines_5496a373_input` | web.news.top_headlines input | contract:action_io | open |  |  |  |
| `action_io_web_news_top_headlines_5496a373_output` | web.news.top_headlines output | contract:action_io | open |  |  |  |
| `agent_io_00ae6c89_59cb_4d49_8b62_c434fa0c4d8b_3a3fa96b_output` | Assessment Item Deepener output | contract:agent_io | open |  |  |  |
| `agent_io_01efc211_902e_407b_8572_daf89769c768_6876f090_output` | incident_assurance_lane_assessor_v1 output | contract:agent_io | open |  |  |  |
| `agent_io_0315e53f_54ab_40fe_aa66_0dc003badce3_36860353_output` | Content Plan Writer (E2E test) output | contract:agent_io | open |  |  |  |
| `agent_io_03ea2bc2_2c2a_426d_8ea9_21799ae1f05d_860566a0_output` | Quiz Item Generator output | contract:agent_io | open |  |  |  |
| `agent_io_04acfd83_63ba_4ca4_9b0d_205d4f853c18_18ff9c45_output` | Assessment Quiz Generator (from source) output | contract:agent_io | open |  |  |  |
| `agent_io_077108a1_8e3b_444f_ac3d_191f4551c4c6_82420ccd_output` | podcast_title_optimizer output | contract:agent_io | open |  |  |  |
| `agent_io_078dcbc9_dcb8_48d9_821d_60051519a664_40e827ec_output` | masterwork_transcript_shortlister output | contract:agent_io | open |  |  |  |
| `agent_io_09221906_bf3c_4f5a_b638_6fe14c5341a5_86b251fd_output` | Context-Starved Code Safety Reviewer output | contract:agent_io | open |  |  |  |
| `agent_io_0cd86da2_2679_4c10_9746_e6723779fe94_653f1322_output` | YouTube Video Transcription Analysis output | contract:agent_io | open |  |  |  |
| `agent_io_0d6c715b_b861_4769_b0de_5d33f29f64a8_feb2adf5_output` | FC Micro Coach output | contract:agent_io | open |  |  |  |
| `agent_io_0db07b8e_ed30_42bc_bc92_8d2346dcd004_51a9a495_output` | Growth Loop Strategy Quality Judge output | contract:agent_io | open |  |  |  |
| `agent_io_0de58405_67ce_47d5_8414_b31309cc47f7_bd6ab926_output` | Education: Language Practice Designer output | contract:agent_io | open |  |  |  |
| `agent_io_0de9ff99_5362_48ed_8b8f_35820e819657_559f77b1_output` | Kit Flashcard Generator — From Source output | contract:agent_io | open |  |  |  |
| `agent_io_106fd261_1b5c_4b13_9522_cc121a1f5ef3_99f96d05_output` | Cross-Cutting Tag Generator output | contract:agent_io | open |  |  |  |
| `agent_io_107a268d_ac64_4f52_8270_1d1e1fc0668d_88e49c35_output` | Digital PR & Reputation Evidence Adjudicator output | contract:agent_io | open |  |  |  |
| `agent_io_13c31086_6420_4f8a_822d_6d0bc48a18e0_d33cac1e_output` | Study Analytics Narrator output | contract:agent_io | open |  |  |  |
| `agent_io_14baaac4_8073_4255_a6a9_ef47cd748f28_03d074c7_output` | website_factory_family_analyst output | contract:agent_io | open |  |  |  |
| `agent_io_15025f25_4f65_4790_b0fb_a1dadb91a42a_2791f898_output` | Knowledge Synthetic Q&A Generator output | contract:agent_io | open |  |  |  |
| `agent_io_18e5f5a7_f3f7_49bc_83e3_3479a831d973_7f564ec6_output` | Structured Research Page Summary output | contract:agent_io | open |  |  |  |
| `agent_io_1c8d4ae3_d538_49ed_93d9_51bb2598d938_7993a4c8_output` | website_factory_page_writer output | contract:agent_io | open |  |  |  |
| `agent_io_1cc19e9f_189d_43f6_b902_3c692346cab1_1a7217dd_output` | Surface Binding Mapper output | contract:agent_io | open |  |  |  |
| `agent_io_1e5c2cea_81cd_4059_942d_5e344c56f064_ddfc5d41_output` | plan_notes_agent output | contract:agent_io | open |  |  |  |
| `agent_io_1fd0cb1f_5b95_49f0_a7f8_79308dc50f58_67eb1e73_output` | Flashcard Generator (K) output | contract:agent_io | open |  |  |  |
| `agent_io_21c64115_5354_434a_a699_3c2005b356a0_9f726fb7_output` | masterwork_source_distiller output | contract:agent_io | open |  |  |  |
| `agent_io_23eb1718_d196_4cb5_ada6_bb3257cfccc3_e53906a9_output` | agent_iteration_architect output | contract:agent_io | open |  |  |  |
| `agent_io_23fa61b7_ecd0_435a_9aa2_7a1bb36403d4_0c5aabf4_output` | workflow_recovery_advisor output | contract:agent_io | open |  |  |  |
| `agent_io_24443cf8_0d0e_41e5_9a3c_ea6ce3145664_3c715cbe_output` | media_list_builder output | contract:agent_io | open |  |  |  |
| `agent_io_2995d6aa_2003_4222_b578_221273f4bbda_64147fee_output` | SDT_Index Records output | contract:agent_io | open |  |  |  |
| `agent_io_2a7f0dc8_5525_437a_8f2e_35f12a45cb27_052387b2_output` | Content Plan Reviewer output | contract:agent_io | open |  |  |  |
| `agent_io_2aede735_64ab_4836_9a37_0d060981f8df_b8d538d4_output` | Project Builder (Copy) output | contract:agent_io | open |  |  |  |
| `agent_io_2edcbd85_91e0_4f0a_9890_1e7d262e2c62_2b624893_output` | Topic Idea Generator output | contract:agent_io | open |  |  |  |
| `agent_io_2f44235b_4add_4716_bc12_856f1aa4ed0d_682c1d65_output` | ner_finisher output | contract:agent_io | open |  |  |  |
| `agent_io_2f600a25_0683_4944_bce7_0a8ebed0d47e_67933193_output` | podcast_chapter_marker output | contract:agent_io | open |  |  |  |
| `agent_io_2f8c44d6_f44e_40bc_8acc_0f3669723fb1_2df2b29e_output` | seo_finding_fixer_v1 output | contract:agent_io | open |  |  |  |
| `agent_io_31252a60_2d0e_46a8_bf6e_16e7ee5f4f79_2cd0eb01_output` | Flashcard Generator (K) output | contract:agent_io | open |  |  |  |
| `agent_io_385d96cf_b018_4d8a_b82f_e4f66c250c10_26e8f078_output` | Competitor Page Autopsy Analyst output | contract:agent_io | open |  |  |  |
| `agent_io_3a2d798f_6e37_4db7_8b2d_38405f507007_dd36024b_output` | Competitor Opportunity Autopsy Strategist output | contract:agent_io | open |  |  |  |
| `agent_io_3cb5c625_1381_475a_900c_690e76d28145_89bc8e21_output` | Growth Loop Collection Quality Judge output | contract:agent_io | open |  |  |  |
| `agent_io_3f9b6c14_8d20_4a5e_b7c1_2e8a90d5f331_332eb4c7_output` | Competitive Landscape Analyst output | contract:agent_io | open |  |  |  |
| `agent_io_410059f6_8f35_4cc7_bf82_65abf2f1004a_13065359_output` | recipient_shortlister output | contract:agent_io | open |  |  |  |
| `agent_io_45023f77_a56e_467d_ac14_151b7844bb5b_762eb45d_output` | vision_interview_adversary output | contract:agent_io | open |  |  |  |
| `agent_io_474b9f5e_2902_45ce_b779_3a8f308f3d81_f4ef27ee_output` | Cross-Cutting Tag Generator output | contract:agent_io | open |  |  |  |
| `agent_io_49d3c256_fdb4_4c9c_8965_6b35e638f698_e0bdd42a_output` | Study Planner output | contract:agent_io | open |  |  |  |
| `agent_io_4c5dd04a_4b22_43cd_bd8b_781a4d6dedb5_14240177_output` | Flashcard Memory Hint output | contract:agent_io | open |  |  |  |
| `agent_io_4dc04357_e265_4d85_9e24_c155227e1000_648b8187_output` | vision_interview_scribe output | contract:agent_io | open |  |  |  |
| `agent_io_517aa4b7_f171_4d7f_ba95_6613970f2fc3_6261a6b9_output` | workflow_assist_fix_suggester output | contract:agent_io | open |  |  |  |
| `agent_io_51e924c2_0c25_43a2_be5e_d7f4a6bd7179_c1b96b70_output` | ner_suggestion_reviewer output | contract:agent_io | open |  |  |  |
| `agent_io_51ed1c3a_e9ba_40dd_b7a3_915e67fa8af0_5c9f6f85_output` | Quiz Item Generator output | contract:agent_io | open |  |  |  |
| `agent_io_53f89bb0_bbc5_4862_bcbf_fdd9470d279a_28714995_output` | Flashcard Enrichment — fc_enrich_card output | contract:agent_io | open |  |  |  |
| `agent_io_58090ae0_316c_44a9_ae0f_1d621e1946bc_4b72d3ca_output` | Education: Spoken Practice Grader output | contract:agent_io | open |  |  |  |
| `agent_io_595d8769_7b28_45b7_84a4_e32b4ab54d03_649f2341_output` | Masterwork Approach Selector output | contract:agent_io | open |  |  |  |
| `agent_io_5ab5f32c_47c3_4afb_9027_98efa971ff44_200141d9_output` | ner_entity_canonicalizer (Copy) output | contract:agent_io | open |  |  |  |
| `agent_io_5ca54dd9_6de6_4364_842f_2ec4a0274ce0_d3685299_output` | Keyword Classifier output | contract:agent_io | open |  |  |  |
| `agent_io_5ce6bdba_53a6_4923_93c4_e49ed6c9c781_8615696d_output` | masterwork_exception_hunter output | contract:agent_io | open |  |  |  |
| `agent_io_5e1309a2_5459_4687_84ea_e0142f73dc86_18d10906_output` | journalist_beat_analyst output | contract:agent_io | open |  |  |  |
| `agent_io_5f77de33_887d_4bb0_9432_91f2f6dddaa4_8f48ca40_output` | Flashcard Expander output | contract:agent_io | open |  |  |  |
| `agent_io_61de01e3_1f60_4bda_9ba9_25eff556c903_5a7588fb_output` | Growth Loop Improvement Quality Judge output | contract:agent_io | open |  |  |  |
| `agent_io_626790c5_1106_49b9_afd1_c37e894d554e_a789189c_output` | Flashcard Generator output | contract:agent_io | open |  |  |  |
| `agent_io_635c8a8d_602d_49f1_a081_428ce08ec58b_1d6dab4b_output` | Competitor Classification Analyst output | contract:agent_io | open |  |  |  |
| `agent_io_656bfb21_1e8f_4f83_a9e5_f659af18db4a_62c456ce_output` | workflow_cert_blurb_writer output | contract:agent_io | open |  |  |  |
| `agent_io_66300b8e_c4b7_4a7e_8486_a807e4b788a3_4e1e7a25_output` | reply_agent output | contract:agent_io | open |  |  |  |
| `agent_io_678eb72e_edad_43bc_91d9_f68759099499_77c9fcdd_output` | Tool Renderer Author output | contract:agent_io | open |  |  |  |
| `agent_io_67df8ca0_c451_4b8e_928c_a08e93c0c8d7_82eb4390_output` | personalization_line_writer output | contract:agent_io | open |  |  |  |
| `agent_io_6a4d3db5_64d8_4b6e_99c1_ba79dabf6be7_967f4b7d_output` | Flashcard Generator (K) output | contract:agent_io | open |  |  |  |
| `agent_io_6bcccb4e_ed0e_4b63_b588_67d135f86964_4a899aa0_output` | plan_node_specialist output | contract:agent_io | open |  |  |  |
| `agent_io_6c378ff6_4581_4e5d_b99b_5cc76ad33105_91833f01_output` | coverage_analyst output | contract:agent_io | open |  |  |  |
| `agent_io_6dc766cb_7980_4e20_ad41_4b3f3620e7dd_f8624370_output` | document_verifier output | contract:agent_io | open |  |  |  |
| `agent_io_711d29b5_0afc_494c_a665_6011e529efce_a4cf0132_output` | Content Plan Brief Writer output | contract:agent_io | open |  |  |  |
| `agent_io_744cf2b6_e045_4db3_95b7_027492ae9d5b_efbda028_output` | Strunk Edit Masterwork — Editor output | contract:agent_io | open |  |  |  |
| `agent_io_75d76e8a_1924_4503_9fb0_5ca93eebbd01_69551004_output` | ner_magic_moment_detector output | contract:agent_io | open |  |  |  |
| `agent_io_77db0f64_15a3_43dd_96f7_ec9380057be8_bf583328_output` | Trust — Grade Handwritten Work (Vision, Step-by-Step) output | contract:agent_io | open |  |  |  |
| `agent_io_780fb7ab_bb27_47e9_8aeb_d9d1ed032901_2a8b5fbe_output` | Flashcard Batch Reviewer output | contract:agent_io | open |  |  |  |
| `agent_io_7a16db8c_48eb_4997_a8d0_dc4a8892d7c5_f0f810c0_output` | Content Plan Family Namer output | contract:agent_io | open |  |  |  |
| `agent_io_7a25cc39_84e6_4165_a339_8875a86aef12_e981a9b2_output` | ner_sweep_value_miner output | contract:agent_io | open |  |  |  |
| `agent_io_7a753ec4_85c3_4f2c_9867_8d8b2093999e_4fb0e78f_output` | Growth Loop Page Experience Quality Judge output | contract:agent_io | open |  |  |  |
| `agent_io_7b9925f9_0f0d_4178_83fd_4509ad5b6d65_db6696f6_output` | website_factory_page_builder output | contract:agent_io | open |  |  |  |
| `agent_io_7c3a0689_d075_4c9f_8a7b_f023ced6a87c_d5531ceb_output` | masterwork_rulebook_auditor output | contract:agent_io | open |  |  |  |
| `agent_io_7e77064d_17a3_4efe_9688_1bfdb824c88f_32f2ef31_output` | ner_sweep_scope_discoverer output | contract:agent_io | open |  |  |  |
| `agent_io_7ed4be08_6751_49d4_b6dd_e02e99a40939_281adefa_output` | hindsight_replay_judge output | contract:agent_io | open |  |  |  |
| `agent_io_810e1510_fd8d_46ed_a751_ee6b68b110e7_9245aeeb_output` | Page URL Chooser output | contract:agent_io | open |  |  |  |
| `agent_io_82643079_4670_423d_92a6_30f9e9fb3fc5_46a0c5bf_output` | WC Medical & Legal Report Extractor (Copy) output | contract:agent_io | open |  |  |  |
| `agent_io_826aaa26_baaf_4e87_b5a3_2e4bba37f053_01076762_output` | Study Memory Aid Generator output | contract:agent_io | open |  |  |  |
| `agent_io_87adedff_266a_42d3_8a02_ea83a0e6175c_fdc2221c_output` | plan_shape_agent output | contract:agent_io | open |  |  |  |
| `agent_io_8a6f15ca_5362_4f41_9d74_290b389400fb_61e35bd8_output` | Growth Loop Research Quality Judge output | contract:agent_io | open |  |  |  |
| `agent_io_8c49b869_c5ee_4bd8_8da8_2803e7366ab9_6a0b5b55_output` | FC Help Live — AI Tutor output | contract:agent_io | open |  |  |  |
| `agent_io_8ffb091c_dccf_4550_a14f_95807fd96b95_0aed942a_output` | Content Plan Keyword Binder output | contract:agent_io | open |  |  |  |
| `agent_io_9035ed6e_a936_488d_9e9b_582cc6effb7d_b9a468f0_output` | FC Help Live — AI Tutor output | contract:agent_io | open |  |  |  |
| `agent_io_90b49ead_0b82_4773_a961_234688197e0a_e55c2086_output` | Trust — Verify Card Against Source output | contract:agent_io | open |  |  |  |
| `agent_io_90ed0972_1fb5_4a86_8c71_8d1d8e381fe0_2a66a416_output` | vision_interview_answer_tracker output | contract:agent_io | open |  |  |  |
| `agent_io_90f84736_7076_47b4_aeae_0c0aec3e155f_f05e8e8a_output` | journalist_beat_analyst output | contract:agent_io | open |  |  |  |
| `agent_io_917074a0_fc06_4ff4_9805_4a517e04d08b_10a88f37_output` | Project Builder output | contract:agent_io | open |  |  |  |
| `agent_io_91d91c26_c74b_4e8b_800c_d5d34b41b7c3_8b9c08de_output` | Project Builder output | contract:agent_io | open |  |  |  |
| `agent_io_92b607a4_ad8c_488c_bd21_7030dbdd2142_3c87ef5b_output` | Study Summary Generator — From Source output | contract:agent_io | open |  |  |  |
| `agent_io_944cf37f_585e_4d7b_8afe_26c8faeb6d38_c8da1126_output` | Topic Assigner + Lazy Tree Growth output | contract:agent_io | open |  |  |  |
| `agent_io_9bc0924d_9995_41ed_b00c_09e9cf9101f1_8b2f003f_output` | hindsight_reviewer output | contract:agent_io | open |  |  |  |
| `agent_io_9cf50f70_4fda_4297_afb0_4d747adc2e38_5a35dcda_output` | ner_entity_canonicalizer output | contract:agent_io | open |  |  |  |
| `agent_io_9f8eab67_96e4_4a08_9563_7a982f920527_576aa1d4_output` | Flashcard Enrichment — fc_enrich_card output | contract:agent_io | open |  |  |  |
| `agent_io_a071396f_409d_465a_988a_98c421244ea1_f7e6d514_output` | WC Medical & Legal Report Extractor output | contract:agent_io | open |  |  |  |
| `agent_io_a1a7784c_538b_44e5_b09d_40d215b79aa6_72ad8844_output` | Content Plan Entity Attacher output | contract:agent_io | open |  |  |  |
| `agent_io_a3e9d1c4_7b62_4f08_9c5a_2d6e8f0b1a37_873f85f7_output` | Orchestra Role Describer output | contract:agent_io | open |  |  |  |
| `agent_io_a6f760c5_4919_410c_8dc0_ac128e4576ac_59839dc8_output` | Education Matrx — Flashcard Set Builder (Copy) output | contract:agent_io | open |  |  |  |
| `agent_io_a93a57ba_aed3_4f02_a5a1_c9c09a51d64d_d974600a_output` | Schema Markup Auditor output | contract:agent_io | open |  |  |  |
| `agent_io_ab2a4bad_14a3_4290_be6f_09ea42f0eeda_e2e410ab_output` | hindsight_crystallizer output | contract:agent_io | open |  |  |  |
| `agent_io_abcb288a_1520_4207_bb68_9133ac5c1b1b_c1f04bbe_output` | gsc_site_intake_interviewer output | contract:agent_io | open |  |  |  |
| `agent_io_afb89a8f_3525_451d_87fa_e19cfa183d58_e0d395cb_output` | Assessment Quiz Generator (topic) output | contract:agent_io | open |  |  |  |
| `agent_io_b39183d1_3d66_467a_ab5b_36f5cf508c45_1e3d83e2_output` | Trust — Grade Typed Answer on Meaning output | contract:agent_io | open |  |  |  |
| `agent_io_b600975c_fc8f_4f1d_ab36_670be436a038_07bb5c23_output` | Content Plan Shape Planner output | contract:agent_io | open |  |  |  |
| `agent_io_b67e60b1_3a6c_4528_a709_ee1d669c8de2_cf563426_output` | SEO Internal Authority Router output | contract:agent_io | open |  |  |  |
| `agent_io_ba3c89eb_bfd1_4768_a699_0ff5d72a51f0_23d4fe87_output` | ner_item_proposer output | contract:agent_io | open |  |  |  |
| `agent_io_be502ddf_bbdc_407e_b948_dbe515e85603_346177ab_output` | Source Authority Ranker output | contract:agent_io | open |  |  |  |
| `agent_io_c028777d_c988_4b98_a6ae_141a88512596_533d3659_output` | Education: Pronunciation Grader output | contract:agent_io | open |  |  |  |
| `agent_io_c08a4b2a_e13a_4b6c_84a7_351e57d61f3f_51c03b6b_output` | workflow_extract_namer output | contract:agent_io | open |  |  |  |
| `agent_io_c09465cb_ed23_4406_ac52_9cfaeb65e897_9194bcef_output` | Masterwork Rule Improver output | contract:agent_io | open |  |  |  |
| `agent_io_c11a5bc3_96aa_4bdd_a622_d697d66312df_e58a665f_output` | ner_item_proposer (Copy) output | contract:agent_io | open |  |  |  |
| `agent_io_c2dae3c2_ab30_4976_ae0e_a37d44791522_5d420366_output` | masterwork_exemplar_distiller output | contract:agent_io | open |  |  |  |
| `agent_io_c40fb813_6c45_4a13_8d1b_655da4ff3d2b_686f4ae3_output` | unit_purpose_writer output | contract:agent_io | open |  |  |  |
| `agent_io_c43e4497_3093_4b18_a906_b088127d8b9c_72b12cb7_output` | Content Plan Entity Curator output | contract:agent_io | open |  |  |  |
| `agent_io_c4639675_06b8_4fdb_8c9f_6332048599d6_8aef9494_output` | FastFire: Grade Spoken Answer output | contract:agent_io | open |  |  |  |
| `agent_io_c4b999a2_629d_4a00_a23f_25c63b2054d9_bb67e316_output` | Keyword Relationship Researcher output | contract:agent_io | open |  |  |  |
| `agent_io_c51f73a5_5748_4789_994d_3dbcaba63bca_1480ea59_output` | Education: Spoken Practice Session Review output | contract:agent_io | open |  |  |  |
| `agent_io_c55b52c9_fc87_40d4_befa_fbfeb899ba4d_81560c2a_output` | masterwork_audition_judge output | contract:agent_io | open |  |  |  |
| `agent_io_c7a41e02_9d5c_4f18_bd3a_6e2b81f4a930_996e13c5_output` | Research Coverage Auditor output | contract:agent_io | open |  |  |  |
| `agent_io_c85993b4_a3c4_4886_bb05_9f4a7378ec28_087dc3af_output` | Hopkins Copy Masterwork — Maker output | contract:agent_io | open |  |  |  |
| `agent_io_c8860e23_f727_479e_974f_fbc95b4f9358_7fd4eebf_output` | masterwork_monologue_distiller output | contract:agent_io | open |  |  |  |
| `agent_io_c94c1a55_a94c_4b76_b6a6_c22b9d80372c_ce9856d9_output` | website_factory_page_reviewer output | contract:agent_io | open |  |  |  |
| `agent_io_ca40bf50_75bf_494f_a463_dd78b3cc52ee_361ebb9a_output` | crm_party_kind_judge output | contract:agent_io | open |  |  |  |
| `agent_io_ca4894e1_5d42_498c_bb09_d99882d73480_32d4778d_output` | Education Matrx — Flashcard Set Builder output | contract:agent_io | open |  |  |  |
| `agent_io_ce5aaa70_ae33_4033_89c3_7fade205ea90_23b28500_output` | workflow_decision_fallback output | contract:agent_io | open |  |  |  |
| `agent_io_d07d40bb_3cac_478d_ab33_859de3cd8d02_f02aeff8_output` | Flashcard Spoken Question Writer output | contract:agent_io | open |  |  |  |
| `agent_io_d13184d4_6a46_4b08_aff4_a95b7be93fc5_055efb7b_output` | Study Mind Map Generator output | contract:agent_io | open |  |  |  |
| `agent_io_d1e2f3a4_b5c6_4d7e_8f90_a1b2c3d4e5f6_7caa2f54_output` | kg_ner_extractor_v1 output | contract:agent_io | open |  |  |  |
| `agent_io_d1e2f3a4_b5c6_4d7e_8f90_a1b2c3d4e5f7_031915ae_output` | kg_cluster_namer_v1 output | contract:agent_io | open |  |  |  |
| `agent_io_d229326f_4cca_478a_8a24_c6f21feb3d8f_073a0426_output` | Knowledge Section Summarizer output | contract:agent_io | open |  |  |  |
| `agent_io_d266e571_9439_42c4_be2c_31453c0b0520_f6c9384e_output` | masterwork_corpus_synthesizer output | contract:agent_io | open |  |  |  |
| `agent_io_d2e3f4a5_b6c7_4d8e_9f01_a2b3c4d5e6f7_93bbe9f6_output` | kg_ner_extractor_gliner_v1 output | contract:agent_io | open |  |  |  |
| `agent_io_d4e4d678_6743_4ad9_8e7b_4205a5e88a27_93337b0b_output` | Flashcard Batch Reviewer output | contract:agent_io | open |  |  |  |
| `agent_io_d54c56fe_1b6c_4d9a_9078_e664c5ce229b_71b80f83_output` | podcast_relevance_gate output | contract:agent_io | open |  |  |  |
| `agent_io_d75f8f45_07dd_4b6b_9034_249ec11a202a_8716b1a8_output` | masterwork_transcript_distiller output | contract:agent_io | open |  |  |  |
| `agent_io_d9607d65_7ff8_4512_a173_d28556db5fe5_c92305ba_output` | CRM Contact Saver output | contract:agent_io | open |  |  |  |
| `agent_io_d97d20b5_099e_4dda_9200_f7091681b7db_189bd0ab_output` | ner_scope_proposer output | contract:agent_io | open |  |  |  |
| `agent_io_dd6d1cd2_e983_4cca_aa58_b3c4a67bf4f1_3d214033_output` | ner_sweep_scope_reference_finder output | contract:agent_io | open |  |  |  |
| `agent_io_debeebae_7a9b_4c6b_b2d2_050badce980b_88a30906_output` | endpoint_family_judge output | contract:agent_io | open |  |  |  |
| `agent_io_dee57c6c_bd06_45ee_9a9d_c9d9b4f2cfe5_48f0f02e_output` | Auto-Tagger Agent output | contract:agent_io | open |  |  |  |
| `agent_io_df0e6c90_e1f2_4530_a766_f8b3302083f9_a4a141f4_output` | Flashcard Helper Writer output | contract:agent_io | open |  |  |  |
| `agent_io_e0449378_370f_4b08_baec_5bd6128d3c64_a3e0cf10_output` | FastFire: Grade Spoken Answer output | contract:agent_io | open |  |  |  |
| `agent_io_e063ded1_38b2_4721_a526_aad01d26e2ef_0e0e502c_output` | Content Plan Keyword Strategist output | contract:agent_io | open |  |  |  |
| `agent_io_e1d9c1f7_c523_4e7a_8090_a74495cdc58f_3205c2a1_output` | Education: Spoken Practice Session Designer output | contract:agent_io | open |  |  |  |
| `agent_io_e2e1d57f_54ac_446d_a434_a28ee8a6b388_4e6de3fe_output` | masterwork_checkup_auditor output | contract:agent_io | open |  |  |  |
| `agent_io_e41e5df5_0498_4750_9650_9318bb716eef_e3b63cdd_output` | Strunk Edit Masterwork — Editor output | contract:agent_io | open |  |  |  |
| `agent_io_e498664d_dcf2_4be8_94d2_58779ee01000_362d76a2_output` | Trust — Grade Handwritten Work (Vision, Step-by-Step) output | contract:agent_io | open |  |  |  |
| `agent_io_e5906994_034f_4ea0_b383_787f68bfab02_52ce5448_output` | Site Strategy Interviewer output | contract:agent_io | open |  |  |  |
| `agent_io_e681a37f_5e9f_47c0_9f42_3b6caeeb9e88_0b84d0e7_output` | Education: Language Practice Designer output | contract:agent_io | open |  |  |  |
| `agent_io_ec2b769b_d0fb_4119_b156_625431646ad6_068892eb_output` | Card Image Web Sourcer output | contract:agent_io | open |  |  |  |
| `agent_io_eef25e62_4bd8_4971_966e_d269bef9a359_22591104_output` | Flashcard Expander output | contract:agent_io | open |  |  |  |
| `agent_io_f01fed47_a0d0_4a59_90e1_c00c815351ca_8b897c42_output` | backlink_context_assessor output | contract:agent_io | open |  |  |  |
| `agent_io_f08b60a7_2051_405d_bb23_cc412f663812_aaabb250_output` | incident_assurance_adjudicator_v1 output | contract:agent_io | open |  |  |  |
| `agent_io_f0cb38e5_5de8_44de_bb7b_a22d9675f098_5f731b59_output` | SERP-Informed Keyword Intent Analyst output | contract:agent_io | open |  |  |  |
| `agent_io_f23562ce_d4e3_4591_b14d_9ed0736a7d9e_83ccd995_output` | Study Notes Generator — From Source output | contract:agent_io | open |  |  |  |
| `agent_io_f6358227_8ae5_4ed4_b58e_3c8848f13e4b_8106d2d9_output` | Growth Loop Supervisor output | contract:agent_io | open |  |  |  |
| `agent_io_f6465429_0bc0_4a7a_9493_f6f939a349b6_cb356f1d_output` | Masterwork Bad Draft Writer output | contract:agent_io | open |  |  |  |
| `agent_io_f728ac6b_8504_4b8c_83fc_5f9df947d6a9_19d724da_output` | Flashcard Generator — From Source output | contract:agent_io | open |  |  |  |
| `agent_io_f76b88a2_6433_4f60_a504_d4579b41d4aa_f11d8487_output` | Backup WC Medical & Legal Report Extractor output | contract:agent_io | open |  |  |  |
| `agent_io_f7f9f771_8729_4d9f_b9ac_2a175bb3de7e_19025cb9_output` | AI Answer Decision Signal Analyst output | contract:agent_io | open |  |  |  |
| `agent_io_f9789816_91b9_4e64_a38d_aa4d2a8127be_eacb0af7_output` | Content Plan Brief Writer output | contract:agent_io | open |  |  |  |
| `tool_io_agent_call_7e388760_5e21_48fc_baa6_39fd717c08e2_69a88e2c_input` | agent_call input | contract:tool_io | open |  |  |  |
| `tool_io_agent_call_7e388760_5e21_48fc_baa6_39fd717c08e2_69a88e2c_output` | agent_call output | contract:tool_io | open |  |  |  |
| `tool_io_agent_plan_0b24ef1d_fb7c_4417_acb3_aee412abe494_8c0e5efa_input` | agent_plan input | contract:tool_io | open |  |  |  |
| `tool_io_ai_87546016_6386_49dc_85b9_ec7566f9fe81_f9b43069_input` | ai input | contract:tool_io | open |  |  |  |
| `tool_io_browser_batch_f327e6f4_a7a4_4e8b_9913_a20e6ca3100b_1a0779b5_input` | browser_batch input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_agent_core_9d11e45d_3298_466b_abc3_d62241470505_f3112d0b_input` | bundle:list_agent-core input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_amplitude_e8f75fc1_7f8d_41a6_bde6_4f40d735671b_da0bd3c9_input` | bundle:list_amplitude input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_asana_654e0acb_02f1_4349_ac6f_98750a865c93_99567293_input` | bundle:list_asana input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_atlassian_cc82ea9e_740b_43d8_8c78_2201f8baf8c1_54d893b6_input` | bundle:list_atlassian input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_box_0810f3ca_1518_4641_be72_5d81c88c4b8b_9b1e14c1_input` | bundle:list_box input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_brave_search_13865c89_e8d6_4c61_8495_07ab0e20d218_9e424a92_input` | bundle:list_brave-search input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_canva_e0afdbc0_06af_4c94_86f1_0a8f1da7d0c1_66f3b09f_input` | bundle:list_canva input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_clay_e6453308_d88c_4947_83c5_5f6710375f0f_7b60fef1_input` | bundle:list_clay input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_cloudflare_ae3a39ab_8410_4482_8c8a_ca1823da8910_fcc16d65_input` | bundle:list_cloudflare input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_cms_8a5dc3c2_5670_4894_8295_4918dc5f13e2_4c7b8e34_input` | bundle:list_cms input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_code_ingest_1cdccfbb_e4b6_420b_9ea9_b7a917d4f879_21648b56_input` | bundle:list_code_ingest input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_context7_70297043_58c7_4cff_8b49_2f09c879fae4_d08a186d_input` | bundle:list_context7 input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_deepwiki_125e82b2_7f6b_4484_ac7d_d2442361b863_e04c343c_input` | bundle:list_deepwiki input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_figma_5fb2553b_84be_46a2_8ab8_89d5c07f0b4e_15677a1c_input` | bundle:list_figma input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_github_ad96739f_84fa_4760_b60b_5887221badae_c4b0bbc5_input` | bundle:list_github input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_google_drive_d05815e3_6d76_494c_918a_d60b1280db81_f533a165_input` | bundle:list_google-drive input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_google_workspace_791723f8_e3a6_45f9_8c50_8a8a5b1b1907_47f90e94_input` | bundle:list_google-workspace input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_hex_f9d1b85c_eeb8_412d_bffa_04bd14d7cf80_8f7e5a75_input` | bundle:list_hex input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_hubspot_06ff036d_a7b5_42d0_ada3_9a5008022def_e69f0a8b_input` | bundle:list_hubspot input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_intercom_da7de39c_a83c_40e2_9793_49bb8cee649f_23a5546e_input` | bundle:list_intercom input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_linear_81ce6eb5_c7bb_4646_b4fc_7d72c6857cdb_1368b41e_input` | bundle:list_linear input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_make_85d3cf12_7e55_4645_a758_ee67efb0aab1_23227430_input` | bundle:list_make input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_miro_f7b07af1_9ced_4ec5_b06e_624cfa373bf2_814a8b49_input` | bundle:list_miro input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_monday_3eaf96c4_524c_42bb_8edf_04fd4e289798_aec21a28_input` | bundle:list_monday input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_neon_3d00f231_2a40_4468_b94f_b15064db0876_0abf46ab_input` | bundle:list_neon input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_notion_76321c18_c738_4668_867a_4b7d9af458cf_fb6bacd1_input` | bundle:list_notion input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_paypal_5f030f9e_0327_4dcc_b1a8_47a16595374a_0007d806_input` | bundle:list_paypal input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_playwright_5ec5c4da_7dcd_465b_a3b8_52b16f55bdf8_98706e75_input` | bundle:list_playwright input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_postgres_54922b42_fe27_46ca_91c1_bc141c77934c_99523c50_input` | bundle:list_postgres input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_resend_724030b9_3234_4e0e_988c_5465339c67ff_d0a81585_input` | bundle:list_resend input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_salesforce_2109ab20_858c_4c6b_abd3_c284194c702c_db279521_input` | bundle:list_salesforce input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_sentry_9b7c1bdb_d36a_4c3b_b92d_26b451f5bc83_1ccfc21b_input` | bundle:list_sentry input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_slack_caf1715a_3b44_45c6_a7d8_4ed3fd5cdf96_0522cf57_input` | bundle:list_slack input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_square_a707d15d_616e_4237_ba30_fb6a3d88af99_d3a3cd8b_input` | bundle:list_square input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_stripe_8b485ae1_7d28_433b_8279_bca52126dd52_8b5deb4d_input` | bundle:list_stripe input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_supabase_d5fef86f_0998_4daf_b6d3_4b362732ac7a_b151c76a_input` | bundle:list_supabase input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_vercel_2560938e_2e9c_4508_89aa_e46a41dc3775_45752adc_input` | bundle:list_vercel input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_webflow_22ae035b_46f2_4f15_aa68_846080497aac_6d5f3d86_input` | bundle:list_webflow input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_wix_09ad0869_b870_4c17_a515_25d4608c8864_1878e94b_input` | bundle:list_wix input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_zapier_725d1658_cb52_4591_9834_f99c4a1f7374_3297a149_input` | bundle:list_zapier input | contract:tool_io | open |  |  |  |
| `tool_io_bundle_list_zoho_5db0df16_ad69_4a5a_9e40_0c4966075934_794fe4ef_input` | bundle:list_zoho input | contract:tool_io | open |  |  |  |
| `tool_io_capture_prospect_f2bc0ea3_e414_4718_b3bb_630d582a87de_15d1f324_input` | capture_prospect input | contract:tool_io | open |  |  |  |
| `tool_io_capture_study_set_51a71551_85eb_4b09_bbbf_915aec41cc5b_55cf7363_input` | capture_study_set input | contract:tool_io | open |  |  |  |
| `tool_io_cdp_a11y_tree_2c01c7fa_3259_4e04_b35d_10ccf14d1386_dc9fef91_input` | cdp_a11y_tree input | contract:tool_io | open |  |  |  |
| `tool_io_cdp_emulate_9b3d29b1_031d_4564_8f35_bb0d7d7cc42c_2c3b0be1_input` | cdp_emulate input | contract:tool_io | open |  |  |  |
| `tool_io_cdp_full_page_screenshot_04784482_2e61_44fa_b695_af15ae876721_20cdc535_input` | cdp_full_page_screenshot input | contract:tool_io | open |  |  |  |
| `tool_io_cdp_input_click_xy_e923f323_ba92_4bb2_930a_fef2f3336222_c78f09ee_input` | cdp_input_click_xy input | contract:tool_io | open |  |  |  |
| `tool_io_cdp_input_type_7014fb07_6214_4d41_968e_7b7dfdddd304_f68482ef_input` | cdp_input_type input | contract:tool_io | open |  |  |  |
| `tool_io_cdp_network_capture_drain_eee5ced3_2f5a_41e2_a911_80f48160bf88_3c2223c2_input` | cdp_network_capture_drain input | contract:tool_io | open |  |  |  |
| `tool_io_cdp_network_capture_start_6cfeaae2_9910_40dc_baf3_45e0e52164e1_8369ec28_input` | cdp_network_capture_start input | contract:tool_io | open |  |  |  |
| `tool_io_cdp_network_capture_stop_c88124da_3061_4405_b5f1_5a83c99d0304_e9fd3766_input` | cdp_network_capture_stop input | contract:tool_io | open |  |  |  |
| `tool_io_cdp_network_get_body_c80a0e80_d103_4c1d_b1e4_ce46ac62a0aa_bf4000f2_input` | cdp_network_get_body input | contract:tool_io | open |  |  |  |
| `tool_io_cdp_perf_metrics_98c5f44d_d70e_4a82_860e_e40221a818d2_97f6f63b_input` | cdp_perf_metrics input | contract:tool_io | open |  |  |  |
| `tool_io_cdp_print_pdf_d3dc40a8_3d7c_4ad0_93ca_9efe554e4f2d_c05e4889_input` | cdp_print_pdf input | contract:tool_io | open |  |  |  |
| `tool_io_cdp_session_aa45954b_92a1_47b9_a35f_ef7eb2a17c32_3378788a_input` | cdp_session input | contract:tool_io | open |  |  |  |
| `tool_io_chrome_bookmarks_e379dfe1_b04a_49bd_865e_f6c4324286b5_5bf4db29_input` | chrome_bookmarks input | contract:tool_io | open |  |  |  |
| `tool_io_chrome_cookies_b8d350c6_8ef3_4c05_86a7_767ecf0eee70_211658d3_input` | chrome_cookies input | contract:tool_io | open |  |  |  |
| `tool_io_chrome_history_18c688c0_152e_4ff6_b872_3f3073c239f3_7246b2c7_input` | chrome_history input | contract:tool_io | open |  |  |  |
| `tool_io_chrome_recently_closed_96259e12_393f_4941_84cc_d87fe520888d_9cd13e0c_input` | chrome_recently_closed input | contract:tool_io | open |  |  |  |
| `tool_io_chrome_record_gif_5c350bca_ed0b_4b31_a697_797bb3901f6f_27ebc3e9_input` | chrome_record_gif input | contract:tool_io | open |  |  |  |
| `tool_io_chrome_record_tab_video_c94f7907_9650_477f_8dd6_fbbae4eac83e_39e99077_input` | chrome_record_tab_video input | contract:tool_io | open |  |  |  |
| `tool_io_chrome_save_page_as_mhtml_5549cdd7_9687_48ac_a844_1056efffb76f_2a08c986_input` | chrome_save_page_as_mhtml input | contract:tool_io | open |  |  |  |
| `tool_io_chrome_tab_audio_inspect_707c383f_be07_497f_8a1e_16616c4f7e9f_00828bb0_input` | chrome_tab_audio_inspect input | contract:tool_io | open |  |  |  |
| `tool_io_chrome_webmcp_4186d293_a330_4e85_b74d_af4c5b7fc24c_db161e68_input` | chrome_webmcp input | contract:tool_io | open |  |  |  |
| `tool_io_clipboard_163b5e55_9d14_4db4_a0c7_07053147a17f_0a522606_input` | clipboard input | contract:tool_io | open |  |  |  |
| `tool_io_cloud_file_5342c01f_dc07_46cd_ac25_938ddf9ffed8_d631d220_input` | cloud_file input | contract:tool_io | open |  |  |  |
| `tool_io_cms_asset_b5cabbb4_80ac_4edb_a4f8_a681ad388025_042a613c_input` | cms_asset input | contract:tool_io | open |  |  |  |
| `tool_io_cms_collection_2cb74192_baaa_4588_8d41_082d343511e3_c3d77339_input` | cms_collection input | contract:tool_io | open |  |  |  |
| `tool_io_cms_component_7e011d00_32de_4f5b_b77f_c2b4a8d2e7d1_fba5f48a_input` | cms_component input | contract:tool_io | open |  |  |  |
| `tool_io_cms_data_42d05f8a_e1fe_425f_95cd_e4904fb2a92a_26854a7e_input` | cms_data input | contract:tool_io | open |  |  |  |
| `tool_io_cms_find_page_826e85b4_bdf8_4b9e_9525_f9f7a9f9cd85_4cf3c146_input` | cms_find_page input | contract:tool_io | open |  |  |  |
| `tool_io_cms_inspect_9064b4d3_d197_471d_bbd1_73c69362f6e4_2e024412_input` | cms_inspect input | contract:tool_io | open |  |  |  |
| `tool_io_cms_page_f3fd829c_eed7_41cc_b90a_86a4d5d6b025_7c5cd862_input` | cms_page input | contract:tool_io | open |  |  |  |
| `tool_io_cms_site_30213100_cb38_4646_ad37_96d2fa401a7a_4e9dbfb6_input` | cms_site input | contract:tool_io | open |  |  |  |
| `tool_io_cms_verify_66d40642_b9ef_4d47_8306_fb38ec405517_56b9d7ac_input` | cms_verify input | contract:tool_io | open |  |  |  |
| `tool_io_code_execute_python_829a57f8_d627_4c4a_8e6a_7fb7e34324bf_12b6c748_input` | code_execute_python input | contract:tool_io | open |  |  |  |
| `tool_io_code_execute_python_829a57f8_d627_4c4a_8e6a_7fb7e34324bf_12b6c748_output` | code_execute_python output | contract:tool_io | open |  |  |  |
| `tool_io_code_fetch_code_6b3cdb76_bdd5_4865_a1e1_a6963f19eecb_92c6623f_input` | code_fetch_code input | contract:tool_io | open |  |  |  |
| `tool_io_code_fetch_code_6b3cdb76_bdd5_4865_a1e1_a6963f19eecb_92c6623f_output` | code_fetch_code output | contract:tool_io | open |  |  |  |
| `tool_io_code_fetch_tree_48baedf8_c8cf_4fa6_aa06_cec550dec12c_f9bf5fc4_input` | code_fetch_tree input | contract:tool_io | open |  |  |  |
| `tool_io_code_fetch_tree_48baedf8_c8cf_4fa6_aa06_cec550dec12c_f9bf5fc4_output` | code_fetch_tree output | contract:tool_io | open |  |  |  |
| `tool_io_code_store_html_adb3497c_f2d9_403c_91b0_7692f73daf55_ec90ee36_input` | code_store_html input | contract:tool_io | open |  |  |  |
| `tool_io_code_store_html_adb3497c_f2d9_403c_91b0_7692f73daf55_ec90ee36_output` | code_store_html output | contract:tool_io | open |  |  |  |
| `tool_io_computer_0b640927_e778_443a_a846_cc421743b201_bcec5473_input` | computer input | contract:tool_io | open |  |  |  |
| `tool_io_content_plan_ff3e8fff_e2a8_47bd_a482_02e32562695b_bb1540aa_input` | content_plan input | contract:tool_io | open |  |  |  |
| `tool_io_context_e7926270_661c_4033_a151_00686f67c296_60abdbda_input` | context input | contract:tool_io | open |  |  |  |
| `tool_io_context_e7926270_661c_4033_a151_00686f67c296_60abdbda_output` | context output | contract:tool_io | open |  |  |  |
| `tool_io_context_patch_136dfa0d_d0dc_449c_a1e3_ec010de50909_8275f6aa_input` | context_patch input | contract:tool_io | open |  |  |  |
| `tool_io_conversations_fe13769f_59b5_43bd_89d4_daa8fffe611e_e4481642_input` | conversations input | contract:tool_io | open |  |  |  |
| `tool_io_credential_login_4226b9d1_1ddc_4115_9ab2_81d4313c2e18_988cf8f2_input` | credential_login input | contract:tool_io | open |  |  |  |
| `tool_io_data_040bf60c_41bd_4510_bab1_a8bd06c0f094_ba250103_input` | data input | contract:tool_io | open |  |  |  |
| `tool_io_data_action_b58f9537_c3f2_4081_aa84_948792ba24a1_34af83f0_input` | data_action input | contract:tool_io | open |  |  |  |
| `tool_io_data_patterns_c1c6d788_cf8a_47b0_8380_d5e9458b4205_a98a06a6_input` | data_patterns input | contract:tool_io | open |  |  |  |
| `tool_io_dataset_57953f50_24eb_43ad_b8e9_9c1fe73433a7_3e82c5aa_input` | dataset input | contract:tool_io | open |  |  |  |
| `tool_io_db_admin_7582cde2_ce95_4a8c_82a3_dc7ed3cbb5c2_bb7ddcf4_input` | db_admin input | contract:tool_io | open |  |  |  |
| `tool_io_db_user_627412fe_793e_4d1d_ade5_a00710707319_5542c7b1_input` | db_user input | contract:tool_io | open |  |  |  |
| `tool_io_debug_traces_by_call_76bb3f48_cd0f_40aa_b0df_d7f9e63555cf_c4c855c4_input` | debug_traces_by_call input | contract:tool_io | open |  |  |  |
| `tool_io_debug_traces_by_conv_2d329319_f7e9_412e_af19_b5e5699e1044_e58a7c3f_input` | debug_traces_by_conv input | contract:tool_io | open |  |  |  |
| `tool_io_debug_traces_failures_since_f7c83191_3c6b_4a7a_82bd_fd1a98370796_cafbb95c_input` | debug_traces_failures_since input | contract:tool_io | open |  |  |  |
| `tool_io_debug_traces_get_file_141b6688_4ed8_4f1f_a78b_b14b341d15e7_b8baee3e_input` | debug_traces_get_file input | contract:tool_io | open |  |  |  |
| `tool_io_debug_traces_list_files_6765b92d_fa56_44b1_b755_a4b3572f99cf_a80b1f0e_input` | debug_traces_list_files input | contract:tool_io | open |  |  |  |
| `tool_io_debug_traces_recent_485a7212_a816_4d30_87f5_8076a9f707ee_edab87ef_input` | debug_traces_recent input | contract:tool_io | open |  |  |  |
| `tool_io_delete_demo_fea4569a_51d7_44cb_8efc_017f3815a847_89ea011e_input` | delete_demo input | contract:tool_io | open |  |  |  |
| `tool_io_delete_guidance_item_585a9b5d_ad64_47ef_b142_b42cce930a9d_d33349fb_input` | delete_guidance_item input | contract:tool_io | open |  |  |  |
| `tool_io_describe_demo_6fe5f77b_c49a_487a_bffb_86d96183d874_7b97a80a_input` | describe_demo input | contract:tool_io | open |  |  |  |
| `tool_io_desktop_run_command_3667a6f0_9dad_4e4e_b83c_7b0deeed1008_3ac89bbd_input` | desktop_run_command input | contract:tool_io | open |  |  |  |
| `tool_io_dictionary_04920d8d_0a54_4010_8ac1_9675942b1aec_51c6429f_input` | dictionary input | contract:tool_io | open |  |  |  |
| `tool_io_document_a60d0f28_e589_40e6_abde_110d098f52fc_1866da5d_input` | document input | contract:tool_io | open |  |  |  |
| `tool_io_document_content_8ad85268_8052_4941_86de_e1e3b34e0737_f6757bf0_input` | document_content input | contract:tool_io | open |  |  |  |
| `tool_io_document_search_85a77577_e9c4_4267_b897_5956a225bc04_e833467d_input` | document_search input | contract:tool_io | open |  |  |  |
| `tool_io_downloads_a85d7453_b89d_4287_8fa3_403103cbf88f_bf97f6c8_input` | downloads input | contract:tool_io | open |  |  |  |
| `tool_io_drop_file_af0cf047_edbe_409b_b550_b0be0f4ba6a1_e52dd5c3_input` | drop_file input | contract:tool_io | open |  |  |  |
| `tool_io_evaluate_javascript_61a964d0_0935_4081_82a1_e5a4f9483c8f_b5f8789c_input` | evaluate_javascript input | contract:tool_io | open |  |  |  |
| `tool_io_extract_microdata_d1aef4bd_e5ef_4bef_8fc8_2a0a5b458b87_6c44d486_input` | extract_microdata input | contract:tool_io | open |  |  |  |
| `tool_io_extract_table_1c2e654e_bcb0_45ed_8e8d_1eb3cbf353aa_32395816_input` | extract_table input | contract:tool_io | open |  |  |  |
| `tool_io_fetch_tool_result_76ab92d9_e7cd_4ce7_8045_70ea69811b40_b6ac08c5_input` | fetch_tool_result input | contract:tool_io | open |  |  |  |
| `tool_io_fetch_url_as_markdown_5654f4ef_ef37_4150_85fb_cb36f3a5389e_700b3513_input` | fetch_url_as_markdown input | contract:tool_io | open |  |  |  |
| `tool_io_file_read_c02761b6_fc8a_4b56_95ac_b8d354f1baf8_880c0c94_input` | file_read input | contract:tool_io | open |  |  |  |
| `tool_io_find_6eeb1534_62f6_4785_a1e2_97a2aaa1d6b0_b8acde04_input` | find input | contract:tool_io | open |  |  |  |
| `tool_io_find_text_on_page_1f2ad5bc_5549_48d3_b20c_1bcbbe4d3bb3_7f8d5217_input` | find_text_on_page input | contract:tool_io | open |  |  |  |
| `tool_io_form_input_9ac5f0a7_98f1_4724_abe0_51b68d964e1f_af458c1c_input` | form_input input | contract:tool_io | open |  |  |  |
| `tool_io_fs_edit_f87cc9a2_6764_4d51_9928_f29c3fd8d246_b46cc4f5_input` | fs_edit input | contract:tool_io | open |  |  |  |
| `tool_io_fs_edit_f87cc9a2_6764_4d51_9928_f29c3fd8d246_b46cc4f5_output` | fs_edit output | contract:tool_io | open |  |  |  |
| `tool_io_fs_list_486a57f9_f3ff_4cdb_8844_a18fd0e6da90_ede55786_input` | fs_list input | contract:tool_io | open |  |  |  |
| `tool_io_fs_list_486a57f9_f3ff_4cdb_8844_a18fd0e6da90_ede55786_output` | fs_list output | contract:tool_io | open |  |  |  |
| `tool_io_fs_mkdir_e84a3c59_2a56_4d59_9841_e47d050b15e0_121c6dc0_input` | fs_mkdir input | contract:tool_io | open |  |  |  |
| `tool_io_fs_mkdir_e84a3c59_2a56_4d59_9841_e47d050b15e0_121c6dc0_output` | fs_mkdir output | contract:tool_io | open |  |  |  |
| `tool_io_fs_patch_61cbb6ee_26ca_4146_b024_e021411e8bed_cde2a91c_input` | fs_patch input | contract:tool_io | open |  |  |  |
| `tool_io_fs_patch_61cbb6ee_26ca_4146_b024_e021411e8bed_cde2a91c_output` | fs_patch output | contract:tool_io | open |  |  |  |
| `tool_io_fs_read_260283ef_0a46_48c5_992d_2a4bb0dc1dcf_558bd4c4_input` | fs_read input | contract:tool_io | open |  |  |  |
| `tool_io_fs_read_260283ef_0a46_48c5_992d_2a4bb0dc1dcf_558bd4c4_output` | fs_read output | contract:tool_io | open |  |  |  |
| `tool_io_fs_search_a81df8a1_95c7_4bfb_9f74_b76179a01452_01ba26b7_input` | fs_search input | contract:tool_io | open |  |  |  |
| `tool_io_fs_search_a81df8a1_95c7_4bfb_9f74_b76179a01452_01ba26b7_output` | fs_search output | contract:tool_io | open |  |  |  |
| `tool_io_fs_write_88b70cf2_3af6_4768_b40c_090027638166_9e11a535_input` | fs_write input | contract:tool_io | open |  |  |  |
| `tool_io_fs_write_88b70cf2_3af6_4768_b40c_090027638166_9e11a535_output` | fs_write output | contract:tool_io | open |  |  |  |
| `tool_io_get_computed_style_1ed5224c_0d01_4958_baff_b381ba73cade_afdf7d7b_input` | get_computed_style input | contract:tool_io | open |  |  |  |
| `tool_io_get_element_at_point_00171572_ef21_4864_b812_0c9f3a81fc84_99ef219d_input` | get_element_at_point input | contract:tool_io | open |  |  |  |
| `tool_io_get_element_details_6565b9a9_31e7_446f_90f7_6b725ed5406f_2b86eebf_input` | get_element_details input | contract:tool_io | open |  |  |  |
| `tool_io_get_form_fields_aba94c34_8633_48d0_8118_2a2212b76714_4e2076c9_input` | get_form_fields input | contract:tool_io | open |  |  |  |
| `tool_io_get_guidance_item_6b5d84a7_f2a7_4766_8da4_a6d1f26e8c78_17a4e039_input` | get_guidance_item input | contract:tool_io | open |  |  |  |
| `tool_io_get_open_trace_incidents_e434425a_6692_431e_8c66_8b8c49a3633e_e00af3ac_input` | get_open_trace_incidents input | contract:tool_io | open |  |  |  |
| `tool_io_get_page_links_dcad250d_45e3_40c7_96a0_f235e8b248a7_119707a6_input` | get_page_links input | contract:tool_io | open |  |  |  |
| `tool_io_get_page_selection_bb54630f_203a_44dd_acf7_2e0052d2df95_da909a9a_input` | get_page_selection input | contract:tool_io | open |  |  |  |
| `tool_io_get_page_text_1ad3f006_22e5_4ef1_ba58_de88106809e4_7be65084_input` | get_page_text input | contract:tool_io | open |  |  |  |
| `tool_io_get_request_body_420580d3_5395_477f_a981_c9d509b56c59_4330437c_input` | get_request_body input | contract:tool_io | open |  |  |  |
| `tool_io_git_ingest_33aede5d_1372_4a15_abbc_6b97b75c478f_13d6ba56_input` | git_ingest input | contract:tool_io | open |  |  |  |
| `tool_io_html_page_9137ef5d_ea15_4ee7_b2e2_a0c343e805d0_3f3a4174_input` | html_page input | contract:tool_io | open |  |  |  |
| `tool_io_inspect_element_7b08dea7_9973_4f8a_8725_fbb4028452ba_379201f4_input` | inspect_element input | contract:tool_io | open |  |  |  |
| `tool_io_instance_create_a8dc859f_de59_44b4_8d1c_a8c5a778c0a1_0375c939_input` | instance_create input | contract:tool_io | open |  |  |  |
| `tool_io_instance_create_a8dc859f_de59_44b4_8d1c_a8c5a778c0a1_0375c939_output` | instance_create output | contract:tool_io | open |  |  |  |
| `tool_io_instance_delete_0be4bb80_869a_45f6_932f_c7a8e8b40bd2_387b880b_input` | instance_delete input | contract:tool_io | open |  |  |  |
| `tool_io_instance_delete_0be4bb80_869a_45f6_932f_c7a8e8b40bd2_387b880b_output` | instance_delete output | contract:tool_io | open |  |  |  |
| `tool_io_instance_get_f43d093a_fea0_4c94_bb7a_d782a564cced_ac77bf8d_input` | instance_get input | contract:tool_io | open |  |  |  |
| `tool_io_instance_get_f43d093a_fea0_4c94_bb7a_d782a564cced_ac77bf8d_output` | instance_get output | contract:tool_io | open |  |  |  |
| `tool_io_instance_list_497ab0b4_7f7a_4ada_8d05_c396c6dfc477_10314dfb_input` | instance_list input | contract:tool_io | open |  |  |  |
| `tool_io_instance_list_497ab0b4_7f7a_4ada_8d05_c396c6dfc477_10314dfb_output` | instance_list output | contract:tool_io | open |  |  |  |
| `tool_io_instance_update_fdb47179_930c_44aa_8694_3ab967454996_202c7dcf_input` | instance_update input | contract:tool_io | open |  |  |  |
| `tool_io_instance_update_fdb47179_930c_44aa_8694_3ab967454996_202c7dcf_output` | instance_update output | contract:tool_io | open |  |  |  |
| `tool_io_kind_activate_c58815d4_50d7_4fff_9f2e_4b2b743e8e73_0e6cdb76_input` | kind_activate input | contract:tool_io | open |  |  |  |
| `tool_io_kind_add_example_4e4784c4_e0c1_4f26_a8ca_6b49f53a328d_3d9fa8d6_input` | kind_add_example input | contract:tool_io | open |  |  |  |
| `tool_io_kind_add_example_4e4784c4_e0c1_4f26_a8ca_6b49f53a328d_3d9fa8d6_output` | kind_add_example output | contract:tool_io | open |  |  |  |
| `tool_io_kind_create_670a1fd1_081a_41bc_b5ed_36cebef459f5_0b0f4d89_input` | kind_create input | contract:tool_io | open |  |  |  |
| `tool_io_kind_create_670a1fd1_081a_41bc_b5ed_36cebef459f5_0b0f4d89_output` | kind_create output | contract:tool_io | open |  |  |  |
| `tool_io_kind_create_content_block_937fe4bf_83d5_41c8_9b4b_34b00009dcd1_4e32f3b9_input` | kind_create_content_block input | contract:tool_io | open |  |  |  |
| `tool_io_kind_create_content_block_937fe4bf_83d5_41c8_9b4b_34b00009dcd1_4e32f3b9_output` | kind_create_content_block output | contract:tool_io | open |  |  |  |
| `tool_io_kind_create_skill_1f6147fd_70f8_413f_a191_410bdd9b4063_99cc78c9_input` | kind_create_skill input | contract:tool_io | open |  |  |  |
| `tool_io_kind_create_skill_1f6147fd_70f8_413f_a191_410bdd9b4063_99cc78c9_output` | kind_create_skill output | contract:tool_io | open |  |  |  |
| `tool_io_kind_get_53592aa2_fc62_4bd2_923f_88a368b675c9_cdf18574_input` | kind_get input | contract:tool_io | open |  |  |  |
| `tool_io_kind_get_53592aa2_fc62_4bd2_923f_88a368b675c9_cdf18574_output` | kind_get output | contract:tool_io | open |  |  |  |
| `tool_io_kind_update_schema_d53a4021_d0b9_4cb2_ab04_dd48487d1616_19b2a03f_input` | kind_update_schema input | contract:tool_io | open |  |  |  |
| `tool_io_kind_update_schema_d53a4021_d0b9_4cb2_ab04_dd48487d1616_19b2a03f_output` | kind_update_schema output | contract:tool_io | open |  |  |  |
| `tool_io_kindcomp_create_component_478a46af_6b15_4e88_aed7_82e9d9dc4f88_d439fb8c_input` | kindcomp_create_component input | contract:tool_io | open |  |  |  |
| `tool_io_kindcomp_create_component_478a46af_6b15_4e88_aed7_82e9d9dc4f88_d439fb8c_output` | kindcomp_create_component output | contract:tool_io | open |  |  |  |
| `tool_io_kindcomp_get_code_eeded970_e440_4624_a691_2c57e1ebe9b3_0af584bf_input` | kindcomp_get_code input | contract:tool_io | open |  |  |  |
| `tool_io_kindcomp_get_code_eeded970_e440_4624_a691_2c57e1ebe9b3_0af584bf_output` | kindcomp_get_code output | contract:tool_io | open |  |  |  |
| `tool_io_kindcomp_get_context_15fd12b9_c744_4828_93cc_b2f428ef6995_c3af2a73_input` | kindcomp_get_context input | contract:tool_io | open |  |  |  |
| `tool_io_kindcomp_get_context_15fd12b9_c744_4828_93cc_b2f428ef6995_c3af2a73_output` | kindcomp_get_context output | contract:tool_io | open |  |  |  |
| `tool_io_kindcomp_patch_code_1a136a85_7975_4301_9ae0_bc53ec8a27d6_845721cf_input` | kindcomp_patch_code input | contract:tool_io | open |  |  |  |
| `tool_io_kindcomp_patch_code_1a136a85_7975_4301_9ae0_bc53ec8a27d6_845721cf_output` | kindcomp_patch_code output | contract:tool_io | open |  |  |  |
| `tool_io_kindcomp_resolve_incident_11604569_c2b3_461c_8ad7_57b9f82013e8_c4641a72_input` | kindcomp_resolve_incident input | contract:tool_io | open |  |  |  |
| `tool_io_kindcomp_resolve_incident_11604569_c2b3_461c_8ad7_57b9f82013e8_c4641a72_output` | kindcomp_resolve_incident output | contract:tool_io | open |  |  |  |
| `tool_io_kindcomp_update_code_46f638db_48b3_449b_ad26_63fbae0333eb_534fe537_input` | kindcomp_update_code input | contract:tool_io | open |  |  |  |
| `tool_io_kindcomp_update_code_46f638db_48b3_449b_ad26_63fbae0333eb_534fe537_output` | kindcomp_update_code output | contract:tool_io | open |  |  |  |
| `tool_io_kindcomp_update_settings_f47ab968_f23b_4ccb_8c0e_738f813dce1d_4ba85fe4_input` | kindcomp_update_settings input | contract:tool_io | open |  |  |  |
| `tool_io_kindcomp_update_settings_f47ab968_f23b_4ccb_8c0e_738f813dce1d_4ba85fe4_output` | kindcomp_update_settings output | contract:tool_io | open |  |  |  |
| `tool_io_knowledge_browse_df009bb5_1b9a_49a4_8db1_90b654f970a2_15492d39_input` | knowledge_browse input | contract:tool_io | open |  |  |  |
| `tool_io_knowledge_browse_df009bb5_1b9a_49a4_8db1_90b654f970a2_15492d39_output` | knowledge_browse output | contract:tool_io | open |  |  |  |
| `tool_io_knowledge_compare_16964a48_af53_423d_a3c4_0ff3a0a061eb_cac36d48_input` | knowledge_compare input | contract:tool_io | open |  |  |  |
| `tool_io_knowledge_compare_16964a48_af53_423d_a3c4_0ff3a0a061eb_cac36d48_output` | knowledge_compare output | contract:tool_io | open |  |  |  |
| `tool_io_knowledge_search_3921fc69_0763_4538_9e36_5a29a088a5bd_fdb49665_input` | knowledge_search input | contract:tool_io | open |  |  |  |
| `tool_io_knowledge_search_3921fc69_0763_4538_9e36_5a29a088a5bd_fdb49665_output` | knowledge_search output | contract:tool_io | open |  |  |  |
| `tool_io_list_browser_tools_1c5a06e7_ab2d_4c97_b804_a66393aac2ba_492501ff_input` | list_browser_tools input | contract:tool_io | open |  |  |  |
| `tool_io_list_demos_b5ff58c3_77dd_43d9_83a6_46ec9c7bb323_44cbcb8b_input` | list_demos input | contract:tool_io | open |  |  |  |
| `tool_io_list_guidance_d1a34e41_3a57_4646_a84c_bf5bf930af28_fa9384c2_input` | list_guidance input | contract:tool_io | open |  |  |  |
| `tool_io_list_highlights_6f4853ff_190b_4df6_8c77_5261e0c1c28f_b0c7fab8_input` | list_highlights input | contract:tool_io | open |  |  |  |
| `tool_io_llms_txt_fetch_119fe210_9000_4b54_970b_a96f23cf9471_f70c3bc4_input` | llms_txt_fetch input | contract:tool_io | open |  |  |  |
| `tool_io_load_browser_tools_3dd2eef1_212c_4ca2_a128_ec5c95e086de_1e406579_input` | load_browser_tools input | contract:tool_io | open |  |  |  |
| `tool_io_load_desktop_tools_c2b20f9a_129e_4a67_8384_ea326014c86d_7056fb43_input` | load_desktop_tools input | contract:tool_io | open |  |  |  |
| `tool_io_local_audio_ed3d955c_e967_433b_8f93_8aaa17f76209_1bfbd469_input` | local_audio input | contract:tool_io | open |  |  |  |
| `tool_io_local_browser_5703e56e_c73b_41e5_b118_3c770fa48666_4d2b07fb_input` | local_browser input | contract:tool_io | open |  |  |  |
| `tool_io_local_browser_5703e56e_c73b_41e5_b118_3c770fa48666_4d2b07fb_output` | local_browser output | contract:tool_io | open |  |  |  |
| `tool_io_local_clipboard_0dd53135_4adf_4c20_ad4d_4bfc3c67f888_2b19e821_input` | local_clipboard input | contract:tool_io | open |  |  |  |
| `tool_io_local_documents_a4ee024f_5f00_494c_9dab_4f39fa0e3366_b5d093ac_input` | local_documents input | contract:tool_io | open |  |  |  |
| `tool_io_local_file_59c47f46_cc23_459b_b3ea_85071d319c55_f2899ef4_input` | local_file input | contract:tool_io | open |  |  |  |
| `tool_io_local_input_2dcd7887_e355_45e4_b91d_e16d1a8e7fb7_cf07a860_input` | local_input input | contract:tool_io | open |  |  |  |
| `tool_io_local_mac_apps_f7378f4b_0c3a_4a73_9509_e0a8127fb98b_d35f94cf_input` | local_mac_apps input | contract:tool_io | open |  |  |  |
| `tool_io_local_media_a7c73e4e_bffe_4e94_b9b1_d19fcc90cdcf_a19ed4c3_input` | local_media input | contract:tool_io | open |  |  |  |
| `tool_io_local_monitor_242dabcd_1817_4369_a9e4_38913103d7f7_d25c30f6_input` | local_monitor input | contract:tool_io | open |  |  |  |
| `tool_io_local_ner_31cf6df3_8080_488c_8230_1d3cad382c62_77ad576d_input` | local_ner input | contract:tool_io | open |  |  |  |
| `tool_io_local_net_1a596195_0ac0_4e2e_9803_292e6301b3ca_b7f4cd0a_input` | local_net input | contract:tool_io | open |  |  |  |
| `tool_io_local_process_984bd0c8_f9dd_4f43_b930_b70d2b306d96_b2c0e3ed_input` | local_process input | contract:tool_io | open |  |  |  |
| `tool_io_local_schedule_7dd5a6c5_0005_49be_81a3_9b27691722a5_99562b9f_input` | local_schedule input | contract:tool_io | open |  |  |  |
| `tool_io_local_screen_bd730c6b_9d91_4c81_a96a_a041b86a682e_584c38fa_input` | local_screen input | contract:tool_io | open |  |  |  |
| `tool_io_local_screen_bd730c6b_9d91_4c81_a96a_a041b86a682e_584c38fa_output` | local_screen output | contract:tool_io | open |  |  |  |
| `tool_io_local_shell_f4b4c748_3627_4585_8b1f_7a756fb55550_4ae0951c_input` | local_shell input | contract:tool_io | open |  |  |  |
| `tool_io_local_system_78c7e3fa_a3da_497f_8205_5688a21acce4_88168125_input` | local_system input | contract:tool_io | open |  |  |  |
| `tool_io_local_web_8b435ccc_2482_42e9_b0f3_01658eb079bd_eb572b65_input` | local_web input | contract:tool_io | open |  |  |  |
| `tool_io_local_window_a71c88c6_5c23_41a0_9636_36fac832be99_76d7403d_input` | local_window input | contract:tool_io | open |  |  |  |
| `tool_io_local_windows_ps_efab5ca0_ad6e_4bf5_b087_b14cd6861e05_95a535f3_input` | local_windows_ps input | contract:tool_io | open |  |  |  |
| `tool_io_math_calculate_8b764ee2_dbc1_4491_a960_3322ffb12fd4_a504da9e_input` | math_calculate input | contract:tool_io | open |  |  |  |
| `tool_io_math_calculate_8b764ee2_dbc1_4491_a960_3322ffb12fd4_a504da9e_output` | math_calculate output | contract:tool_io | open |  |  |  |
| `tool_io_memory_3c121dff_1df9_47e7_9894_a5693e89a7d5_0a9e4b91_input` | memory input | contract:tool_io | open |  |  |  |
| `tool_io_mutation_watch_3421160d_9c7d_4c5d_a316_6392b5caae7d_6720d1a0_input` | mutation_watch input | contract:tool_io | open |  |  |  |
| `tool_io_navigate_dbfdac6d_ffdd_49ce_95bb_7878d1690e75_48e23c8d_input` | navigate input | contract:tool_io | open |  |  |  |
| `tool_io_news_get_headlines_f570b5d4_86bc_4345_9241_dc236bc5c25b_e6a5b3b2_input` | news_get_headlines input | contract:tool_io | open |  |  |  |
| `tool_io_news_get_headlines_f570b5d4_86bc_4345_9241_dc236bc5c25b_e6a5b3b2_output` | news_get_headlines output | contract:tool_io | open |  |  |  |
| `tool_io_note_116f5956_0744_41cf_abd8_38f82bf5d835_01199ff5_input` | note input | contract:tool_io | open |  |  |  |
| `tool_io_office_a4ed9f04_1d6a_4d79_9a3e_7c64894e44ef_14d8bc6e_input` | office input | contract:tool_io | open |  |  |  |
| `tool_io_package_info_2208b14c_1cfc_45d7_9305_6ab2e40e3a1a_af4fbd50_input` | package_info input | contract:tool_io | open |  |  |  |
| `tool_io_picklist_f0467a72_7e2e_478e_9aea_ed93311f1066_ca642cba_input` | picklist input | contract:tool_io | open |  |  |  |
| `tool_io_query_elements_7e9b9fac_17a3_4dba_a758_854bd0adcc7e_d7b31107_input` | query_elements input | contract:tool_io | open |  |  |  |
| `tool_io_random_wheel_0d8f2668_f341_4ec3_8e9e_000044f35ffc_723b3664_input` | random_wheel input | contract:tool_io | open |  |  |  |
| `tool_io_read_active_page_3a2ef19b_3b71_4a34_9d80_80aec3460f22_022edcc3_input` | read_active_page input | contract:tool_io | open |  |  |  |
| `tool_io_read_console_messages_f50e4a0d_4b92_4194_825f_be7847546593_02fde4a5_input` | read_console_messages input | contract:tool_io | open |  |  |  |
| `tool_io_read_network_requests_8bcee18a_89e1_4ff3_a368_39d3c86e5bfb_01b837f0_input` | read_network_requests input | contract:tool_io | open |  |  |  |
| `tool_io_read_page_f4edcbdf_f85a_4170_8852_f91f28438c94_84f855dc_input` | read_page input | contract:tool_io | open |  |  |  |
| `tool_io_read_pdf_85b45a83_6a9b_40d3_8783_a3324c3ad583_17737d4c_input` | read_pdf input | contract:tool_io | open |  |  |  |
| `tool_io_record_demo_02c34de4_2513_48d4_a5d3_0aa8f9356c2e_7d9b7a87_input` | record_demo input | contract:tool_io | open |  |  |  |
| `tool_io_remember_for_domain_0f992997_1ef7_435b_9475_a9b9c31dbe95_bd68dba8_input` | remember_for_domain input | contract:tool_io | open |  |  |  |
| `tool_io_replay_demo_d3383285_82d1_434c_a3fb_9bcc92f45a42_f2cf2911_input` | replay_demo input | contract:tool_io | open |  |  |  |
| `tool_io_report_trace_incident_99f78c9e_e92a_42d6_afc2_a50c5e862d40_17e58d3d_input` | report_trace_incident input | contract:tool_io | open |  |  |  |
| `tool_io_request_user_takeover_d5304ae4_05c5_4578_8fdd_17c287b85a4c_a0c8be62_input` | request_user_takeover input | contract:tool_io | open |  |  |  |
| `tool_io_research_run_5d3bf2c4_0005_4364_987b_3ebbeef204f6_2e520e88_input` | research_run input | contract:tool_io | open |  |  |  |
| `tool_io_research_web_075194f7_3766_4ae7_a887_2234331b49c1_a8def76b_input` | research_web input | contract:tool_io | open |  |  |  |
| `tool_io_research_web_075194f7_3766_4ae7_a887_2234331b49c1_a8def76b_output` | research_web output | contract:tool_io | open |  |  |  |
| `tool_io_resize_window_3738e8e7_0710_44fe_9128_bc4a48a13e50_4473e48f_input` | resize_window input | contract:tool_io | open |  |  |  |
| `tool_io_rulebook_7fac67d8_aa2e_47fa_a8ae_58e09b7dc7c0_32725bbc_input` | rulebook input | contract:tool_io | open |  |  |  |
| `tool_io_save_guidance_note_dd447414_88cb_4cb5_b739_e3b9119a6341_7caeb6a3_input` | save_guidance_note input | contract:tool_io | open |  |  |  |
| `tool_io_scope_system_eed179e9_4334_4617_b5e8_e4ce20cdeb14_9b08a705_input` | scope_system input | contract:tool_io | open |  |  |  |
| `tool_io_screenshot_region_7c6ecc0e_b193_4a68_b201_d1e5c352fec4_80e2f508_input` | screenshot_region input | contract:tool_io | open |  |  |  |
| `tool_io_self_prompt_65f6bbaa_ac1e_4050_a2be_ee0c710d63ee_dc16161c_input` | self_prompt input | contract:tool_io | open |  |  |  |
| `tool_io_seo_617b5d2b_138a_40f9_952a_b25d701328d9_31ca6832_input` | seo input | contract:tool_io | open |  |  |  |
| `tool_io_shell_execute_fcd2d948_4766_4fe0_9a3b_aba37dd72725_9afd972e_input` | shell_execute input | contract:tool_io | open |  |  |  |
| `tool_io_shell_execute_fcd2d948_4766_4fe0_9a3b_aba37dd72725_9afd972e_output` | shell_execute output | contract:tool_io | open |  |  |  |
| `tool_io_shell_python_1dcfb521_3fce_48cf_a216_4f6c981d8ab5_db9e49ec_input` | shell_python input | contract:tool_io | open |  |  |  |
| `tool_io_shell_python_1dcfb521_3fce_48cf_a216_4f6c981d8ab5_db9e49ec_output` | shell_python output | contract:tool_io | open |  |  |  |
| `tool_io_skill_b39b2b6b_1f95_4c33_82a5_0228e8b7886a_d2d73bf2_input` | skill input | contract:tool_io | open |  |  |  |
| `tool_io_sleep_47893e94_3ceb_4c62_b012_b8a101fbd865_dc8f7383_input` | sleep input | contract:tool_io | open |  |  |  |
| `tool_io_sql_4cabd960_cb6d_4b82_9d77_c60031e5f6b6_085205c9_input` | sql input | contract:tool_io | open |  |  |  |
| `tool_io_stylesheet_03bf63a8_da97_4dc4_823a_412401997b6d_e09bfa14_input` | stylesheet input | contract:tool_io | open |  |  |  |
| `tool_io_submit_form_89f166f8_fe7e_4812_b9e0_a048c6a4c8a0_27b353b8_input` | submit_form input | contract:tool_io | open |  |  |  |
| `tool_io_tab_groups_05e9e45e_70d0_44f0_84f5_248f1e4cfc77_7bf3588c_input` | tab_groups input | contract:tool_io | open |  |  |  |
| `tool_io_tabs_11f74f23_1ec5_4eb1_b7c9_a543420d474a_f8e55437_input` | tabs input | contract:tool_io | open |  |  |  |
| `tool_io_task_76db9c44_8cf7_4abc_ac6e_624e2307fcab_394c97dd_input` | task input | contract:tool_io | open |  |  |  |
| `tool_io_tasks_8243be6c_f553_451e_b27c_dc6edd0fdd3a_f73637de_input` | tasks input | contract:tool_io | open |  |  |  |
| `tool_io_text_analyze_2ab12011_e29c_4543_ac25_7ba8f2f81588_42bf9a70_input` | text_analyze input | contract:tool_io | open |  |  |  |
| `tool_io_text_analyze_2ab12011_e29c_4543_ac25_7ba8f2f81588_42bf9a70_output` | text_analyze output | contract:tool_io | open |  |  |  |
| `tool_io_text_regex_extract_72ae12a7_9c9a_41c3_b1b7_c8a2f1ef440b_eb728d3d_input` | text_regex_extract input | contract:tool_io | open |  |  |  |
| `tool_io_text_regex_extract_72ae12a7_9c9a_41c3_b1b7_c8a2f1ef440b_eb728d3d_output` | text_regex_extract output | contract:tool_io | open |  |  |  |
| `tool_io_toolcomp_create_component_a9a9105f_f4fc_4ef3_abe2_853a9a45cc32_733ff285_input` | toolcomp_create_component input | contract:tool_io | open |  |  |  |
| `tool_io_toolcomp_create_component_a9a9105f_f4fc_4ef3_abe2_853a9a45cc32_733ff285_output` | toolcomp_create_component output | contract:tool_io | open |  |  |  |
| `tool_io_toolcomp_get_code_1f3c8aa7_54f5_42e7_82fd_bc501a92a8a6_4cc36712_input` | toolcomp_get_code input | contract:tool_io | open |  |  |  |
| `tool_io_toolcomp_get_code_1f3c8aa7_54f5_42e7_82fd_bc501a92a8a6_4cc36712_output` | toolcomp_get_code output | contract:tool_io | open |  |  |  |
| `tool_io_toolcomp_get_context_1bf98a62_fa46_4589_b0d4_67bd9afdc535_86014945_input` | toolcomp_get_context input | contract:tool_io | open |  |  |  |
| `tool_io_toolcomp_get_context_1bf98a62_fa46_4589_b0d4_67bd9afdc535_86014945_output` | toolcomp_get_context output | contract:tool_io | open |  |  |  |
| `tool_io_toolcomp_get_incident_detail_f94d7035_0fbd_4fef_bbcc_2c0ca38a591e_ebf87c19_input` | toolcomp_get_incident_detail input | contract:tool_io | open |  |  |  |
| `tool_io_toolcomp_get_incident_detail_f94d7035_0fbd_4fef_bbcc_2c0ca38a591e_ebf87c19_output` | toolcomp_get_incident_detail output | contract:tool_io | open |  |  |  |
| `tool_io_toolcomp_get_sample_detail_b9df12a5_6334_4536_8de3_a4ec159f71fc_d86f3874_input` | toolcomp_get_sample_detail input | contract:tool_io | open |  |  |  |
| `tool_io_toolcomp_get_sample_detail_b9df12a5_6334_4536_8de3_a4ec159f71fc_d86f3874_output` | toolcomp_get_sample_detail output | contract:tool_io | open |  |  |  |
| `tool_io_toolcomp_list_tools_75ca678e_2366_43c7_904e_9bff4645581e_2efc90d1_input` | toolcomp_list_tools input | contract:tool_io | open |  |  |  |
| `tool_io_toolcomp_list_tools_75ca678e_2366_43c7_904e_9bff4645581e_2efc90d1_output` | toolcomp_list_tools output | contract:tool_io | open |  |  |  |
| `tool_io_toolcomp_patch_code_5e445f50_8efa_4a50_b331_305ed6c1823d_6ad82557_input` | toolcomp_patch_code input | contract:tool_io | open |  |  |  |
| `tool_io_toolcomp_patch_code_5e445f50_8efa_4a50_b331_305ed6c1823d_6ad82557_output` | toolcomp_patch_code output | contract:tool_io | open |  |  |  |
| `tool_io_toolcomp_resolve_incident_831a1c09_1952_4208_9e7e_a3cee6afa911_9fd6bad1_input` | toolcomp_resolve_incident input | contract:tool_io | open |  |  |  |
| `tool_io_toolcomp_resolve_incident_831a1c09_1952_4208_9e7e_a3cee6afa911_9fd6bad1_output` | toolcomp_resolve_incident output | contract:tool_io | open |  |  |  |
| `tool_io_toolcomp_update_code_d0e6849d_9716_4a2a_9ef7_287845a04c53_61f76971_input` | toolcomp_update_code input | contract:tool_io | open |  |  |  |
| `tool_io_toolcomp_update_code_d0e6849d_9716_4a2a_9ef7_287845a04c53_61f76971_output` | toolcomp_update_code output | contract:tool_io | open |  |  |  |
| `tool_io_toolcomp_update_settings_85fff0e0_4e96_43d3_97c6_b37c48d84a97_a3415c5d_input` | toolcomp_update_settings input | contract:tool_io | open |  |  |  |
| `tool_io_toolcomp_update_settings_85fff0e0_4e96_43d3_97c6_b37c48d84a97_a3415c5d_output` | toolcomp_update_settings output | contract:tool_io | open |  |  |  |
| `tool_io_travel_create_summary_ccf683e5_a983_4a30_9b18_8b40b08b4b4d_e1e583bb_input` | travel_create_summary input | contract:tool_io | open |  |  |  |
| `tool_io_travel_create_summary_ccf683e5_a983_4a30_9b18_8b40b08b4b4d_e1e583bb_output` | travel_create_summary output | contract:tool_io | open |  |  |  |
| `tool_io_travel_get_activities_f33b2b24_5436_4e03_9333_fb11aa065759_9e8a3d3a_input` | travel_get_activities input | contract:tool_io | open |  |  |  |
| `tool_io_travel_get_activities_f33b2b24_5436_4e03_9333_fb11aa065759_9e8a3d3a_output` | travel_get_activities output | contract:tool_io | open |  |  |  |
| `tool_io_travel_get_events_643f51bb_96f9_4ceb_9a69_a140d8d64207_193d3212_input` | travel_get_events input | contract:tool_io | open |  |  |  |
| `tool_io_travel_get_events_643f51bb_96f9_4ceb_9a69_a140d8d64207_193d3212_output` | travel_get_events output | contract:tool_io | open |  |  |  |
| `tool_io_travel_get_location_3cb14cbb_f476_4bae_9ff4_498774859e9e_b0ee82e2_input` | travel_get_location input | contract:tool_io | open |  |  |  |
| `tool_io_travel_get_location_3cb14cbb_f476_4bae_9ff4_498774859e9e_b0ee82e2_output` | travel_get_location output | contract:tool_io | open |  |  |  |
| `tool_io_travel_get_restaurants_1712247d_e5a3_4876_ac7b_9e69a694336d_d0656ee8_input` | travel_get_restaurants input | contract:tool_io | open |  |  |  |
| `tool_io_travel_get_restaurants_1712247d_e5a3_4876_ac7b_9e69a694336d_d0656ee8_output` | travel_get_restaurants output | contract:tool_io | open |  |  |  |
| `tool_io_travel_get_weather_26951d76_4ed0_4a86_bee0_6364021d9580_4fc64f84_input` | travel_get_weather input | contract:tool_io | open |  |  |  |
| `tool_io_travel_get_weather_26951d76_4ed0_4a86_bee0_6364021d9580_4fc64f84_output` | travel_get_weather output | contract:tool_io | open |  |  |  |
| `tool_io_update_plan_6eefa682_b0e6_4335_8f54_91960e86f8ae_9fc33308_input` | update_plan input | contract:tool_io | open |  |  |  |
| `tool_io_upload_file_1ed44e94_1ac6_477f_87d2_c91262223c12_66f3123c_input` | upload_file input | contract:tool_io | open |  |  |  |
| `tool_io_user_863107b0_3e7c_407a_a00d_6d0b7350d844_09924ef8_input` | user input | contract:tool_io | open |  |  |  |
| `tool_io_user_secret_set_61b7723f_7f84_4498_9578_f79a9584b650_8e20f440_input` | user_secret_set input | contract:tool_io | open |  |  |  |
| `tool_io_user_todos_7347c005_6142_475c_982a_10aae5271e98_34c72b0f_input` | user_todos input | contract:tool_io | open |  |  |  |
| `tool_io_value_store_53dc936e_e26b_4263_a79b_1eb584d0e32c_b78c3ef6_input` | value_store input | contract:tool_io | open |  |  |  |
| `tool_io_verify_cb86a0ca_439e_4e63_be45_44c2dcd159f5_715789cb_input` | verify input | contract:tool_io | open |  |  |  |
| `tool_io_verify_cb86a0ca_439e_4e63_be45_44c2dcd159f5_715789cb_output` | verify output | contract:tool_io | open |  |  |  |
| `tool_io_vsc_get_state_f1696ea5_95bd_4848_80a8_34caacc366a2_50193220_input` | vsc_get_state input | contract:tool_io | open |  |  |  |
| `tool_io_vsc_get_state_f1696ea5_95bd_4848_80a8_34caacc366a2_50193220_output` | vsc_get_state output | contract:tool_io | open |  |  |  |
| `tool_io_wait_for_e261dc7d_2cc9_460f_be84_f98828042ac7_80554783_input` | wait_for input | contract:tool_io | open |  |  |  |
| `tool_io_web_55bc14b4_a166_4a33_a0bc_a2b0dcf66de0_c5f18ac7_input` | web input | contract:tool_io | open |  |  |  |
| `tool_io_widget_attach_media_949f70d7_1b13_4989_8fb5_9d5911011b8b_d2dacff5_input` | widget_attach_media input | contract:tool_io | open |  |  |  |
| `tool_io_widget_attach_media_949f70d7_1b13_4989_8fb5_9d5911011b8b_d2dacff5_output` | widget_attach_media output | contract:tool_io | open |  |  |  |
| `tool_io_widget_create_artifact_05d4365d_4172_4ca1_afc8_c601996610a8_0b299e7f_input` | widget_create_artifact input | contract:tool_io | open |  |  |  |
| `tool_io_widget_create_artifact_05d4365d_4172_4ca1_afc8_c601996610a8_0b299e7f_output` | widget_create_artifact output | contract:tool_io | open |  |  |  |
| `tool_io_widget_text_append_0ff71740_c0ba_433b_a165_b253ba20ad00_31894259_input` | widget_text_append input | contract:tool_io | open |  |  |  |
| `tool_io_widget_text_append_0ff71740_c0ba_433b_a165_b253ba20ad00_31894259_output` | widget_text_append output | contract:tool_io | open |  |  |  |
| `tool_io_widget_text_insert_after_965bf6c3_7d85_47b6_b566_770be2738b39_6a9a418c_input` | widget_text_insert_after input | contract:tool_io | open |  |  |  |
| `tool_io_widget_text_insert_after_965bf6c3_7d85_47b6_b566_770be2738b39_6a9a418c_output` | widget_text_insert_after output | contract:tool_io | open |  |  |  |
| `tool_io_widget_text_insert_before_5c8fc07d_3f9b_4736_a3c0_e0c3610cfc36_8e54b28b_input` | widget_text_insert_before input | contract:tool_io | open |  |  |  |
| `tool_io_widget_text_insert_before_5c8fc07d_3f9b_4736_a3c0_e0c3610cfc36_8e54b28b_output` | widget_text_insert_before output | contract:tool_io | open |  |  |  |
| `tool_io_widget_text_patch_94fcb67b_1dc8_408f_a3d7_67e1ef0fcff7_93d5494e_input` | widget_text_patch input | contract:tool_io | open |  |  |  |
| `tool_io_widget_text_patch_94fcb67b_1dc8_408f_a3d7_67e1ef0fcff7_93d5494e_output` | widget_text_patch output | contract:tool_io | open |  |  |  |
| `tool_io_widget_text_prepend_ea778ea2_2246_4f9d_9cdd_6ad3150fd01a_ac5a0778_input` | widget_text_prepend input | contract:tool_io | open |  |  |  |
| `tool_io_widget_text_prepend_ea778ea2_2246_4f9d_9cdd_6ad3150fd01a_ac5a0778_output` | widget_text_prepend output | contract:tool_io | open |  |  |  |
| `tool_io_widget_text_replace_635df3ce_9324_483f_b82a_e1027862dd53_7722ccd4_input` | widget_text_replace input | contract:tool_io | open |  |  |  |
| `tool_io_widget_text_replace_635df3ce_9324_483f_b82a_e1027862dd53_7722ccd4_output` | widget_text_replace output | contract:tool_io | open |  |  |  |
| `tool_io_widget_update_field_af3544cc_fc5d_4f1d_86e0_d420fbfbc991_42f97cff_input` | widget_update_field input | contract:tool_io | open |  |  |  |
| `tool_io_widget_update_field_af3544cc_fc5d_4f1d_86e0_d420fbfbc991_42f97cff_output` | widget_update_field output | contract:tool_io | open |  |  |  |
| `tool_io_widget_update_record_e1360076_5bb3_48ab_a74f_1bb4280b1e6b_7a18bc0c_input` | widget_update_record input | contract:tool_io | open |  |  |  |
| `tool_io_widget_update_record_e1360076_5bb3_48ab_a74f_1bb4280b1e6b_7a18bc0c_output` | widget_update_record output | contract:tool_io | open |  |  |  |
| `tool_io_workbook_cf7f68ab_0ec5_4428_825c_152e6c314cb5_fe4e8250_input` | workbook input | contract:tool_io | open |  |  |  |
| `tool_io_workflow_author_3b1a66ca_daaf_4657_a4a9_c46a811894b8_a1fa2529_input` | workflow_author input | contract:tool_io | open |  |  |  |
| `tool_io_workflow_catalog_0a9cd0c3_c479_43e1_94d3_4f5fb9d58a20_b5c790eb_input` | workflow_catalog input | contract:tool_io | open |  |  |  |
| `tool_io_workflow_node_5e9dcb6f_e89a_43f2_b508_dcac81ee9648_44c7321c_input` | workflow_node input | contract:tool_io | open |  |  |  |
| `tool_io_workflow_plan_98ef2d35_e588_4982_8c44_a2885a33a21b_b717839e_input` | workflow_plan input | contract:tool_io | open |  |  |  |
| `tool_io_workflow_run_926f6d8a_a560_44c1_9bb6_39bc02c0ecfb_04f5345e_input` | workflow_run input | contract:tool_io | open |  |  |  |
| `workflow_io_control_branch_a21c7117_input` | control.branch input | contract:other | open |  |  |  |
| `workflow_io_control_branch_a21c7117_output` | control.branch output | contract:other | open |  |  |  |
| `workflow_io_control_gather_6e593fed_input` | control.gather input | contract:other | open |  |  |  |
| `workflow_io_control_gather_6e593fed_output` | control.gather output | contract:other | open |  |  |  |
| `workflow_io_control_human_input_ca1380f2_input` | control.human_input input | contract:other | open |  |  |  |
| `workflow_io_control_human_input_ca1380f2_output` | control.human_input output | contract:other | open |  |  |  |
| `workflow_io_control_loop_f88a7f73_input` | control.loop input | contract:other | open |  |  |  |
| `workflow_io_control_loop_f88a7f73_output` | control.loop output | contract:other | open |  |  |  |
| `workflow_io_control_map_d9b45ca4_input` | control.map input | contract:other | open |  |  |  |
| `workflow_io_control_map_d9b45ca4_output` | control.map output | contract:other | open |  |  |  |
| `workflow_io_control_send_56f057e4_input` | control.send input | contract:other | open |  |  |  |
| `workflow_io_control_send_56f057e4_output` | control.send output | contract:other | open |  |  |  |
| `workflow_io_control_work_queue_195140c6_input` | control.work_queue input | contract:other | open |  |  |  |
| `workflow_io_control_work_queue_195140c6_output` | control.work_queue output | contract:other | open |  |  |  |
| `workflow_io_control_work_seed_f8aed686_input` | control.work_seed input | contract:other | open |  |  |  |
| `workflow_io_control_work_seed_f8aed686_output` | control.work_seed output | contract:other | open |  |  |  |
| `workflow_io_crypto_hash_ac7342c7_input` | crypto.hash input | contract:other | open |  |  |  |
| `workflow_io_crypto_hash_ac7342c7_output` | crypto.hash output | contract:other | open |  |  |  |
| `workflow_io_crypto_random_string_c41bb24f_input` | crypto.random_string input | contract:other | open |  |  |  |
| `workflow_io_crypto_random_string_c41bb24f_output` | crypto.random_string output | contract:other | open |  |  |  |
| `workflow_io_crypto_uuid_245c0ffc_input` | crypto.uuid input | contract:other | open |  |  |  |
| `workflow_io_crypto_uuid_245c0ffc_output` | crypto.uuid output | contract:other | open |  |  |  |
| `workflow_io_data_assert_dbada631_input` | data.assert input | contract:other | open |  |  |  |
| `workflow_io_data_assert_dbada631_output` | data.assert output | contract:other | open |  |  |  |
| `workflow_io_data_criteria_gate_e355a7fd_input` | data.criteria_gate input | contract:other | open |  |  |  |
| `workflow_io_data_criteria_gate_e355a7fd_output` | data.criteria_gate output | contract:other | open |  |  |  |
| `workflow_io_data_filter_f307bb6a_input` | data.filter input | contract:other | open |  |  |  |
| `workflow_io_data_filter_f307bb6a_output` | data.filter output | contract:other | open |  |  |  |
| `workflow_io_data_map_template_92cf2bea_input` | data.map_template input | contract:other | open |  |  |  |
| `workflow_io_data_map_template_92cf2bea_output` | data.map_template output | contract:other | open |  |  |  |
| `workflow_io_data_merge_b826536c_input` | data.merge input | contract:other | open |  |  |  |
| `workflow_io_data_merge_b826536c_output` | data.merge output | contract:other | open |  |  |  |
| `workflow_io_data_omit_cc7f17f3_input` | data.omit input | contract:other | open |  |  |  |
| `workflow_io_data_omit_cc7f17f3_output` | data.omit output | contract:other | open |  |  |  |
| `workflow_io_data_parse_json_3f60462a_input` | data.parse_json input | contract:other | open |  |  |  |
| `workflow_io_data_parse_json_3f60462a_output` | data.parse_json output | contract:other | open |  |  |  |
| `workflow_io_data_pick_99a5002e_input` | data.pick input | contract:other | open |  |  |  |
| `workflow_io_data_pick_99a5002e_output` | data.pick output | contract:other | open |  |  |  |
| `workflow_io_data_stringify_json_03ea6c50_input` | data.stringify_json input | contract:other | open |  |  |  |
| `workflow_io_data_stringify_json_03ea6c50_output` | data.stringify_json output | contract:other | open |  |  |  |
| `workflow_io_data_transform_2aa7e01c_input` | data.transform input | contract:other | open |  |  |  |
| `workflow_io_data_transform_2aa7e01c_output` | data.transform output | contract:other | open |  |  |  |
| `workflow_io_datetime_add_ff6445d0_input` | datetime.add input | contract:other | open |  |  |  |
| `workflow_io_datetime_add_ff6445d0_output` | datetime.add output | contract:other | open |  |  |  |
| `workflow_io_datetime_format_fa3ad7b4_input` | datetime.format input | contract:other | open |  |  |  |
| `workflow_io_datetime_format_fa3ad7b4_output` | datetime.format output | contract:other | open |  |  |  |
| `workflow_io_datetime_now_90c95665_input` | datetime.now input | contract:other | open |  |  |  |
| `workflow_io_datetime_now_90c95665_output` | datetime.now output | contract:other | open |  |  |  |
| `workflow_io_datetime_parse_6e818733_input` | datetime.parse input | contract:other | open |  |  |  |
| `workflow_io_datetime_parse_6e818733_output` | datetime.parse output | contract:other | open |  |  |  |
| `workflow_io_http_custom_api_49400089_input` | http.custom_api input | contract:other | open |  |  |  |
| `workflow_io_http_custom_api_49400089_output` | http.custom_api output | contract:other | open |  |  |  |
| `workflow_io_http_get_8423985e_input` | http.get input | contract:other | open |  |  |  |
| `workflow_io_http_get_8423985e_output` | http.get output | contract:other | open |  |  |  |
| `workflow_io_http_graphql_1350c73d_input` | http.graphql input | contract:other | open |  |  |  |
| `workflow_io_http_graphql_1350c73d_output` | http.graphql output | contract:other | open |  |  |  |
| `workflow_io_http_post_779419c1_input` | http.post input | contract:other | open |  |  |  |
| `workflow_io_http_post_779419c1_output` | http.post output | contract:other | open |  |  |  |
| `workflow_io_io_user_input_58330011_input` | io.user_input input | contract:other | open |  |  |  |
| `workflow_io_output_to_frontend_c8349f91_input` | output.to_frontend input | contract:other | open |  |  |  |
| `workflow_io_output_to_frontend_c8349f91_output` | output.to_frontend output | contract:other | open |  |  |  |
| `workflow_io_pipe_step_5e2ce32c_input` | pipe.step input | contract:other | open |  |  |  |
| `workflow_io_plan_step_d5e87efb_input` | plan.step input | contract:other | open |  |  |  |
| `workflow_io_subgraph_call_7a52a526_input` | subgraph.call input | contract:other | open |  |  |  |
| `workflow_io_subgraph_call_7a52a526_output` | subgraph.call output | contract:other | open |  |  |  |
| `workflow_io_text_custom_extract_99846438_input` | text.custom_extract input | contract:other | open |  |  |  |
| `workflow_io_text_custom_extract_99846438_output` | text.custom_extract output | contract:other | open |  |  |  |
| `workflow_io_text_join_9e795324_input` | text.join input | contract:other | open |  |  |  |
| `workflow_io_text_join_9e795324_output` | text.join output | contract:other | open |  |  |  |
| `workflow_io_text_json_path_ef881886_input` | text.json_path input | contract:other | open |  |  |  |
| `workflow_io_text_json_path_ef881886_output` | text.json_path output | contract:other | open |  |  |  |
| `workflow_io_text_regex_extract_f262b62e_input` | text.regex_extract input | contract:other | open |  |  |  |
| `workflow_io_text_regex_extract_f262b62e_output` | text.regex_extract output | contract:other | open |  |  |  |
| `workflow_io_text_regex_replace_8478c2c0_input` | text.regex_replace input | contract:other | open |  |  |  |
| `workflow_io_text_regex_replace_8478c2c0_output` | text.regex_replace output | contract:other | open |  |  |  |
| `workflow_io_text_render_list_b5fad81e_input` | text.render_list input | contract:other | open |  |  |  |
| `workflow_io_text_render_list_b5fad81e_output` | text.render_list output | contract:other | open |  |  |  |
| `workflow_io_text_slug_ab0ff73e_input` | text.slug input | contract:other | open |  |  |  |
| `workflow_io_text_slug_ab0ff73e_output` | text.slug output | contract:other | open |  |  |  |
| `workflow_io_text_split_473bb9a3_input` | text.split input | contract:other | open |  |  |  |
| `workflow_io_text_split_473bb9a3_output` | text.split output | contract:other | open |  |  |  |
| `workflow_io_text_template_2294f4f3_input` | text.template input | contract:other | open |  |  |  |
| `workflow_io_text_template_2294f4f3_output` | text.template output | contract:other | open |  |  |  |
| `workflow_io_text_word_count_49149c30_input` | text.word_count input | contract:other | open |  |  |  |
| `workflow_io_text_word_count_49149c30_output` | text.word_count output | contract:other | open |  |  |  |
| `workflow_io_tool_call_a07d74e1_input` | tool.call input | contract:other | open |  |  |  |
