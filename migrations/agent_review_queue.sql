-- Agent Review Queue — the single drop-off point for anything an agent builds
-- that Arman must go see/test in the UI (demo pages, new routes, features).
-- One table, deliberately minimal: agents INSERT via the Supabase MCP, the
-- super-admin page /administration/agent-review lists items, Arman leaves
-- feedback + flips status, agents SELECT the feedback back and archive the row
-- once handled. See features/admin/agent-review/FEATURE.md.
--
-- Lives in the `agent` schema (PostgREST-exposed + included in `pnpm db-types`).

create table if not exists agent.review_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- What the agent wants reviewed
  title text not null,
  url text not null,                 -- app path preferred ("/demos/foo") so it works on localhost AND prod; absolute URLs allowed
  instructions text not null,        -- what to test / what feedback is wanted
  source text not null default 'ai-matrx',  -- repo or surface that created it (ai-matrx, aidream, matrx-extend, ...)
  -- Review state
  status text not null default 'pending'
    check (status in ('pending', 'changes_requested', 'approved', 'archived')),
  feedback text,                     -- Arman's feedback, written from the review page
  feedback_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

comment on table agent.review_queue is
  'Queue of agent-built things awaiting human review. pending = needs Arman; changes_requested/approved = feedback left, agent must act then archive; archived = done (hidden by default).';
comment on column agent.review_queue.url is 'App path preferred (works on localhost and prod); absolute URL allowed.';
comment on column agent.review_queue.instructions is 'What the reviewer should test and what feedback the agent needs.';

create index if not exists review_queue_status_created_idx
  on agent.review_queue (status, created_at desc);

drop trigger if exists review_queue_set_updated_at on agent.review_queue;
create trigger review_queue_set_updated_at
  before update on agent.review_queue
  for each row execute function public.update_updated_at_column();

-- Super-admin only from the browser; agents write via the Supabase MCP (service role).
alter table agent.review_queue enable row level security;

drop policy if exists review_queue_super_admin on agent.review_queue;
create policy review_queue_super_admin on agent.review_queue
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant select, insert, update, delete on agent.review_queue to authenticated;
revoke all on agent.review_queue from anon;
