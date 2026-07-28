-- CRM core, step 2: the nine tables, their registry rows, RLS, triggers,
-- vocabularies, association pairs, edge payloads, and RPCs.
--
-- APPLIED LIVE 2026-07-27 via Supabase MCP as migrations crm_02_party_entity,
-- crm_03_contact_medium_and_campaign, crm_04_component_tables,
-- crm_05_component_registry_rls_triggers, crm_06_constraints_indexes,
-- crm_07_vocabularies_and_registry, crm_08_affiliation_mirror, crm_09_rpcs.
-- Consolidated here as ONE idempotent record of the change that already landed.
--
-- THE LOAD-BEARING SPLIT: crm.contact_medium is one row per normalized value per
-- org and owns everything intrinsic to the VALUE (verification, bounce, complaint,
-- DNC, suppression). crm.party_contact_point says WHO uses it and HOW. A switchboard
-- shared by 40 contacts, or a shared inbox on 7 parties, therefore has exactly one
-- deliverability state — and a suppression entry needs no party at all.
--
-- Component tables are hand-built on purpose: platform.create_entity_table cannot
-- create them. iam.apply_rls('component') requires a platform.entity_relationships
-- composition row whose child_type FKs to entity_types.token, and that token does
-- not exist until create_entity_table has already run and called apply_rls.

-- ============================================================ 1. entity tables
do $$
begin
  if to_regclass('crm.party') is null then
    perform platform.create_entity_table(
      p_schema => 'crm', p_table => 'party', p_token => 'party', p_label => 'Entity',
      p_fields => ARRAY[
        $f$party_kind text NOT NULL CHECK (party_kind IN ('person','organization'))$f$,
        'display_name text NOT NULL', 'sort_name text', 'name_key text',
        $f$aka text[] NOT NULL DEFAULT '{}'$f$,
        'first_name text', 'middle_name text', 'last_name text', 'preferred_name text',
        'name_prefix text', 'name_suffix text', 'pronouns text', 'date_of_birth date',
        'headline text',
        'legal_name text', 'primary_domain text',
        'industry_id uuid REFERENCES iam.industries(id)',
        'employee_band text', 'founded_year smallint',
        'tax_id text', 'registration_number text',
        'bio text', 'avatar_file_id uuid', 'timezone text', 'locale text',
        'canonical_id uuid REFERENCES crm.party(id)',
        'source_party_id uuid REFERENCES crm.party(id)',
        'source_synced_at timestamptz',
        $f$locked_fields text[] NOT NULL DEFAULT '{}'$f$,
        $f$expert_status text CHECK (expert_status IN ('registered','approved','vetted'))$f$,
        'claimed_by uuid REFERENCES auth.users(id)', 'claimed_at timestamptz',
        'assigned_to uuid REFERENCES auth.users(id)',
        'lifecycle_stage_id uuid REFERENCES platform.categories(id)',
        'lifecycle_stage_changed_at timestamptz', 'became_customer_at timestamptz',
        'rating_id uuid REFERENCES platform.categories(id)',
        'source text', 'source_detail text',
        'do_not_contact boolean NOT NULL DEFAULT false', 'do_not_contact_reason text',
        'linked_organization_id uuid REFERENCES iam.organizations(id)',
        'primary_employer_party_id uuid REFERENCES crm.party(id)',
        'job_title text',
        $f$attributes jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true,
      p_visibility => 'internal', p_category => false, p_listed => true,
      p_org_default => true, p_gin_jsonb => true);
  end if;

  if to_regclass('crm.contact_medium') is null then
    perform platform.create_entity_table(
      p_schema => 'crm', p_table => 'contact_medium', p_token => 'contact_medium',
      p_label => 'Contact Medium',
      p_fields => ARRAY[
        $f$channel text NOT NULL CHECK (channel IN ('email','phone','social','messaging','url','external_id'))$f$,
        'platform_slug text', 'value_raw text NOT NULL', 'value_key text NOT NULL',
        'display_value text', 'external_id text', 'handle text', 'profile_url text',
        $f$line_type text CHECK (line_type IN ('mobile','landline','voip','toll_free','fax'))$f$,
        'phone_country text', 'calling_time_zone text',
        'is_role_address boolean NOT NULL DEFAULT false', 'mx_valid boolean',
        $f$verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','verified','invalid','risky'))$f$,
        'verified_at timestamptz',
        $f$bounce_type text CHECK (bounce_type IN ('soft','hard','block','complaint'))$f$,
        'bounce_count integer NOT NULL DEFAULT 0',
        'first_bounced_at timestamptz', 'last_bounced_at timestamptz',
        'complaint_at timestamptz', 'unsubscribed_at timestamptz',
        $f$dnc_state text CHECK (dnc_state IN ('unknown','clear','listed'))$f$,
        'dnc_checked_at timestamptz',
        'suppressed_at timestamptz', 'suppression_reason text', 'suppression_expires_at timestamptz',
        $f$details jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => false, p_soft_delete => true,
      p_visibility => 'internal', p_category => false, p_listed => false,
      p_org_default => true, p_gin_jsonb => true);
  end if;

  if to_regclass('crm.campaign') is null then
    perform platform.create_entity_table(
      p_schema => 'crm', p_table => 'campaign', p_token => 'crm_campaign', p_label => 'Campaign',
      p_fields => ARRAY[
        'name text NOT NULL', 'description text',
        $f$campaign_kind text NOT NULL DEFAULT 'list' CHECK (campaign_kind IN ('list','email','call','mixed'))$f$,
        $f$status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed','archived'))$f$,
        $f$definition jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'started_at timestamptz', 'ended_at timestamptz'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true,
      p_visibility => 'internal', p_category => false, p_listed => true,
      p_org_default => true, p_gin_jsonb => true);
  end if;
end $$;

-- ============================================================ 2. component tables
create table if not exists crm.party_contact_point (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references crm.party(id) on delete cascade,
  medium_id uuid not null references crm.contact_medium(id),
  channel text,
  purpose_code text not null default 'work'
    check (purpose_code in ('work','personal','mobile','direct','switchboard','main','billing','support','other')),
  purpose_id uuid references platform.categories(id),
  label text, extension text,
  is_primary boolean not null default false,
  is_identity_key boolean not null default false,
  affiliation_id uuid, address_id uuid,
  valid_from date, valid_to date,
  opt_out_at timestamptz, opt_out_source text, last_contacted_at timestamptz,
  source text,
  confidence smallint check (confidence between 0 and 100),
  sort_order integer,
  organization_id uuid not null references iam.organizations(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
  deleted_at timestamptz, version int not null default 1,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists crm.address (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references crm.party(id) on delete cascade,
  purpose_code text not null default 'office'
    check (purpose_code in ('billing','shipping','office','home','mailing','other')),
  purpose_id uuid references platform.categories(id),
  label text,
  line1 text, line2 text, line3 text,
  locality text, region text, postal_code text, plus4 text,
  country_code text, formatted_address text,
  latitude numeric(9,6), longitude numeric(9,6), timezone text,
  place_id text, geo_source text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','verified','invalid','risky')),
  is_primary boolean not null default false,
  valid_from date, valid_to date, source text,
  organization_id uuid not null references iam.organizations(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
  deleted_at timestamptz, version int not null default 1,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists crm.affiliation (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references crm.party(id) on delete cascade,
  employer_party_id uuid not null references crm.party(id),
  title text, department text, seniority text,
  is_primary boolean not null default false,
  is_current boolean not null default true,
  start_date date, end_date date, source text,
  confidence smallint check (confidence between 0 and 100),
  organization_id uuid not null references iam.organizations(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
  deleted_at timestamptz, version int not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  constraint affiliation_not_self check (party_id <> employer_party_id)
);

create table if not exists crm.interaction (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references crm.party(id) on delete cascade,
  contact_point_id uuid references crm.party_contact_point(id),
  address_id uuid references crm.address(id),
  campaign_id uuid references crm.campaign(id),
  direction text not null check (direction in ('inbound','outbound')),
  channel_code text not null default 'note'
    check (channel_code in ('call','email','meeting','sms','social','note','task','other')),
  channel_id uuid references platform.categories(id),
  status text not null default 'completed'
    check (status in ('planned','scheduled','in_progress','completed','failed','cancelled')),
  scheduled_at timestamptz, occurred_at timestamptz, duration_seconds integer,
  subject text, body text,
  outcome_id uuid references platform.categories(id),
  attempt_number smallint,
  assigned_to uuid references auth.users(id), performed_by uuid references auth.users(id),
  thread_key text, message_id text, in_reply_to text, recording_url text,
  attributes jsonb not null default '{}'::jsonb,
  organization_id uuid not null references iam.organizations(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
  deleted_at timestamptz, version int not null default 1,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists crm.campaign_member (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references crm.campaign(id) on delete cascade,
  party_id uuid not null references crm.party(id) on delete cascade,
  contact_point_id uuid references crm.party_contact_point(id),
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','opened','clicked','replied','bounced',
                      'connected','voicemail','no_answer','not_interested','meeting_booked',
                      'suppressed','done')),
  attempt_count integer not null default 0,
  last_attempt_at timestamptz, next_attempt_at timestamptz, current_step smallint,
  claimed_by uuid references auth.users(id), claimed_until timestamptz,
  outcome_id uuid references platform.categories(id), notes text,
  organization_id uuid not null references iam.organizations(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
  deleted_at timestamptz, version int not null default 1,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists crm.party_merge (
  id uuid primary key default gen_random_uuid(),
  winner_id uuid not null references crm.party(id) on delete cascade,
  loser_id uuid not null references crm.party(id),
  moved jsonb not null default '{}'::jsonb,
  method text, reason text,
  merged_by uuid references auth.users(id),
  merged_at timestamptz not null default now(),
  unmerged_at timestamptz, unmerged_by uuid references auth.users(id),
  organization_id uuid not null references iam.organizations(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
  deleted_at timestamptz, version int not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  constraint party_merge_not_self check (winner_id <> loser_id)
);

alter table crm.party_contact_point drop constraint if exists party_contact_point_affiliation_id_fkey;
alter table crm.party_contact_point add constraint party_contact_point_affiliation_id_fkey
  foreign key (affiliation_id) references crm.affiliation(id) on delete set null;
alter table crm.party_contact_point drop constraint if exists party_contact_point_address_id_fkey;
alter table crm.party_contact_point add constraint party_contact_point_address_id_fkey
  foreign key (address_id) references crm.address(id) on delete set null;

grant select, insert, update, delete on
  crm.party_contact_point, crm.address, crm.affiliation,
  crm.interaction, crm.campaign_member, crm.party_merge
  to authenticated, service_role;

-- ============================================================ 3. component org inheritance
-- Without this, platform._stamp_org_default derives org from the CREATOR's personal
-- org, silently landing a contact point in a different org than its party and
-- corrupting every org-scoped rollup. Mirrors web.enforce_site_component_organization().
create or replace function crm._inherit_parent_org()
returns trigger language plpgsql security definer set search_path to 'pg_catalog' as $fn$
declare
  v_parent regclass := TG_ARGV[0]::regclass;
  v_fk     text     := TG_ARGV[1];
  v_fk_val uuid; v_org uuid;
begin
  execute format('select ($1).%I', v_fk) into v_fk_val using NEW;
  if v_fk_val is null then
    raise exception 'crm._inherit_parent_org: %.% is null', TG_TABLE_NAME, v_fk;
  end if;
  execute format('select organization_id from %s where id = $1', v_parent) into v_org using v_fk_val;
  if v_org is null then
    raise exception 'crm._inherit_parent_org: parent % row % missing or has no organization_id', v_parent, v_fk_val;
  end if;
  if NEW.organization_id is not null and NEW.organization_id <> v_org then
    raise exception 'crm._inherit_parent_org: %.organization_id % does not match parent % org %',
      TG_TABLE_NAME, NEW.organization_id, v_parent, v_org;
  end if;
  NEW.organization_id := v_org;
  return NEW;
end $fn$;

-- ============================================================ 4. registry + RLS
insert into platform.entity_types
  (token, label, schema_name, table_name, table_ref, rls_variant, is_component,
   is_versioned, title_column, has_soft_delete, base_tier, is_active, is_listed, reference_pickable)
values
  ('party_contact_point','Contact Point','crm','party_contact_point','crm.party_contact_point','component', true, false, 'label',   true, 1, true, false, false),
  ('crm_address',        'Address',      'crm','address',            'crm.address',            'component', true, false, 'label',   true, 1, true, false, false),
  ('crm_affiliation',    'Affiliation',  'crm','affiliation',        'crm.affiliation',        'component', true, true,  'title',   true, 1, true, false, false),
  ('crm_interaction',    'Interaction',  'crm','interaction',        'crm.interaction',        'component', true, false, 'subject', true, 1, true, false, false),
  ('crm_campaign_member','Campaign Member','crm','campaign_member',  'crm.campaign_member',    'component', true, false, null,      true, 1, true, false, false),
  ('crm_party_merge',    'Party Merge',  'crm','party_merge',        'crm.party_merge',        'component', true, false, null,      true, 1, true, false, false)
on conflict (token) do update set
  label = excluded.label, schema_name = excluded.schema_name,
  table_name = excluded.table_name, table_ref = excluded.table_ref,
  rls_variant = excluded.rls_variant, is_component = excluded.is_component,
  is_versioned = excluded.is_versioned, title_column = excluded.title_column,
  has_soft_delete = excluded.has_soft_delete, is_active = true;

insert into platform.entity_relationships (parent_type, child_type, fk_column, kind, note)
values
  ('party','party_contact_point','party_id','composition','access derives from the party'),
  ('party','crm_address','party_id','composition','access derives from the party'),
  ('party','crm_affiliation','party_id','composition','access derives from the person party'),
  ('party','crm_interaction','party_id','composition','access derives from the party'),
  ('crm_campaign','crm_campaign_member','campaign_id','composition','access derives from the campaign'),
  ('party','crm_party_merge','winner_id','composition','access derives from the surviving party')
on conflict do nothing;

select iam.apply_rls('crm','party_contact_point','party_contact_point','component');
select iam.apply_rls('crm','address','crm_address','component');
select iam.apply_rls('crm','affiliation','crm_affiliation','component');
select iam.apply_rls('crm','interaction','crm_interaction','component');
select iam.apply_rls('crm','campaign_member','crm_campaign_member','component');
select iam.apply_rls('crm','party_merge','crm_party_merge','component');

-- _a_ sorts before _stamp_* (triggers fire alphabetically) so the parent org wins.
do $do$
declare r record;
begin
  for r in select * from (values
      ('party_contact_point','crm.party','party_id'),
      ('address',            'crm.party','party_id'),
      ('affiliation',        'crm.party','party_id'),
      ('interaction',        'crm.party','party_id'),
      ('campaign_member',    'crm.campaign','campaign_id'),
      ('party_merge',        'crm.party','winner_id')
    ) as v(tbl, parent, fk)
  loop
    execute format('drop trigger if exists _a_org_from_parent on crm.%I', r.tbl);
    execute format('create trigger _a_org_from_parent before insert or update on crm.%I for each row execute function crm._inherit_parent_org(%L, %L)', r.tbl, r.parent, r.fk);
    execute format('drop trigger if exists _stamp_actor on crm.%I', r.tbl);
    execute format('create trigger _stamp_actor before insert or update on crm.%I for each row execute function platform._stamp_actor()', r.tbl);
    execute format('drop trigger if exists _touch_row on crm.%I', r.tbl);
    execute format('create trigger _touch_row before insert or update on crm.%I for each row execute function platform._touch_row()', r.tbl);
  end loop;
end $do$;

drop trigger if exists _version_capture on crm.affiliation;
create trigger _version_capture after insert or delete or update on crm.affiliation
  for each row execute function platform._version_capture('crm_affiliation');

-- ============================================================ 5. constraints + indexes
alter table crm.party drop constraint if exists party_person_facet;
alter table crm.party add constraint party_person_facet check (
  party_kind = 'person' or (
    first_name is null and middle_name is null and last_name is null
    and preferred_name is null and name_prefix is null and name_suffix is null
    and date_of_birth is null));
alter table crm.party drop constraint if exists party_org_facet;
alter table crm.party add constraint party_org_facet check (
  party_kind = 'organization' or (
    legal_name is null and primary_domain is null and employee_band is null
    and founded_year is null and tax_id is null and registration_number is null));
alter table crm.party drop constraint if exists party_no_self_merge;
alter table crm.party add constraint party_no_self_merge check (canonical_id is distinct from id);
alter table crm.party drop constraint if exists party_no_self_source;
alter table crm.party add constraint party_no_self_source check (source_party_id is distinct from id);

create unique index if not exists party_org_domain_key on crm.party (organization_id, lower(primary_domain))
  where party_kind = 'organization' and primary_domain is not null and deleted_at is null;
create unique index if not exists party_org_source_key on crm.party (organization_id, source_party_id)
  where source_party_id is not null and deleted_at is null;
-- pg_trgm is installed in `public` on this project, not `extensions`.
create index if not exists party_name_key_trgm on crm.party using gin (name_key public.gin_trgm_ops);
create index if not exists party_canonical_idx on crm.party (canonical_id) where canonical_id is not null;
create index if not exists party_employer_idx on crm.party (primary_employer_party_id) where deleted_at is null;
create index if not exists party_assigned_idx on crm.party (assigned_to) where deleted_at is null;
create index if not exists party_stage_idx on crm.party (lifecycle_stage_id) where deleted_at is null;
create index if not exists party_kind_idx on crm.party (organization_id, party_kind) where deleted_at is null;

alter table crm.contact_medium drop constraint if exists medium_email_lowercased;
alter table crm.contact_medium add constraint medium_email_lowercased
  check (channel <> 'email' or value_key = lower(value_key));
alter table crm.contact_medium drop constraint if exists medium_phone_e164;
alter table crm.contact_medium add constraint medium_phone_e164
  check (channel <> 'phone' or value_key ~ '^\+[1-9][0-9]{6,14}$');

alter table crm.contact_medium add column if not exists is_contactable boolean
  generated always as (
    deleted_at is null and suppressed_at is null and unsubscribed_at is null
    and complaint_at is null and (bounce_type is null or bounce_type = 'soft')
    and dnc_state is distinct from 'listed' and verification_status <> 'invalid'
  ) stored;

create unique index if not exists medium_org_value_key
  on crm.contact_medium (organization_id, channel, coalesce(platform_slug,''), value_key)
  where deleted_at is null;
create index if not exists medium_contactable_idx on crm.contact_medium (organization_id, channel) where is_contactable;
create index if not exists medium_value_key_idx on crm.contact_medium (value_key);

-- `channel` is denormalized from the medium so "one primary per channel" can be a
-- real constraint (a primary email AND a primary phone must both be legal).
create or replace function crm._contact_point_shape()
returns trigger language plpgsql security definer set search_path to 'pg_catalog' as $fn$
declare v_channel text; v_org uuid;
begin
  select m.channel, m.organization_id into v_channel, v_org
    from crm.contact_medium m where m.id = NEW.medium_id;
  if v_channel is null then
    raise exception 'crm._contact_point_shape: contact_medium % not found', NEW.medium_id;
  end if;
  if v_org is distinct from NEW.organization_id then
    raise exception 'crm._contact_point_shape: medium org % does not match contact point org %', v_org, NEW.organization_id;
  end if;
  NEW.channel := v_channel;
  return NEW;
end $fn$;

drop trigger if exists _b_contact_point_shape on crm.party_contact_point;
create trigger _b_contact_point_shape before insert or update on crm.party_contact_point
  for each row execute function crm._contact_point_shape();

create unique index if not exists contact_point_party_medium_key
  on crm.party_contact_point (party_id, medium_id) where deleted_at is null;
create unique index if not exists contact_point_primary_key
  on crm.party_contact_point (party_id, channel) where is_primary and deleted_at is null;
create index if not exists contact_point_medium_idx on crm.party_contact_point (medium_id);
create index if not exists contact_point_party_idx on crm.party_contact_point (party_id) where deleted_at is null;
create index if not exists contact_point_identity_idx on crm.party_contact_point (party_id)
  where is_identity_key and deleted_at is null;

create index if not exists address_party_idx on crm.address (party_id) where deleted_at is null;
create unique index if not exists address_primary_key on crm.address (party_id, purpose_code)
  where is_primary and deleted_at is null;

alter table crm.affiliation drop constraint if exists affiliation_date_order;
alter table crm.affiliation add constraint affiliation_date_order
  check (start_date is null or end_date is null or end_date >= start_date);
alter table crm.affiliation drop constraint if exists affiliation_one_primary;
alter table crm.affiliation add constraint affiliation_one_primary
  exclude using gist (party_id with =, daterange(start_date, end_date, '[]') with &&)
  where (is_primary and deleted_at is null);
create index if not exists affiliation_employer_idx on crm.affiliation (employer_party_id) where deleted_at is null;
create index if not exists affiliation_party_idx on crm.affiliation (party_id) where deleted_at is null;
create index if not exists affiliation_current_idx on crm.affiliation (employer_party_id)
  where is_current and deleted_at is null;

-- ISO-3166-1 alpha-2 shape. text + CHECK, not char(2): char(n) is blank-padded and
-- the matrx-orm generator has no Field mapping for bpchar.
alter table crm.contact_medium drop constraint if exists medium_phone_country_iso2;
alter table crm.contact_medium add constraint medium_phone_country_iso2
  check (phone_country is null or phone_country ~ '^[A-Z]{2}$');
alter table crm.address drop constraint if exists address_country_iso2;
alter table crm.address add constraint address_country_iso2
  check (country_code is null or country_code ~ '^[A-Z]{2}$');

alter table crm.interaction drop constraint if exists interaction_completed_needs_time;
alter table crm.interaction add constraint interaction_completed_needs_time
  check (status <> 'completed' or occurred_at is not null);
create index if not exists interaction_party_time_idx on crm.interaction (party_id, occurred_at desc) where deleted_at is null;
create index if not exists interaction_campaign_idx on crm.interaction (campaign_id) where deleted_at is null;
create index if not exists interaction_thread_idx on crm.interaction (thread_key) where thread_key is not null;
create index if not exists interaction_due_idx on crm.interaction (assigned_to, scheduled_at)
  where status in ('planned','scheduled') and deleted_at is null;

create unique index if not exists campaign_member_key on crm.campaign_member (campaign_id, party_id)
  where deleted_at is null;
create index if not exists campaign_member_queue_idx on crm.campaign_member (campaign_id, status, next_attempt_at)
  where deleted_at is null;
create index if not exists campaign_member_party_idx on crm.campaign_member (party_id) where deleted_at is null;

create index if not exists party_merge_loser_idx on crm.party_merge (loser_id);
create index if not exists party_merge_winner_idx on crm.party_merge (winner_id);

update platform.entity_types set title_column = 'display_name', content_role = 'source', reference_pickable = true where token = 'party';
update platform.entity_types set title_column = 'name', content_role = 'container', reference_pickable = true where token = 'crm_campaign';
update platform.entity_types set title_column = 'display_value', content_role = 'utility' where token = 'contact_medium';

-- ============================================================ 6. vocabularies
-- visibility='public' is MANDATORY on system-org dimensions. At 'internal' they are
-- invisible to every customer org (empty pickers) AND every `party -> category` edge
-- write fails 42501, because assoc_add requires has_access(target,'viewer').
-- This is the bug plan_seed_categories_public.sql had to fix after the fact.
insert into platform.categories (organization_id, dimension, name, slug, is_system, position, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v.dim, v.name, v.slug, true, v.pos, 'public'::platform.visibility
from (values
  ('party_role','Expert','expert',10),('party_role','Lead','lead',20),('party_role','Customer','customer',30),
  ('party_role','Vendor','vendor',40),('party_role','Partner','partner',50),('party_role','Competitor','competitor',60),
  ('party_role','Journalist','journalist',70),('party_role','Author','author',80),('party_role','Speaker','speaker',90),
  ('party_role','Investor','investor',100),('party_role','Advisor','advisor',110),
  ('crm_lifecycle_stage','Subscriber','subscriber',10),('crm_lifecycle_stage','Lead','lead',20),
  ('crm_lifecycle_stage','Marketing Qualified','marketing-qualified',30),
  ('crm_lifecycle_stage','Sales Qualified','sales-qualified',40),
  ('crm_lifecycle_stage','Opportunity','opportunity',50),('crm_lifecycle_stage','Customer','customer',60),
  ('crm_lifecycle_stage','Evangelist','evangelist',70),('crm_lifecycle_stage','Churned','churned',80),
  ('crm_lifecycle_stage','Disqualified','disqualified',90),
  ('crm_rating','Hot','hot',10),('crm_rating','Warm','warm',20),('crm_rating','Cold','cold',30),
  ('contact_point_purpose','Work','work',10),('contact_point_purpose','Personal','personal',20),
  ('contact_point_purpose','Mobile','mobile',30),('contact_point_purpose','Direct Dial','direct',40),
  ('contact_point_purpose','Switchboard','switchboard',50),('contact_point_purpose','Main','main',60),
  ('contact_point_purpose','Billing','billing',70),('contact_point_purpose','Support','support',80),
  ('social_platform','Website','website',10),('social_platform','LinkedIn','linkedin',20),
  ('social_platform','YouTube','youtube',30),('social_platform','Instagram','instagram',40),
  ('social_platform','TikTok','tiktok',50),('social_platform','Facebook','facebook',60),
  ('social_platform','X','x',70),('social_platform','Threads','threads',80),
  ('social_platform','Pinterest','pinterest',90),('social_platform','Google Business Profile','google_business_profile',100),
  ('social_platform','GitHub','github',110),('social_platform','Substack','substack',120),
  ('social_platform','Reddit','reddit',130),('social_platform','Twitch','twitch',140),
  ('social_platform','WhatsApp','whatsapp',150),('social_platform','Telegram','telegram',160),
  ('interaction_channel','Call','call',10),('interaction_channel','Email','email',20),
  ('interaction_channel','Meeting','meeting',30),('interaction_channel','SMS','sms',40),
  ('interaction_channel','Social','social',50),('interaction_channel','Note','note',60),
  ('interaction_outcome','Connected','connected',10),('interaction_outcome','Voicemail','voicemail',20),
  ('interaction_outcome','No Answer','no-answer',30),('interaction_outcome','Callback Requested','callback',40),
  ('interaction_outcome','Wrong Number','wrong-number',50),('interaction_outcome','Not Interested','not-interested',60),
  ('interaction_outcome','Meeting Booked','meeting-booked',70),('interaction_outcome','Replied','replied',80),
  ('interaction_outcome','Bounced','bounced',90),('interaction_outcome','Do Not Call','do-not-call',100)
) as v(dim, name, slug, pos)
where not exists (select 1 from platform.categories c
                   where c.dimension = v.dim and c.slug = v.slug and c.deleted_at is null);

insert into platform.categories (organization_id, dimension, name, slug, is_system, position, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'association_role', v.name, v.name, true, v.pos, 'public'::platform.visibility
from (values
  ('works_at',200),('member_of',210),('same_as',220),('merge_candidate',230),
  ('expert_for',240),('speaker',250),('writes_for',260),('owns',270),
  ('mentioned_in',280),('appears_in',290),('authored',300),('attendee',310)
) as v(name, pos)
where not exists (select 1 from platform.categories c
                   where c.dimension = 'association_role' and c.slug = v.name and c.deleted_at is null);

-- ============================================================ 7. association pairs
insert into platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes)
values
  ('party','party',           null,'none',  'viewer', true, 'Roles: works_at (mirror of crm.affiliation - the TABLE is the truth), member_of, same_as, merge_candidate.'),
  ('party','category',        null,'none',  'viewer', true, 'Role: member. party_role tagging.'),
  ('party','data_store',      null,'target','viewer', true, 'Curated contact set. Industry/global/org grants on the store convey viewer to member parties via reachability. Mirrors file -> data_store.'),
  ('party','research_source', null,'none',  'viewer', true, 'Roles: authored, appears_in, mentioned_in. Carries the party_observation payload.'),
  ('party','research_topic',  null,'none',  'viewer', true, 'Role: expert_for.'),
  ('party','transcript',      null,'none',  'viewer', true, 'Role: speaker.'),
  ('party','seo_topic',       null,'none',  'viewer', true, 'Role: topic.'),
  ('party','web_site',        null,'none',  'viewer', true, 'Roles: owns, writes_for.'),
  ('party','web_brand',       null,'none',  'viewer', true, 'Role: owns. Link until the web.brand fold lands.'),
  ('party','scope',           null,'target','viewer', true, 'Scope tagging; reachable through a scope means readable, never enumerable.'),
  ('party','project',         null,'target','editor', true, 'Project membership.'),
  ('party','task',            null,'target','editor', true, 'Party attached to a task.'),
  ('party','war_room',        null,'target','editor', true, 'Party attached to a war room.'),
  ('party','organization',    null,'target','editor', true, 'Org workspace attachment.'),
  ('file','party',            null,'target','editor', true, 'Files attached to a party (contracts, decks).'),
  ('note','party',            null,'target','editor', true, 'Notes attached to a party.'),
  ('plan_node','party',       null,'none',  'viewer', true, 'Roles: authored_by, reviewed_by, about, cites. Mirrors the plan_node -> plan_entity direction.')
on conflict (source_type, target_type) do update set
  container_side = excluded.container_side, conveys_max = excluded.conveys_max,
  is_active = true, notes = excluded.notes, updated_at = now();

-- A payload kind binds to exactly ONE (source_type, target_type) pair.
insert into platform.edge_payload_kind (kind, version, description, json_schema, source_type, target_type)
values
  ('party_observation', 1,
   'Provenance for a fact asserted about a party from a research source: which run, which agent, what it claimed.',
   '{"type":"object","properties":{"observed_at":{"type":"string"},"run_id":{"type":"string"},"agent_id":{"type":"string"},"model_id":{"type":"string"},"confidence":{"type":"integer","minimum":0,"maximum":100},"fields":{"type":"object"},"quote":{"type":"string"}},"required":["observed_at"],"additionalProperties":false}'::jsonb,
   'party','research_source'),
  ('party_affiliation', 1,
   'Display mirror of crm.affiliation on a party -> party works_at edge. crm.affiliation is the source of truth.',
   '{"type":"object","properties":{"title":{"type":"string"},"department":{"type":"string"},"is_primary":{"type":"boolean"},"is_current":{"type":"boolean"},"start_date":{"type":"string"},"end_date":{"type":"string"},"affiliation_id":{"type":"string"}},"additionalProperties":false}'::jsonb,
   'party','party')
on conflict (kind) do update set
  version = excluded.version, description = excluded.description,
  json_schema = excluded.json_schema, source_type = excluded.source_type,
  target_type = excluded.target_type, updated_at = now();

-- Without these the "Shared" scope on /crm can never work: share_resource_with_user
-- raises on an unregistered resource type.
insert into platform.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, is_public_column,
   display_label, url_path_template, rls_uses_has_permission, is_active, content_role, is_scopeable)
values
  ('party','crm','party','id','created_by',null,'Entity','/crm/{id}',true,true,'source',true),
  ('crm_campaign','crm','campaign','id','created_by',null,'Campaign','/crm/campaigns/{id}',true,true,'container',true)
on conflict (resource_type) do update set
  schema_name = excluded.schema_name, table_name = excluded.table_name,
  display_label = excluded.display_label, url_path_template = excluded.url_path_template,
  is_active = true;

-- Per token. NEVER the global sweep: it dies on entity_types row agent_card, which
-- points at a VIEW.
select platform.sync_association_gc_triggers('party');
select platform.sync_association_gc_triggers('crm_campaign');
select platform.sync_association_gc_triggers('contact_medium');

-- Stale registry row: token 'profile' points at schema "user", which does not exist
-- (the live table is users.profiles, already registered as 'user_profile').
update platform.entity_types set is_active = false where token = 'profile' and schema_name = 'user';

-- ============================================================ 8. affiliation mirror
-- crm.affiliation is the truth: a person can hold two stints at one company, which
-- the association unique key (source,source_id,target,target_id,role) cannot express.
-- This keeps ONE derived works_at edge per live affiliation so the 360 association
-- surfaces still render, and maintains the denormalized current employer so grids,
-- sorts and exports are one column read. It does NOT use the forbidden
-- platform._mirror_fk_to_assoc; modelled on plan._site_edge.
create or replace function crm._affiliation_edge()
returns trigger language plpgsql security definer set search_path to 'pg_catalog' as $fn$
declare v_party uuid; v_payload jsonb;
begin
  if TG_OP = 'DELETE' then v_party := OLD.party_id; else v_party := NEW.party_id; end if;

  if TG_OP in ('UPDATE','DELETE') then
    if TG_OP = 'DELETE'
       or OLD.employer_party_id is distinct from NEW.employer_party_id
       or (NEW.deleted_at is not null and OLD.deleted_at is null) then
      delete from platform.associations
       where source_type = 'party' and source_id = OLD.party_id
         and target_type = 'party' and target_id = OLD.employer_party_id and role = 'works_at';
    end if;
  end if;

  if TG_OP in ('INSERT','UPDATE') and NEW.deleted_at is null then
    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'title', NEW.title, 'department', NEW.department,
      'is_primary', NEW.is_primary, 'is_current', NEW.is_current,
      'start_date', NEW.start_date::text, 'end_date', NEW.end_date::text,
      'affiliation_id', NEW.id::text));
    insert into platform.associations
      (source_type, source_id, target_type, target_id, organization_id, role, payload_kind, payload)
    values ('party', NEW.party_id, 'party', NEW.employer_party_id, NEW.organization_id,
            'works_at', 'party_affiliation', v_payload)
    on conflict (source_type, source_id, target_type, target_id, role)
    do update set payload = excluded.payload, payload_kind = excluded.payload_kind;
  end if;

  update crm.party p
     set primary_employer_party_id = a.employer_party_id, job_title = a.title
    from (select employer_party_id, title from crm.affiliation
           where party_id = v_party and deleted_at is null and is_primary and is_current
           order by coalesce(start_date, '-infinity'::date) desc limit 1) a
   where p.id = v_party
     and (p.primary_employer_party_id is distinct from a.employer_party_id
          or p.job_title is distinct from a.title);

  if not exists (select 1 from crm.affiliation
                  where party_id = v_party and deleted_at is null and is_primary and is_current) then
    update crm.party set primary_employer_party_id = null, job_title = null
     where id = v_party and (primary_employer_party_id is not null or job_title is not null);
  end if;

  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end $fn$;

drop trigger if exists _z_affiliation_edge on crm.affiliation;
create trigger _z_affiliation_edge after insert or update or delete on crm.affiliation
  for each row execute function crm._affiliation_edge();

-- ============================================================ 9. RPCs (public schema: platform.* is unreachable from supabase-js)
-- Partial unique indexes cannot be DEFERRABLE, so the natural "set new primary,
-- clear old" UI flow 23505s. Clearing and setting must happen here, in order.
create or replace function public.crm_set_primary_contact_point(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_party uuid; v_channel text;
begin
  select party_id, channel into v_party, v_channel
    from crm.party_contact_point where id = p_id and deleted_at is null;
  if v_party is null then
    raise exception 'crm_set_primary_contact_point: contact point % not found', p_id using errcode = 'P0002';
  end if;
  if not iam.has_access('party', v_party, 'editor') then
    raise exception 'crm_set_primary_contact_point: no edit access to party %', v_party using errcode = '42501';
  end if;
  update crm.party_contact_point set is_primary = false
   where party_id = v_party and channel = v_channel and deleted_at is null and is_primary and id <> p_id;
  update crm.party_contact_point set is_primary = true where id = p_id;
end $fn$;

-- Merge repoints children to the winner and RECORDS every move, so unmerge is exact
-- rather than best-effort. Nothing is destroyed: the loser row stays live with
-- canonical_id set, keeping anything that could not be repointed.
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
    update crm.campaign_member cm set party_id = p_winner
     where cm.party_id = p_loser and cm.deleted_at is null
       and not exists (select 1 from crm.campaign_member w
                        where w.campaign_id = cm.campaign_id and w.party_id = p_winner and w.deleted_at is null)
    returning cm.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('campaign_member', to_jsonb(v_ids));

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
  update crm.campaign_member set party_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'campaign_member'))::uuid[]);
  update platform.associations set source_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'assoc_source'))::uuid[]);
  update platform.associations set target_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'assoc_target'))::uuid[]);

  update crm.party set canonical_id = null where id = v_m.loser_id;
  update crm.party_merge set unmerged_at = now(), unmerged_by = auth.uid() where id = p_merge_id;

  perform platform.log_activity(v_m.organization_id, 'crm.party.unmerge', 'party', v_m.winner_id,
    jsonb_build_object('loser_id', v_m.loser_id, 'merge_id', p_merge_id));
end $fn$;

-- Erasure. Versioned CRM tables put PII into history.row_versions permanently, so a
-- purge that only deletes the live row is not a purge.
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
  delete from crm.campaign_member where party_id = p_party;
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
end $fn$;

revoke all on function public.crm_set_primary_contact_point(uuid) from public;
revoke all on function public.crm_merge_parties(uuid, uuid, text, text) from public;
revoke all on function public.crm_unmerge_parties(uuid) from public;
revoke all on function public.crm_party_purge(uuid) from public;
grant execute on function public.crm_set_primary_contact_point(uuid) to authenticated, service_role;
grant execute on function public.crm_merge_parties(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.crm_unmerge_parties(uuid) to authenticated, service_role;
grant execute on function public.crm_party_purge(uuid) to authenticated, service_role;
