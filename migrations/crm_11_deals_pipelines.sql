-- CRM deals + pipelines: `crm.deal` (entity) + `crm.deal_stage_event` (component),
-- the `deal_pipeline` category dimension, the interaction seam, and the outcome seam.
--
-- Ruled by Arman twice (2026-08-14, 2026-08-19: "We build them now! Dispatch agent
-- chips and let's get it done. no waiting.") — projects/crm/STATE.md §4.1 P4 / Q2.
--
-- THE SHAPE, and why:
--
-- 1. PIPELINES AND STAGES ARE CATEGORIES, NOT AN ENUM OR A COLUMN — Arman's settled
--    roles-are-categories ruling applied to stages. One dimension `deal_pipeline`:
--    a TOP-LEVEL row is a pipeline, its CHILD rows (parent_id) are the stages, in
--    `position` order — exactly the `web_entity_type` nesting shape (8 top-level +
--    34 nested) that proves parent_id works. A new pipeline or stage is a ROW,
--    never a migration. Stage semantics ride category `metadata`:
--      { "outcome": "won" | "lost",   -- absent means an open stage
--        "probability": 0..100 }      -- the stage's default win probability
--
-- 2. THE STAGE IS THE AUTHORITY; `status` IS DERIVED. Writers move stages; the
--    trigger derives status ('open'|'won'|'lost') from the stage's metadata.outcome
--    and stamps closed_at, so a deal's status can never disagree with its stage.
--
-- 3. STAGE HISTORY IS A COMPONENT TABLE written by trigger — `crm.deal_stage_event`
--    appends on create and on every stage move, so cycle time / stage-aging is
--    derivable later without having designed the report now. Hand-built per the
--    crm_02_core.sql recipe: platform.create_entity_table's 'component' variant
--    ALWAYS fails (its internal iam.apply_rls needs a composition row whose
--    child_type FKs to a not-yet-existing token).
--
-- 4. THE TIMELINE IS `crm.interaction`, NOT A NEW TABLE — new nullable
--    `interaction.deal_id`, mirroring `outreach_list_id`.
--
-- 5. A DEAL CLOSING IS AN OUTCOME — the won transition writes ONE
--    platform.outcome_event row (outcome_kind 'deal_won', match_method 'manual',
--    confidence 100, status 'confirmed', dedupe-keyed on the deal id) from the same
--    trigger. This is ground truth, not attribution — decide_outcome_event stays
--    the only DECIDER, and no second attribution path exists.
--
-- 6. `party.lifecycle_stage_id` / `became_customer_at` ARE INDEPENDENT COLUMNS,
--    but a won deal advances them FORWARD-ONLY on the primary party (never demotes
--    a human's verdict; became_customer_at fills only when NULL). Written down here
--    because STATE.md P4 asked for the decision to be explicit.
--
-- 7. Deal creation is a DIRECT browser write under RLS. The resolver governs party
--    IDENTITY (find-or-create can manufacture duplicates); a deal is an org-scoped
--    record with no identity-dedup hazard, like outreach_list. This is not the P1
--    bypass pattern.
--
-- APPLIED LIVE 2026-08-20 against txzxabzwovsujtloxrus and ledgered. This file is
-- the record of a change that already landed, never the mechanism. Idempotent.

-- ============================================================ 1. the deal entity
do $$
begin
  if to_regclass('crm.deal') is null then
    perform platform.create_entity_table(
      p_schema => 'crm', p_table => 'deal', p_token => 'crm_deal', p_label => 'Deal',
      p_fields => ARRAY[
        'name text NOT NULL',
        'description text',
        'pipeline_id uuid NOT NULL REFERENCES platform.categories(id)',
        'stage_id uuid NOT NULL REFERENCES platform.categories(id)',
        'stage_entered_at timestamptz NOT NULL DEFAULT now()',
        $f$status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost'))$f$,
        $f$amount numeric(14,2) CHECK (amount IS NULL OR amount >= 0)$f$,
        -- ISO-4217 shape. text + CHECK, never char(3) (bpchar has no ORM Field mapping).
        $f$currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$')$f$,
        'expected_close_date date',
        'closed_at timestamptz',
        -- NULL means "use the stage default from category metadata.probability".
        'probability smallint CHECK (probability BETWEEN 0 AND 100)',
        'primary_party_id uuid REFERENCES crm.party(id)',
        'assigned_to uuid REFERENCES auth.users(id)',
        'lost_reason_id uuid REFERENCES platform.categories(id)',
        'lost_reason_note text',
        'source text', 'source_detail text',
        -- Manual ordering within a kanban column; NULL sorts last.
        'sort_order numeric',
        $f$attributes jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true,
      p_visibility => 'internal', p_category => false, p_listed => true,
      p_org_default => true, p_gin_jsonb => true);
  end if;
end $$;

update platform.entity_types
   set title_column = 'name', content_role = 'source', reference_pickable = true
 where token = 'crm_deal';

-- ============================================================ 2. the stage-history component
create table if not exists crm.deal_stage_event (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references crm.deal(id) on delete cascade,
  pipeline_id uuid not null references platform.categories(id),
  stage_id uuid not null references platform.categories(id),
  from_stage_id uuid references platform.categories(id),
  entered_at timestamptz not null default now(),
  organization_id uuid not null references iam.organizations(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
  deleted_at timestamptz, version int not null default 1,
  metadata jsonb not null default '{}'::jsonb
);

grant select, insert, update, delete on crm.deal_stage_event to authenticated, service_role;

insert into platform.entity_types
  (token, label, schema_name, table_name, table_ref, rls_variant, is_component,
   is_versioned, title_column, has_soft_delete, base_tier, is_active, is_listed, reference_pickable)
values
  ('crm_deal_stage_event','Deal Stage Event','crm','deal_stage_event','crm.deal_stage_event','component', true, false, null, true, 1, true, false, false)
on conflict (token) do update set
  label = excluded.label, schema_name = excluded.schema_name,
  table_name = excluded.table_name, table_ref = excluded.table_ref,
  rls_variant = excluded.rls_variant, is_component = excluded.is_component, is_active = true;

insert into platform.entity_relationships (parent_type, child_type, fk_column, kind, note)
values ('crm_deal','crm_deal_stage_event','deal_id','composition','access derives from the deal')
on conflict do nothing;

select iam.apply_rls('crm','deal_stage_event','crm_deal_stage_event','component');

drop trigger if exists _a_org_from_parent on crm.deal_stage_event;
create trigger _a_org_from_parent before insert or update on crm.deal_stage_event
  for each row execute function crm._inherit_parent_org('crm.deal', 'deal_id');
drop trigger if exists _stamp_actor on crm.deal_stage_event;
create trigger _stamp_actor before insert or update on crm.deal_stage_event
  for each row execute function platform._stamp_actor();
drop trigger if exists _touch_row on crm.deal_stage_event;
create trigger _touch_row before insert or update on crm.deal_stage_event
  for each row execute function platform._touch_row();

-- ============================================================ 3. constraints + indexes
alter table crm.deal drop constraint if exists deal_closed_needs_time;
alter table crm.deal add constraint deal_closed_needs_time
  check (status = 'open' or closed_at is not null);
alter table crm.deal drop constraint if exists deal_open_has_no_close;
alter table crm.deal add constraint deal_open_has_no_close
  check (status <> 'open' or closed_at is null);
alter table crm.deal drop constraint if exists deal_lost_reason_only_when_lost;
alter table crm.deal add constraint deal_lost_reason_only_when_lost
  check (status = 'lost' or (lost_reason_id is null and lost_reason_note is null));

create index if not exists deal_org_pipeline_stage_idx on crm.deal (organization_id, pipeline_id, stage_id)
  where deleted_at is null;
create index if not exists deal_org_status_idx on crm.deal (organization_id, status) where deleted_at is null;
create index if not exists deal_primary_party_idx on crm.deal (primary_party_id) where deleted_at is null;
create index if not exists deal_assigned_idx on crm.deal (assigned_to) where deleted_at is null;
create index if not exists deal_expected_close_idx on crm.deal (organization_id, expected_close_date)
  where status = 'open' and deleted_at is null;

create index if not exists deal_stage_event_deal_idx on crm.deal_stage_event (deal_id, entered_at desc)
  where deleted_at is null;
create index if not exists deal_stage_event_stage_idx on crm.deal_stage_event (stage_id) where deleted_at is null;

-- The interaction seam: a deal's activity timeline is crm.interaction rows.
alter table crm.interaction add column if not exists deal_id uuid references crm.deal(id) on delete set null;
create index if not exists interaction_deal_idx on crm.interaction (deal_id, occurred_at desc)
  where deal_id is not null and deleted_at is null;

-- Saved views serve more than one list now. Open set on purpose ('parties','deals', …).
alter table crm.saved_view add column if not exists list_key text not null default 'parties';
drop index if exists crm.saved_view_name_per_owner;
create unique index if not exists saved_view_name_per_owner_list
  on crm.saved_view (organization_id, created_by, list_key, lower(name))
  where deleted_at is null;

-- ============================================================ 4. the stage authority trigger
-- BEFORE: validate the pipeline/stage pair, derive status from the stage's
-- metadata.outcome, stamp stage_entered_at and closed_at. Loud on bad input.
create or replace function crm._deal_stage_shape()
returns trigger language plpgsql security definer set search_path to 'pg_catalog' as $fn$
declare
  v_stage record;
  v_outcome text;
begin
  select c.parent_id, c.dimension, c.deleted_at, c.metadata->>'outcome' as outcome
    into v_stage
    from platform.categories c where c.id = NEW.stage_id;
  if v_stage is null or v_stage.dimension <> 'deal_pipeline' or v_stage.deleted_at is not null then
    raise exception 'crm.deal: stage % is not a live deal_pipeline category', NEW.stage_id;
  end if;
  if v_stage.parent_id is null then
    raise exception 'crm.deal: % is a pipeline, not a stage - pick one of its child stages', NEW.stage_id;
  end if;
  if v_stage.parent_id <> NEW.pipeline_id then
    raise exception 'crm.deal: stage % does not belong to pipeline %', NEW.stage_id, NEW.pipeline_id;
  end if;

  if TG_OP = 'UPDATE' and OLD.stage_id is distinct from NEW.stage_id then
    NEW.stage_entered_at := now();
    -- A manual sort position belongs to the column the deal was in.
    if OLD.sort_order is not distinct from NEW.sort_order then
      NEW.sort_order := null;
    end if;
  end if;

  v_outcome := v_stage.outcome;
  NEW.status := case when v_outcome = 'won' then 'won'
                     when v_outcome = 'lost' then 'lost'
                     else 'open' end;
  if NEW.status = 'open' then
    NEW.closed_at := null;
    NEW.lost_reason_id := null;
    NEW.lost_reason_note := null;
  else
    NEW.closed_at := coalesce(NEW.closed_at, now());
    if NEW.status <> 'lost' then
      NEW.lost_reason_id := null; NEW.lost_reason_note := null;
    end if;
  end if;
  return NEW;
end $fn$;

drop trigger if exists _b_deal_stage_shape on crm.deal;
create trigger _b_deal_stage_shape before insert or update on crm.deal
  for each row execute function crm._deal_stage_shape();

-- AFTER: append stage history; on the won transition, record the outcome event
-- (ground truth, dedupe-keyed) and advance the primary party's lifecycle forward-only.
create or replace function crm._deal_stage_track()
returns trigger language plpgsql security definer set search_path to 'pg_catalog' as $fn$
declare
  v_customer_stage uuid;
begin
  if TG_OP = 'INSERT' or OLD.stage_id is distinct from NEW.stage_id then
    insert into crm.deal_stage_event (deal_id, pipeline_id, stage_id, from_stage_id, entered_at, organization_id)
    values (NEW.id, NEW.pipeline_id, NEW.stage_id,
            case when TG_OP = 'UPDATE' then OLD.stage_id end,
            NEW.stage_entered_at, NEW.organization_id);
  end if;

  if NEW.status = 'won' and (TG_OP = 'INSERT' or OLD.status is distinct from 'won') then
    insert into platform.outcome_event
      (intent_type, intent_id, subject_type, subject_id, outcome_kind, party_id,
       occurred_at, match_method, confidence, status, decided_by, decided_at,
       disposition, dedupe_key, organization_id,
       match_detail)
    values
      ('crm_deal', NEW.id, 'crm_deal', NEW.id, 'deal_won', NEW.primary_party_id,
       coalesce(NEW.closed_at, now()), 'manual', 100, 'confirmed', auth.uid(), now(),
       'automatic', 'crm_deal:' || NEW.id || ':won', NEW.organization_id,
       pg_catalog.jsonb_build_object('amount', NEW.amount, 'currency', NEW.currency,
                                     'pipeline_id', NEW.pipeline_id, 'auto_confirmed', true))
    on conflict (dedupe_key) do nothing;

    if NEW.primary_party_id is not null then
      select id into v_customer_stage from platform.categories
       where dimension = 'crm_lifecycle_stage' and slug = 'customer'
         and is_system and deleted_at is null limit 1;
      -- Forward-only: never demote a human's lifecycle verdict; fill timestamps only when NULL.
      update crm.party p
         set lifecycle_stage_id = coalesce(p.lifecycle_stage_id, v_customer_stage),
             lifecycle_stage_changed_at = case when p.lifecycle_stage_id is null then now()
                                               else p.lifecycle_stage_changed_at end,
             became_customer_at = coalesce(p.became_customer_at, now())
       where p.id = NEW.primary_party_id
         and (p.became_customer_at is null or p.lifecycle_stage_id is null);
    end if;
  end if;
  return NEW;
end $fn$;

drop trigger if exists _z_deal_stage_track on crm.deal;
create trigger _z_deal_stage_track after insert or update on crm.deal
  for each row execute function crm._deal_stage_track();

-- ============================================================ 5. vocabularies
-- visibility='public' is MANDATORY on system-org dimensions (see crm_02_core.sql §6).
-- The default pipeline, then its stages under it.
do $seed$
declare
  v_org constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_pipeline uuid;
begin
  select id into v_pipeline from platform.categories
   where dimension = 'deal_pipeline' and slug = 'sales-pipeline' and parent_id is null and deleted_at is null;
  if v_pipeline is null then
    insert into platform.categories (organization_id, dimension, name, slug, is_system, position, visibility)
    values (v_org, 'deal_pipeline', 'Sales pipeline', 'sales-pipeline', true, 10, 'public')
    returning id into v_pipeline;
  end if;

  insert into platform.categories (organization_id, dimension, name, slug, parent_id, is_system, position, visibility, metadata)
  select v_org, 'deal_pipeline', v.name, v.slug, v_pipeline, true, v.pos, 'public', v.meta::jsonb
  from (values
    ('New',                'new',                10, '{"probability": 10}'),
    ('Qualified',          'qualified',          20, '{"probability": 25}'),
    ('Meeting scheduled',  'meeting-scheduled',  30, '{"probability": 40}'),
    ('Proposal sent',      'proposal-sent',      40, '{"probability": 60}'),
    ('Negotiation',        'negotiation',        50, '{"probability": 80}'),
    ('Won',                'won',                90, '{"probability": 100, "outcome": "won"}'),
    ('Lost',               'lost',               95, '{"probability": 0, "outcome": "lost"}')
  ) as v(name, slug, pos, meta)
  where not exists (select 1 from platform.categories c
                     where c.dimension = 'deal_pipeline' and c.parent_id = v_pipeline
                       and c.slug = v.slug and c.deleted_at is null);
end $seed$;

insert into platform.categories (organization_id, dimension, name, slug, is_system, position, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'deal_lost_reason', v.name, v.slug, true, v.pos, 'public'::platform.visibility
from (values
  ('Price','price',10),('Chose a competitor','competitor',20),('No budget','no-budget',30),
  ('No decision / went quiet','no-decision',40),('Bad timing','timing',50),
  ('Not a fit','not-a-fit',60),('Other','other',70)
) as v(name, slug, pos)
where not exists (select 1 from platform.categories c
                   where c.dimension = 'deal_lost_reason' and c.slug = v.slug and c.deleted_at is null);

insert into platform.categories (organization_id, dimension, name, slug, is_system, position, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'association_role', v.name, v.name, true, v.pos, 'public'::platform.visibility
from (values ('deal_contact',320)) as v(name, pos)
where not exists (select 1 from platform.categories c
                   where c.dimension = 'association_role' and c.slug = v.name and c.deleted_at is null);

-- Widen the outcome vocabulary: a closed-won deal is an outcome.
alter table platform.outcome_event drop constraint if exists outcome_event_outcome_kind_check;
alter table platform.outcome_event add constraint outcome_event_outcome_kind_check
  check (outcome_kind = any (array['link_appeared','link_lost','coverage_published',
                                   'page_corrected','mention_appeared','deal_won']));

-- ============================================================ 6. association pairs + sharing
insert into platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes)
values
  ('crm_deal','party', null,'none',  'viewer', true, 'Roles: deal_contact (the people on the deal). The primary company/person is crm.deal.primary_party_id; edges carry everyone else.'),
  ('file','crm_deal',  null,'target','editor', true, 'Files attached to a deal (contracts, proposals).'),
  ('note','crm_deal',  null,'target','editor', true, 'Notes attached to a deal.'),
  ('crm_deal','task',  null,'target','editor', true, 'Follow-up tasks on a deal.')
on conflict (source_type, target_type) do update set
  container_side = excluded.container_side, conveys_max = excluded.conveys_max,
  is_active = true, notes = excluded.notes, updated_at = now();

insert into platform.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, is_public_column,
   display_label, url_path_template, rls_uses_has_permission, is_active, content_role, is_scopeable)
values
  ('crm_deal','crm','deal','id','created_by',null,'Deal','/crm/deals/{id}',true,true,'source',true)
on conflict (resource_type) do update set
  schema_name = excluded.schema_name, table_name = excluded.table_name,
  display_label = excluded.display_label, url_path_template = excluded.url_path_template,
  is_active = true;

-- Per token, never the global sweep (it dies on the agent_card VIEW row).
select platform.sync_association_gc_triggers('crm_deal');

-- The agent surface: the aidream agent_data registry derives writable resources from
-- this flag at boot (registry.py sync_from_entity_types); the seed entry in aidream
-- tunes description/readonly columns. Deals have no identity-dedup hazard, so the
-- generic create path is safe (unlike party, whose create is the resolver).
update platform.entity_types set agent_writable = true where token = 'crm_deal';

-- ============================================================ 7. merge / unmerge / purge learn about deals
-- Patched from the LIVE definitions (2026-08-20) — the crm_02_core.sql copies are
-- stale (outreach-list rename). New: a merge repoints crm.deal.primary_party_id to
-- the winner and records the moved ids under 'deal_primary'; unmerge replays them;
-- purge nulls the reference so the party FK cannot block erasure.
create or replace function public.crm_merge_parties(
  p_winner uuid, p_loser uuid, p_method text default 'manual', p_reason text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $fn$
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

  with moved as (update crm.deal set primary_party_id = p_winner
                  where primary_party_id = p_loser and deleted_at is null returning id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('deal_primary', to_jsonb(v_ids));

  with moved as (
    update platform.associations a set source_id = p_winner
     where a.source_type = 'party' and a.source_id = p_loser
       and not exists (select 1 from platform.associations_live w
                        where w.source_type = 'party' and w.source_id = p_winner
                          and w.target_type = a.target_type and w.target_id = a.target_id
                          and w.role is not distinct from a.role)
    returning a.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('assoc_source', to_jsonb(v_ids));

  with moved as (
    update platform.associations a set target_id = p_winner
     where a.target_type = 'party' and a.target_id = p_loser
       and not exists (select 1 from platform.associations_live w
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
end $fn$;

create or replace function public.crm_unmerge_parties(p_merge_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
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
  update crm.deal set primary_party_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'deal_primary'))::uuid[]);
  update platform.associations set source_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'assoc_source'))::uuid[]);
  update platform.associations set target_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'assoc_target'))::uuid[]);

  update crm.party set canonical_id = null where id = v_m.loser_id;
  update crm.party_merge set unmerged_at = now(), unmerged_by = auth.uid() where id = p_merge_id;

  perform platform.log_activity(v_m.organization_id, 'crm.party.unmerge', 'party', v_m.winner_id,
    jsonb_build_object('loser_id', v_m.loser_id, 'merge_id', p_merge_id));
end $fn$;

create or replace function public.crm_party_purge(p_party uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
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
  update crm.deal set primary_party_id = null where primary_party_id = p_party;
  delete from crm.party where id = p_party;

  perform platform.log_activity(v_org, 'crm.party.purge', 'party', p_party, '{}'::jsonb);
end $fn$;

-- ============================================================ 8. certify
-- Raise on any FAIL so a partial application can never be mistaken for done.
do $certify$
begin
  if not iam.canonical_certify_ok('crm', 'deal', 'crm_deal') then
    raise exception 'crm.deal failed canonical certification';
  end if;
  if not iam.canonical_certify_ok('crm', 'deal_stage_event', 'crm_deal_stage_event') then
    raise exception 'crm.deal_stage_event failed canonical certification';
  end if;
end $certify$;
