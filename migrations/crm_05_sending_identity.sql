-- CRM / outreach, step 5: THE RIGHT TO SEND — the sending-identity primitive.
--
-- Outreach handoff §5 (docs/handoffs/outreach-system.md) is the decided
-- architecture and the safety design of the business. THE LAW it encodes:
--
--   Customers send from THEIR OWN mailboxes on THEIR OWN verified domains.
--   AI Matrx NEVER relays customer outreach through its own infrastructure or a
--   shared "from" pool. That is what contains a spammy customer's blast radius
--   to their own domain instead of everyone's.
--
-- Which is why a sending identity is a FIRST-CLASS ORG-SCOPED RECORD and not a
-- config field: it carries the mailbox connection, the DNS proof that the org
-- owns the domain, the measured SPF/DKIM/DMARC verdicts, the warmup state
-- machine, the caps and pacing, the rolling health, and the circuit breaker.
--
-- APPLIED LIVE 2026-08-14 (aidream session, `_schema_migrations` source
-- 'matrx-frontend', filename 'crm_05_sending_identity.sql'). Idempotent record
-- of the change that already landed.
--
-- Component tables are hand-built ON PURPOSE: platform.create_entity_table
-- cannot create them (iam.apply_rls('component') needs a composition row whose
-- child_type FKs to a token create_entity_table has not yet inserted). Recipe
-- copied verbatim from crm_02_core.sql §2–4.

-- ============================================================ 1. entity tables
do $$
begin
  if to_regclass('crm.sending_identity') is null then
    perform platform.create_entity_table(
      p_schema => 'crm', p_table => 'sending_identity',
      p_token => 'crm_sending_identity', p_label => 'Sending Identity',
      p_fields => ARRAY[
        'display_name text NOT NULL',

        -- ── Connection: which mailbox, on which provider, over which credential
        -- Google Workspace is live; microsoft_365 and smtp are declared slots so
        -- the interface is provider-shaped from day one (handoff §5.2.1).
        $f$provider text NOT NULL CHECK (provider IN ('google_workspace','microsoft_365','smtp'))$f$,
        'connection_id uuid REFERENCES users.integration_connections(id)',
        'provider_account text',
        'from_address text NOT NULL',
        'from_address_key text NOT NULL',
        'from_name text',
        'reply_to text',
        'sending_domain text NOT NULL',

        -- ── Lifecycle. `ready` is the ONLY state a campaign may consume, and
        -- only the code gate decides that — never a client.
        $f$status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','verifying','warming','ready','paused','disabled'))$f$,
        'status_changed_at timestamptz',
        -- A system pause may only be lifted by a human (handoff §5.2.7). The
        -- kind is recorded so the service can refuse a machine resume.
        $f$paused_by_kind text CHECK (paused_by_kind IN ('system','human'))$f$,
        'paused_at timestamptz', 'paused_by uuid REFERENCES auth.users(id)',
        'pause_reason text', 'pause_code text',
        'resumed_at timestamptz', 'resumed_by uuid REFERENCES auth.users(id)',

        -- ── Domain-ownership proof (DNS TXT challenge). HARD GATE: no send of
        -- any kind before domain_verified_at is set.
        'domain_verification_token text NOT NULL',
        'domain_verified_at timestamptz',
        'domain_checked_at timestamptz',
        'domain_check_error text',

        -- ── Authentication measured, never assumed. NULL = never checked.
        'spf_pass boolean', 'dkim_pass boolean', 'dmarc_pass boolean',
        'auth_checked_at timestamptz',
        $f$auth_detail jsonb NOT NULL DEFAULT '{}'::jsonb$f$,

        -- ── Warmup state machine. warmup_day is derived from warmup_started_at
        -- by the service; it is stored so a human can read the ramp position.
        'warmup_started_at timestamptz',
        'warmup_completed_at timestamptz',
        'warmup_day smallint',

        -- ── Caps + human pacing. Cold-outreach practice is tens per mailbox per
        -- day, not hundreds; volume scales by connecting more mailboxes.
        'daily_cap integer NOT NULL DEFAULT 40 CHECK (daily_cap > 0 AND daily_cap <= 500)',
        'hourly_cap integer NOT NULL DEFAULT 8 CHECK (hourly_cap > 0 AND hourly_cap <= 200)',
        'min_interval_seconds integer NOT NULL DEFAULT 90 CHECK (min_interval_seconds >= 0)',
        'max_interval_seconds integer NOT NULL DEFAULT 600 CHECK (max_interval_seconds >= 0)',

        -- ── Quiet hours are evaluated in the RECIPIENT''s timezone, not the
        -- sender''s. [quiet_start, quiet_end) local is when we must NOT send;
        -- the window wraps midnight when start > end (the normal case).
        'quiet_hours_start smallint NOT NULL DEFAULT 20 CHECK (quiet_hours_start BETWEEN 0 AND 23)',
        'quiet_hours_end smallint NOT NULL DEFAULT 8 CHECK (quiet_hours_end BETWEEN 0 AND 23)',
        'send_weekends boolean NOT NULL DEFAULT false',
        $f$default_recipient_timezone text NOT NULL DEFAULT 'UTC'$f$,

        -- ── Rolling health snapshot (recomputed by the sweep from
        -- crm.sending_event, which stays the source of truth).
        $f$health jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'health_computed_at timestamptz',
        'last_send_at timestamptz',

        $f$attributes jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true,
      p_visibility => 'internal', p_category => false, p_listed => true,
      p_org_default => true, p_gin_jsonb => true);
  end if;

  -- Per-org kill switch (handoff §5.2.8): one row per org, pullable instantly,
  -- and consulted by the send gate before anything else.
  if to_regclass('crm.sending_policy') is null then
    perform platform.create_entity_table(
      p_schema => 'crm', p_table => 'sending_policy',
      p_token => 'crm_sending_policy', p_label => 'Sending Policy',
      p_fields => ARRAY[
        'outreach_enabled boolean NOT NULL DEFAULT true',
        'disabled_at timestamptz', 'disabled_by uuid REFERENCES auth.users(id)',
        'disabled_reason text',
        $f$disabled_by_kind text CHECK (disabled_by_kind IN ('system','human'))$f$,
        'enabled_at timestamptz', 'enabled_by uuid REFERENCES auth.users(id)',
        'notes text',
        $f$attributes jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => false, p_soft_delete => true,
      p_visibility => 'internal', p_category => false, p_listed => false,
      p_org_default => true, p_gin_jsonb => true);
  end if;
end $$;

-- ============================================================ 2. component tables
-- Verification-check history. The identity carries the CURRENT verdict; this
-- carries every observation, so "it passed last Tuesday and fails now" is a fact
-- the surface can show instead of a mystery.
create table if not exists crm.sending_identity_check (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references crm.sending_identity(id) on delete cascade,
  check_kind text not null
    check (check_kind in ('domain_txt','spf','dkim','dmarc','connection','mailbox_match')),
  passed boolean not null,
  message text,
  observed jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  duration_ms integer,
  organization_id uuid not null references iam.organizations(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
  deleted_at timestamptz, version int not null default 1,
  metadata jsonb not null default '{}'::jsonb
);

-- The audit trail (handoff §5.2.8: "who sent what to whom") AND the source of
-- truth for rolling health. One row per observable outcome per recipient.
create table if not exists crm.sending_event (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references crm.sending_identity(id) on delete cascade,
  event_kind text not null
    check (event_kind in ('sent','delivered','bounced','complained','replied','unsubscribed','failed')),
  party_id uuid references crm.party(id),
  medium_id uuid references crm.contact_medium(id),
  outreach_list_id uuid references crm.outreach_list(id),
  interaction_id uuid references crm.interaction(id),
  to_address_key text not null,
  subject text,
  provider_message_id text,
  bounce_type text check (bounce_type in ('soft','hard','block','complaint')),
  error_code text, error_message text,
  actor_kind text not null default 'user' check (actor_kind in ('user','system')),
  actor_user_id uuid references auth.users(id),
  occurred_at timestamptz not null default now(),
  detail jsonb not null default '{}'::jsonb,
  organization_id uuid not null references iam.organizations(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
  deleted_at timestamptz, version int not null default 1,
  metadata jsonb not null default '{}'::jsonb
);

grant select, insert, update, delete on
  crm.sending_identity_check, crm.sending_event
  to authenticated, service_role;

-- ============================================================ 3. registry + RLS
insert into platform.entity_types
  (token, label, schema_name, table_name, table_ref, rls_variant, is_component,
   is_versioned, title_column, has_soft_delete, base_tier, is_active, is_listed, reference_pickable)
values
  ('crm_sending_identity_check','Sending Check','crm','sending_identity_check','crm.sending_identity_check','component', true, false, 'check_kind', true, 1, true, false, false),
  ('crm_sending_event',         'Sending Event','crm','sending_event',         'crm.sending_event',         'component', true, false, 'subject',    true, 1, true, false, false)
on conflict (token) do update set
  label = excluded.label, schema_name = excluded.schema_name,
  table_name = excluded.table_name, table_ref = excluded.table_ref,
  rls_variant = excluded.rls_variant, is_component = excluded.is_component,
  is_versioned = excluded.is_versioned, title_column = excluded.title_column,
  has_soft_delete = excluded.has_soft_delete, is_active = true;

insert into platform.entity_relationships (parent_type, child_type, fk_column, kind, note)
values
  ('crm_sending_identity','crm_sending_identity_check','identity_id','composition','access derives from the sending identity'),
  ('crm_sending_identity','crm_sending_event','identity_id','composition','access derives from the sending identity')
on conflict do nothing;

select iam.apply_rls('crm','sending_identity_check','crm_sending_identity_check','component');
select iam.apply_rls('crm','sending_event','crm_sending_event','component');

-- _a_ sorts before _stamp_* (triggers fire alphabetically) so the parent org wins.
do $do$
declare r record;
begin
  for r in select * from (values
      ('sending_identity_check','crm.sending_identity','identity_id'),
      ('sending_event',         'crm.sending_identity','identity_id')
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

-- ============================================================ 4. constraints + indexes
-- ONE identity per address per org. The address IS the identity.
create unique index if not exists sending_identity_org_address_key
  on crm.sending_identity (organization_id, from_address_key)
  where deleted_at is null;
create index if not exists sending_identity_org_status_idx
  on crm.sending_identity (organization_id, status) where deleted_at is null;
create index if not exists sending_identity_domain_idx
  on crm.sending_identity (organization_id, sending_domain) where deleted_at is null;
create index if not exists sending_identity_connection_idx
  on crm.sending_identity (connection_id) where deleted_at is null;

alter table crm.sending_identity drop constraint if exists sending_identity_address_key_lower;
alter table crm.sending_identity add constraint sending_identity_address_key_lower
  check (from_address_key = lower(from_address_key) and from_address_key like '%@%');
alter table crm.sending_identity drop constraint if exists sending_identity_domain_lower;
alter table crm.sending_identity add constraint sending_identity_domain_lower
  check (sending_domain = lower(sending_domain) and sending_domain <> '');
-- The address must live on the domain it proved ownership of. Without this a
-- verified domain could front an address on a completely different domain.
alter table crm.sending_identity drop constraint if exists sending_identity_address_on_domain;
alter table crm.sending_identity add constraint sending_identity_address_on_domain
  check (split_part(from_address_key, '@', 2) = sending_domain);
alter table crm.sending_identity drop constraint if exists sending_identity_interval_order;
alter table crm.sending_identity add constraint sending_identity_interval_order
  check (max_interval_seconds >= min_interval_seconds);
-- A paused identity always names WHO paused it and WHY. A system pause with no
-- reason is unreviewable, and the human-resume rule needs the kind.
alter table crm.sending_identity drop constraint if exists sending_identity_pause_provenance;
alter table crm.sending_identity add constraint sending_identity_pause_provenance
  check (status <> 'paused' or (paused_by_kind is not null and pause_reason is not null));

-- One policy row per org.
create unique index if not exists sending_policy_org_key
  on crm.sending_policy (organization_id) where deleted_at is null;

create index if not exists sending_check_identity_idx
  on crm.sending_identity_check (identity_id, checked_at desc) where deleted_at is null;
create index if not exists sending_check_kind_idx
  on crm.sending_identity_check (identity_id, check_kind, checked_at desc) where deleted_at is null;

-- The two health queries: "everything in the window" and "this outcome in the
-- window". Both are per-identity and time-ordered.
create index if not exists sending_event_identity_time_idx
  on crm.sending_event (identity_id, occurred_at desc) where deleted_at is null;
create index if not exists sending_event_identity_kind_time_idx
  on crm.sending_event (identity_id, event_kind, occurred_at desc) where deleted_at is null;
create index if not exists sending_event_org_time_idx
  on crm.sending_event (organization_id, occurred_at desc) where deleted_at is null;
create index if not exists sending_event_party_idx
  on crm.sending_event (party_id) where party_id is not null and deleted_at is null;
-- Provider message ids are how an inbound webhook (Phase 5 / G6) will find the
-- send it is reporting on.
create unique index if not exists sending_event_provider_message_key
  on crm.sending_event (identity_id, event_kind, provider_message_id)
  where provider_message_id is not null and deleted_at is null;

alter table crm.sending_event drop constraint if exists sending_event_address_lower;
alter table crm.sending_event add constraint sending_event_address_lower
  check (to_address_key = lower(to_address_key));

-- ============================================================ 5. campaign binding
-- The circuit breaker must pause the identity AND ITS CAMPAIGNS (handoff
-- §5.2.7), so the campaign has to name the identity it sends through, and a
-- pause has to record who did it — a system pause a human cannot distinguish
-- from their own is a pause nobody dares lift.
alter table crm.outreach_list add column if not exists sending_identity_id uuid
  references crm.sending_identity(id);
alter table crm.outreach_list add column if not exists paused_at timestamptz;
alter table crm.outreach_list add column if not exists paused_by uuid references auth.users(id);
alter table crm.outreach_list add column if not exists pause_reason text;
alter table crm.outreach_list add column if not exists paused_by_kind text;
alter table crm.outreach_list drop constraint if exists outreach_list_paused_by_kind_check;
alter table crm.outreach_list add constraint outreach_list_paused_by_kind_check
  check (paused_by_kind is null or paused_by_kind in ('system','human'));
create index if not exists outreach_list_sending_identity_idx
  on crm.outreach_list (sending_identity_id) where deleted_at is null;
