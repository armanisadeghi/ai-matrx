-- platform.output_feedback — THE one destination for "was this output good?"
--
-- Before this: the /chat thumbs wrote `chat.message.metadata.user_reaction`
-- (no consumer, chat-only, no prose, no correction); the cx-chat action bar
-- wrote nothing at all (local useState); and the rich-document thumbs actions
-- called host callbacks nobody supplied. One table replaces all three.
--
-- The corrected-output pair (original_content / corrected_content) is the
-- point: it is the reference the Level-1 replay harness ranks against.
--
-- Applied via Supabase MCP 2026-08-15 (project txzxabzwovsujtloxrus).
-- Certified: iam.canonical_certify_ok('platform','output_feedback','output_feedback') = true.

create table if not exists platform.output_feedback (
  id uuid primary key default gen_random_uuid(),

  -- Subject: what was judged. Canonical entity token + row id.
  subject_type text not null references platform.entity_types(token),
  subject_id uuid not null,

  -- The verdict + the human's words.
  verdict text not null check (verdict in ('positive','negative','mixed')),
  prose text,

  -- Replay linkage: the agent request that produced the judged output.
  request_id text,
  -- Which UI surface captured this (surfaces registry name).
  surface_name text,

  -- Corrected-output capture: the frozen pair + a ref to where the
  -- correction lives. The pair is frozen on purpose — the referenced row
  -- keeps changing, the training/ranking signal must not.
  original_content text,
  corrected_content text,
  corrected_ref_type text references platform.entity_types(token),
  corrected_ref_id uuid,
  corrected_at timestamptz,

  -- Base entity columns.
  organization_id uuid not null default public.current_personal_org_id()
    references iam.organizations(id),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  -- personal-justified: a thumbs verdict is one person's opinion of one
  -- output. Org-wide feedback would be a different product.
  visibility platform.visibility not null default 'personal'
);

-- One live row per (subject, person). Total (not partial) so ON CONFLICT can
-- infer it. Retracting feedback is a real DELETE — a retracted opinion is not
-- trash to be restored.
alter table platform.output_feedback
  drop constraint if exists output_feedback_subject_author_uniq;
alter table platform.output_feedback
  add constraint output_feedback_subject_author_uniq
  unique (subject_type, subject_id, created_by);

create index if not exists output_feedback_subject_idx
  on platform.output_feedback (subject_type, subject_id) where deleted_at is null;
create index if not exists output_feedback_request_idx
  on platform.output_feedback (request_id) where request_id is not null and deleted_at is null;
create index if not exists output_feedback_org_created_idx
  on platform.output_feedback (organization_id, created_at desc) where deleted_at is null;
-- The high-value slice: negative verdicts that carry a correction.
create index if not exists output_feedback_corrected_idx
  on platform.output_feedback (verdict, corrected_at desc)
  where corrected_content is not null and deleted_at is null;

comment on table platform.output_feedback is
  'The ONE destination for feedback on an AI-produced output (thumbs up/down, prose, and the corrected-output pair). Subject is polymorphic by canonical entity token. corrected_content is frozen at capture time — it is the reference point Level-1 replay ranks against.';

drop trigger if exists _stamp_actor on platform.output_feedback;
create trigger _stamp_actor before insert or update on platform.output_feedback
  for each row execute function platform._stamp_actor();
drop trigger if exists _touch_row on platform.output_feedback;
create trigger _touch_row before insert or update on platform.output_feedback
  for each row execute function platform._touch_row();

insert into platform.entity_types
  (token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete,
   is_active, default_visibility, is_listed, is_component, rls_variant, audit_class)
select 'output_feedback','platform','output_feedback','Output Feedback',1,false,true,
       true,'personal',false,false,'entity','entity'
where not exists (select 1 from platform.entity_types where token='output_feedback');

select iam.apply_rls('platform','output_feedback','output_feedback','entity');

grant usage on schema platform to authenticated, anon, service_role;
grant select, insert, update, delete on platform.output_feedback to authenticated;
grant all on platform.output_feedback to service_role;

-- Backfill the four pre-existing chat reactions, then retire the metadata key
-- and the RPC that wrote it (one authority, no silent second store).
insert into platform.output_feedback
  (subject_type, subject_id, verdict, surface_name, organization_id, created_by, created_at, metadata)
select 'message', m.id,
       case m.metadata->>'user_reaction' when 'like' then 'positive' else 'negative' end,
       'chat', m.organization_id, c.created_by, coalesce(m.updated_at, m.created_at),
       jsonb_build_object('backfilled_from','chat.message.metadata.user_reaction')
from chat.message m join chat.conversation c on c.id = m.conversation_id
where m.metadata ? 'user_reaction'
on conflict do nothing;

update chat.message set metadata = metadata - 'user_reaction' where metadata ? 'user_reaction';
drop function if exists public.cx_message_set_reaction(uuid, text);

-- THE one write path. SECURITY INVOKER: chat.message RLS still decides whether
-- this caller may see the subject; platform.output_feedback RLS decides the row.
-- p_verdict NULL = leave the existing verdict alone (a pure correction capture);
-- a fresh row with no verdict lands as 'mixed' — the user rewrote the output,
-- so it was not right as produced.
create or replace function platform.upsert_output_feedback(
  p_subject_type text,
  p_subject_id uuid,
  p_verdict text default null,
  p_prose text default null,
  p_request_id text default null,
  p_surface_name text default null,
  p_original_content text default null,
  p_corrected_content text default null,
  p_corrected_ref_type text default null,
  p_corrected_ref_id uuid default null,
  p_organization_id uuid default null
)
returns platform.output_feedback
language plpgsql
security invoker
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_row platform.output_feedback;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_verdict is not null and p_verdict not in ('positive','negative','mixed') then
    raise exception 'invalid verdict %', p_verdict using errcode = '22023';
  end if;

  insert into platform.output_feedback as f (
    subject_type, subject_id, verdict, prose, request_id, surface_name,
    original_content, corrected_content, corrected_ref_type, corrected_ref_id,
    corrected_at, organization_id, created_by
  ) values (
    p_subject_type, p_subject_id,
    coalesce(p_verdict, 'mixed'), p_prose, p_request_id, p_surface_name,
    p_original_content, p_corrected_content, p_corrected_ref_type, p_corrected_ref_id,
    case when p_corrected_content is not null then now() end,
    coalesce(p_organization_id, public.current_personal_org_id()), v_uid
  )
  on conflict (subject_type, subject_id, created_by) do update set
    verdict           = coalesce(p_verdict, f.verdict),
    prose             = coalesce(p_prose, f.prose),
    request_id        = coalesce(p_request_id, f.request_id),
    surface_name      = coalesce(p_surface_name, f.surface_name),
    -- The ORIGINAL is written once and never overwritten: the first capture is
    -- the model's actual output. Later edits only move `corrected_content`.
    original_content  = coalesce(f.original_content, p_original_content),
    corrected_content = coalesce(p_corrected_content, f.corrected_content),
    corrected_ref_type= coalesce(p_corrected_ref_type, f.corrected_ref_type),
    corrected_ref_id  = coalesce(p_corrected_ref_id, f.corrected_ref_id),
    corrected_at      = case when p_corrected_content is not null then now()
                             else f.corrected_at end,
    deleted_at        = null
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function platform.upsert_output_feedback(
  text, uuid, text, text, text, text, text, text, text, uuid, uuid
) to authenticated;

-- Retract: the user's own opinion, removed outright.
create or replace function platform.clear_output_feedback(
  p_subject_type text,
  p_subject_id uuid
) returns boolean
language sql
security invoker
set search_path to 'pg_catalog', 'public'
as $$
  delete from platform.output_feedback
   where subject_type = p_subject_type
     and subject_id = p_subject_id
     and created_by = auth.uid()
  returning true;
$$;

grant execute on function platform.clear_output_feedback(text, uuid) to authenticated;
