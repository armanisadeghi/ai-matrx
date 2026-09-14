-- DD-235 — a door never names a relation the catalog does not have.
--
-- THE DEFECT, measured live 2026-09-14 over HTTPS as test@test.com against
-- https://db.matrxserver.com:
--
--   rpc/set_my_sms_assistant_enabled   -> 42P01 relation "agent.mandate" does not exist
--   rpc/masterwork_improvement_summary -> 42P01 relation "agent.mandate" does not exist
--
-- Neither is an authorization decision and neither depends on the caller: the
-- two bodies name a relation this database does not have, so NO caller can use
-- either door. `agent.mandate` was retired by the Phase 1W mandate detach on
-- 2026-08-29 and `platform.deprecated_relations` records its successor —
-- `mandate.definition` — but nothing re-read the two SECURITY DEFINER bodies
-- that still named the old relation. A `CREATE OR REPLACE FUNCTION` body is not
-- checked against the catalogue at creation time, and PostgreSQL does not track
-- a dependency from a plpgsql or sql body to the relations it names, so a rename
-- leaves the body syntactically valid and permanently broken at run time. The
-- class guard that makes this impossible to reintroduce is arm D19 of
-- `pnpm check:impl-doors` (scripts/check-impl-doors.ts).
--
-- WHAT CHANGES, AND NOTHING ELSE:
--   * `agent.mandate` -> `mandate.definition` in both bodies.
--   * `masterwork_improvement_summary` additionally reads the Holder off
--     `default_holder_id` (the detach split `default_agent_id` into
--     `default_holder_type` + `default_holder_id`), and says `default_holder_type
--     = 'agent'` out loud because the join's other side is `subject_kind = 'agent'`
--     — an agent Holder is the only kind that answers a Hindsight enrollment.
-- Signatures, return shapes, grants and gates are untouched, so every existing
-- caller sends and receives exactly what it did before.

set lock_timeout = '8s';

-- based-on: communication.set_my_sms_assistant_enabled(text, boolean) 30ff3b3ec83e857a70bd0bca7aef8c54601feed1001476b5696ba474c0772c42
create or replace function communication.set_my_sms_assistant_enabled(
  p_program_key text,
  p_enabled boolean
)
returns table (
  destination_id uuid,
  masked_phone text,
  program_key text,
  number_active boolean,
  global_assistant_enabled boolean,
  verified_user_phone text,
  sms_enabled boolean,
  user_assistant_enabled boolean,
  preferred_agent_id uuid,
  preferred_agent_version_id uuid,
  sms_conversation_id uuid,
  chat_conversation_id uuid,
  identity_status text,
  consent_status text,
  ready boolean,
  blocked_reasons text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  updated_count integer;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if nullif(btrim(p_program_key), '') is null then
    raise exception 'Program key is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from mandate.definition sms_mandate
    where sms_mandate.mandate_key = 'sms.owner_beta'
      and sms_mandate.is_enabled
      and sms_mandate.deleted_at is null
  ) then
    raise exception 'SMS assistant Mandate is unavailable' using errcode = '55000';
  end if;

  update communication.sms_notification_preferences preference
  set ai_agent_messages = coalesce(p_enabled, false),
      updated_by = caller,
      updated_at = now()
  where preference.user_id = caller
    and preference.assistant_program_key = p_program_key
    and preference.assistant_destination_id is not null
    and preference.deleted_at is null;
  get diagnostics updated_count = row_count;

  if updated_count = 0 then
    raise exception 'SMS preferences and program must already be explicitly bound'
      using errcode = 'P0002';
  elsif updated_count > 1 then
    raise exception 'SMS assistant program binding is ambiguous' using errcode = '21000';
  end if;

  return query
  select * from communication.get_my_sms_assistant_program(p_program_key);
end;
$$;

comment on function communication.set_my_sms_assistant_enabled(text, boolean) is
  'Toggles SMS assistant delivery only. Agent identity resolves exclusively through sms.owner_beta Mandate Bindings.';

-- based-on: public.masterwork_improvement_summary(text[]) 519b1095073be018f3624039b85f0b3c28ab8b9fff41def5f6708563508a552a
create or replace function public.masterwork_improvement_summary(p_mandate_keys text[])
returns table (
  mandate_key text,
  enrolled boolean,
  review_cadence integer,
  review_count bigint,
  last_review_at timestamp with time zone,
  findings_total bigint,
  findings_applied bigint,
  findings_open bigint,
  lever_counts jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.mandate_key,
    (e.id is not null) as enrolled,
    e.review_every_n as review_cadence,
    count(distinct r.id) filter (where r.status = 'completed') as review_count,
    coalesce(max(r.completed_at) filter (where r.status = 'completed'), e.last_review_at) as last_review_at,
    count(distinct f.id) as findings_total,
    count(distinct f.id) filter (where f.status = 'applied') as findings_applied,
    count(distinct f.id) filter (where f.status in ('proposed', 'evidencing', 'ready', 'approved')) as findings_open,
    coalesce(
      (
        select jsonb_object_agg(lv.lever, lv.n)
        from (
          select f2.lever, count(*) as n
          from hindsight.finding f2
          where f2.enrollment_id = e.id
            and f2.deleted_at is null
            and f2.lever is not null
          group by f2.lever
        ) lv
      ),
      '{}'::jsonb
    ) as lever_counts
  from mandate.definition m
  left join hindsight.enrollment e
    on e.subject_id = m.default_holder_id
   and m.default_holder_type = 'agent'
   and e.subject_kind = 'agent'
   and e.deleted_at is null
  left join hindsight.review r
    on r.enrollment_id = e.id
   and r.deleted_at is null
  left join hindsight.finding f
    on f.enrollment_id = e.id
   and f.deleted_at is null
  where m.deleted_at is null
    and m.mandate_key = any (p_mandate_keys)
    -- Scoped to the Masterwork mandates by design — this RPC is not a general
    -- Hindsight reader and must never become one.
    and m.mandate_key like 'masterwork.%'
  group by m.mandate_key, e.id, e.review_every_n, e.last_review_at;
$$;
