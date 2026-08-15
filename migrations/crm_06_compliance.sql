-- migrations/crm_06_compliance.sql
--
-- OUTREACH COMPLIANCE — the legal and operational gates for both sending lanes.
--
-- APPLIED LIVE 2026-08-14/15 via Supabase MCP in nine steps, consolidated here as
-- ONE idempotent record of the change that already landed. Re-applying is a no-op.
--
-- System-of-record — READ IT BEFORE TOUCHING ANY OF THIS:
--   /Users/armanisadeghi/code/common-docs/systems/outreach-compliance/
--     FEATURE.md              verified sources + dates
--     REQUIREMENTS_MATRIX.md  obligation -> jurisdiction -> lane -> enforcement point
--     ENGINEERING_GAPS.md     what this closes, and what it does not
--     ATTORNEY_BRIEF.md       what still needs counsel
--
-- Closes matrix gaps GAP-1 (unsubscribe), GAP-2 (postal address), GAP-4 (consent
-- provenance), GAP-5 (LIA), GAP-6 (art. 14 gating), GAP-7 (per-country policy),
-- GAP-8 (health + circuit breaker), GAP-9 (machine-checkable AUP), GAP-11
-- (verification required).
--
-- 🚨 THE ONE AUTHORITY is crm.check_send_eligibility(). Every send path asks it
-- and refuses on a block. Never reimplement one of its checks elsewhere.

-- ═══════════════════════════════════════════════ 1. THE JURISDICTION POLICY
-- "May our customer email this person in this country" is a legal judgment that
-- varies by country in ways that genuinely contradict each other. This table is
-- where that judgment LIVES, so counsel's answer becomes an enforced product
-- behavior instead of a paragraph nobody reads.
--
-- THE DEFAULT IS REFUSAL. A missing row, or a row still 'unknown', BLOCKS.
-- Platform-global reference data (the law is the same for every tenant), so it
-- follows the iam.industries precedent: everyone reads, nobody writes directly.
-- An org does not get its own opinion about German law.

create table if not exists crm.jurisdiction_policy (
  country_code text primary key check (country_code ~ '^[A-Z]{2}$'),
  country_name text not null,
  region text not null check (region in ('US','CA','EEA','UK','AU','OTHER')),
  -- Verdict for outreach with NO prior express consent:
  --   allowed / conditional (conditions must be MET) / prohibited / unknown
  cold_b2b text not null default 'unknown'
    check (cold_b2b in ('allowed','conditional','prohibited','unknown')),
  cold_b2c text not null default 'unknown'
    check (cold_b2c in ('allowed','conditional','prohibited','unknown')),
  conditions text,
  unsubscribe_validity_days integer not null default 60 check (unsubscribe_validity_days > 0),
  honor_within_hours integer not null default 24 check (honor_within_hours > 0),
  requires_postal_address boolean not null default true,
  requires_source_disclosure boolean not null default false,   -- GDPR art. 14
  requires_role_relevance boolean not null default false,      -- FR / CA / AU
  distinguishes_subscriber_kind boolean not null default false,-- UK PECR
  citation text,
  -- 'agent-research' is explicitly NOT ratification.
  ratified_by text not null default 'agent-research',
  ratified_at timestamptz,
  ratified_note text,
  notes text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table crm.jurisdiction_policy is
  'Per-country outreach legality. Default is refusal: a missing row or cold_b2b=unknown blocks the send. Rows with ratified_by=''agent-research'' are UNRATIFIED and must be reviewed by a qualified attorney before they are relied on.';

create index if not exists jurisdiction_policy_region_idx on crm.jurisdiction_policy (region) where is_active;

alter table crm.jurisdiction_policy enable row level security;
drop policy if exists jurisdiction_policy_select_all on crm.jurisdiction_policy;
create policy jurisdiction_policy_select_all on crm.jurisdiction_policy
  for select to anon, authenticated using (true);
revoke insert, update, delete on crm.jurisdiction_policy from anon, authenticated;
grant select on crm.jurisdiction_policy to anon, authenticated;
grant select, insert, update, delete on crm.jurisdiction_policy to service_role;

drop trigger if exists _touch_row on crm.jurisdiction_policy;
create trigger _touch_row before insert or update on crm.jurisdiction_policy
  for each row execute function platform._touch_row();

-- ── seed. EVERY row is agent research verified 2026-08-14, NOT legal advice.
insert into crm.jurisdiction_policy
  (country_code, country_name, region, cold_b2b, cold_b2c, conditions,
   unsubscribe_validity_days, honor_within_hours, requires_source_disclosure,
   requires_role_relevance, distinguishes_subscriber_kind, citation, notes)
values
  ('US','United States','US','allowed','allowed',
   'Opt-out regime. Truthful headers and subject; clear opt-out; valid physical postal address; honor opt-out promptly. No B2B exemption and no low-volume exemption.',
   30, 240, false, false, false, '15 U.S.C. 7704 (CAN-SPAM)',
   'Utah and Michigan child-protection registries survive CAN-SPAM preemption for alcohol, tobacco, gambling, pornography, illegal drugs or prostitution. Our AUP bans those categories outright, which is why we do not scrub.'),
  ('CA','Canada','CA','conditional','conditional',
   'Consent required BEFORE sending. Express, OR implied from an existing business relationship (2 years from a purchase/accepted opportunity, 6 months from an inquiry), OR a conspicuously published business address where (a) no notice beside it refuses commercial messages AND (b) the message is relevant to that person''s business role. Sender bears the burden of proof.',
   60, 240, false, true, false, 'CASL; CRTC crtc.gc.ca/eng/com500/faq500.htm and /guide.htm',
   'Penalties up to CAD $1m (individual) / $10m (organization) per violation. Applies to B2B — Compu-Finder was primarily B2B, fined CAD $1.1m.'),
  ('GB','United Kingdom','UK','conditional','prohibited',
   'Permitted WITHOUT consent to corporate subscribers only (companies, LLPs, Scottish partnerships). Individual subscribers — which INCLUDES sole traders and ordinary partnerships — need consent or a soft opt-in. UK GDPR still applies to a named individual at a corporate address.',
   60, 72, true, false, true, 'PECR reg. 22; ICO direct-marketing guidance; Data (Use and Access) Act 2025',
   'DUAA 2025 raised PECR direct-marketing fines from GBP 500,000 to GBP 17.5m or 4% of global turnover; most provisions in force 2026-02-05.'),
  ('FR','France','EEA','conditional','prohibited',
   'B2B prospecting to a professional address may rest on legitimate interest WITHOUT prior consent, but ONLY if the subject of the message relates to that person''s profession or function. Data collected fairly, sender identified, simple opt-out in every message.',
   60, 72, true, true, false, 'CNIL, prospection commerciale par courrier electronique; LCEN / art. L34-5 CPCE',
   'The role-relevance test is the whole ballgame: accounting software to an accountant is fine; office chairs to the same person is not.'),
  ('DE','Germany','EEA','prohibited','prohibited',
   'Advertising by electronic mail requires the addressee''s PRIOR EXPRESS CONSENT. No B2B carve-out, and no "presumed consent" for email (that exists for telephone under s.7(2) no.1, and expressly not for email). Only exception is s.7(3): address obtained from the customer in connection with a sale, used for the sender''s OWN SIMILAR goods, no objection, and clear notice at collection AND in every message.',
   60, 72, true, false, false, 'UWG s.7(2) no.2 and s.7(3), gesetze-im-internet.de/englisch_uwg',
   'Competitors and trade associations have standing to issue cease-and-desist letters and seek injunctions — often costlier than a regulator. Hence a hard block, not a warning.'),
  ('AT','Austria','EEA','prohibited','prohibited',
   'Understood to extend the consent requirement to legal persons, on the same pattern as Germany. BLOCKED PENDING VERIFICATION — an unverified strict jurisdiction is blocked, never assumed permissive.',
   60, 72, true, false, false, 'TKG 2021 s.174 (successor to TKG 2003 s.107) — NOT VERIFIED',
   'UNVERIFIED. Attorney question Q3. Blocked in the safe direction until confirmed.'),
  ('AU','Australia','AU','conditional','prohibited',
   'Consent required — express, or INFERRED from an existing relationship or a conspicuously published work address where the message is relevant to that person''s role. Sender identified with contact details accurate for at least 30 days.',
   30, 120, false, true, false, 'Spam Act 2003 (Cth); ACMA rules for business',
   'Penalties are per DAY, not per message — reportedly up to AUD 3.13m/day for a corporation.')
on conflict (country_code) do update set
  country_name = excluded.country_name, region = excluded.region,
  cold_b2b = excluded.cold_b2b, cold_b2c = excluded.cold_b2c,
  conditions = excluded.conditions,
  unsubscribe_validity_days = excluded.unsubscribe_validity_days,
  honor_within_hours = excluded.honor_within_hours,
  requires_source_disclosure = excluded.requires_source_disclosure,
  requires_role_relevance = excluded.requires_role_relevance,
  distinguishes_subscriber_kind = excluded.distinguishes_subscriber_kind,
  citation = excluded.citation, notes = excluded.notes;

-- The rest of the EEA/EFTA, seeded EXPLICITLY as unknown so the surface can show
-- a real list of blocked countries with a real reason, rather than a silent
-- absence the user discovers by having a send refused.
insert into crm.jurisdiction_policy (country_code, country_name, region, cold_b2b, cold_b2c,
  conditions, requires_source_disclosure, citation, notes)
select c.code, c.name, 'EEA', 'unknown', 'unknown',
  'Not researched. ePrivacy is a DIRECTIVE — each member state implemented it differently, and art. 13(5) lets each decide whether the consent rule covers legal persons. Several are reported to extend it. Blocked until an attorney rules.',
  true, 'ePrivacy Directive 2002/58/EC art. 13, as implemented nationally',
  'Attorney question Q3. The ePrivacy Regulation that would have harmonised this was WITHDRAWN 2025-02-05, so this fragmentation is permanent, not transitional.'
from (values
  ('BE','Belgium'),('BG','Bulgaria'),('HR','Croatia'),('CY','Cyprus'),('CZ','Czechia'),
  ('DK','Denmark'),('EE','Estonia'),('FI','Finland'),('GR','Greece'),('HU','Hungary'),
  ('IE','Ireland'),('IT','Italy'),('LV','Latvia'),('LT','Lithuania'),('LU','Luxembourg'),
  ('MT','Malta'),('NL','Netherlands'),('PL','Poland'),('PT','Portugal'),('RO','Romania'),
  ('SK','Slovakia'),('SI','Slovenia'),('ES','Spain'),('SE','Sweden'),
  ('IS','Iceland'),('LI','Liechtenstein'),('NO','Norway')
) as c(code, name)
on conflict (country_code) do nothing;

insert into crm.jurisdiction_policy (country_code, country_name, region, cold_b2b, cold_b2c,
  conditions, requires_source_disclosure, citation, notes)
values ('CH','Switzerland','OTHER','unknown','unknown',
  'Not researched. Switzerland has its own regime (UWG art. 3(1)(o)) reported to require prior consent. Blocked until an attorney rules.',
  true, 'Swiss UWG art. 3(1)(o) — NOT VERIFIED', 'Attorney question Q3.')
on conflict (country_code) do nothing;

-- ═══════════════════════════════════════════ 2. CONSENT PROVENANCE (GAP-4)
-- crm.contact_medium already owned whether a message CAN arrive. It never owned
-- whether a message MAY be sent. This is the difference.
--
-- The one thing here that cannot be retrofitted: consent not recorded at capture
-- time cannot be reconstructed, and the only remedy is re-contacting everyone.
--
-- The vocabulary is the one the LAW uses. communication.sms_consent folds into
-- THIS vocabulary (crm handoff s.5.2 — one suppression authority, therefore one
-- consent vocabulary). Never add a second.

alter table crm.contact_medium
  add column if not exists consent_basis text not null default 'none'
    check (consent_basis in (
      'express', 'implied_ebr', 'implied_inquiry', 'conspicuous_publication',
      'legitimate_interest', 'soft_opt_in', 'none')),
  add column if not exists consent_source text,
  add column if not exists consent_source_url text,
  add column if not exists consent_recorded_at timestamptz,
  add column if not exists consent_evidence_at timestamptz,
  add column if not exists consent_expires_at timestamptz,
  add column if not exists consent_jurisdiction text,
  add column if not exists consent_evidence jsonb not null default '{}'::jsonb,
  add column if not exists subscriber_kind text not null default 'unknown'
    check (subscriber_kind in ('individual','corporate','unknown')),
  add column if not exists source_disclosed_at timestamptz;

alter table crm.contact_medium drop constraint if exists contact_medium_consent_jurisdiction_iso2;
alter table crm.contact_medium add constraint contact_medium_consent_jurisdiction_iso2
  check (consent_jurisdiction is null or consent_jurisdiction ~ '^[A-Z]{2}$');

comment on column crm.contact_medium.consent_basis is
  'The lawful basis for contacting this value. THE ELIGIBILITY KEY: lane A requires express or soft_opt_in with evidence; basis=none is invisible to lane A by query, not by warning.';
comment on column crm.contact_medium.consent_source_url is
  'The page this address was published on. Serves CASL conspicuous publication, Australian inferred consent, AND GDPR art. 14 "source" simultaneously.';
comment on column crm.contact_medium.subscriber_kind is
  'PECR individual vs corporate subscriber. Sole traders and ordinary partnerships count as INDIVIDUAL.';

-- Consent naming no source is not evidence of anything.
alter table crm.contact_medium drop constraint if exists contact_medium_consent_provenance;
alter table crm.contact_medium add constraint contact_medium_consent_provenance
  check (consent_basis = 'none' or (consent_source is not null or consent_source_url is not null));

-- A conspicuous-publication basis is a claim about a specific page.
alter table crm.contact_medium drop constraint if exists contact_medium_publication_needs_url;
alter table crm.contact_medium add constraint contact_medium_publication_needs_url
  check (consent_basis <> 'conspicuous_publication' or consent_source_url is not null);

-- An undated consent cannot be aged out of an EBR window and cannot be defended.
alter table crm.contact_medium drop constraint if exists contact_medium_consent_dated;
alter table crm.contact_medium add constraint contact_medium_consent_dated
  check (consent_basis = 'none' or consent_recorded_at is not null);

create index if not exists contact_medium_consent_basis_idx
  on crm.contact_medium (organization_id, consent_basis) where deleted_at is null;
create index if not exists contact_medium_consent_jurisdiction_idx
  on crm.contact_medium (organization_id, consent_jurisdiction) where deleted_at is null;
create index if not exists contact_medium_lane_a_eligible_idx
  on crm.contact_medium (organization_id, channel)
  where deleted_at is null and suppressed_at is null and unsubscribed_at is null
    and consent_basis in ('express','soft_opt_in');

-- ══════════════════════════════ 3. THE LANE, THE POSTAL ADDRESS, THE LIA
-- Handoff s.5.1: "Do not build a single send() with a lane boolean." The lane is
-- declared on the campaign, in DATA, and decides which sending path is reachable
-- and which contacts are eligible. Default cold_outreach: that lane never touches
-- our infrastructure, so it is the safe direction for existing rows.
alter table crm.outreach_list
  add column if not exists lane text not null default 'cold_outreach',
  add column if not exists lawful_basis text,
  add column if not exists lia_interest text,
  add column if not exists lia_necessity text,
  add column if not exists lia_balancing text,
  add column if not exists lia_completed_at timestamptz,
  add column if not exists lia_completed_by uuid references auth.users(id);

alter table crm.outreach_list drop constraint if exists outreach_list_lane_check;
alter table crm.outreach_list add constraint outreach_list_lane_check
  check (lane in ('cold_outreach','opt_in_marketing'));
alter table crm.outreach_list drop constraint if exists outreach_list_lawful_basis_check;
alter table crm.outreach_list add constraint outreach_list_lawful_basis_check
  check (lawful_basis is null or lawful_basis in ('consent','legitimate_interest'));
-- A half-filled LIA form must not read as a finished assessment.
alter table crm.outreach_list drop constraint if exists outreach_list_lia_complete;
alter table crm.outreach_list add constraint outreach_list_lia_complete
  check (lia_completed_at is null
    or (lia_interest is not null and lia_necessity is not null and lia_balancing is not null));

comment on column crm.outreach_list.lane is
  'cold_outreach (customer''s own mailbox, never our infrastructure) or opt_in_marketing (we send; per-recipient consent required). THE TWO-LANE LAW, enforced in data.';

create index if not exists outreach_list_lane_idx
  on crm.outreach_list (organization_id, lane) where deleted_at is null;

-- CAN-SPAM s.7704(a)(5), CASL (>=60 days), Spam Act (>=30 days) all require the
-- SENDER's valid physical postal address in every commercial message. There was
-- nowhere to put one: iam.organizations has no address and crm.address is a
-- component of crm.party — the RECIPIENT's. Org default on sending_policy,
-- per-identity override so an agency carries the CLIENT's address.
alter table crm.sending_policy
  add column if not exists postal_name text,
  add column if not exists postal_line1 text,
  add column if not exists postal_line2 text,
  add column if not exists postal_city text,
  add column if not exists postal_region text,
  add column if not exists postal_code text,
  add column if not exists postal_country text,
  add column if not exists postal_verified_at timestamptz,
  add column if not exists privacy_notice_url text;

alter table crm.sending_policy drop constraint if exists sending_policy_postal_country_iso2;
alter table crm.sending_policy add constraint sending_policy_postal_country_iso2
  check (postal_country is null or postal_country ~ '^[A-Z]{2}$');

alter table crm.sending_identity
  add column if not exists postal_name text,
  add column if not exists postal_line1 text,
  add column if not exists postal_line2 text,
  add column if not exists postal_city text,
  add column if not exists postal_region text,
  add column if not exists postal_code text,
  add column if not exists postal_country text,
  add column if not exists domain_registered_at timestamptz,
  add column if not exists domain_age_checked_at timestamptz;

alter table crm.sending_identity drop constraint if exists sending_identity_postal_country_iso2;
alter table crm.sending_identity add constraint sending_identity_postal_country_iso2
  check (postal_country is null or postal_country ~ '^[A-Z]{2}$');

comment on column crm.sending_policy.postal_line1 is
  'ORG DEFAULT physical postal address for every commercial message footer. Legally required by CAN-SPAM, CASL and the Australian Spam Act.';

-- ── AUP acceptance. Evidence, therefore append-only.
create table if not exists crm.outreach_acceptance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id),
  lane text not null check (lane in ('cold_outreach','opt_in_marketing')),
  policy_version text not null,
  accepted_at timestamptz not null default now(),
  accepted_by uuid not null references auth.users(id),
  accepted_text text not null,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists outreach_acceptance_current_key
  on crm.outreach_acceptance (organization_id, lane, policy_version);
create index if not exists outreach_acceptance_org_idx
  on crm.outreach_acceptance (organization_id, lane, accepted_at desc);

alter table crm.outreach_acceptance enable row level security;
drop policy if exists outreach_acceptance_select on crm.outreach_acceptance;
create policy outreach_acceptance_select on crm.outreach_acceptance
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists outreach_acceptance_insert on crm.outreach_acceptance;
create policy outreach_acceptance_insert on crm.outreach_acceptance
  for insert to authenticated
  with check (public.is_org_member(organization_id) and accepted_by = auth.uid());
grant select, insert on crm.outreach_acceptance to authenticated;
revoke update, delete on crm.outreach_acceptance from authenticated;
grant select, insert, update, delete on crm.outreach_acceptance to service_role;

drop trigger if exists _touch_row on crm.outreach_acceptance;
create trigger _touch_row before insert or update on crm.outreach_acceptance
  for each row execute function platform._touch_row();

-- ═══════════════════════════════════ 4. THE UNSUBSCRIBE MACHINERY (GAP-1)
-- Required by every regime; existed in no form. CAN-SPAM >=30 days / <=10 bus.
-- days; CASL >=60 / <=10 bus. days; Australia >=30 / <=5 bus. days; Yahoo <=2
-- days; RFC 8058 one click with NO confirmation step.
-- We honor INSTANTLY, which satisfies all of them. Tokens NEVER expire.

create table if not exists crm.unsubscribe_token (
  -- The raw address must NEVER appear in an unsubscribe URL: those end up in
  -- logs, referrers and proxies.
  token text primary key check (length(token) >= 32),
  contact_medium_id uuid not null references crm.contact_medium(id) on delete cascade,
  outreach_list_id uuid references crm.outreach_list(id) on delete set null,
  party_id uuid references crm.party(id) on delete set null,
  organization_id uuid not null references iam.organizations(id),
  sending_identity_id uuid references crm.sending_identity(id) on delete set null,
  issued_at timestamptz not null default now(),
  -- Kept after use so a repeated one-click POST is idempotent, not a 404.
  used_at timestamptz,
  use_count integer not null default 0,
  last_user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table crm.unsubscribe_token is
  'One permanent opaque token per (contact_medium, outreach_list). Resolves an anonymous unsubscribe to a suppression write with no session and no email address in the URL. NEVER expire these — a dead unsubscribe link is a statutory violation in four jurisdictions.';

create unique index if not exists unsubscribe_token_medium_list_key
  on crm.unsubscribe_token (contact_medium_id,
    coalesce(outreach_list_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists unsubscribe_token_medium_idx on crm.unsubscribe_token (contact_medium_id);
create index if not exists unsubscribe_token_org_idx on crm.unsubscribe_token (organization_id, issued_at desc);

alter table crm.unsubscribe_token enable row level security;
-- A table anon can select is a table anon can enumerate. The only ways in are
-- the SECURITY DEFINER RPCs below.
drop policy if exists unsubscribe_token_select on crm.unsubscribe_token;
create policy unsubscribe_token_select on crm.unsubscribe_token
  for select to authenticated using (public.is_org_member(organization_id));
revoke all on crm.unsubscribe_token from anon;
grant select on crm.unsubscribe_token to authenticated;
grant select, insert, update, delete on crm.unsubscribe_token to service_role;

drop trigger if exists _touch_row on crm.unsubscribe_token;
create trigger _touch_row before insert or update on crm.unsubscribe_token
  for each row execute function platform._touch_row();

-- Idempotent: the same (medium, list) always yields the same token, so a
-- follow-up carries the link the recipient may already hold.
-- NOTE pgcrypto lives in the `extensions` schema here and this function pins
-- search_path (correctly, for a definer) — hence the qualified call.
create or replace function crm.issue_unsubscribe_token(
  p_contact_medium_id uuid,
  p_outreach_list_id uuid default null,
  p_sending_identity_id uuid default null
) returns text
language plpgsql security definer set search_path = crm, public, pg_temp as $fn$
declare
  v_token text; v_org uuid; v_party uuid;
begin
  select organization_id into v_org from crm.contact_medium where id = p_contact_medium_id;
  if v_org is null then
    raise exception 'unsubscribe token: contact medium % not found', p_contact_medium_id
      using errcode = 'no_data_found';
  end if;

  select token into v_token from crm.unsubscribe_token
   where contact_medium_id = p_contact_medium_id
     and coalesce(outreach_list_id,'00000000-0000-0000-0000-000000000000'::uuid)
       = coalesce(p_outreach_list_id,'00000000-0000-0000-0000-000000000000'::uuid);
  if v_token is not null then return v_token; end if;

  select pcp.party_id into v_party from crm.party_contact_point pcp
   where pcp.medium_id = p_contact_medium_id and pcp.deleted_at is null
   order by pcp.is_primary desc nulls last, pcp.created_at asc limit 1;

  v_token := replace(replace(replace(
    encode(extensions.gen_random_bytes(32),'base64'), '+','-'), '/','_'), '=','');

  insert into crm.unsubscribe_token
    (token, contact_medium_id, outreach_list_id, party_id, organization_id, sending_identity_id)
  values (v_token, p_contact_medium_id, p_outreach_list_id, v_party, v_org, p_sending_identity_id)
  on conflict (contact_medium_id, coalesce(outreach_list_id,'00000000-0000-0000-0000-000000000000'::uuid))
    do update set updated_at = now()
  returning token into v_token;

  return v_token;
end $fn$;

grant execute on function crm.issue_unsubscribe_token(uuid, uuid, uuid) to authenticated, service_role;

-- THE ONE-CLICK POST (RFC 8058). Anonymous by design; the recipient has no
-- account and requiring one would make the mechanism non-functional and
-- therefore unlawful. Idempotent: providers retry.
-- crm.contact_medium.is_contactable is GENERATED and already folds in
-- unsubscribed_at — writing it is both illegal and unnecessary.
create or replace function public.outreach_unsubscribe(
  p_token text, p_user_agent text default null, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = crm, public, pg_temp as $fn$
declare
  t crm.unsubscribe_token; v_already boolean := false; v_org_name text;
begin
  if p_token is null or length(p_token) < 32 then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into t from crm.unsubscribe_token where token = p_token;
  if t.token is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  select o.name into v_org_name from iam.organizations o where o.id = t.organization_id;
  select (cm.unsubscribed_at is not null) into v_already
    from crm.contact_medium cm where cm.id = t.contact_medium_id;

  -- THE WRITE. crm.contact_medium is the ONE suppression authority: an
  -- unsubscribe stops EVERY channel and EVERY campaign, not only the list the
  -- link arrived on. Never time-limited.
  update crm.contact_medium
     set unsubscribed_at = coalesce(unsubscribed_at, now()),
         suppressed_at   = coalesce(suppressed_at, now()),
         suppression_reason = coalesce(suppression_reason, 'unsubscribe'),
         suppression_expires_at = null
   where id = t.contact_medium_id;

  update crm.unsubscribe_token
     set used_at = coalesce(used_at, now()),
         use_count = use_count + 1,
         last_user_agent = coalesce(p_user_agent, last_user_agent)
   where token = p_token;

  -- Audit only on FIRST use, so a retried POST cannot inflate the health numbers
  -- the circuit breaker reads.
  if not v_already and t.sending_identity_id is not null then
    insert into crm.sending_event
      (identity_id, event_kind, party_id, medium_id, outreach_list_id,
       to_address_key, actor_kind, organization_id, detail)
    select t.sending_identity_id, 'unsubscribed', t.party_id, t.contact_medium_id,
           t.outreach_list_id, cm.value_key, 'system', t.organization_id,
           jsonb_build_object('via','one_click','reason',p_reason)
      from crm.contact_medium cm where cm.id = t.contact_medium_id;
  end if;

  return jsonb_build_object('ok', true, 'already_unsubscribed', v_already,
    'organization_name', v_org_name);
end $fn$;

-- What the browser GET renders. Returns NO raw address — a leaked token must not
-- become a disclosed email address.
create or replace function public.outreach_unsubscribe_preview(p_token text)
returns jsonb
language plpgsql security definer set search_path = crm, public, pg_temp as $fn$
declare
  t crm.unsubscribe_token;
  v_org_name text; v_masked text; v_already boolean; v_list text;
begin
  if p_token is null or length(p_token) < 32 then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;
  select * into t from crm.unsubscribe_token where token = p_token;
  if t.token is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  select o.name into v_org_name from iam.organizations o where o.id = t.organization_id;
  select ol.name into v_list from crm.outreach_list ol where ol.id = t.outreach_list_id;
  select cm.unsubscribed_at is not null,
         left(cm.value_key,1) || '***@' || split_part(cm.value_key,'@',2)
    into v_already, v_masked
    from crm.contact_medium cm where cm.id = t.contact_medium_id;

  return jsonb_build_object('ok', true, 'organization_name', v_org_name,
    'list_name', v_list, 'masked_address', v_masked, 'already_unsubscribed', v_already);
end $fn$;

revoke all on function public.outreach_unsubscribe(text, text, text) from public;
revoke all on function public.outreach_unsubscribe_preview(text) from public;
grant execute on function public.outreach_unsubscribe(text, text, text) to anon, authenticated, service_role;
grant execute on function public.outreach_unsubscribe_preview(text) to anon, authenticated, service_role;

-- ══════════════════════════════════ 5. JURISDICTION RESOLUTION + THE GATE
-- The law that applies is the RECIPIENT's. Resolving it is genuinely imperfect —
-- a .com says nothing — so this returns CONFIDENCE and METHOD, and the gate
-- refuses on unresolved rather than guessing. Silently guessing "probably US" is
-- how a campaign lands in Germany.
create or replace function crm.resolve_recipient_jurisdiction(p_medium_id uuid)
returns table (country_code text, confidence text, method text)
language plpgsql stable security definer set search_path = crm, public, pg_temp as $fn$
declare
  v_cm crm.contact_medium; v_country text; v_domain text; v_tld text;
begin
  select * into v_cm from crm.contact_medium where id = p_medium_id;
  if v_cm.id is null then
    return query select null::text, 'none'::text, 'medium_not_found'::text; return;
  end if;

  -- 1. Recorded at consent capture — the only high-confidence source.
  if v_cm.consent_jurisdiction is not null then
    return query select v_cm.consent_jurisdiction, 'high'::text, 'consent_jurisdiction'::text; return;
  end if;

  -- 2. A structured postal address on a party using this medium.
  select a.country_code into v_country
    from crm.party_contact_point pcp
    join crm.address a on a.party_id = pcp.party_id and a.deleted_at is null
   where pcp.medium_id = p_medium_id and pcp.deleted_at is null
     and a.country_code is not null
   order by a.is_primary desc nulls last, a.created_at asc limit 1;
  if v_country is not null then
    return query select upper(v_country), 'high'::text, 'party_address'::text; return;
  end if;

  -- 3. ccTLD. Evidence of where the ORGANISATION presents itself, not where the
  --    human sits — medium confidence at best.
  v_domain := lower(split_part(v_cm.value_key, '@', 2));
  if v_domain <> '' then
    v_tld := reverse(split_part(reverse(v_domain), '.', 1));
    v_country := case v_tld
      when 'de' then 'DE' when 'at' then 'AT' when 'fr' then 'FR'
      when 'uk' then 'GB' when 'ca' then 'CA' when 'au' then 'AU'
      when 'be' then 'BE' when 'bg' then 'BG' when 'hr' then 'HR'
      when 'cy' then 'CY' when 'cz' then 'CZ' when 'dk' then 'DK'
      when 'ee' then 'EE' when 'fi' then 'FI' when 'gr' then 'GR'
      when 'hu' then 'HU' when 'ie' then 'IE' when 'it' then 'IT'
      when 'lv' then 'LV' when 'lt' then 'LT' when 'lu' then 'LU'
      when 'mt' then 'MT' when 'nl' then 'NL' when 'pl' then 'PL'
      when 'pt' then 'PT' when 'ro' then 'RO' when 'sk' then 'SK'
      when 'si' then 'SI' when 'es' then 'ES' when 'se' then 'SE'
      when 'is' then 'IS' when 'li' then 'LI' when 'no' then 'NO'
      when 'ch' then 'CH' when 'us' then 'US'
      -- .com/.org/.net/.io/.ai/.co say NOTHING.
      else null end;
    if v_country is not null then
      return query select v_country, 'medium'::text, 'cctld'::text; return;
    end if;
  end if;

  -- 4. Nothing. NOT "probably the US".
  return query select null::text, 'none'::text, 'unresolved'::text;
end $fn$;

grant execute on function crm.resolve_recipient_jurisdiction(uuid) to authenticated, service_role;

comment on function crm.resolve_recipient_jurisdiction(uuid) is
  'Best-effort recipient country with an honest confidence. A generic TLD resolves to NULL, never a default country. The send gate refuses on unresolved rather than assuming.';

-- 🚨 THE ONE SEND AUTHORITY. Returns a VERDICT, never a boolean: every block
-- carries a code, a message our non-technical user can act on, and a fix. That
-- is handoff s.5.3b applied to refusal — a bare "not allowed" is a dead end.
create or replace function crm.check_send_eligibility(
  p_medium_id uuid, p_list_id uuid default null, p_identity_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = crm, public, pg_temp as $fn$
declare
  cm crm.contact_medium; ol crm.outreach_list; si crm.sending_identity;
  sp crm.sending_policy; jp crm.jurisdiction_policy;
  v_country text; v_conf text; v_method text;
  v_lane text := 'cold_outreach';
  blocks jsonb := '[]'::jsonb; warns jsonb := '[]'::jsonb;
  v_postal_ok boolean; v_accepted boolean;
begin
  select * into cm from crm.contact_medium where id = p_medium_id and deleted_at is null;
  if cm.id is null then
    return jsonb_build_object('allowed', false, 'blocks',
      jsonb_build_array(jsonb_build_object('code','medium_not_found',
        'message','That contact no longer exists.','fix','Refresh the list.')));
  end if;

  if p_list_id is not null then
    select * into ol from crm.outreach_list where id = p_list_id and deleted_at is null;
    v_lane := coalesce(ol.lane, 'cold_outreach');
  end if;
  if p_identity_id is not null then
    select * into si from crm.sending_identity where id = p_identity_id and deleted_at is null;
  end if;
  select * into sp from crm.sending_policy
   where organization_id = cm.organization_id and deleted_at is null limit 1;

  select r.country_code, r.confidence, r.method into v_country, v_conf, v_method
    from crm.resolve_recipient_jurisdiction(p_medium_id) r;
  if v_country is not null then
    select * into jp from crm.jurisdiction_policy where country_code = v_country and is_active;
  end if;

  -- 0. kill switch
  if sp.id is not null and sp.outreach_enabled is false then
    blocks := blocks || jsonb_build_object('code','org_outreach_disabled',
      'message','Sending is turned off for this organization.',
      'fix', coalesce(sp.disabled_reason,'Contact support to re-enable it.'));
  end if;

  -- 1. suppression — first among recipient reasons, because an opt-out outranks
  --    every other consideration in every lane.
  if cm.unsubscribed_at is not null then
    blocks := blocks || jsonb_build_object('code','unsubscribed',
      'message','This person asked to stop receiving email. That is permanent.',
      'fix','Nothing — only they can reverse it.');
  end if;
  if cm.complaint_at is not null then
    blocks := blocks || jsonb_build_object('code','complained',
      'message','This person marked earlier email as spam.',
      'fix','Nothing — do not contact them again.');
  end if;
  if cm.suppressed_at is not null and cm.unsubscribed_at is null then
    blocks := blocks || jsonb_build_object('code','suppressed',
      'message','This address is on your suppression list.',
      'fix', coalesce(cm.suppression_reason,'Remove the suppression if it was a mistake.'));
  end if;
  if cm.dnc_state = 'listed' then
    blocks := blocks || jsonb_build_object('code','dnc_listed',
      'message','This contact is on a do-not-contact register.','fix','Nothing.');
  end if;
  if cm.bounce_type in ('hard','block','complaint') then
    blocks := blocks || jsonb_build_object('code','hard_bounced',
      'message','Mail to this address permanently failed before.',
      'fix','Find a current address for this person.');
  end if;

  -- 2. verification (handoff s.5.3: never send to an address we have not verified)
  if cm.verification_status = 'invalid' then
    blocks := blocks || jsonb_build_object('code','address_invalid',
      'message','This address is not deliverable.','fix','Find a current address.');
  elsif cm.verification_status = 'unverified' then
    blocks := blocks || jsonb_build_object('code','address_unverified',
      'message','We have not checked yet whether this address is real.',
      'fix','Run verification on this list — we do it for you.');
  elsif cm.verification_status = 'risky' then
    warns := warns || jsonb_build_object('code','address_risky',
      'message','This address looks risky (catch-all or disposable domain).');
  end if;

  -- 3. THE LANE
  if v_lane = 'opt_in_marketing' then
    if cm.consent_basis not in ('express','soft_opt_in') then
      blocks := blocks || jsonb_build_object('code','no_consent_record',
        'message','This person has no record of asking to hear from you, so they cannot be included in a marketing campaign.',
        'fix','Move them to an outreach campaign, or collect consent first.');
    elsif cm.consent_expires_at is not null and cm.consent_expires_at < now() then
      blocks := blocks || jsonb_build_object('code','consent_expired',
        'message','Their permission has run out.','fix','Ask them to opt in again.');
    end if;
  else
    if v_country is null then
      blocks := blocks || jsonb_build_object('code','jurisdiction_unresolved',
        'message','We cannot tell which country this person is in, and the rules depend on it.',
        'fix','Set the country on this contact, or remove them from the campaign.');
    elsif jp.country_code is null then
      blocks := blocks || jsonb_build_object('code','jurisdiction_unknown',
        'message', 'We have not confirmed the rules for ' || v_country || ' yet.',
        'fix','Remove recipients in this country until we have.');
    elsif jp.cold_b2b = 'prohibited' then
      blocks := blocks || jsonb_build_object('code','jurisdiction_prohibited',
        'message', jp.country_name || ' requires permission BEFORE you write, even for business email.',
        'fix','Remove recipients in ' || jp.country_name || ', or get their permission first.');
    elsif jp.cold_b2b = 'unknown' then
      blocks := blocks || jsonb_build_object('code','jurisdiction_unknown',
        'message', 'We have not confirmed the rules for ' || jp.country_name || ' yet, so we will not send there.',
        'fix','Remove recipients in ' || jp.country_name || '.');
    elsif jp.cold_b2b = 'conditional' then
      -- Conditional means a real condition that must be MET, not acknowledged.
      if jp.requires_role_relevance
         and cm.consent_basis not in ('conspicuous_publication','legitimate_interest','express','implied_ebr','implied_inquiry') then
        blocks := blocks || jsonb_build_object('code','role_relevance_unproven',
          'message', jp.country_name || ' only allows this if the message relates to what this person does at work, and we have no record of why you picked them.',
          'fix','Record where you found this contact and why the message fits their role.');
      end if;
      if jp.distinguishes_subscriber_kind and cm.subscriber_kind = 'individual' then
        blocks := blocks || jsonb_build_object('code','individual_subscriber',
          'message', jp.country_name || ' treats sole traders and individuals differently from companies, and this contact is marked as an individual.',
          'fix','Only contact them with their permission.');
      elsif jp.distinguishes_subscriber_kind and cm.subscriber_kind = 'unknown' then
        warns := warns || jsonb_build_object('code','subscriber_kind_unknown',
          'message', jp.country_name || ': confirm this is a company, not a sole trader.');
      end if;
    end if;

    -- GDPR art. 14
    if jp.requires_source_disclosure and cm.consent_source_url is null and cm.consent_source is null then
      blocks := blocks || jsonb_build_object('code','source_undisclosed',
        'message','In this country you must tell people where you got their details, and we have no record of where this came from.',
        'fix','Record the page you found this contact on.');
    end if;

    -- The LIA, where legitimate interest is the basis relied on.
    if jp.region in ('EEA','UK') and p_list_id is not null
       and coalesce(ol.lawful_basis,'legitimate_interest') = 'legitimate_interest'
       and ol.lia_completed_at is null then
      blocks := blocks || jsonb_build_object('code','lia_missing',
        'message','Before contacting people in Europe you need to write down why this outreach is fair to them.',
        'fix','Complete the short assessment on this campaign — we draft it for you.');
    end if;
  end if;

  if v_conf = 'medium' then
    warns := warns || jsonb_build_object('code','jurisdiction_inferred',
      'message','Country guessed from the email domain (' || v_method || '). Confirm it.');
  end if;

  -- 4. THE SENDER
  if p_identity_id is not null then
    if si.id is null then
      blocks := blocks || jsonb_build_object('code','identity_not_found',
        'message','That sending mailbox no longer exists.','fix','Pick another mailbox.');
    else
      if si.status <> 'ready' then
        blocks := blocks || jsonb_build_object('code','identity_not_ready',
          'message', case si.status
            when 'warming' then 'This mailbox is still warming up. It cannot run a campaign yet.'
            when 'paused'  then 'This mailbox is paused: ' || coalesce(si.pause_reason,'health check failed') || '.'
            when 'draft'   then 'This mailbox has not finished setup.'
            when 'verifying' then 'We are still checking this mailbox.'
            else 'This mailbox is disabled.' end,
          'fix', case si.status
            when 'warming' then 'Wait for warmup to finish, or use a mailbox that is ready.'
            when 'paused'  then 'A person on our team reviews this before it turns back on.'
            else 'Finish setting up this mailbox.' end);
      end if;
      if si.domain_verified_at is null then
        blocks := blocks || jsonb_build_object('code','domain_unverified',
          'message','You have not proven you own this domain yet.',
          'fix','Add the DNS record we generated for you — we check it automatically.');
      end if;
      if si.spf_pass is not true or si.dkim_pass is not true or si.dmarc_pass is not true then
        blocks := blocks || jsonb_build_object('code','authentication_failing',
          'message','Your email is not set up to prove it is really from you, so most of it will be thrown away before anyone sees it.',
          'fix','Open the setup checklist — we show you the exact records to add.');
      end if;
      -- V-5 (Outreach): people reply to people, not to sales@.
      if split_part(si.from_address_key,'@',1) in
         ('info','sales','hello','contact','support','admin','noreply','no-reply','marketing','team','office') then
        blocks := blocks || jsonb_build_object('code','role_sender_address',
          'message','You cannot send outreach from a shared address like ' || split_part(si.from_address_key,'@',1) || '@.',
          'fix','Send from your own named address.');
      end if;
      -- V-6 (Instantly, lemlist): a brand-new domain sending cold is a spam signal.
      if si.domain_registered_at is not null and si.domain_registered_at > now() - interval '30 days' then
        blocks := blocks || jsonb_build_object('code','domain_too_new',
          'message','This domain is less than a month old. Sending from it now would get it blocked.',
          'fix','Wait until the domain is at least 30 days old.');
      end if;
    end if;
  end if;

  -- 5. THE FOOTER — the cheapest possible hard gate.
  v_postal_ok := coalesce(nullif(si.postal_line1,''), nullif(sp.postal_line1,'')) is not null
             and coalesce(nullif(si.postal_country,''), nullif(sp.postal_country,'')) is not null;
  if not v_postal_ok then
    blocks := blocks || jsonb_build_object('code','no_postal_address',
      'message','Every marketing or outreach email must show a real postal address for your business. We do not have one.',
      'fix','Add your business address once — it goes in the footer automatically.');
  end if;

  -- 6. THE AGREEMENT
  select exists (select 1 from crm.outreach_acceptance oa
    where oa.organization_id = cm.organization_id and oa.lane = v_lane) into v_accepted;
  if not v_accepted then
    blocks := blocks || jsonb_build_object('code','aup_not_accepted',
      'message','Before your first send, someone in your organization needs to agree to the sending rules.',
      'fix','Read and accept the sending rules — it takes a minute.');
  end if;

  return jsonb_build_object(
    'allowed', jsonb_array_length(blocks) = 0,
    'lane', v_lane, 'blocks', blocks, 'warnings', warns,
    'resolved', jsonb_build_object(
      'jurisdiction', v_country, 'confidence', v_conf, 'method', v_method,
      'jurisdiction_verdict', jp.cold_b2b, 'jurisdiction_ratified', jp.ratified_at is not null,
      'consent_basis', cm.consent_basis, 'subscriber_kind', cm.subscriber_kind));
end $fn$;

grant execute on function crm.check_send_eligibility(uuid, uuid, uuid) to authenticated, service_role;

comment on function crm.check_send_eligibility(uuid, uuid, uuid) is
  '🚨 THE ONE SEND AUTHORITY. Every send path asks this and refuses on a block. Returns a verdict with per-block code + human message + fix, never a boolean. Never reimplement a check elsewhere — add it here.';

-- Client preview. Same authority, same answers — a preview that disagreed with
-- the gate would be worse than no preview.
create or replace function public.crm_check_send_eligibility(
  p_medium_id uuid, p_list_id uuid default null, p_identity_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = crm, public, pg_temp as $fn$
declare v_org uuid;
begin
  select organization_id into v_org from crm.contact_medium where id = p_medium_id;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return crm.check_send_eligibility(p_medium_id, p_list_id, p_identity_id);
end $fn$;

revoke all on function public.crm_check_send_eligibility(uuid, uuid, uuid) from public;
grant execute on function public.crm_check_send_eligibility(uuid, uuid, uuid) to authenticated, service_role;

-- ══════════════════════ 6. ROLLING HEALTH + THE CIRCUIT BREAKER (GAP-8)
-- crm_05 already had the right design (event table as source of truth, snapshot
-- on the identity, system-pauses/human-resumes with a constraint forcing a
-- reason). Missing was the thing that computes and the thing that trips.
--
-- THRESHOLDS ARE CONSTANTS, NOT CONFIG (CLAUDE.md: an env var is a VALUE, never
-- a TOGGLE). Google and Yahoo both treat 0.3% complaints as the failure line
-- with 0.1% as the target — our trip is 0.1%, because a rate measured at the
-- point it trips is already too late.
create or replace function crm.compute_sending_health(
  p_identity_id uuid, p_window interval default interval '7 days'
) returns jsonb
language sql stable security definer set search_path = crm, public, pg_temp as $fn$
  with e as (
    select event_kind, bounce_type from crm.sending_event
     where identity_id = p_identity_id and deleted_at is null
       and occurred_at >= now() - p_window
  ), c as (
    select
      count(*) filter (where event_kind = 'sent')        as sent,
      count(*) filter (where event_kind = 'delivered')   as delivered,
      count(*) filter (where event_kind = 'bounced')     as bounced,
      count(*) filter (where event_kind = 'bounced' and bounce_type in ('hard','block')) as hard_bounced,
      count(*) filter (where event_kind = 'complained')  as complained,
      count(*) filter (where event_kind = 'replied')     as replied,
      count(*) filter (where event_kind = 'unsubscribed')as unsubscribed,
      count(*) filter (where event_kind = 'failed')      as failed
    from e
  )
  select jsonb_build_object(
    'window_days', extract(epoch from p_window)/86400,
    'sent', sent, 'delivered', delivered, 'bounced', bounced,
    'hard_bounced', hard_bounced, 'complained', complained,
    'replied', replied, 'unsubscribed', unsubscribed, 'failed', failed,
    -- NULL below the minimum volume, never 0 — "no data" and "clean" are
    -- different facts, and collapsing them is how a breaker fails silent.
    'complaint_rate', case when sent >= 50 then round(complained::numeric / sent, 5) end,
    'bounce_rate',    case when sent >= 50 then round(bounced::numeric   / sent, 5) end,
    'hard_bounce_rate', case when sent >= 50 then round(hard_bounced::numeric / sent, 5) end,
    'reply_rate',     case when sent >= 50 then round(replied::numeric   / sent, 5) end,
    'computed_at', now())
  from c;
$fn$;

grant execute on function crm.compute_sending_health(uuid, interval) to authenticated, service_role;

create or replace function crm.sweep_sending_health(p_window interval default interval '7 days')
returns jsonb
language plpgsql security definer set search_path = crm, public, pg_temp as $fn$
declare
  COMPLAINT_TRIP constant numeric := 0.0010;  -- 0.10%  (Google/Yahoo line: 0.30%)
  BOUNCE_TRIP    constant numeric := 0.0300;  -- 3.00%
  r record; h jsonb; v_reason text; v_code text; v_days text;
  v_checked int := 0; v_paused int := 0; paused_ids jsonb := '[]'::jsonb;
begin
  v_days := trim(to_char(extract(epoch from p_window)/86400, 'FM999990.9'));
  v_days := rtrim(rtrim(v_days, '0'), '.');

  for r in
    select id, organization_id, display_name, from_address_key
      from crm.sending_identity
     where deleted_at is null and status in ('ready','warming')
  loop
    v_checked := v_checked + 1;
    h := crm.compute_sending_health(r.id, p_window);
    update crm.sending_identity set health = h, health_computed_at = now() where id = r.id;

    v_reason := null; v_code := null;
    if (h->>'complaint_rate') is not null
       and (h->>'complaint_rate')::numeric > COMPLAINT_TRIP then
      v_code := 'complaint_rate';
      v_reason := format('Too many people marked your email as spam: %s%% over the last %s days (the limit is %s%%).',
        trim(to_char((h->>'complaint_rate')::numeric * 100, 'FM990.999')), v_days,
        trim(to_char(COMPLAINT_TRIP * 100, 'FM990.999')));
    elsif (h->>'bounce_rate') is not null
       and (h->>'bounce_rate')::numeric > BOUNCE_TRIP then
      v_code := 'bounce_rate';
      v_reason := format('Too many messages could not be delivered: %s%% over the last %s days (the limit is %s%%).',
        trim(to_char((h->>'bounce_rate')::numeric * 100, 'FM990.99')), v_days,
        trim(to_char(BOUNCE_TRIP * 100, 'FM990.99')));
    end if;

    if v_reason is not null then
      -- THE SYSTEM PAUSES; A HUMAN RESUMES. Never the reverse.
      update crm.sending_identity
         set status = 'paused', status_changed_at = now(), paused_at = now(),
             paused_by_kind = 'system', pause_reason = v_reason, pause_code = v_code
       where id = r.id and status <> 'paused';

      -- The breaker pauses the identity AND ITS CAMPAIGNS. Pausing the mailbox
      -- but leaving the campaign live is how a "paused" system keeps sending.
      update crm.outreach_list
         set paused_at = now(), paused_by_kind = 'system',
             pause_reason = 'Sending paused. ' || v_reason
       where sending_identity_id = r.id and deleted_at is null and paused_at is null;

      v_paused := v_paused + 1;
      paused_ids := paused_ids || jsonb_build_object(
        'identity_id', r.id, 'address', r.from_address_key,
        'organization_id', r.organization_id, 'code', v_code, 'reason', v_reason);
    end if;
  end loop;

  return jsonb_build_object('checked', v_checked, 'paused', v_paused,
    'paused_identities', paused_ids, 'swept_at', now(),
    'thresholds', jsonb_build_object('complaint_rate', COMPLAINT_TRIP, 'bounce_rate', BOUNCE_TRIP));
end $fn$;

revoke all on function crm.sweep_sending_health(interval) from public;
grant execute on function crm.sweep_sending_health(interval) to service_role;

comment on function crm.sweep_sending_health(interval) is
  'Circuit breaker. Recomputes rolling health for every live sending identity and PAUSES the identity and its campaigns when complaint rate > 0.10% or bounce rate > 3.00% (min 50 sends in window). The system pauses; only a human resumes. Host on aidream system_task_runner — never build a second scheduler.';

-- A system pause may only be lifted by a person, deliberately, with a note.
create or replace function public.crm_resume_sending_identity(
  p_identity_id uuid, p_note text default null
) returns jsonb
language plpgsql security definer set search_path = crm, public, pg_temp as $fn$
declare si crm.sending_identity;
begin
  select * into si from crm.sending_identity where id = p_identity_id and deleted_at is null;
  if si.id is null then raise exception 'sending identity not found' using errcode='no_data_found'; end if;
  if not public.is_org_admin(si.organization_id) then
    raise exception 'only an organization admin can resume a paused mailbox' using errcode='42501';
  end if;
  if si.status <> 'paused' then
    return jsonb_build_object('ok', false, 'error', 'not_paused', 'status', si.status);
  end if;

  update crm.sending_identity
     set status = case when warmup_completed_at is null and warmup_started_at is not null
                       then 'warming' else 'ready' end,
         status_changed_at = now(), resumed_at = now(), resumed_by = auth.uid(),
         paused_at = null, paused_by_kind = null, pause_reason = null, pause_code = null
   where id = p_identity_id;

  update crm.outreach_list
     set paused_at = null, paused_by_kind = null, pause_reason = null
   where sending_identity_id = p_identity_id and paused_by_kind = 'system' and deleted_at is null;

  insert into crm.sending_identity_check (identity_id, check_kind, passed, message, organization_id, observed)
  values (p_identity_id, 'connection', true,
          coalesce('Resumed by a human. ' || p_note, 'Resumed by a human.'),
          si.organization_id, jsonb_build_object('previous_pause_reason', si.pause_reason));

  return jsonb_build_object('ok', true, 'identity_id', p_identity_id);
end $fn$;

revoke all on function public.crm_resume_sending_identity(uuid, text) from public;
grant execute on function public.crm_resume_sending_identity(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
