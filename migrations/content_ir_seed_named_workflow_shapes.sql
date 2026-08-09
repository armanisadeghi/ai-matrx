-- Name the real shapes (features-to-workflows item 6, NOMENCLATURE.md "I/O
-- contract identities"): register the 8 new human-named workflow I/O kinds
-- (agent_result, web_search_results, parsed_json, rendered_text, scraped_page,
-- table_rows, saved_row, user_inputs) with plain-language descriptions and
-- canonical examples (validation_status derived by trigger). Schemas are the
-- verbatim model_json_schema() of the owning pydantic models (AiExecutionResult,
-- BraveSearchOutput, ParseLlmJsonOutput, RenderListOutput, ScrapedPage,
-- TableLookupOutput, TableUpsertOutput). Idempotent; applied via Supabase MCP
-- 2026-08-09.


insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select 'agent_result', $mtx$Agent Result$mtx$, 'python', null,
       $mtx${"$defs": {"AiMessage": {"additionalProperties": true, "description": "Single message in the conversation as seen by the workflow.\n\nFlattens the matrx-ai ``UnifiedMessage`` into a stable JSON shape.\nUnknown / provider-specific keys land in ``extra`` so consumers can\nreach them without losing fidelity \u2014 ``extra=\"allow\"`` is deliberate\nand must stay (``to_storage_dict()`` payloads carry provider keys we\nnever declare here).\n\n``content`` / ``tool_calls`` values are genuinely dynamic JSON \u2014\nprovider content blocks and tool-call envelopes whose shape varies per\nprovider \u2014 hence ``JsonValue``, never a declared block union that\nwould drift from the providers.", "properties": {"role": {"title": "Role", "type": "string"}, "content": {"$ref": "#/$defs/JsonValue", "default": null}, "tool_calls": {"items": {"additionalProperties": {"$ref": "#/$defs/JsonValue"}, "type": "object"}, "title": "Tool Calls", "type": "array"}, "tool_call_id": {"anyOf": [{"type": "string"}, {"type": "null"}], "default": null, "title": "Tool Call Id"}, "name": {"anyOf": [{"type": "string"}, {"type": "null"}], "default": null, "title": "Name"}}, "required": ["role"], "title": "AiMessage", "type": "object", "x-contract-dynamic": "provider-specific storage keys (to_storage_dict payloads) must survive"}, "AiModelUsage": {"additionalProperties": false, "description": "Per-model token/cost breakdown \u2014 one entry in :class:`AiUsage.models`.\n\nClosed shape, one canonical key-set across every producer. ``cost_usd``\nmatches the top-level ``AiUsage.cost_usd`` (this unified a prior divergence\nwhere graph_nodes wrote ``cost`` while the podcast aggregator wrote\n``cost_usd``). ``api`` / ``request_count`` default to ``\"\"`` / ``0`` for\nproducers that don't track them.", "properties": {"input_tokens": {"default": 0, "title": "Input Tokens", "type": "integer"}, "output_tokens": {"default": 0, "title": "Output Tokens", "type": "integer"}, "total_tokens": {"default": 0, "title": "Total Tokens", "type": "integer"}, "cost_usd": {"default": 0.0, "title": "Cost Usd", "type": "number"}, "request_count": {"default": 0, "title": "Request Count", "type": "integer"}, "api": {"default": "", "title": "Api", "type": "string"}}, "title": "AiModelUsage", "type": "object"}, "AiUsage": {"description": "Aggregated token / cost usage for the run.\n\nEvery constructor in the package (``_extract_usage`` below and the\npodcast pipeline's stage aggregators) sets only the declared fields, so\nthe model is closed \u2014 no ``extra=\"allow\"``. Per-model breakdown values are\ntyped as :class:`AiModelUsage`: the two producer shapes were unified onto\none canonical key-set (``cost_usd`` everywhere), so this is a precise\ncontract, not an open ``dict[str, JsonValue]``.", "properties": {"input_tokens": {"default": 0, "description": "Total input tokens billed across the run.", "title": "Input Tokens", "type": "integer"}, "output_tokens": {"default": 0, "description": "Total output tokens billed across the run.", "title": "Output Tokens", "type": "integer"}, "total_tokens": {"default": 0, "description": "Combined input and output token count across the run.", "title": "Total Tokens", "type": "integer"}, "cost_usd": {"default": 0.0, "description": "Total estimated provider cost in US dollars.", "title": "Cost Usd", "type": "number"}, "models": {"additionalProperties": {"$ref": "#/$defs/AiModelUsage"}, "description": "Per-model usage breakdown keyed by canonical model name.", "title": "Models", "type": "object"}}, "title": "AiUsage", "type": "object"}, "JsonValue": {}}, "additionalProperties": false, "description": "Canonical output for every matrx-ai graph action.\n\nWhether the node ran a single chat turn or a multi-iteration agent loop,\nthe workflow sees the same shape: ``final_text`` for the final assistant\nresponse, ``messages`` for the full conversation history (so the next\nnode in the graph can continue the thread), and ``usage`` for cost\ntracking.", "properties": {"conversation_id": {"title": "Conversation Id", "type": "string"}, "request_id": {"title": "Request Id", "type": "string"}, "iterations": {"title": "Iterations", "type": "integer"}, "finish_reason": {"anyOf": [{"type": "string"}, {"type": "null"}], "default": null, "title": "Finish Reason"}, "final_text": {"default": "", "title": "Final Text", "type": "string"}, "final_message": {"anyOf": [{"$ref": "#/$defs/AiMessage"}, {"type": "null"}], "default": null}, "messages": {"items": {"$ref": "#/$defs/AiMessage"}, "title": "Messages", "type": "array"}, "usage": {"$ref": "#/$defs/AiUsage"}, "duration_ms": {"default": 0, "title": "Duration Ms", "type": "integer"}, "tool_calls_made": {"default": 0, "title": "Tool Calls Made", "type": "integer"}, "metadata": {"additionalProperties": {"$ref": "#/$defs/JsonValue"}, "title": "Metadata", "type": "object"}, "structured_output": {"anyOf": [{"additionalProperties": {"$ref": "#/$defs/JsonValue"}, "type": "object"}, {"items": {"$ref": "#/$defs/JsonValue"}, "type": "array"}, {"type": "null"}], "default": null, "title": "Structured Output"}}, "required": ["conversation_id", "request_id", "iterations"], "title": "AiExecutionResult", "type": "object"}$mtx$::jsonb,
       false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582',
       $mtx${"family": "workflow_io", "generic": false, "category": "pure", "description": "What an AI step hands back: the reply text, any structured data it produced, the full conversation so a later step can continue it, and cost details."}$mtx$::jsonb
where not exists (
  select 1 from content_ir.kind_definition
  where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    and kind = 'agent_result' and deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, organization_id)
select kd.id, kd.version,
       $mtx${"conversation_id": "7b1f2b1e-9f0a-4c6d-8f21-2f4a5b6c7d8e", "request_id": "9c2d3e4f-1a2b-4c5d-8e9f-0a1b2c3d4e5f", "iterations": 1, "finish_reason": "stop", "final_text": "The capital of France is Paris.", "final_message": null, "messages": [], "usage": {}, "duration_ms": 1840, "tool_calls_made": 0, "metadata": {}, "structured_output": null}$mtx$::jsonb,
       'Canonical example', 'authored', true,
       '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and kd.kind = 'agent_result' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_example e
    where e.kind_definition_id = kd.id and e.is_canonical and e.deleted_at is null);


insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select 'web_search_results', $mtx$Web Search Results$mtx$, 'python', null,
       $mtx${"$defs": {"BraveSearchResultItem": {"additionalProperties": true, "description": "One raw Brave result (a ``web.results`` or ``news.results`` item).\n\nThe Brave Search API item is passed through unmodified \u2014 declared fields\nare the ones our consumers read (see\n``matrx_scraper.search.search.generate_search_text_summary``); the many\nprovider-specific keys (``meta_url``, ``profile``, ``thumbnail``, \u2026)\nremain reachable via ``extra=\"allow\"`` \u2014 a genuinely dynamic passthrough,\nso the open shape stays.", "properties": {"title": {"anyOf": [{"type": "string"}, {"type": "null"}], "default": null, "description": "Result headline supplied by Brave.", "title": "Title"}, "url": {"anyOf": [{"type": "string"}, {"type": "null"}], "default": null, "description": "Canonical destination URL for the result.", "title": "Url"}, "description": {"anyOf": [{"type": "string"}, {"type": "null"}], "default": null, "description": "Primary search-result snippet.", "title": "Description"}, "extra_snippets": {"description": "Additional relevant snippets returned for the result.", "items": {"type": "string"}, "title": "Extra Snippets", "type": "array"}, "age": {"anyOf": [{"type": "string"}, {"type": "null"}], "default": null, "description": "Human-readable content age reported by Brave.", "title": "Age"}, "page_age": {"anyOf": [{"type": "string"}, {"type": "null"}], "default": null, "description": "Published or indexed page-age value reported by Brave.", "title": "Page Age"}, "language": {"anyOf": [{"type": "string"}, {"type": "null"}], "default": null, "description": "Detected language code for the result page.", "title": "Language"}}, "title": "BraveSearchResultItem", "type": "object", "x-contract-dynamic": "raw Brave API item passthrough; consumers read provider keys"}}, "additionalProperties": false, "properties": {"query": {"title": "Query", "type": "string"}, "results": {"items": {"$ref": "#/$defs/BraveSearchResultItem"}, "title": "Results", "type": "array"}, "urls": {"items": {"type": "string"}, "title": "Urls", "type": "array"}}, "required": ["query"], "title": "BraveSearchOutput", "type": "object"}$mtx$::jsonb,
       false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582',
       $mtx${"family": "workflow_io", "generic": false, "category": "pure", "description": "A web search's outcome: the query, the top results (title, link, description), and a plain list of the result links."}$mtx$::jsonb
where not exists (
  select 1 from content_ir.kind_definition
  where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    and kind = 'web_search_results' and deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, organization_id)
select kd.id, kd.version,
       $mtx${"query": "best hiking trails colorado", "results": [{"title": "12 Best Hikes in Colorado", "url": "https://example.com/co-hikes", "description": "A roundup of the state's most scenic trails."}], "urls": ["https://example.com/co-hikes"]}$mtx$::jsonb,
       'Canonical example', 'authored', true,
       '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and kd.kind = 'web_search_results' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_example e
    where e.kind_definition_id = kd.id and e.is_canonical and e.deleted_at is null);


insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select 'parsed_json', $mtx$Parsed JSON$mtx$, 'python', null,
       $mtx${"$defs": {"JsonValue": {}}, "additionalProperties": false, "properties": {"value": {"$ref": "#/$defs/JsonValue", "default": null, "description": "The parsed JSON value (always present, whatever its type). Map nested fields with dot-paths, e.g. `value.suggested_keywords`."}}, "title": "ParseLlmJsonOutput", "type": "object"}$mtx$::jsonb,
       false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582',
       $mtx${"family": "workflow_io", "generic": false, "category": "pure", "description": "Structured data pulled out of an AI's text reply. The data always sits under 'value' - reach inside with dot-paths like value.keywords."}$mtx$::jsonb
where not exists (
  select 1 from content_ir.kind_definition
  where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    and kind = 'parsed_json' and deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, organization_id)
select kd.id, kd.version,
       $mtx${"value": {"suggested_keywords": ["ai workflows", "no-code automation"]}}$mtx$::jsonb,
       'Canonical example', 'authored', true,
       '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and kd.kind = 'parsed_json' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_example e
    where e.kind_definition_id = kd.id and e.is_canonical and e.deleted_at is null);


insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select 'rendered_text', $mtx$Rendered Text$mtx$, 'python', null,
       $mtx${"additionalProperties": false, "properties": {"text": {"default": "", "description": "The rendered text block.", "title": "Text", "type": "string"}, "rendered": {"default": 0, "description": "How many elements were rendered.", "title": "Rendered", "type": "integer"}, "truncated": {"default": false, "description": "True when max_items dropped elements or any per-item value was cut at max_chars_per_item.", "title": "Truncated", "type": "boolean"}}, "title": "RenderListOutput", "type": "object"}$mtx$::jsonb,
       false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582',
       $mtx${"family": "workflow_io", "generic": false, "category": "pure", "description": "A list formatted into one readable block of text, with how many items were rendered and whether any were cut."}$mtx$::jsonb
where not exists (
  select 1 from content_ir.kind_definition
  where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    and kind = 'rendered_text' and deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, organization_id)
select kd.id, kd.version,
       $mtx${"text": "- Item one\n\n- Item two", "rendered": 2, "truncated": false}$mtx$::jsonb,
       'Canonical example', 'authored', true,
       '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and kd.kind = 'rendered_text' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_example e
    where e.kind_definition_id = kd.id and e.is_canonical and e.deleted_at is null);


insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select 'scraped_page', $mtx$Scraped Page$mtx$, 'python', null,
       $mtx${"description": "Canonical scraped-page success payload for ``scraper.scrape``.\n\nLightweight projection over ``matrx_scraper.ScrapeResult``. Authors\ntypically want ``text`` (the cleanest readable form) and optional\nmetadata. Failure semantics live in the NodeResult envelope \u2014 this\npayload has no ``success``/``failure_reason`` fields.\n\nFully closed shape: the only constructor site\n(``_scrape_result_to_page`` + the dump-copy in ``scraper_scrape``)\npasses exactly the declared fields \u2014 nothing dynamic is spread in.", "properties": {"url": {"title": "Url", "type": "string"}, "response_url": {"anyOf": [{"type": "string"}, {"type": "null"}], "default": null, "title": "Response Url"}, "status_code": {"default": 0, "title": "Status Code", "type": "integer"}, "title": {"anyOf": [{"type": "string"}, {"type": "null"}], "default": null, "title": "Title"}, "published_at": {"anyOf": [{"type": "string"}, {"type": "null"}], "default": null, "title": "Published At"}, "content_type": {"anyOf": [{"type": "string"}, {"type": "null"}], "default": null, "title": "Content Type"}, "text": {"default": "", "description": "Best-available readable text. Falls back across ai_research_content \u2192 markdown_renderable \u2192 text_data \u2192 raw_text.", "title": "Text", "type": "string"}, "markdown": {"anyOf": [{"type": "string"}, {"type": "null"}], "default": null, "title": "Markdown"}, "scraped_at": {"anyOf": [{"type": "string"}, {"type": "null"}], "default": null, "title": "Scraped At"}}, "required": ["url"], "title": "ScrapedPage", "type": "object"}$mtx$::jsonb,
       false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582',
       $mtx${"family": "workflow_io", "generic": false, "category": "pure", "description": "One web page's readable content: the address, title, text, optional markdown, and fetch details. Batch scrape steps return lists of these."}$mtx$::jsonb
where not exists (
  select 1 from content_ir.kind_definition
  where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    and kind = 'scraped_page' and deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, organization_id)
select kd.id, kd.version,
       $mtx${"url": "https://example.com/article", "response_url": "https://example.com/article", "status_code": 200, "title": "Example Article", "published_at": "2026-08-01T12:00:00Z", "content_type": "text/html", "text": "The readable text of the page.", "markdown": "# Example Article\n\nThe readable text of the page.", "scraped_at": "2026-08-09T00:00:00Z"}$mtx$::jsonb,
       'Canonical example', 'authored', true,
       '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and kd.kind = 'scraped_page' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_example e
    where e.kind_definition_id = kd.id and e.is_canonical and e.deleted_at is null);


insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select 'table_rows', $mtx$Table Rows$mtx$, 'python', null,
       $mtx${"$defs": {"JsonValue": {}, "_RowRecord": {"additionalProperties": false, "properties": {"row_id": {"description": "Stable id of the user-table row.", "title": "Row Id", "type": "string"}, "data": {"additionalProperties": {"$ref": "#/$defs/JsonValue"}, "description": "User-defined JSON column values stored on the row.", "title": "Data", "type": "object"}}, "required": ["row_id"], "title": "_RowRecord", "type": "object"}}, "additionalProperties": false, "properties": {"found": {"description": "True when at least one row matched.", "title": "Found", "type": "boolean"}, "row": {"anyOf": [{"$ref": "#/$defs/_RowRecord"}, {"type": "null"}], "default": null, "description": "The first matching row (convenience for single-row lookups)."}, "rows": {"description": "All matching rows (up to limit).", "items": {"$ref": "#/$defs/_RowRecord"}, "title": "Rows", "type": "array"}, "count": {"default": 0, "description": "Number of rows returned.", "title": "Count", "type": "integer"}, "table_id": {"description": "Dataset id from which the rows were read.", "title": "Table Id", "type": "string"}}, "required": ["found", "table_id"], "title": "TableLookupOutput", "type": "object"}$mtx$::jsonb,
       false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582',
       $mtx${"family": "workflow_io", "generic": false, "category": "pure", "description": "Rows read from one of your datasets: whether anything matched, the first row, all matching rows, and a count."}$mtx$::jsonb
where not exists (
  select 1 from content_ir.kind_definition
  where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    and kind = 'table_rows' and deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, organization_id)
select kd.id, kd.version,
       $mtx${"found": true, "row": {"row_id": "3f9b2a10-6c4e-4d2b-9a8f-1e2d3c4b5a69", "data": {"name": "Acme", "score": 42}}, "rows": [{"row_id": "3f9b2a10-6c4e-4d2b-9a8f-1e2d3c4b5a69", "data": {"name": "Acme", "score": 42}}], "count": 1, "table_id": "b7e6a5d4-3c2b-4a19-8f7e-6d5c4b3a2919"}$mtx$::jsonb,
       'Canonical example', 'authored', true,
       '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and kd.kind = 'table_rows' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_example e
    where e.kind_definition_id = kd.id and e.is_canonical and e.deleted_at is null);


insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select 'saved_row', $mtx$Saved Row$mtx$, 'python', null,
       $mtx${"$defs": {"JsonValue": {}}, "additionalProperties": false, "properties": {"row_id": {"description": "The id of the created or updated row.", "title": "Row Id", "type": "string"}, "created": {"description": "True if a new row was inserted.", "title": "Created", "type": "boolean"}, "updated": {"description": "True if an existing row was updated.", "title": "Updated", "type": "boolean"}, "data": {"additionalProperties": {"$ref": "#/$defs/JsonValue"}, "description": "The row's data after the write.", "title": "Data", "type": "object"}, "table_id": {"description": "Dataset id containing the created or updated row.", "title": "Table Id", "type": "string"}}, "required": ["row_id", "created", "updated", "table_id"], "title": "TableUpsertOutput", "type": "object"}$mtx$::jsonb,
       false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582',
       $mtx${"family": "workflow_io", "generic": false, "category": "pure", "description": "The receipt for saving a dataset row: the row's id, whether it was newly created or updated, and its data after the write."}$mtx$::jsonb
where not exists (
  select 1 from content_ir.kind_definition
  where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    and kind = 'saved_row' and deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, organization_id)
select kd.id, kd.version,
       $mtx${"row_id": "3f9b2a10-6c4e-4d2b-9a8f-1e2d3c4b5a69", "created": true, "updated": false, "data": {"name": "Acme", "score": 42}, "table_id": "b7e6a5d4-3c2b-4a19-8f7e-6d5c4b3a2919"}$mtx$::jsonb,
       'Canonical example', 'authored', true,
       '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and kd.kind = 'saved_row' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_example e
    where e.kind_definition_id = kd.id and e.is_canonical and e.deleted_at is null);


insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select 'user_inputs', $mtx$User Inputs$mtx$, 'python', null,
       $mtx${"type": "object"}$mtx$::jsonb,
       false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582',
       $mtx${"family": "workflow_io", "generic": true, "category": "pure", "description": "The values a person entered on the workflow's Run form - one entry per field the workflow author defined."}$mtx$::jsonb
where not exists (
  select 1 from content_ir.kind_definition
  where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    and kind = 'user_inputs' and deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, organization_id)
select kd.id, kd.version,
       $mtx${"topic": "quarterly report", "count": 3}$mtx$::jsonb,
       'Canonical example', 'authored', true,
       '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and kd.kind = 'user_inputs' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_example e
    where e.kind_definition_id = kd.id and e.is_canonical and e.deleted_at is null);



-- Plain-language descriptions for the pre-existing structural/generic
-- workflow_io shapes (picker subtitles). Only fills empty descriptions.
with descs(kind, description) as (values
  ('json', 'Any data - no particular shape is promised.'),
  ('text', 'Plain text.'),
  ('number', 'A single number.'),
  ('boolean', 'A yes/no value.'),
  ('string_list', 'A list of short text values.'),
  ('http_response', 'What came back from a web request: status, final address, headers, and the body (parsed JSON when possible).'),
  ('regex_extract_result', 'Pattern matches found in text: how many, the first match, and the full list.'),
  ('branch_result', 'Which way a decision step went, with the original value passed through.'),
  ('map_result', 'How many items a repeat-for-each step sent out for processing.'),
  ('gather_result', 'Values collected from parallel branches, with a count.'),
  ('workflow_run_result', 'A sub-workflow run''s outcome: the run id and the final outputs of its last steps.')
)
update content_ir.kind_definition kd
   set metadata = jsonb_set(coalesce(kd.metadata,'{}'::jsonb), '{description}', to_jsonb(d.description), true)
  from descs d
 where kd.kind = d.kind
   and kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
   and kd.deleted_at is null
   and kd.metadata->>'family' = 'workflow_io'
   and not kd.is_contract_artifact
   and coalesce(kd.metadata->>'description','') = '';

-- Activate every human-named workflow_io shape that passes the dual gate
-- (data_only family: canonical passed example is the whole gate). Operator
-- path: the gate verdict is checked row-by-row; set_config satisfies the
-- activation guard trigger inside this transaction.
select set_config('content_ir.activation_ok', '1', true);
update content_ir.kind_definition kd
   set is_active = true,
       metadata = jsonb_set(coalesce(kd.metadata,'{}'::jsonb), '{activation_note}',
         to_jsonb('Named-shapes campaign 2026-08-09 (features-to-workflows item 6): gate verified via evaluate_kind_activation before activation.'::text), true),
       updated_at = now()
 where kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
   and kd.deleted_at is null
   and not kd.is_contract_artifact
   and kd.metadata->>'family' = 'workflow_io'
   and not kd.is_active
   and (content_ir.evaluate_kind_activation(kd.id) ->> 'would_activate')::boolean;
