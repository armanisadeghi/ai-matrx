-- System Context "feed model" — a context item is a DEFINITION + a FEED.
--
-- Before this, a context item had no concept of HOW its value is populated:
-- `source_type` is an ignored provenance label, `fetch_hint` is a binary
-- include/exclude at resolution, and `review_interval_days`/`next_review_at`
-- are dead reminder bookkeeping. Nothing described "where does this value come
-- from / how does it stay fresh." This adds that — the feed.
--
-- feed_type = how the value is produced:
--   manual    — a typed value (rare; e.g. a one-off clean-text blob)
--   computed  — code/expression evaluated at resolution time (extends the
--               hard-coded ambient providers toward user-defined)
--   api       — a defined HTTP call + extraction, run server-side
--   agent     — an agent run produces the value (e.g. "top 10 news stories")
--   dataset   — points at a rag.data_stores knowledge store; NOT a scalar value
--               (agents query it with the RAG tools). The industry-dataset case.
--
-- Refresh (WHEN) is orthogonal to feed_type (HOW): refresh_task_id links to an
-- sch_task that re-runs the feed on a cadence; null = on-demand / static.
--
-- Idempotent (re-appliable).

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'context_feed_type' and n.nspname = 'public') then
    create type public.context_feed_type as enum (
      'manual', 'computed', 'api', 'agent', 'dataset'
    );
  end if;
end $$;

alter table public.ctx_context_items
  add column if not exists feed_type public.context_feed_type not null default 'manual',
  add column if not exists feed_config jsonb not null default '{}'::jsonb,
  add column if not exists last_fed_at timestamptz,
  add column if not exists feed_status text,
  add column if not exists feed_error text,
  add column if not exists refresh_task_id uuid;

comment on column public.ctx_context_items.feed_type is
  'How this item''s value is populated: manual (rare typed value), computed (code/expression at resolution), api (defined HTTP call), agent (agent run produces it), dataset (points at a rag.data_stores; agents query it, not a scalar). The definition + feed is the authored thing; the value is the feed output.';
comment on column public.ctx_context_items.feed_config is
  'Feed-specific config. computed: {kind: reserved|expression|code, reserved_key|expression|code}. api: {endpoint, method, headers, body, auth_secret_id, extraction}. agent: {agent_id, prompt}. dataset: {data_store_id}.';
comment on column public.ctx_context_items.last_fed_at is 'When the feed last produced a value (any feed_type except manual).';
comment on column public.ctx_context_items.feed_status is 'Last feed-run outcome: ok | error | pending | null (never fed).';
comment on column public.ctx_context_items.feed_error is 'Last feed-run error message, if feed_status = error.';
comment on column public.ctx_context_items.refresh_task_id is 'sch_task that refreshes this item on a cadence; null = on-demand / static.';

-- Existing items keep feed_type='manual' (their authored stored value), except
-- the ambient computes which ARE code-computed at resolution time.
update public.ctx_context_items ci
set feed_type = 'computed',
    feed_config = jsonb_build_object('kind', 'reserved', 'reserved_key', ci.key)
where ci.key in ('current_date','current_datetime','current_time','current_year','current_user_id')
  and ci.feed_type <> 'computed';
