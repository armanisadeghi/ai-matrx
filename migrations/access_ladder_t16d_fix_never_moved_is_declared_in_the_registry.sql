-- based-on: iam._org_records_owned_by(uuid, uuid) 15311ea475d555f30faf8f7c1b4e13ad785a4902a7c1557e49b7383bbb848533
--
-- ACCESS LADDER T-16d fix (independent verification, 2026-09-28): what an org-scoped records
-- take-over NEVER moves is read from the registry, not from a list inside the function.
--
-- Before: iam._org_records_owned_by skipped Confidential and non-entity tables from the registry,
-- but the rest was a hardcoded list — schemas hr/billing/runtime and seven tokens
-- (notification, notification_channel_preference, knob_override, app_setting, app_sync_status,
-- user_form_profile, record). A newly registered settings table, notice table or HR table moved
-- with the member's work until someone edited the function; and the list had already missed
-- ~20 per-person tables (preferences, profile, stats, streaks, badges, phone number, SMS consent)
-- that did move.
--
-- After: ONE registry declaration, platform.entity_types.ownership_handover, says what happens to a
-- record's ownership when its owner's work is handed over:
--   'work'   — a person's work; it moves to the named member (the default, like every table
--              starting at Organization: locking an organization out of its own work is the bug).
--   'person' — a per-person account record: addressed to or configuring that one person
--              (settings, preferences, notices, usage, profile, stats). It stays with the person.
--   'system' — the owning system's own record or its own door: HR (HR's own door and offboarding),
--              billing (who bought what), request logs, and custom Tables (they move through
--              custom.table_transfer_owner, one Table at a time).
-- The take-over's never-moved set is then derived entirely from the registry:
--   data_class not in (organization, public, private)  -> Confidential (and any future class) never moves
--   type <> 'entity' or audit_class = 'machinery'       -> machinery, ledgers, catalogues, restricted
--   is_component                                        -> a component follows its parent
--   ownership_handover <> 'work'                        -> per-person account records, own-door systems
-- Nothing else in the function names a table. custom.record keeps its dedicated branch because it
-- is the custom data system's own door, not an exclusion.

set local lock_timeout = '5s';

alter table platform.entity_types
  add column if not exists ownership_handover text not null default 'work',
  add column if not exists ownership_handover_reason text;

alter table platform.entity_types
  drop constraint if exists entity_types_ownership_handover_check;
alter table platform.entity_types
  add constraint entity_types_ownership_handover_check
  check (ownership_handover in ('work', 'person', 'system')
         and (ownership_handover = 'work' or length(btrim(coalesce(ownership_handover_reason, ''))) >= 20));

comment on column platform.entity_types.ownership_handover is
  'What happens to a record''s ownership when its owner''s work is handed over (records take-over, '
  'offboarding): work = moves to the named member (default); person = a per-person account record '
  '(settings, notices, usage, profile) that stays with the person; system = the owning system''s own '
  'record or door (HR, billing, request logs, custom Tables). Read by iam._org_records_owned_by.';
comment on column platform.entity_types.ownership_handover_reason is
  'Why a table is not ''work'' for ownership_handover. Required (20+ chars) when it is not.';

-- ── Declarations (the old hardcoded list, plus the per-person tables it missed) ───────────────
update platform.entity_types set ownership_handover = 'system',
       ownership_handover_reason = 'HR records hand over through HR''s own door and offboarding, never a records take-over.'
 where schema_name = 'hr' and ownership_handover = 'work';
update platform.entity_types set ownership_handover = 'system',
       ownership_handover_reason = 'Billing history: who bought or set what stays true; money records never change owner.'
 where schema_name = 'billing' and ownership_handover = 'work';
update platform.entity_types set ownership_handover = 'system',
       ownership_handover_reason = 'Runtime request logs: a record of what happened, not a person''s work.'
 where schema_name = 'runtime' and ownership_handover = 'work';
update platform.entity_types set ownership_handover = 'system',
       ownership_handover_reason = 'Custom data is owned by its Table; each Table moves through custom.table_transfer_owner.'
 where token = 'record' and schema_name = 'custom';

update platform.entity_types set ownership_handover = 'person',
       ownership_handover_reason = 'A per-person account record: addressed to or configuring that one person, not their work.'
 where ownership_handover = 'work'
   and (rls_variant = 'personal'
        or token in (
          -- the old list
          'notification', 'notification_channel_preference', 'knob_override', 'app_setting',
          'app_sync_status', 'user_form_profile',
          -- per-person tables the old list missed (they moved with the member's work)
          'user_preference', 'user_email_preference', 'user_analysis_preference',
          'notification_preference', 'sms_notification_preference', 'sms_notification',
          'sms_phone_number', 'sms_consent', 'user_surface_state', 'user_active_context',
          'user_profile', 'user_stat', 'user_achievement', 'study_streak', 'game_badge',
          'league_membership', 'dict_setting', 'study_reminder_context', 'study_reminder_delivery'));

-- ── The one list of what an org-scoped take-over moves, read from the registry ────────────────
create or replace function iam._org_records_owned_by(p_org_id uuid, p_user_id uuid)
returns table (token text, label text, data_class text, schema_name text, table_name text,
               owner_column text, row_count bigint)
language plpgsql
stable security definer
set search_path to 'iam', 'platform', 'public', 'pg_temp'
as $function$
declare r record; v_n bigint;
begin
  for r in
    select et.token, coalesce(et.label, et.token) as label, et.data_class::text as data_class,
           et.schema_name, et.table_name,
           case when exists (select 1 from information_schema.columns c
                              where c.table_schema = et.schema_name and c.table_name = et.table_name
                                and c.column_name = 'created_by') then 'created_by'
                when exists (select 1 from information_schema.columns c
                              where c.table_schema = et.schema_name and c.table_name = et.table_name
                                and c.column_name = 'owner_id') then 'owner_id' end as owner_column
      from platform.entity_types et
     where et.is_active
       and not et.is_component                                        -- a component follows its parent
       and et.type = 'entity' and et.audit_class <> 'machinery'       -- a person's work, not machinery
       and et.data_class::text in ('organization', 'public', 'private')   -- never Confidential
       and et.ownership_handover = 'work'                             -- never per-person or own-door
       and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
       and exists (select 1 from information_schema.columns c
                    where c.table_schema = et.schema_name and c.table_name = et.table_name
                      and c.column_name = 'organization_id')
     order by et.data_class::text desc, et.token
  loop
    continue when r.owner_column is null;
    execute format('select count(*) from %I.%I where %I = $1 and organization_id = $2',
                   r.schema_name, r.table_name, r.owner_column)
       into v_n using p_user_id, p_org_id;
    continue when v_n = 0;
    token := r.token; label := r.label; data_class := r.data_class; schema_name := r.schema_name;
    table_name := r.table_name; owner_column := r.owner_column; row_count := v_n;
    return next;
  end loop;
  -- Custom data (custom.record, ownership_handover = 'system') is owned by its Table: a custom
  -- Table the member owns here moves through the custom data system's own door,
  -- custom.table_transfer_owner (its rows follow it).
  select count(*) into v_n from custom.record t
   where t.table_id = custom.table_kernel_id() and t.deleted_at is null
     and t.created_by = p_user_id and t.organization_id = p_org_id;
  if v_n > 0 then
    token := 'custom_table'; label := 'Table'; data_class := 'organization'; schema_name := 'custom';
    table_name := 'record'; owner_column := 'created_by'; row_count := v_n;
    return next;
  end if;
end $function$;

