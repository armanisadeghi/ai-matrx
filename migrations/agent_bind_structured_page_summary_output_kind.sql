-- agent_bind_structured_page_summary_output_kind.sql
--
-- D162 (part 2 of 2). Bind the Structured Research Page Summary
-- (agent.definition 18e5f5a7-..., slot `research.structured_page_summary`,
-- gemini-3.6-flash) to its DECLARED kind `research_page_analysis`.
--
-- Precedent + full reasoning: migrations/agent_bind_keyword_researcher_output_kind.sql.
--
-- WHY THIS WAS BROKEN
-- `matrx_ai.client_host.agent_source.definition_to_agent_config` lifts
-- `output_schema` into `config.response_format` ONLY when
-- `config.response_format is None`. This agent's `settings.response_format`
-- held {"type": "json_object"}, so it won and the real `output_schema` was
-- discarded. Worse on Gemini: `json_object` has no Google equivalent at all
-- (`_build_google_response_schema` returns None for any non-`json_schema`
-- type), so the run was prompt-only. Measured live 2026-08-11 BEFORE this
-- migration: markdown-fenced JSON, `parsed` null -- nothing enforced.
--
-- WHY THE DECLARED KIND, NOT THE SLOT'S output_kind
-- The stale `output_schema.name` was `research_page_summary`, which disagrees
-- with the slot's declared `output_kind = research_page_analysis`. The
-- disagreement is NOMENCLATURE ONLY, not shape: the kind's
-- `emitted_json_schema` is generated from `research.page_analysis.PageAnalysis`,
-- the very type this agent declares as its `Output` (research/agents.py:186)
-- and the type the analysis pipeline parses. Both carry the identical 26
-- top-level fields (id, url, analysis_status, should_use, should_reject,
-- rejection_reason, page_type, the eight 0-100 scores, summary_markdown,
-- key_facts, notable_quotes, core_findings, notable_claims, evidence_signals,
-- bias_and_risk_signals, dates, entities_mentioned, recommended_use,
-- analysis_notes) with the same nested objects and the same enum values. So
-- the canonical kind wins and the slot's `output_kind` is CORRECT and left
-- alone.
--
-- One deliberate loss: the bespoke schema carried advisory bounds the kind
-- does not (minLength:1 on several strings, maxLength:7000 on
-- summary_markdown). The kind is the canonical declaration -- the same schema
-- the frontend renders against -- so it wins; the length guidance still lives
-- in the prompt ("200-800 words"). Enforcing minLength:1 on `rejection_reason`
-- / `analysis_notes` was in any case pulling against fields whose whole point
-- is to be empty on a clean page.
--
-- The bound value is exactly what `matrx_ai.kinds.response_format_for_kind(
-- 'research_page_analysis')` builds today: the kind's `emitted_json_schema`
-- through `matrx_ai.schema.lint.lint_output_schema(...).portable_schema`
-- (additionalProperties:false + all-required on every object node). No
-- `__kind` in the bound schema, for the reason the topic_ideas precedent
-- established live.
--
-- NO PROMPT REWRITE. The prompt's "Required JSON Output" block teaches
-- exactly these 26 fields, the same nested shapes and the same enum values,
-- and emits no `__kind` and no extra keys -- it agrees with the bound schema
-- (additionalProperties:false), so it is left untouched.
--
-- NOTE ($defs): see the sibling migration
-- agent_bind_cross_cutting_tags_output_kind.sql -- same portable-schema
-- `$defs`/`$ref` note, verified live after apply.

update agent.definition set
  settings = settings - 'response_format',
  output_schema = $mtx${"name": "research_page_analysis", "schema": {"type": "object", "$defs": {"PageDates": {"type": "object", "title": "PageDates", "properties": {"updated_date": {"type": "string", "title": "Updated Date", "default": "Not stated"}, "published_date": {"type": "string", "title": "Published Date", "default": "Not stated"}, "content_timeframe": {"type": "string", "title": "Content Timeframe", "default": ""}}, "additionalProperties": false, "required": ["updated_date", "published_date", "content_timeframe"]}, "CoreFinding": {"type": "object", "title": "CoreFinding", "properties": {"finding": {"type": "string", "title": "Finding", "default": ""}, "confidence": {"type": "number", "title": "Confidence", "default": 0.0}, "importance": {"enum": ["low", "medium", "high"], "type": "string", "title": "Importance", "default": "medium"}, "finding_type": {"enum": ["fact", "claim", "statistic", "expert_opinion", "definition", "trend", "example", "counterpoint"], "type": "string", "title": "Finding Type", "default": "claim"}, "supporting_text": {"type": "string", "title": "Supporting Text", "default": ""}}, "additionalProperties": false, "required": ["finding", "confidence", "importance", "finding_type", "supporting_text"]}, "NotableClaim": {"type": "object", "title": "NotableClaim", "properties": {"claim": {"type": "string", "title": "Claim", "default": ""}, "is_well_supported": {"type": "boolean", "title": "Is Well Supported", "default": false}, "support_assessment": {"type": "string", "title": "Support Assessment", "default": ""}}, "additionalProperties": false, "required": ["claim", "is_well_supported", "support_assessment"]}, "NotableQuote": {"type": "object", "title": "NotableQuote", "properties": {"quote": {"type": "string", "title": "Quote", "default": ""}, "speaker": {"type": "string", "title": "Speaker", "default": "Not stated"}}, "additionalProperties": false, "required": ["quote", "speaker"]}, "BiasRiskSignals": {"type": "object", "title": "BiasRiskSignals", "properties": {"is_promotional": {"type": "boolean", "title": "Is Promotional", "default": false}, "overstates_claims": {"type": "boolean", "title": "Overstates Claims", "default": false}, "is_ai_generated_or_thin": {"type": "boolean", "title": "Is Ai Generated Or Thin", "default": false}, "is_affiliate_or_sales_driven": {"type": "boolean", "title": "Is Affiliate Or Sales Driven", "default": false}, "lacks_sources_for_major_claims": {"type": "boolean", "title": "Lacks Sources For Major Claims", "default": false}, "contains_obvious_factual_errors": {"type": "boolean", "title": "Contains Obvious Factual Errors", "default": false}}, "additionalProperties": false, "required": ["is_promotional", "overstates_claims", "is_ai_generated_or_thin", "is_affiliate_or_sales_driven", "lacks_sources_for_major_claims", "contains_obvious_factual_errors"]}, "EvidenceSignals": {"type": "object", "title": "EvidenceSignals", "properties": {"has_citations": {"type": "boolean", "title": "Has Citations", "default": false}, "has_methodology": {"type": "boolean", "title": "Has Methodology", "default": false}, "has_named_author": {"type": "boolean", "title": "Has Named Author", "default": false}, "has_updated_date": {"type": "boolean", "title": "Has Updated Date", "default": false}, "has_original_data": {"type": "boolean", "title": "Has Original Data", "default": false}, "has_links_to_sources": {"type": "boolean", "title": "Has Links To Sources", "default": false}, "has_publication_date": {"type": "boolean", "title": "Has Publication Date", "default": false}, "has_author_credentials": {"type": "boolean", "title": "Has Author Credentials", "default": false}, "has_quotes_from_experts": {"type": "boolean", "title": "Has Quotes From Experts", "default": false}}, "additionalProperties": false, "required": ["has_citations", "has_methodology", "has_named_author", "has_updated_date", "has_original_data", "has_links_to_sources", "has_publication_date", "has_author_credentials", "has_quotes_from_experts"]}, "EntitiesMentioned": {"type": "object", "title": "EntitiesMentioned", "properties": {"people": {"type": "array", "items": {"type": "string"}, "title": "People"}, "studies": {"type": "array", "items": {"type": "string"}, "title": "Studies"}, "products": {"type": "array", "items": {"type": "string"}, "title": "Products"}, "locations": {"type": "array", "items": {"type": "string"}, "title": "Locations"}, "organizations": {"type": "array", "items": {"type": "string"}, "title": "Organizations"}}, "additionalProperties": false, "required": ["people", "studies", "products", "locations", "organizations"]}}, "title": "PageAnalysis", "properties": {"id": {"type": "string", "title": "Id", "default": ""}, "url": {"type": "string", "title": "Url", "default": ""}, "dates": {"$ref": "#/$defs/PageDates"}, "key_facts": {"type": "array", "items": {"type": "string"}, "title": "Key Facts"}, "page_type": {"enum": ["primary_research", "government", "academic", "news", "industry_report", "company_blog", "personal_blog", "forum", "directory", "product_page", "landing_page", "ad_page", "unknown"], "type": "string", "title": "Page Type", "default": "unknown"}, "should_use": {"type": "boolean", "title": "Should Use", "default": true}, "core_findings": {"type": "array", "items": {"$ref": "#/$defs/CoreFinding"}, "title": "Core Findings"}, "should_reject": {"type": "boolean", "title": "Should Reject", "default": false}, "analysis_notes": {"type": "string", "title": "Analysis Notes", "default": ""}, "notable_claims": {"type": "array", "items": {"$ref": "#/$defs/NotableClaim"}, "title": "Notable Claims"}, "notable_quotes": {"type": "array", "items": {"$ref": "#/$defs/NotableQuote"}, "title": "Notable Quotes"}, "analysis_status": {"enum": ["valid", "invalid", "inaccessible", "irrelevant", "thin", "ad_heavy", "duplicate", "error"], "type": "string", "title": "Analysis Status", "default": "valid"}, "freshness_score": {"type": "integer", "title": "Freshness Score", "default": 0}, "recommended_use": {"enum": ["cite_directly", "use_as_background", "use_for_leads_only", "compare_against_other_sources", "reject"], "type": "string", "title": "Recommended Use", "default": "use_as_background"}, "evidence_signals": {"$ref": "#/$defs/EvidenceSignals"}, "rejection_reason": {"type": "string", "title": "Rejection Reason", "default": "Not applicable"}, "summary_markdown": {"type": "string", "title": "Summary Markdown", "default": ""}, "originality_score": {"type": "integer", "title": "Originality Score", "default": 0}, "specificity_score": {"type": "integer", "title": "Specificity Score", "default": 0}, "entities_mentioned": {"$ref": "#/$defs/EntitiesMentioned"}, "bias_and_risk_signals": {"$ref": "#/$defs/BiasRiskSignals"}, "commercial_bias_score": {"type": "integer", "title": "Commercial Bias Score", "default": 0}, "content_quality_score": {"type": "integer", "title": "Content Quality Score", "default": 0}, "topic_relevance_score": {"type": "integer", "title": "Topic Relevance Score", "default": 0}, "evidence_quality_score": {"type": "integer", "title": "Evidence Quality Score", "default": 0}, "overall_page_value_score": {"type": "integer", "title": "Overall Page Value Score", "default": 0}, "authority_after_read_score": {"type": "integer", "title": "Authority After Read Score", "default": 0}}, "additionalProperties": false, "required": ["id", "url", "dates", "key_facts", "page_type", "should_use", "core_findings", "should_reject", "analysis_notes", "notable_claims", "notable_quotes", "analysis_status", "freshness_score", "recommended_use", "evidence_signals", "rejection_reason", "summary_markdown", "originality_score", "specificity_score", "entities_mentioned", "bias_and_risk_signals", "commercial_bias_score", "content_quality_score", "topic_relevance_score", "evidence_quality_score", "overall_page_value_score", "authority_after_read_score"]}, "strict": true}$mtx$::jsonb,
  updated_at = now()
where id = '18e5f5a7-f3f7-49bc-83e3-3479a831d973'
  and deleted_at is null;
