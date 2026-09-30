-- chair-step: lane DRILL-CALLS (program DRILL-FINISH, decisions 12 and 24) — A MODEL CALL IS ONE ROW OF AI CALLS. It CREATES one server-only view runtime._ai_calls (chat.request, one row per model call that was not deleted: the model that actually ran by its common name, its provider from ai.provider, latency, status, iteration, request, conversation, sign-in session, a UTC ten-minute bucket, and whether the call's request is in the spend ledger), registered System machinery as token ai_calls (a projection of cx_request). No client grant; no table, policy or row of anybody's data is touched.
-- lane: DRILL-CALLS
-- lock: platform
--
-- WHY. Two grains, two definitions, both true (decision 12): ai_usage counts what the platform SPENT
-- (the ledger, every execution incl. tools, scraping and child runs); ai_calls counts the MODEL CALLS
-- (chat.request): which model actually answered, how fast, with what status. The CX usage tab
-- (chat.cx_usage_analytics) is a set of questions of this grain, so its cuts become built-in Saved
-- views of the declared definition ai_calls, and chat.cx_usage_analytics stays their parity oracle:
--   model    = coalesce(ai.model_definition.common_name, 'Unknown')   (cx: model_name)
--   provider = coalesce(ai.provider.name, 'Unknown') via the model's provider_id (cx: provider — NOT
--              chat.request.provider, the text the ledger's rules use)
--   origin   = coalesce(chat.user_request.origin_class, 'unknown')      (cx: origin_class)
--   latency_ms = nullif(api_duration_ms, 0)                             (cx: avg(nullif(api_duration_ms,0)))
-- The window: cx_usage_analytics counts created_at <= p_end (inclusive); the drill door's window is
-- half-open [from, to), so the same rows are asked with to = p_end + 1 microsecond (timestamps are
-- microseconds). The views carry no window of their own; the explorer adds it.
--
-- Money: cost is chat.request.cost with a call that has no price counted as 0 and ALSO counted in
-- unpriced_calls, so a sum never hides that the ledger of calls under-counts (cx sums the same way).
-- request_in_ledger says whether the call's request owns any row of runtime.global_execution — the
-- measured part of the ledger-vs-calls reconciliation (decision 29) that the calls side holds.
--
-- Server-only: no client grant; read only through the drill door's definer step with each lane's
-- rule compiled in (declared definition ai_calls). security_invoker, so a grant made by mistake would
-- still meet chat.request's own row security. A flat select: a filter on created_at / bucket reaches
-- cx_request_created_at_idx.
-- INVERSE: migrations/inverse/drillcalls_a_model_call_is_one_row_of_ai_calls_down.sql
-- Proof: scripts/campaign-tests/drillcalls_green.sql (clone).

create view runtime._ai_calls with (security_invoker = true) as
select
  r.id                                                                    as call_id,
  r.created_at,
  date_trunc('hour', r.created_at, 'UTC')                                 as bucket,
  date_bin('10 minutes', r.created_at, timestamptz '2000-01-01 00:00:00+00') as bucket_10m,
  r.organization_id,
  coalesce(ur.created_by, r.created_by)                                   as person_id,
  ur.agent_id,
  r.user_request_id                                                       as request_id,
  r.conversation_id,
  ur.metadata -> 'jwt_claims' ->> 'session_id'                            as session_id,
  coalesce(md.common_name, 'Unknown')::text                               as model,
  coalesce(p.name, 'Unknown')::text                                       as provider,
  coalesce(ur.origin_class, 'unknown')                                    as origin,
  r.status,
  r.iteration::integer                                                    as iteration,
  r.finish_reason,
  coalesce(r.cost, 0)::numeric                                            as cost,
  1::bigint                                                               as calls,
  (case when r.cost is null then 1 else 0 end)::bigint                    as unpriced_calls,
  coalesce(r.input_tokens, 0)::bigint                                     as tokens_in,
  coalesce(r.output_tokens, 0)::bigint                                    as tokens_out,
  coalesce(r.cached_tokens, 0)::bigint                                    as tokens_cached,
  coalesce(r.total_tokens, 0)::bigint                                     as tokens_total,
  nullif(r.api_duration_ms, 0)                                            as latency_ms,
  exists (select 1 from runtime.global_execution e where e.request_id = r.user_request_id) as request_in_ledger
from chat.request r
left join ai.model_definition md on md.id = r.ai_model_id
left join ai.provider p on p.id = md.provider_id
left join chat.user_request ur on ur.id = r.user_request_id
where r.deleted_at is null;

revoke all on runtime._ai_calls from public, anon, authenticated;
comment on view runtime._ai_calls is
  'DRILL-CALLS: the model calls (chat.request, not deleted), one row per call, by chat.cx_usage_analytics''s rules (model = the common name, provider = ai.provider.name, latency = api_duration_ms with 0 as not recorded). The fact of the declared drill definition ai_calls (token ai_calls). Server-only.';
comment on column runtime._ai_calls.model is 'The model that answered this call: ai.model_definition.common_name ("Unknown" when the model has none).';
comment on column runtime._ai_calls.provider is 'The provider of that model (ai.provider.name via model_definition.provider_id), "Unknown" when the model names none.';
comment on column runtime._ai_calls.cost is 'Dollars; a call with no price counts 0 here and 1 in unpriced_calls.';
comment on column runtime._ai_calls.latency_ms is 'The provider API time in milliseconds; empty when it was not recorded (0 is not a latency).';
comment on column runtime._ai_calls.session_id is 'The sign-in session of the call''s request (its JWT claims); empty = no session.';
comment on column runtime._ai_calls.bucket_10m is 'The UTC ten-minute bucket of the call (high cardinality).';
comment on column runtime._ai_calls.request_in_ledger is 'The call''s request owns at least one row of the spend ledger (runtime.global_execution).';

insert into platform.entity_types (
  token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active,
  notes, is_listed, is_component, is_module, rls_variant, reference_pickable, audit_class,
  audit_class_reason, relation_kind, projects_token, data_class, data_class_reason, default_list_scope,
  origin, type, type_reason, agent_writable, allow_preview, table_ref
)
values (
  'ai_calls', 'runtime', '_ai_calls', 'AI model calls', 1, false, false, true,
  'The model calls (chat.request) one row per call, by the CX usage rules; the fact of the declared drill definition ai_calls.',
  false, false, false, 'system', false, 'machinery',
  'Projection: a server-only view over chat.request + ai.model_definition + ai.provider + chat.user_request. It owns no rows.',
  'projection', 'cx_request', 'organization',
  'System machinery with no client lane; read only through the drill door''s definer step with each lane''s rule compiled in.',
  'organization', 'standard', 'system',
  'Lane DRILL-CALLS: the model-call grain of AI usage (PROGRESS-DRILL-FINISH decisions 12 and 24).',
  false, false, 'runtime._ai_calls'::regclass
)
on conflict (token) do nothing;
