-- crm.campaign → crm.outreach_list  (table-naming standard, db-rules §1a / §12)
--
-- WHY: `crm.campaign` is not a marketing campaign. It is a worked outreach list
-- (`campaign_kind IN ('list','email','call','mixed')` with `campaign_member` rows
-- carrying `status` + `next_attempt_at` — a send/dial queue). Marketing's channel
-- container took the distinct name `initiative` on 2026-08-13 precisely so the two
-- would not collide; a repeated table name may only mean the same ROLE, and these
-- two never did. Owner ruling 2026-08-13.
--
-- Renames, in order:
--   crm.campaign                 → crm.outreach_list          (token crm_campaign        → crm_outreach_list)
--   crm.campaign_member          → crm.outreach_list_member   (token crm_campaign_member → crm_outreach_list_member)
--   campaign.campaign_kind       → outreach_list.list_kind
--   campaign_member.campaign_id  → outreach_list_member.outreach_list_id
--   interaction.campaign_id      → interaction.outreach_list_id
--
-- Idempotent: every step is guarded on the OLD name still being present, so a
-- re-run after a partial apply is a no-op. Constraint/trigger guards are qualified
-- by relation (never by name alone — a graveyard twin carries the same names).

begin;

-- ── 1. Tables (the DDL-sync trigger repoints entity_types.schema/table/ref) ──
do $$
begin
  if to_regclass('crm.campaign') is not null and to_regclass('crm.outreach_list') is null then
    execute 'alter table crm.campaign rename to outreach_list';
  end if;
  if to_regclass('crm.campaign_member') is not null and to_regclass('crm.outreach_list_member') is null then
    execute 'alter table crm.campaign_member rename to outreach_list_member';
  end if;
end $$;

-- ── 2. Columns ──────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema='crm' and table_name='outreach_list' and column_name='campaign_kind') then
    execute 'alter table crm.outreach_list rename column campaign_kind to list_kind';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema='crm' and table_name='outreach_list_member' and column_name='campaign_id') then
    execute 'alter table crm.outreach_list_member rename column campaign_id to outreach_list_id';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema='crm' and table_name='interaction' and column_name='campaign_id') then
    execute 'alter table crm.interaction rename column campaign_id to outreach_list_id';
  end if;
end $$;

-- ── 3. Constraint + index names (vocabulary must be honest everywhere) ──────
do $$
declare r record;
begin
  for r in
    select * from (values
      ('crm.outreach_list',        'campaign_pkey',                        'outreach_list_pkey'),
      ('crm.outreach_list',        'campaign_campaign_kind_check',         'outreach_list_list_kind_check'),
      ('crm.outreach_list',        'campaign_status_check',                'outreach_list_status_check'),
      ('crm.outreach_list',        'campaign_created_by_fkey',             'outreach_list_created_by_fkey'),
      ('crm.outreach_list',        'campaign_updated_by_fkey',             'outreach_list_updated_by_fkey'),
      ('crm.outreach_list',        'campaign_organization_id_fkey',        'outreach_list_organization_id_fkey'),
      ('crm.outreach_list_member', 'campaign_member_pkey',                 'outreach_list_member_pkey'),
      ('crm.outreach_list_member', 'campaign_member_status_check',         'outreach_list_member_status_check'),
      ('crm.outreach_list_member', 'campaign_member_campaign_id_fkey',     'outreach_list_member_list_id_fkey'),
      ('crm.outreach_list_member', 'campaign_member_party_id_fkey',        'outreach_list_member_party_id_fkey'),
      ('crm.outreach_list_member', 'campaign_member_contact_point_id_fkey','outreach_list_member_contact_point_id_fkey'),
      ('crm.outreach_list_member', 'campaign_member_claimed_by_fkey',      'outreach_list_member_claimed_by_fkey'),
      ('crm.outreach_list_member', 'campaign_member_outcome_id_fkey',      'outreach_list_member_outcome_id_fkey'),
      ('crm.outreach_list_member', 'campaign_member_created_by_fkey',      'outreach_list_member_created_by_fkey'),
      ('crm.outreach_list_member', 'campaign_member_updated_by_fkey',      'outreach_list_member_updated_by_fkey'),
      ('crm.outreach_list_member', 'campaign_member_organization_id_fkey', 'outreach_list_member_organization_id_fkey'),
      ('crm.interaction',          'interaction_campaign_id_fkey',         'interaction_outreach_list_id_fkey')
    ) as v(rel, old_name, new_name)
  loop
    if exists (select 1 from pg_constraint where conrelid = r.rel::regclass and conname = r.old_name) then
      execute format('alter table %s rename constraint %I to %I', r.rel, r.old_name, r.new_name);
    end if;
  end loop;

  for r in
    select * from (values
      ('campaign_created_by_idx',      'outreach_list_created_by_idx'),
      ('campaign_definition_idx',      'outreach_list_definition_idx'),
      ('campaign_organization_id_idx', 'outreach_list_organization_id_idx'),
      ('campaign_member_key',          'outreach_list_member_key'),
      ('campaign_member_party_idx',    'outreach_list_member_party_idx'),
      ('campaign_member_queue_idx',    'outreach_list_member_queue_idx'),
      ('interaction_campaign_idx',     'interaction_outreach_list_idx')
    ) as v(old_name, new_name)
  loop
    if to_regclass('crm.' || quote_ident(r.old_name)) is not null then
      execute format('alter index crm.%I rename to %I', r.old_name, r.new_name);
    end if;
  end loop;
end $$;

-- ── 4. Tokens (FKs from associations / association_types / entity_relationships
--        are ON UPDATE CASCADE, so those follow automatically) ───────────────
update platform.entity_types
   set token = 'crm_outreach_list', label = 'Outreach List'
 where token = 'crm_campaign';

update platform.entity_types
   set token = 'crm_outreach_list_member', label = 'Outreach List Member'
 where token = 'crm_campaign_member';

update platform.entity_relationships
   set fk_column = 'outreach_list_id'
 where child_type = 'crm_outreach_list_member'
   and parent_type = 'crm_outreach_list'
   and fk_column = 'campaign_id';

-- ── 5. Token references with no FK cascade ──────────────────────────────────
update platform.shareable_resource_registry
   set resource_type    = 'crm_outreach_list',
       table_name       = 'outreach_list',
       display_label    = 'Outreach List',
       url_path_template = '/crm/outreach-lists/{id}'
 where resource_type = 'crm_campaign';

update iam.permissions
   set resource_type = 'crm_outreach_list'
 where resource_type = 'crm_campaign';

update iam.permissions
   set resource_type = 'crm_outreach_list_member'
 where resource_type = 'crm_campaign_member';

update history.row_versions
   set entity_type = 'crm_outreach_list'
 where entity_type = 'crm_campaign';

update history.row_versions
   set entity_type = 'crm_outreach_list_member'
 where entity_type = 'crm_campaign_member';

update platform.activity_log
   set entity_type = 'crm_outreach_list'
 where entity_type = 'crm_campaign';

update platform.user_entity_state
   set entity_type = 'crm_outreach_list'
 where entity_type = 'crm_campaign';

update platform.comments
   set entity_type = 'crm_outreach_list'
 where entity_type = 'crm_campaign';

-- ── 6. Triggers carrying the token / table name as a literal argument ───────
drop trigger if exists _gc_assoc_harddelete on crm.outreach_list;
drop trigger if exists _gc_assoc_softdelete on crm.outreach_list;
drop trigger if exists _version_capture     on crm.outreach_list;

create trigger _gc_assoc_harddelete after delete on crm.outreach_list
  for each row execute function platform._gc_entity_associations('crm_outreach_list');
create trigger _gc_assoc_softdelete after update on crm.outreach_list
  for each row execute function platform._gc_entity_associations('crm_outreach_list');
create trigger _version_capture after insert or delete or update on crm.outreach_list
  for each row execute function platform._version_capture('crm_outreach_list');

drop trigger if exists _a_org_from_parent on crm.outreach_list_member;
drop trigger if exists trg_inherit_org    on crm.outreach_list_member;

create trigger _a_org_from_parent before insert or update on crm.outreach_list_member
  for each row execute function crm._inherit_parent_org('crm.outreach_list', 'outreach_list_id');
create trigger trg_inherit_org before insert on crm.outreach_list_member
  for each row execute function platform.inherit_org_from_parent('crm', 'outreach_list', 'outreach_list_id');

-- ── 7. RLS — regenerate from the canonical generator (policy bodies carry the
--        token as a literal; a hand-edited policy is a defect, db-rules §6d) ─
select iam.apply_rls('crm', 'outreach_list',        'crm_outreach_list',        'entity');
select iam.apply_rls('crm', 'outreach_list_member', 'crm_outreach_list_member', 'component');

-- ── 8. Dependent functions (text references — SET SCHEMA/RENAME never fix these)
create or replace function public.crm_merge_parties(p_winner uuid, p_loser uuid, p_method text default 'manual'::text, p_reason text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_org uuid; v_merge_id uuid; v_moved jsonb := '{}'::jsonb; v_ids uuid[];
begin
  if p_winner = p_loser then
    raise exception 'crm_merge_parties: cannot merge a party into itself' using errcode = '22023';
  end if;
  select organization_id into v_org from crm.party where id = p_winner and deleted_at is null;
  if v_org is null then
    raise exception 'crm_merge_parties: winner party % not found', p_winner using errcode = 'P0002';
  end if;
  if not exists (select 1 from crm.party where id = p_loser and deleted_at is null and organization_id = v_org) then
    raise exception 'crm_merge_parties: loser party % not found in the same organization', p_loser using errcode = 'P0002';
  end if;
  if not (iam.has_access('party', p_winner, 'editor') and iam.has_access('party', p_loser, 'editor')) then
    raise exception 'crm_merge_parties: editor access required on both parties' using errcode = '42501';
  end if;
  if exists (select 1 from crm.party where id in (p_winner, p_loser) and canonical_id is not null) then
    raise exception 'crm_merge_parties: one of these parties is already merged - unmerge first' using errcode = '22023';
  end if;

  with moved as (
    update crm.party_contact_point cp set party_id = p_winner, is_primary = false
     where cp.party_id = p_loser and cp.deleted_at is null
       and not exists (select 1 from crm.party_contact_point w
                        where w.party_id = p_winner and w.medium_id = cp.medium_id and w.deleted_at is null)
    returning cp.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('party_contact_point', to_jsonb(v_ids));

  with moved as (update crm.address set party_id = p_winner, is_primary = false
                  where party_id = p_loser and deleted_at is null returning id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('address', to_jsonb(v_ids));

  with moved as (update crm.affiliation set party_id = p_winner, is_primary = false
                  where party_id = p_loser and deleted_at is null returning id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('affiliation', to_jsonb(v_ids));

  with moved as (update crm.interaction set party_id = p_winner
                  where party_id = p_loser and deleted_at is null returning id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('interaction', to_jsonb(v_ids));

  with moved as (
    update crm.outreach_list_member cm set party_id = p_winner
     where cm.party_id = p_loser and cm.deleted_at is null
       and not exists (select 1 from crm.outreach_list_member w
                        where w.outreach_list_id = cm.outreach_list_id and w.party_id = p_winner and w.deleted_at is null)
    returning cm.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('outreach_list_member', to_jsonb(v_ids));

  with moved as (
    update platform.associations a set source_id = p_winner
     where a.source_type = 'party' and a.source_id = p_loser
       and not exists (select 1 from platform.associations w
                        where w.source_type = 'party' and w.source_id = p_winner
                          and w.target_type = a.target_type and w.target_id = a.target_id
                          and w.role is not distinct from a.role)
    returning a.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('assoc_source', to_jsonb(v_ids));

  with moved as (
    update platform.associations a set target_id = p_winner
     where a.target_type = 'party' and a.target_id = p_loser
       and not exists (select 1 from platform.associations w
                        where w.target_type = 'party' and w.target_id = p_winner
                          and w.source_type = a.source_type and w.source_id = a.source_id
                          and w.role is not distinct from a.role)
    returning a.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('assoc_target', to_jsonb(v_ids));

  update crm.party set canonical_id = p_winner where id = p_loser;

  insert into crm.party_merge (winner_id, loser_id, moved, method, reason, merged_by, organization_id)
  values (p_winner, p_loser, v_moved, p_method, p_reason, auth.uid(), v_org)
  returning id into v_merge_id;

  perform platform.log_activity(v_org, 'crm.party.merge', 'party', p_winner,
    jsonb_build_object('loser_id', p_loser, 'merge_id', v_merge_id, 'method', p_method));
  return v_merge_id;
end $function$;

create or replace function public.crm_party_purge(p_party uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_org uuid;
begin
  select organization_id into v_org from crm.party where id = p_party;
  if v_org is null then
    raise exception 'crm_party_purge: party % not found', p_party using errcode = 'P0002';
  end if;
  if not iam.has_access('party', p_party, 'admin') then
    raise exception 'crm_party_purge: admin access required on the party' using errcode = '42501';
  end if;

  delete from platform.associations
   where (source_type = 'party' and source_id = p_party) or (target_type = 'party' and target_id = p_party);
  delete from platform.comments where entity_type = 'party' and entity_id = p_party;
  delete from platform.user_entity_state where entity_type = 'party' and entity_id = p_party;
  delete from crm.outreach_list_member where party_id = p_party;
  delete from crm.interaction where party_id = p_party;
  delete from crm.party_contact_point where party_id = p_party;
  delete from crm.address where party_id = p_party;
  delete from crm.affiliation where party_id = p_party or employer_party_id = p_party;
  delete from crm.party_merge where winner_id = p_party or loser_id = p_party;
  delete from history.row_versions where entity_type in ('party','crm_affiliation') and row_id = p_party;
  update crm.party set canonical_id = null where canonical_id = p_party;
  update crm.party set source_party_id = null where source_party_id = p_party;
  update crm.party set primary_employer_party_id = null where primary_employer_party_id = p_party;
  delete from crm.party where id = p_party;

  perform platform.log_activity(v_org, 'crm.party.purge', 'party', p_party, '{}'::jsonb);
end $function$;

create or replace function public.crm_unmerge_parties(p_merge_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_m crm.party_merge;
begin
  select * into v_m from crm.party_merge where id = p_merge_id and unmerged_at is null;
  if v_m.id is null then
    raise exception 'crm_unmerge_parties: merge record % not found or already undone', p_merge_id using errcode = 'P0002';
  end if;
  if not iam.has_access('party', v_m.winner_id, 'editor') then
    raise exception 'crm_unmerge_parties: editor access required' using errcode = '42501';
  end if;

  update crm.party_contact_point set party_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'party_contact_point'))::uuid[]);
  update crm.address set party_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'address'))::uuid[]);
  update crm.affiliation set party_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'affiliation'))::uuid[]);
  update crm.interaction set party_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'interaction'))::uuid[]);
  update crm.outreach_list_member set party_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'outreach_list_member'))::uuid[]);
  update platform.associations set source_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'assoc_source'))::uuid[]);
  update platform.associations set target_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'assoc_target'))::uuid[]);

  update crm.party set canonical_id = null where id = v_m.loser_id;
  update crm.party_merge set unmerged_at = now(), unmerged_by = auth.uid() where id = p_merge_id;

  perform platform.log_activity(v_m.organization_id, 'crm.party.unmerge', 'party', v_m.winner_id,
    jsonb_build_object('loser_id', v_m.loser_id, 'merge_id', p_merge_id));
end $function$;

-- ── 9. Retirement ledger (the old name must error loudly, and be greppable) ──
insert into platform.deprecated_relations (old_ref, new_ref, reason)
values ('crm.campaign', 'crm.outreach_list',
        'Renamed 2026-08-13: not a marketing campaign but a worked outreach list; the word campaign is retired as a table name (db-rules 1a/12).'),
       ('crm.campaign_member', 'crm.outreach_list_member',
        'Renamed 2026-08-13 with its parent crm.campaign → crm.outreach_list.')
on conflict (old_ref) do update
  set new_ref = excluded.new_ref, reason = excluded.reason;

commit;
