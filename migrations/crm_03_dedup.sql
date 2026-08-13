-- crm_03_dedup.sql — dedup automation: name_key canonicalization, merge
-- candidates, detection RPC (auto-merge on identity-key collisions), dismissal.
--
-- Contract: features/crm/FEATURE.md · docs/handoffs/crm-system.md §4 Wave 3.
-- Everything here is idempotent. The merge/unmerge machinery this builds on
-- (public.crm_merge_parties / crm_unmerge_parties) lives in crm_02_core.sql.
--
-- Design:
--   * STRONG signal — two live canonical parties in one org hold the SAME live
--     contact medium (email/phone) through contact points BOTH flagged
--     is_identity_key → merged automatically (earlier-created party wins,
--     method 'auto'; crm.party_merge keeps the exact unmerge record).
--   * WEAK signals — shared medium without both identity flags, same name_key,
--     company domain matching another company's email domain → NEVER
--     auto-merged. Stored in crm.merge_candidate (CHECK source_id < target_id
--     so a pair can never appear twice mirrored) and surfaced for human review.
--   * Dismissal is durable: a dismissed pair stays dismissed through every
--     future scan (status only ever leaves 'dismissed' by a human decision).

-- ============================================================ 1. name_key
-- crm.party.name_key existed since crm_02 but had NO writer anywhere — this
-- gives it one. Lowercase, punctuation → space, trailing legal suffixes
-- stripped (twice, for "Acme Co Inc"), whitespace collapsed. Non-latin names
-- collapse to NULL and simply never participate in name matching.
create or replace function crm.name_key(p_name text)
returns text language sql immutable strict set search_path to 'pg_catalog' as $fn$
  select nullif(btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(p_name), '[^a-z0-9]+', ' ', 'g'),
        '\s+(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|gmbh|plc|llp|pllc)\s*$', '', 'g'),
      '\s+(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|gmbh|plc|llp|pllc)\s*$', '', 'g'),
    '\s+', ' ', 'g')), '');
$fn$;

create or replace function crm._party_name_key()
returns trigger language plpgsql security definer set search_path to 'pg_catalog' as $fn$
begin
  NEW.name_key := crm.name_key(NEW.display_name);
  return NEW;
end $fn$;

drop trigger if exists _b_party_name_key on crm.party;
create trigger _b_party_name_key before insert or update of display_name, name_key on crm.party
  for each row execute function crm._party_name_key();

-- Backfill (small table; versioned-row snapshots are acceptable one-time cost).
update crm.party set name_key = crm.name_key(display_name)
 where name_key is distinct from crm.name_key(display_name);

-- ============================================================ 2. merge_candidate
create table if not exists crm.merge_candidate (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references crm.party(id) on delete cascade,
  target_id uuid not null references crm.party(id) on delete cascade,
  -- jsonb array of {kind:'shared_medium'|'identity_collision'|'name_key'|'domain', ...}
  signals jsonb not null default '[]'::jsonb,
  confidence smallint not null default 50 check (confidence between 0 and 100),
  status text not null default 'pending'
    check (status in ('pending','dismissed','merged','stale')),
  dismissed_by uuid references auth.users(id),
  dismissed_at timestamptz,
  detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  organization_id uuid not null references iam.organizations(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
  deleted_at timestamptz, version int not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  -- One row per pair, ever — the ordered pair kills mirrored duplicates.
  constraint merge_candidate_ordered check (source_id < target_id)
);

create unique index if not exists merge_candidate_pair_key
  on crm.merge_candidate (source_id, target_id);
create index if not exists merge_candidate_org_pending_idx
  on crm.merge_candidate (organization_id) where status = 'pending';
create index if not exists merge_candidate_target_idx
  on crm.merge_candidate (target_id);

grant select, insert, update, delete on crm.merge_candidate to authenticated, service_role;

-- Registry + RLS (component of the source party — same recipe as crm_02 §4).
insert into platform.entity_types
  (token, label, schema_name, table_name, table_ref, rls_variant, is_component,
   is_versioned, title_column, has_soft_delete, base_tier, is_active, is_listed, reference_pickable)
values
  ('crm_merge_candidate','Merge Candidate','crm','merge_candidate','crm.merge_candidate','component', true, false, null, true, 1, true, false, false)
on conflict (token) do update set
  label = excluded.label, schema_name = excluded.schema_name,
  table_name = excluded.table_name, table_ref = excluded.table_ref,
  rls_variant = excluded.rls_variant, is_component = excluded.is_component,
  is_versioned = excluded.is_versioned, title_column = excluded.title_column,
  has_soft_delete = excluded.has_soft_delete, is_active = true;

insert into platform.entity_relationships (parent_type, child_type, fk_column, kind, note)
values ('party','crm_merge_candidate','source_id','composition','access derives from the source party')
on conflict do nothing;

select iam.apply_rls('crm','merge_candidate','crm_merge_candidate','component');

drop trigger if exists _a_org_from_parent on crm.merge_candidate;
create trigger _a_org_from_parent before insert or update on crm.merge_candidate
  for each row execute function crm._inherit_parent_org('crm.party','source_id');
drop trigger if exists _stamp_actor on crm.merge_candidate;
create trigger _stamp_actor before insert or update on crm.merge_candidate
  for each row execute function platform._stamp_actor();
drop trigger if exists _touch_row on crm.merge_candidate;
create trigger _touch_row before insert or update on crm.merge_candidate
  for each row execute function platform._touch_row();

-- When a party gets merged (canonical_id set) by ANY path — auto, review UI,
-- direct RPC — every pending candidate naming it resolves to 'merged'.
create or replace function crm._candidate_on_merge()
returns trigger language plpgsql security definer set search_path to 'pg_catalog' as $fn$
begin
  if NEW.canonical_id is not null and OLD.canonical_id is null then
    update crm.merge_candidate set status = 'merged', updated_at = now()
     where status = 'pending' and (source_id = NEW.id or target_id = NEW.id);
  end if;
  return NEW;
end $fn$;

drop trigger if exists _z_candidate_on_merge on crm.party;
create trigger _z_candidate_on_merge after update of canonical_id on crm.party
  for each row execute function crm._candidate_on_merge();

-- ============================================================ 3. detection RPC
-- Scans ONE org. Auto-merges strong identity collisions, upserts weak-signal
-- candidates, retires stale pending rows, returns a receipt.
create or replace function public.crm_detect_merge_candidates(p_org uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_auto jsonb := '[]'::jsonb;
  v_refreshed int := 0;
  v_pending int;
  v_merge uuid;
  r record;
begin
  if auth.uid() is null or not iam.has_org_access_for(auth.uid(), p_org) then
    raise exception 'crm_detect_merge_candidates: organization membership required'
      using errcode = '42501';
  end if;

  -- 3a. STRONG: same live medium held via contact points BOTH flagged
  -- is_identity_key → auto-merge, earlier-created party wins.
  for r in
    select distinct
      case when pa.created_at <= pb.created_at then pa.id else pb.id end as winner_id,
      case when pa.created_at <= pb.created_at then pb.id else pa.id end as loser_id,
      m.channel, m.display_value
    from crm.party_contact_point a
    join crm.party_contact_point b on b.medium_id = a.medium_id and b.party_id > a.party_id
    join crm.contact_medium m on m.id = a.medium_id
    join crm.party pa on pa.id = a.party_id
    join crm.party pb on pb.id = b.party_id
    where m.organization_id = p_org and m.deleted_at is null
      and m.channel in ('email','phone')
      and a.deleted_at is null and b.deleted_at is null
      and a.is_identity_key and b.is_identity_key
      and pa.deleted_at is null and pa.canonical_id is null
      and pb.deleted_at is null and pb.canonical_id is null
      and pa.party_kind = pb.party_kind
  loop
    -- A party can sit in several collisions; skip pairs a prior loop merge
    -- already resolved.
    if exists (select 1 from crm.party
                where id in (r.winner_id, r.loser_id)
                  and (canonical_id is not null or deleted_at is not null)) then
      continue;
    end if;
    begin
      v_merge := public.crm_merge_parties(r.winner_id, r.loser_id, 'auto',
        format('identity key collision: both records hold %s %s', r.channel, r.display_value));
      v_auto := v_auto || jsonb_build_object(
        'winner_id', r.winner_id, 'loser_id', r.loser_id, 'merge_id', v_merge);
    exception when others then
      -- Can't merge (e.g. caller lacks editor on one side) → keep it visible
      -- as a top-confidence suggestion instead of failing the whole scan.
      insert into crm.merge_candidate as mc (source_id, target_id, organization_id, signals, confidence)
      values (least(r.winner_id, r.loser_id), greatest(r.winner_id, r.loser_id), p_org,
        jsonb_build_array(jsonb_build_object('kind','identity_collision','channel',r.channel,'value',r.display_value)), 95)
      on conflict (source_id, target_id) do update set
        signals = excluded.signals,
        confidence = greatest(mc.confidence, excluded.confidence),
        last_detected_at = now(),
        status = case when mc.status = 'dismissed' then 'dismissed' else 'pending' end;
    end;
  end loop;

  -- 3b. WEAK signals → suggestion candidates. Never auto-merged.
  with raw as (
    -- shared email/phone medium, not both identity-flagged
    select least(pa.id, pb.id) as s, greatest(pa.id, pb.id) as t,
           jsonb_build_object('kind','shared_medium','channel',m.channel,'value',m.display_value) as signal,
           90 as confidence
    from crm.party_contact_point a
    join crm.party_contact_point b on b.medium_id = a.medium_id and b.party_id > a.party_id
    join crm.contact_medium m on m.id = a.medium_id
    join crm.party pa on pa.id = a.party_id
    join crm.party pb on pb.id = b.party_id
    where m.organization_id = p_org and m.deleted_at is null
      and m.channel in ('email','phone')
      and a.deleted_at is null and b.deleted_at is null
      and not (a.is_identity_key and b.is_identity_key)
      and pa.deleted_at is null and pa.canonical_id is null
      and pb.deleted_at is null and pb.canonical_id is null
      and pa.party_kind = pb.party_kind
    union all
    -- same normalized name (kind-matched; ≥3 chars so initials don't pair the org)
    select least(pa.id, pb.id), greatest(pa.id, pb.id),
           jsonb_build_object('kind','name_key','value', pa.name_key),
           60
    from crm.party pa
    join crm.party pb on pb.name_key = pa.name_key and pb.id > pa.id
     and pb.party_kind = pa.party_kind and pb.organization_id = pa.organization_id
    where pa.organization_id = p_org
      and pa.name_key is not null and length(pa.name_key) >= 3
      and pa.deleted_at is null and pa.canonical_id is null
      and pb.deleted_at is null and pb.canonical_id is null
    union all
    -- a company's primary domain shows up in another company's email addresses
    -- (exact primary_domain duplicates are impossible — unique index — so THIS
    -- is what "same domain" means among live records)
    select least(ca.id, cb.id), greatest(ca.id, cb.id),
           jsonb_build_object('kind','domain','value', ca.primary_domain),
           75
    from crm.party ca
    join crm.party_contact_point p on p.deleted_at is null
    join crm.contact_medium m on m.id = p.medium_id and m.deleted_at is null
     and m.channel = 'email'
     and m.value_key like '%@' || lower(ca.primary_domain)
    join crm.party cb on cb.id = p.party_id and cb.id <> ca.id
    where ca.organization_id = p_org and m.organization_id = p_org
      and ca.party_kind = 'organization' and cb.party_kind = 'organization'
      and ca.primary_domain is not null
      and ca.deleted_at is null and ca.canonical_id is null
      and cb.deleted_at is null and cb.canonical_id is null
  ), agg as (
    select s, t, jsonb_agg(distinct signal) as signals, max(confidence) as confidence
    from raw group by s, t
  )
  insert into crm.merge_candidate as mc (source_id, target_id, organization_id, signals, confidence)
  select s, t, p_org, signals, confidence from agg
  on conflict (source_id, target_id) do update set
    signals = excluded.signals,
    confidence = greatest(mc.confidence, excluded.confidence),
    last_detected_at = now(),
    -- durable dismissal; 'merged' only re-opens after an unmerge re-splits the pair
    status = case when mc.status = 'dismissed' then 'dismissed' else 'pending' end;
  get diagnostics v_refreshed = row_count;

  -- 3c. Retire pending rows whose parties are no longer both live canonical.
  update crm.merge_candidate mc set status = 'stale', updated_at = now()
   where mc.organization_id = p_org and mc.status = 'pending'
     and exists (select 1 from crm.party p
                  where p.id in (mc.source_id, mc.target_id)
                    and (p.deleted_at is not null or p.canonical_id is not null));

  select count(*) into v_pending from crm.merge_candidate
   where organization_id = p_org and status = 'pending' and deleted_at is null;

  return jsonb_build_object(
    'auto_merged', v_auto,
    'refreshed_candidates', v_refreshed,
    'pending_candidates', v_pending);
end $fn$;

-- ============================================================ 4. dismissal RPC
create or replace function public.crm_dismiss_merge_candidate(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v crm.merge_candidate;
begin
  select * into v from crm.merge_candidate where id = p_id and deleted_at is null;
  if v.id is null then
    raise exception 'crm_dismiss_merge_candidate: candidate % not found', p_id using errcode = 'P0002';
  end if;
  if not (iam.has_access('party', v.source_id, 'editor') or iam.has_access('party', v.target_id, 'editor')) then
    raise exception 'crm_dismiss_merge_candidate: editor access required' using errcode = '42501';
  end if;
  update crm.merge_candidate
     set status = 'dismissed', dismissed_by = auth.uid(), dismissed_at = now()
   where id = p_id;
  perform platform.log_activity(v.organization_id, 'crm.party.merge_candidate_dismissed',
    'party', v.source_id, jsonb_build_object('candidate_id', p_id, 'target_id', v.target_id));
end $fn$;

revoke all on function public.crm_detect_merge_candidates(uuid) from public;
revoke all on function public.crm_dismiss_merge_candidate(uuid) from public;
grant execute on function public.crm_detect_merge_candidates(uuid) to authenticated, service_role;
grant execute on function public.crm_dismiss_merge_candidate(uuid) to authenticated, service_role;

-- ============================================================ 5. self-check
do $chk$
begin
  if to_regclass('crm.merge_candidate') is null then
    raise exception 'crm_03_dedup: crm.merge_candidate missing';
  end if;
  if to_regprocedure('public.crm_detect_merge_candidates(uuid)') is null
     or to_regprocedure('public.crm_dismiss_merge_candidate(uuid)') is null
     or to_regprocedure('crm.name_key(text)') is null then
    raise exception 'crm_03_dedup: expected functions missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = '_z_candidate_on_merge'
                   and tgrelid = 'crm.party'::regclass) then
    raise exception 'crm_03_dedup: _z_candidate_on_merge trigger missing';
  end if;
end $chk$;

-- New table → PostgREST must reload or every read 42501s (see memory:
-- project_new_table_pgrst_reload).
notify pgrst, 'reload schema';
