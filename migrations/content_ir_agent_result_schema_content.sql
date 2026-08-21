-- content_ir: regenerate agent_result's emitted_json_schema from AiExecutionResult
--
-- WHY: `agent_result` is a PYTHON-OWNED kind — its contract is
-- `emitted_json_schema`, derived from matrx-ai's `AiExecutionResult`
-- (aidream `packages/matrx-ai/matrx_ai/graph_nodes/shared.py`). The row was
-- published 2026-08-09, BEFORE the model gained `content` — THE AGENT OUTPUT
-- CONTRACT (KINDS_EVERYWHERE_PLAN.md §6): the response as an ordered list of
-- typed kind instances, each carrying its own `__kind`. Python emits it
-- (`_extract_content`), and the frontend half shipped 2026-08-21
-- (`features/workflow-runtime/agent-run-output.ts`,
-- `features/content-ir/kinds/agent-result.ts`, `AgentContentList.tsx`). The DB
-- contract was the stale half: every real run carrying `content` failed its own
-- kind check with *Additional properties are not allowed* (the root is
-- `additionalProperties: false`) — the same defect `agent_react_result` hit and
-- closed by republishing.
--
-- WHAT: the schema below is `AiExecutionResult.model_json_schema()` verbatim —
-- never hand-written, per the shape-system rule for python-owned kinds. Diffed
-- against the live row before applying: the ONLY delta is the added `content`
-- property (removed: none, changed: none, everything outside `properties`
-- byte-identical). `compatibility_verdict()` from
-- `matrx_graph.content_ir.sdk` judges it compatible/additive
-- ("adds optional field 'content'"), so version 2 evolves IN PLACE — a new
-- version row would fork a shape nothing emits.
--
-- Not touched: `is_active` (`content_ir.set_kind_activation` remains the ONE
-- write path; the kind is already active and the gate stays green),
-- `emitted_block_schema` (NULL — wire IS block for this kind), `data` (NULL —
-- python-owned).
--
-- Idempotent: rewrites only when the stored schema differs from the generated
-- one, so re-running is a no-op. Ledger: public._schema_migrations
-- (source 'matrx-frontend').

do $$
declare
  v_id uuid;
  v_live jsonb;
  v_model jsonb := '{"$defs":{"AiMessage":{"additionalProperties":true,"description":"Single message in the conversation as seen by the workflow.\n\nFlattens the matrx-ai ``UnifiedMessage`` into a stable JSON shape.\nUnknown / provider-specific keys land in ``extra`` so consumers can\nreach them without losing fidelity \u2014 ``extra=\"allow\"`` is deliberate\nand must stay (``to_storage_dict()`` payloads carry provider keys we\nnever declare here).\n\n``content`` / ``tool_calls`` values are genuinely dynamic JSON \u2014\nprovider content blocks and tool-call envelopes whose shape varies per\nprovider \u2014 hence ``JsonValue``, never a declared block union that\nwould drift from the providers.","properties":{"content":{"$ref":"#/$defs/JsonValue","default":null},"name":{"anyOf":[{"type":"string"},{"type":"null"}],"default":null,"title":"Name"},"role":{"title":"Role","type":"string"},"tool_call_id":{"anyOf":[{"type":"string"},{"type":"null"}],"default":null,"title":"Tool Call Id"},"tool_calls":{"items":{"additionalProperties":{"$ref":"#/$defs/JsonValue"},"type":"object"},"title":"Tool Calls","type":"array"}},"required":["role"],"title":"AiMessage","type":"object","x-contract-dynamic":"provider-specific storage keys (to_storage_dict payloads) must survive"},"AiModelUsage":{"additionalProperties":false,"description":"Per-model token/cost breakdown \u2014 one entry in :class:`AiUsage.models`.\n\nClosed shape, one canonical key-set across every producer. ``cost_usd``\nmatches the top-level ``AiUsage.cost_usd`` (this unified a prior divergence\nwhere graph_nodes wrote ``cost`` while the podcast aggregator wrote\n``cost_usd``). ``api`` / ``request_count`` default to ``\"\"`` / ``0`` for\nproducers that don''t track them.","properties":{"api":{"default":"","title":"Api","type":"string"},"cost_usd":{"default":0.0,"title":"Cost Usd","type":"number"},"input_tokens":{"default":0,"title":"Input Tokens","type":"integer"},"output_tokens":{"default":0,"title":"Output Tokens","type":"integer"},"request_count":{"default":0,"title":"Request Count","type":"integer"},"total_tokens":{"default":0,"title":"Total Tokens","type":"integer"}},"title":"AiModelUsage","type":"object"},"AiUsage":{"description":"Aggregated token / cost usage for the run.\n\nEvery constructor in the package (``_extract_usage`` below and the\npodcast pipeline''s stage aggregators) sets only the declared fields, so\nthe model is closed \u2014 no ``extra=\"allow\"``. Per-model breakdown values are\ntyped as :class:`AiModelUsage`: the two producer shapes were unified onto\none canonical key-set (``cost_usd`` everywhere), so this is a precise\ncontract, not an open ``dict[str, JsonValue]``.","properties":{"cost_usd":{"default":0.0,"description":"Total estimated provider cost in US dollars.","title":"Cost Usd","type":"number"},"input_tokens":{"default":0,"description":"Total input tokens billed across the run.","title":"Input Tokens","type":"integer"},"models":{"additionalProperties":{"$ref":"#/$defs/AiModelUsage"},"description":"Per-model usage breakdown keyed by canonical model name.","title":"Models","type":"object"},"output_tokens":{"default":0,"description":"Total output tokens billed across the run.","title":"Output Tokens","type":"integer"},"total_tokens":{"default":0,"description":"Combined input and output token count across the run.","title":"Total Tokens","type":"integer"}},"title":"AiUsage","type":"object"},"JsonValue":{}},"additionalProperties":false,"description":"Canonical output for every matrx-ai graph action.\n\nWhether the node ran a single chat turn or a multi-iteration agent loop,\nthe workflow sees the same shape: ``final_text`` for the final assistant\nresponse, ``messages`` for the full conversation history (so the next\nnode in the graph can continue the thread), and ``usage`` for cost\ntracking.","properties":{"content":{"items":{"additionalProperties":{"$ref":"#/$defs/JsonValue"},"type":"object"},"title":"Content","type":"array"},"conversation_id":{"title":"Conversation Id","type":"string"},"duration_ms":{"default":0,"title":"Duration Ms","type":"integer"},"final_message":{"anyOf":[{"$ref":"#/$defs/AiMessage"},{"type":"null"}],"default":null},"final_text":{"default":"","title":"Final Text","type":"string"},"finish_reason":{"anyOf":[{"type":"string"},{"type":"null"}],"default":null,"title":"Finish Reason"},"iterations":{"title":"Iterations","type":"integer"},"messages":{"items":{"$ref":"#/$defs/AiMessage"},"title":"Messages","type":"array"},"metadata":{"additionalProperties":{"$ref":"#/$defs/JsonValue"},"title":"Metadata","type":"object"},"request_id":{"title":"Request Id","type":"string"},"structured_output":{"anyOf":[{"additionalProperties":{"$ref":"#/$defs/JsonValue"},"type":"object"},{"items":{"$ref":"#/$defs/JsonValue"},"type":"array"},{"type":"null"}],"default":null,"title":"Structured Output"},"tool_calls_made":{"default":0,"title":"Tool Calls Made","type":"integer"},"usage":{"$ref":"#/$defs/AiUsage"}},"required":["conversation_id","request_id","iterations"],"title":"AiExecutionResult","type":"object"}'::jsonb;
begin
  -- Keyed on the slug alone: `version` here is the PLATFORM row version
  -- (bumped by `_version_capture` on every write), not a kind schema version,
  -- so pinning it would make this file self-defeating on a re-run.
  select id, emitted_json_schema into v_id, v_live
    from content_ir.kind_definition
   where kind = 'agent_result' and deleted_at is null;

  if v_id is null then
    raise exception 'content_ir_agent_result_schema_content: agent_result kind_definition missing';
  end if;

  if v_live is distinct from v_model then
    update content_ir.kind_definition
       set emitted_json_schema = v_model,
           updated_at = now()
     where id = v_id;
    raise notice 'agent_result emitted_json_schema regenerated from AiExecutionResult (content added)';
  else
    raise notice 'agent_result emitted_json_schema already current — no-op';
  end if;
end $$;
