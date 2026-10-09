-- Approved by Arman 2026-10-07 for the live database (lane BELL-OWNER); rehearsed up/inverse/up on the clone 2026-10-01.
--
-- THE INBOX YOU TRIAGE TO ZERO (owner rulings 1 and 2, 2026-10-01,
-- common-docs/projects/notifications-ui-redo/RESEARCH.md §0a, §3.1, §4).
--
-- WHAT IT ADDS
--   * three per-notice state columns on communication.notification:
--       seen_at        the notice appeared in an opened bell or page -> it leaves the badge
--       done_at        handled; it leaves the Inbox and lives in Done (recoverable)
--       snoozed_until  hidden until then; it comes back at the top, unread
--     `seen_at` is per notice, not a per-person watermark: a watermark needs a new table, and a new
--     table is `platform.create_entity_table` + certification. Per-notice is exact, needs nothing
--     new, and after the first open touches only what is new.
--   * every event type's `config.bucket` default (needs_you | direct | updates) — the knob the badge
--     and the tabs read. An organization overrides it through the existing
--     `notification_event_override.config_patch` (not read by these doors yet; named follow-up).
--   * five signed-in doors (SECURITY DEFINER, auth.uid() resolved inside, anon holds no EXECUTE,
--     each declared in platform.client_callable_door before its GRANT):
--       communication.inbox_notifications(p_state, p_limit, p_before, p_before_id, p_unread_only, p_org_id)
--       communication.my_inbox_summary()
--       communication.mark_inbox_seen()
--       communication.set_notifications_state(p_ids, p_action, p_until)
--       communication.my_inbox_organizations()
--
-- SNOOZE NEEDS NO SCHEDULE. Snoozing clears read_at/seen_at; the read doors treat a past
-- snoozed_until as "back", sorted at the moment it came back (`sort_at`). No cron (no unapproved
-- schedules), nothing to sweep.
--
-- The old doors (my_notifications, my_notification_unread_count) stay until this lands on live:
-- the client falls back to them, honestly and with Done/Snooze absent, while this file is a draft.
-- Inverse: migrations/inverse/notifications_inbox_triage_down.sql

set local lock_timeout = '2s';

alter table communication.notification
  add column if not exists seen_at timestamptz,
  add column if not exists done_at timestamptz,
  add column if not exists snoozed_until timestamptz;

comment on column communication.notification.seen_at is
  'The notice appeared in the recipient''s opened bell or inbox (it no longer counts in the badge). in_app only.';
comment on column communication.notification.done_at is
  'The recipient marked it handled: it left the Inbox for Done. Null again on undo.';
comment on column communication.notification.snoozed_until is
  'Hidden from the Inbox until this time; after it the notice is back, unread, sorted at this time.';

-- A notice already read was seen: it never counts as new on the day this lands.
update communication.notification n
   set seen_at = n.read_at
 where n.channel = 'in_app'
   and n.read_at is not null
   and n.seen_at is null;

create index if not exists notification_inbox_recipient_idx
  on communication.notification (recipient_user_id, created_at desc)
  where channel = 'in_app' and status = 'succeeded';

-- ── THE BUCKET DEFAULTS (a knob with a default; organizations override) ──────
-- The same three rules the client mirrors in features/notifications/presentation.ts for rows read
-- through the pre-triage door.
update communication.notification_event_type et
   set config = coalesce(et.config, '{}'::jsonb) || jsonb_build_object('bucket',
     case
       when et.event_key ~ '^(records\.changed|news\.monitor\.|masterwork\.daily_drip|hr\.digest\.|knowledge\.saved_view_alert|pipeline\.stage_entered|personal_staff\.ack|print\.order_status_changed|hr\.recognition\.team_post|hr\.schedule\.(re)?published|hr\.announcement\.published|meet\.rsvp_received|custom\.form\.response|custom\.booking\.made|custom\.capture\.arrived|cms\.form_submission|esign\.signer_viewed)'
         or et.event_key ~ '(campaign_progress|cost_warning|run_digest)$'
         then 'updates'
       when et.event_key ~ '(_due|_overdue|_requested|_assigned|_reminder|_deadline|action_required|approval_needed|request_received|link_sent|link_requested|candidate_ready|prediction_outcome_due|request_needs_attention|request_changed|step_timeout_warning|step_escalated|step_delegated|inbox\.reminder|inbox\.snooze_ended|invitation|swap_requested|claim_submitted|request_submitted|failure_raised|verification_needed)$'
         then 'needs_you'
       else 'direct'
     end)
 where et.deleted_at is null
   and not (coalesce(et.config, '{}'::jsonb) ? 'bucket');

-- ── THE LIST ──────────────────────────────────────────────────────────────
create or replace function communication.inbox_notifications(
  p_state text default 'inbox',
  p_limit integer default 50,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_unread_only boolean default false,
  p_org_id uuid default null
)
returns table (
  id uuid, event_key text, event_label text, event_bucket text,
  subject text, body text, deep_link text, target_kind text, target_id uuid,
  organization_id uuid, organization_name text,
  actor_id uuid, actor_name text, actor_avatar text,
  created_at timestamptz, sort_at timestamptz,
  seen_at timestamptz, read_at timestamptz, done_at timestamptz, snoozed_until timestamptz,
  acted_at timestamptz, outcome text
)
language sql
stable
security definer
set search_path to ''
as $function$
  with mine as (
    select n.*,
           case when n.snoozed_until is not null and n.snoozed_until <= now()
                then greatest(n.created_at, n.snoozed_until) else n.created_at end as s_at
      from communication.notification n
     where n.recipient_user_id = auth.uid()
       and auth.uid() is not null
       and n.channel = 'in_app'
       and n.status = 'succeeded'
       and n.deleted_at is null
       and (p_org_id is null or n.organization_id = p_org_id)
       and (not p_unread_only or n.read_at is null)
       and case coalesce(p_state, 'inbox')
             when 'inbox'   then n.done_at is null and (n.snoozed_until is null or n.snoozed_until <= now())
             when 'done'    then n.done_at is not null
             when 'snoozed' then n.done_at is null and n.snoozed_until > now()
             else true
           end
  )
  select m.id, m.event_key, et.label, coalesce(et.config->>'bucket', 'direct'),
         m.subject, m.body, m.deep_link, m.target_kind, m.target_id,
         m.organization_id, o.name,
         case when m.created_by is not null and m.created_by <> m.recipient_user_id then m.created_by end,
         case when m.created_by is not null and m.created_by <> m.recipient_user_id then p.display_name end,
         case when m.created_by is not null and m.created_by <> m.recipient_user_id then p.avatar_url end,
         m.created_at, m.s_at,
         m.seen_at, m.read_at, m.done_at, m.snoozed_until,
         m.acted_at, m.outcome
    from mine m
    left join communication.notification_event_type et
      on et.event_key = m.event_key and et.deleted_at is null
    left join iam.organizations o on o.id = m.organization_id
    left join users.profiles p on p.id = m.created_by
   -- Keyset on (sort time, id): rows sharing a time are never skipped at a page edge.
   where p_before is null
      or m.s_at < p_before
      or (p_before_id is not null and m.s_at = p_before and m.id < p_before_id)
   order by m.s_at desc, m.id desc
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$function$;

-- ── THE BADGE AND THE TAB COUNTS ───────────────────────────────────────────
create or replace function communication.my_inbox_summary()
returns table (
  unseen_needs_you integer, unseen_direct integer, unseen_updates integer,
  unread integer, inbox integer, snoozed integer, done integer
)
language sql
stable
security definer
set search_path to ''
as $function$
  with mine as (
    select n.seen_at, n.read_at, n.done_at, n.snoozed_until,
           coalesce(et.config->>'bucket', 'direct') as bucket,
           (n.done_at is null and (n.snoozed_until is null or n.snoozed_until <= now())) as in_inbox
      from communication.notification n
      left join communication.notification_event_type et
        on et.event_key = n.event_key and et.deleted_at is null
     where n.recipient_user_id = auth.uid()
       and auth.uid() is not null
       and n.channel = 'in_app'
       and n.status = 'succeeded'
       and n.deleted_at is null
  )
  select
    -- New = never seen here AND not already read anywhere (e.g. from the email).
    (count(*) filter (where in_inbox and seen_at is null and read_at is null and bucket = 'needs_you'))::integer,
    (count(*) filter (where in_inbox and seen_at is null and read_at is null and bucket = 'direct'))::integer,
    (count(*) filter (where in_inbox and seen_at is null and read_at is null and bucket = 'updates'))::integer,
    (count(*) filter (where in_inbox and read_at is null))::integer,
    (count(*) filter (where in_inbox))::integer,
    (count(*) filter (where done_at is null and snoozed_until > now()))::integer,
    (count(*) filter (where done_at is not null))::integer
  from mine;
$function$;

-- ── OPENING THE BELL CLEARS THE BADGE ─────────────────────────────────────
create or replace function communication.mark_inbox_seen()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  update communication.notification n
     set seen_at = now(), updated_at = now()
   where n.recipient_user_id = v_uid
     and n.channel = 'in_app'
     and n.status = 'succeeded'
     and n.seen_at is null
     and n.done_at is null
     and (n.snoozed_until is null or n.snoozed_until <= now());
  get diagnostics v_count = row_count;
  return v_count;
end
$function$;

-- ── TRIAGE: done / undone / read / unread / snooze / unsnooze ─────────────
create or replace function communication.set_notifications_state(
  p_ids uuid[],
  p_action text,
  p_until timestamptz default null
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;
  if cardinality(p_ids) > 500 then
    raise exception 'At most 500 notices at a time' using errcode = '22023';
  end if;
  if p_action not in ('done', 'undone', 'read', 'unread', 'snooze', 'unsnooze') then
    raise exception 'Unknown action %', p_action using errcode = '22023';
  end if;
  if p_action = 'snooze' and (p_until is null or p_until <= now()) then
    raise exception 'A snooze needs a time in the future' using errcode = '22023';
  end if;

  update communication.notification n
     set done_at       = case p_action when 'done' then coalesce(n.done_at, now())
                                       when 'undone' then null else n.done_at end,
         snoozed_until = case p_action when 'snooze' then p_until
                                       when 'unsnooze' then null
                                       when 'done' then null else n.snoozed_until end,
         read_at       = case p_action when 'read' then coalesce(n.read_at, now())
                                       when 'unread' then null
                                       when 'snooze' then null else n.read_at end,
         read_channel  = case p_action when 'read' then coalesce(n.read_channel, 'in_app')
                                       when 'unread' then null
                                       when 'snooze' then null else n.read_channel end,
         seen_at       = case p_action when 'snooze' then null
                                       when 'unsnooze' then null else n.seen_at end,
         updated_at    = now()
   where n.id = any(p_ids)
     and n.recipient_user_id = v_uid
     and n.channel = 'in_app'
     and n.status = 'succeeded';
  get diagnostics v_count = row_count;
  return v_count;
end
$function$;

-- ── THE ORGANIZATION FILTER'S CHOICES (never the active org) ──────────────
create or replace function communication.my_inbox_organizations()
returns table (organization_id uuid, organization_name text, notices integer)
language sql
stable
security definer
set search_path to ''
as $function$
  select n.organization_id, max(o.name), count(*)::integer
    from communication.notification n
    left join iam.organizations o on o.id = n.organization_id
   where n.recipient_user_id = auth.uid()
     and auth.uid() is not null
     and n.channel = 'in_app'
     and n.status = 'succeeded'
     and n.deleted_at is null
     and n.organization_id is not null
   group by n.organization_id
   order by max(o.name) nulls last;
$function$;

-- ── WHO MAY CALL THESE, IN DATA (before the GRANT) ────────────────────────
insert into platform.client_callable_door (
  schema_name, function_name, identity_args, identity_argtypes,
  reason, declared_by, gate_predicate, signed_in_callers, anonymous_callers, argument_rules
)
select v.schema_name, v.function_name, v.identity_args, v.identity_argtypes,
       'Signed-in door for the shell Inbox: the caller is resolved inside the body by auth.uid() and only rows with recipient_user_id = caller are visible/updated. Reads/writes the in_app channel of communication.notification only; p_org_id only narrows the caller''s own rows.',
       'notifications_inbox_triage.sql', 'auth.uid()', true, false, v.argument_rules
  from (values
    ('communication', 'inbox_notifications',
     'p_state text, p_limit integer, p_before timestamp with time zone, p_before_id uuid, p_unread_only boolean, p_org_id uuid',
     array['text','integer','timestamptz','uuid','boolean','uuid']::regtype[]::oid[],
     jsonb_build_object('version', 1, 'arguments', jsonb_build_object(
       'p_before_id', jsonb_build_object('type', 'uuid', 'optional', true, 'position', 4,
         'foreign', jsonb_build_object('bounded', true, 'note', 'A paging cursor compared only against the caller''s own rows; a foreign id selects nothing.')),
       'p_org_id', jsonb_build_object('type', 'uuid', 'optional', true, 'position', 6,
         'null_rule', jsonb_build_object('means', 'every organization the caller''s notices come from'),
         'foreign', jsonb_build_object('bounded', true, 'note', 'Only narrows rows already limited to recipient_user_id = auth.uid(); a foreign organization returns nothing.'))))),
    ('communication', 'my_inbox_summary', '', array[]::oid[], null::jsonb),
    ('communication', 'mark_inbox_seen', '', array[]::oid[], null::jsonb),
    ('communication', 'set_notifications_state',
     'p_ids uuid[], p_action text, p_until timestamp with time zone',
     array['uuid[]','text','timestamptz']::regtype[]::oid[],
     jsonb_build_object('version', 1, 'arguments', jsonb_build_object(
       'p_ids', jsonb_build_object('type', 'uuid[]', 'optional', false, 'position', 1,
         'foreign', jsonb_build_object('bounded', true, 'note', 'The update matches only rows whose recipient_user_id = auth.uid(); a foreign id changes nothing.'))))),
    ('communication', 'my_inbox_organizations', '', array[]::oid[], null::jsonb)
  ) as v(schema_name, function_name, identity_args, identity_argtypes, argument_rules)
 where not exists (
   select 1 from platform.client_callable_door d
    where d.schema_name = v.schema_name and d.function_name = v.function_name
 );


grant execute on function communication.inbox_notifications(text, integer, timestamptz, uuid, boolean, uuid) to authenticated;
grant execute on function communication.my_inbox_summary() to authenticated;
grant execute on function communication.mark_inbox_seen() to authenticated;
grant execute on function communication.set_notifications_state(uuid[], text, timestamptz) to authenticated;
grant execute on function communication.my_inbox_organizations() to authenticated;

notify pgrst, 'reload schema';
