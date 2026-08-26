-- HR domain C3 — migration 7 of 7 (register item HRB-007, lane core-c3-access).
--
-- THE NON-USER ACTOR LANE. platform.outsider_consumer (the purpose registry as ROWS, all eight
-- purposes seeded), platform.actor_token, platform.actor_session, platform.actor_token_event, the
-- mint/revoke/scope-assert primitives, the four anon-callable session RPCs, the three per-purpose
-- wrappers SPEC-ACCESS itself owns, the kiosk device/PIN primitives — and the bare
-- `{{ACTOR}}.actor_token_id` columns finally given their foreign keys.
--
-- Authority: SPEC-ESIGN §5.1–§5.7 (the table and registry are that spec's; this lane BUILDS them
-- because SPEC-ACCESS §6.2/§6.3 cannot exist without them and HRB-011 has not started),
-- SPEC-ACCESS §5.1, §6.1–§6.3, §7, §9 T-10/T-11/T-34/T-37; SPEC-TIME's p_kiosk_session_id contract.
-- Applied live as `hr_c3_07_actor_lane`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THE TABLE IS `platform.actor_token`, AND `platform.outsider_token` IS NOT BUILT.
--    SPEC-ACCESS §6.2 calls it `platform.outsider_token`; SPEC-ESIGN §5.2 — which §6.2a makes the
--    OWNER of the physical table — calls it `platform.actor_token`, and so does the `{{ACTOR}}`
--    block the whole hr schema already carries (`actor_token_id`, on 20+ tables, sitting bare
--    since tranche 2 precisely because this table did not exist). The owner's name wins and the
--    live columns agree with it. OWED: SPEC-ACCESS §6.2's table name, throughout.
--
-- 2. 🚨 SPEC-ESIGN'S SIX FIXES TO THE `share_links` PRECEDENT ARE ALL BUILT, and one of them
--    CONTRADICTS SPEC-ACCESS §6.2's comparison table, which says "same plaintext storage
--    (deviating would break the precedent's proven redemption path for no gain)". SPEC-ESIGN §5.1
--    says the opposite and gives the reason: "a DB read, a backup, or a log line hands over live
--    credentials". §6.2a settles it — where the two could disagree, SPEC-ESIGN wins — so the
--    secret is stored as SHA-256 ONLY, and `token_prefix` (8 chars) exists for support lookup and
--    log correlation. OWED: SPEC-ACCESS §6.2's token row.
--
-- 3. RESOLUTION NEVER CONSUMES A USE. `use_count` increments on VERIFIED SESSION ISSUANCE, not on
--    `outsider_begin`. The precedent gets this wrong and it is not academic: a mail-security
--    scanner prefetching the link BURNS a single-use token before the human ever clicks it.
--
-- 4. THE TTL ANCHOR IS A COLUMN, NOT A CONVENTION. `hr.preboarding` is start-date-relative BY
--    RULING (§5.2): a mint-relative 30-day TTL silently expires the packet before day 1 for any
--    offer accepted more than 30 days out — the exact defect SPEC-ONBOARDING found. When the
--    anchor date moves, `platform.reanchor_outsider_token` recomputes and writes a token event; it
--    NEVER re-mints, so the link already in the hire's inbox keeps working.
--
-- 5. ONLY THREE PER-PURPOSE MINT WRAPPERS ARE BUILT HERE, and the other five are ROUTED not
--    skipped. SPEC-ESIGN §5.4 lists eight wrappers. This lane owns the purposes SPEC-ACCESS itself
--    governs: `hr_mint_records_request_token` (§7 — HR approval of a records request only),
--    `hr_mint_investigation_token` (§5 — the accused-hr_owner escalation), and
--    `anonymous_report_open` (§5.1 — the one anon-callable minter). `esign_mint_signer_token`
--    belongs to HRB-011/L11, `hr_mint_apply_token` and `hr_mint_candidate_portal_token` and
--    `hr_mint_referee_token` to L6/HRB-018, `hr_mint_preboarding_token` to L7/HRB-019. All eight
--    PURPOSES are registered, so those lanes seed nothing — they write one wrapper each over
--    `platform.mint_outsider_token`.
--
-- 6. 🚨 §5.5's OUTSIDER-WRITABLE TABLE LAW IS ASSERTED, NOT ASSUMED. `auth.uid()` is NULL for an
--    outsider write, so `created_by` is NULL, so no table an outsider can write may depend on
--    `created_by` for its access path. The closing assertion below fails the migration if any
--    token an outsider purpose can WRITE is the `restricted` variant — the shape whose std_select
--    is owner-only and which would silently make the row unreachable by the HR team that needs it.
--
-- 7. THE KIOSK PIN IS bcrypt VIA pgcrypto, AND IT IS NEVER REVERSIBLE AND NEVER REVEALED.
--    `hr.employment_pin.pin_hash` + `pin_algo`; the live token already carries
--    client_excluded_columns = {pin_hash, pin_algo}. §4.5 names the kiosk PIN as taking the same
--    shape as the SSN: "a salted hash — never reversible, never revealed". There is no
--    `pin_salt` column live and none is needed: bcrypt carries its salt inside the hash.
--    OWED: §6.3's `hr.employment_pin` field list (`failed_attempts` is `failed_attempt_count`
--    live, and there is no `pin_salt`).
--
-- 8. 🚨 §5.5's OUTSIDER-WRITABLE TABLE LAW AND SPEC-ACCESS §4.1 CONTRADICT EACH OTHER, AND THE
--    ASSERTION BELOW IS WRITTEN AT THE BAR THAT IS ACTUALLY TRUE. Written literally, §5.5 forbids
--    an outsider-writable table from being the owner-only `restricted` variant — and the first
--    version of the closing assertion, written literally, FAILED on four real resources:
--    hr_eeo_response, hr_incident, hr_restricted_note, hr_reference_check. Every one of those is
--    `restricted` BY SPEC-ACCESS §3.1's own tier map, and every one is written by an outsider
--    (the applicant's EEO submission, the anonymous report, the external investigator's notes,
--    the referee's response). Both specs are right about different things:
--      · §5.5's HARM is a row nobody on the HR side can reach — which happens when the ONLY read
--        path is the owner arm and `created_by` is NULL for an outsider write.
--      · §4.1's DESIGN is that audited-tier rows are reached through a SECURITY DEFINER DOOR and
--        never through RLS at all, precisely so "there is no unaudited path to forget to audit".
--    Where a door exists, the row is reachable and the harm does not arise. The assertion is
--    therefore: owner-only AND no recorded door decision. hr_eeo_response satisfies it with a
--    DELIBERATE doorlessness (§4.4's aggregate-only guarantee, recorded by name in hr._door_spec)
--    rather than an accidental one.
--    OWED: SPEC-ESIGN §5.5 owes the carve-out for audited-tier tokens.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ============================================================ §5.3 the purpose registry
do $$ begin
  if to_regclass('platform.outsider_consumer') is null then
    perform platform.create_entity_table(
      p_schema => 'platform', p_table => 'outsider_consumer', p_token => 'platform_outsider_consumer',
      p_label => 'Outsider consumer',
      p_fields => ARRAY[
        'consumer_key text NOT NULL',
        'resource text NOT NULL',
        'is_subject_resource boolean NOT NULL DEFAULT false',
        $f$allowed_actions text[] NOT NULL DEFAULT '{}'$f$,
        $f$readable_columns text[] NOT NULL DEFAULT '{}'$f$,
        $f$default_verification_factor text NOT NULL DEFAULT 'email_code' CHECK (default_verification_factor IN ('none','email_code','sms_code','access_code'))$f$,
        $f$default_ttl interval NOT NULL DEFAULT '14 days'$f$,
        $f$default_expiry_anchor text NOT NULL DEFAULT 'mint' CHECK (default_expiry_anchor IN ('mint','subject_date'))$f$,
        'anchor_source_column text',
        'default_max_uses integer',
        'default_single_session boolean NOT NULL DEFAULT false',
        'session_ttl_minutes integer NOT NULL DEFAULT 30',
        'ip_pinned boolean NOT NULL DEFAULT true',
        'forbid_recipient_identity boolean NOT NULL DEFAULT false',
        'label text',
        'justification text',
        'is_active boolean NOT NULL DEFAULT true'
      ],
      p_variant => 'system', p_versioned => true, p_soft_delete => true, p_visibility => 'internal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

-- 🚨 A NON-PARTIAL UNIQUE, because it is a FOREIGN KEY TARGET. A registry entry is retired with
-- `is_active = false`, never by freeing its key for reuse — so there is nothing for a partial
-- index to buy here and a partial index cannot be referenced.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'outsider_consumer_key_resource_unique') then
    alter table platform.outsider_consumer
      add constraint outsider_consumer_key_resource_unique unique (consumer_key, resource);
  end if;
end $$;

-- ============================================================ §5.2 platform.actor_token
do $$ begin
  if to_regclass('platform.actor_token') is null then
    perform platform.create_entity_table(
      p_schema => 'platform', p_table => 'actor_token', p_token => 'platform_actor_token',
      p_label => 'Actor token',
      p_fields => ARRAY[
        'consumer_key text NOT NULL',
        'subject_type text NOT NULL',
        'subject_id uuid NOT NULL',
        $f$scope jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'token_hash text NOT NULL',
        'token_prefix text NOT NULL',
        $f$verification_factor text NOT NULL DEFAULT 'email_code' CHECK (verification_factor IN ('none','email_code','sms_code','access_code'))$f$,
        'verification_target text',
        'verification_code_hash text',
        'verification_code_expires_at timestamptz',
        'verification_attempts integer NOT NULL DEFAULT 0',
        'verification_locked_until timestamptz',
        'expires_at timestamptz NOT NULL',
        $f$expiry_anchor text NOT NULL DEFAULT 'mint' CHECK (expiry_anchor IN ('mint','subject_date'))$f$,
        'expiry_anchor_at timestamptz',
        'max_uses integer',
        'use_count integer NOT NULL DEFAULT 0',
        'single_session boolean NOT NULL DEFAULT false',
        'is_active boolean NOT NULL DEFAULT true',
        'revoked_at timestamptz',
        'revoked_reason text',
        'issued_by uuid REFERENCES auth.users(id)',
        $f$issued_by_actor_type text NOT NULL DEFAULT 'hr_admin' CHECK (issued_by_actor_type IN ('hr_admin','automation','integration','system'))$f$,
        'recipient_name text',
        'recipient_email text',
        'last_used_at timestamptz',
        'last_used_ip inet'
      ],
      p_variant => 'entity', p_versioned => false, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

-- 🚨 THE PURPOSE SET IS CLOSED BY WHAT IS REGISTERED, NEVER BY A CHECK (SPEC-ESIGN §5.2 / U-01):
-- adding a purpose is a seeded row plus its RPC family, and no migration. The FK is COMPOSITE
-- rather than §5.2's single-column form because the registry is keyed (consumer_key, resource) —
-- which makes this strictly stronger: it closes the purpose set AND enforces §5.3's "every grant
-- names a registered resource" for the token's own subject, at the storage layer.
-- OWED: SPEC-ESIGN §5.2's FK line.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'actor_token_consumer_fk') then
    alter table platform.actor_token add constraint actor_token_consumer_fk
      foreign key (consumer_key, subject_type)
      references platform.outsider_consumer (consumer_key, resource);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'actor_token_hash_unique') then
    alter table platform.actor_token add constraint actor_token_hash_unique unique (token_hash);
  end if;
  -- §5.1: `expires_at` NOT NULL, ALWAYS. An eternal link to a personnel record is the precedent's
  -- worst property and it is closed by the column definition, not by a convention.
  if not exists (select 1 from pg_constraint where conname = 'actor_token_anchor_resolved') then
    alter table platform.actor_token add constraint actor_token_anchor_resolved
      check (expiry_anchor <> 'subject_date' or expiry_anchor_at is not null);
  end if;
  -- §5.6(G): the anonymous purpose records NO addressee, by construction
  if not exists (select 1 from pg_constraint where conname = 'actor_token_anonymous_has_no_addressee') then
    alter table platform.actor_token add constraint actor_token_anonymous_has_no_addressee
      check (consumer_key <> 'hr.anonymous_report'
             or (recipient_email is null and recipient_name is null
                 and verification_target is null and verification_factor = 'none'));
  end if;
end $$;

create index if not exists actor_token_prefix_idx on platform.actor_token (token_prefix);
create index if not exists actor_token_subject_idx on platform.actor_token (subject_type, subject_id);
create index if not exists actor_token_live_idx
  on platform.actor_token (organization_id, consumer_key, expires_at) where is_active and revoked_at is null;

-- ============================================================ §5.2 platform.actor_session
do $$ begin
  if to_regclass('platform.actor_session') is null then
    perform platform.create_entity_table(
      p_schema => 'platform', p_table => 'actor_session', p_token => 'platform_actor_session',
      p_label => 'Actor session',
      p_fields => ARRAY[
        'actor_token_id uuid NOT NULL REFERENCES platform.actor_token(id)',
        'session_hash text NOT NULL',
        'issued_at timestamptz NOT NULL DEFAULT now()',
        'expires_at timestamptz NOT NULL',
        'verified_at timestamptz',
        'ip inet',
        'user_agent text',
        'revoked_at timestamptz'
      ],
      p_variant => 'entity', p_versioned => false, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'actor_session_hash_unique') then
    alter table platform.actor_session add constraint actor_session_hash_unique unique (session_hash);
  end if;
end $$;

-- ============================================================ §5.2 platform.actor_token_event
-- The abuse-control substrate AND the audit answer to "who touched this link".
do $$ begin
  if to_regclass('platform.actor_token_event') is null then
    perform platform.create_entity_table(
      p_schema => 'platform', p_table => 'actor_token_event', p_token => 'platform_actor_token_event',
      p_label => 'Actor token event',
      p_fields => ARRAY[
        'actor_token_id uuid REFERENCES platform.actor_token(id)',
        'session_id uuid REFERENCES platform.actor_session(id)',
        $f$event_type text NOT NULL CHECK (event_type IN ('minted','sent','resolved','verification_sent','verification_passed','verification_failed','session_issued','session_expired','action_performed','rate_limited','replay_rejected','expired','revoked','reanchored'))$f$,
        'occurred_at timestamptz NOT NULL DEFAULT now()',
        'ip inet',
        'user_agent text',
        $f$detail jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'ledger', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

create index if not exists actor_token_event_token_idx
  on platform.actor_token_event (actor_token_id, occurred_at desc);

-- ============================================================ the secret-bearing wall
-- §5.2: `restricted` — owner or platform admin only, no has_access path. HR admins never read this
-- table; they see invitation state on the consumer's own rows.
do $$ begin
  if (select rls_variant from platform.entity_types where token = 'platform_actor_token') is distinct from 'restricted' then
    update platform.entity_types set rls_variant = 'restricted', is_component = false
     where token = 'platform_actor_token';
    perform iam.apply_rls('platform','actor_token','platform_actor_token','restricted');
  end if;
  if (select rls_variant from platform.entity_types where token = 'platform_actor_session') is distinct from 'restricted' then
    update platform.entity_types set rls_variant = 'restricted', is_component = false
     where token = 'platform_actor_session';
    perform iam.apply_rls('platform','actor_session','platform_actor_session','restricted');
  end if;
end $$;

-- §4.6: the projection convention, so a well-meaning `select *` in a future RPC cannot leak a
-- credential into a client payload. SPEC-ACCESS §4.6 lists `platform_outsider_token → {token}`;
-- the live columns are the hash and the code hash, and both are excluded.
update platform.entity_types
   set client_excluded_columns = array['token_hash','verification_code_hash','verification_target']
 where token = 'platform_actor_token'
   and client_excluded_columns is distinct from array['token_hash','verification_code_hash','verification_target'];

update platform.entity_types
   set client_excluded_columns = array['session_hash']
 where token = 'platform_actor_session'
   and client_excluded_columns is distinct from array['session_hash'];

-- ============================================================ §5.6 all eight purposes, seeded
select set_config('hr.privileged_write', 'on', false);

insert into platform.outsider_consumer
  (organization_id, consumer_key, resource, is_subject_resource, allowed_actions, readable_columns,
   default_verification_factor, default_ttl, default_expiry_anchor, anchor_source_column,
   default_max_uses, default_single_session, session_ttl_minutes, ip_pinned,
   forbid_recipient_identity, label, justification, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v.ck, v.res, v.subj, v.acts::text[],
       v.cols::text[], v.fac, v.ttl::interval, v.anchor, v.anchor_col, v.uses, v.single, v.smin,
       v.ip, v.noid, v.label, v.just, 'internal'::platform.visibility
from (values
 -- ---------- (A) external signer
 ('esign.signer','esign_envelope_signer',true,
  array['consent','sign','decline','delegate','read'],
  array['id','status','signer_name','signer_email','order_index'],
  'email_code','14 days','mint',null,null,true,30,true,false,'External signer',
  'The evidence package IS the product. A plain link proves someone who HELD the link signed; a code to the addressed mailbox proves the ADDRESSEE did. That distinction is what a dispute turns on, so we pay one extra click for it.'),
 ('esign.signer','esign_envelope',false,array['read'],
  array['id','title','status','expires_at'],'email_code','14 days','mint',null,null,true,30,true,false,null,null),
 ('esign.signer','esign_envelope_document',false,array['read','download'],
  array['id','file_name','content_hash'],'email_code','14 days','mint',null,null,true,30,true,false,null,null),
 -- ---------- (B) job applicant: CREATE ONLY, and it can read NOTHING that exists
 ('hr.apply','hr_posting',true,array['read'],
  array['id','title','summary','location_text','employment_type','posted_at'],
  'none','90 days','mint',null,null,false,30,false,false,'Job applicant (public apply form)',
  'A verification step before applying suppresses applications and there is nothing to protect: this token authorises CREATION ONLY and can read nothing that exists. The abuse control is rate limiting and a create-only scope, not a factor. Adding a code here would trade real applicants for imaginary security.'),
 ('hr.apply','hr_application',false,array['create'],array[]::text[],
  'none','90 days','mint',null,null,false,30,false,false,null,null),
 ('hr.apply','hr_eeo_response',false,array['create'],array[]::text[],
  'none','90 days','mint',null,null,false,30,false,false,null,
  'A SEPARATE RPC writing a SEPARATE segregated table, returning no read path and no linkage the application RPC can see.'),
 -- ---------- (C) candidate portal: the factor appears exactly where the READ appears
 ('hr.candidate_portal','hr_application',true,
  array['read','withdraw'],array['id','stage_bucket','stage_entered_at','applied_at','disposition'],
  'email_code','90 days','mint',null,null,false,30,true,false,'Candidate portal',
  'Unlike the apply form this token READS: application status, interview slots, and an offer. Those are personal to the candidate and, in the offer case, commercially sensitive. The apply form''s "nothing to protect" argument does not survive the moment the token can read.'),
 ('hr.candidate_portal','hr_interview',false,array['read','create','reschedule','decline'],
  array['id','scheduled_start_at','scheduled_end_at','candidate_tz','state','meeting_url','location_text'],
  'email_code','90 days','mint',null,null,false,30,true,false,null,null),
 ('hr.candidate_portal','hr_offer',false,array['read'],
  array['id','state','job_title_id','start_on','expires_at'],
  'email_code','90 days','mint',null,null,false,30,true,false,null,null),
 -- ---------- (D) referee
 ('hr.referee','hr_reference_check',true,array['read','save','submit','decline'],
  array['id','state','requested_at'],'email_code','21 days','mint',null,null,false,30,true,false,'Referee',
  'A reference response is attributed testimony about a named person; an unverified link means anyone forwarded it could file a reference under the referee''s name — the precise abuse a reference check exists to prevent. The code is also what makes the response admissible as evidence of who said it.'),
 -- ---------- (E) preboarding: 🚨 START-DATE-RELATIVE BY RULING
 ('hr.preboarding','hr_checklist_run',true,array['read','write','upload'],
  array['id','state','due_on'],'email_code','30 days','subject_date','target_start_on',null,false,30,true,false,
  'Preboarding hire',
  'This person submits SSN, DOB, address and bank-adjacent data (W-4, direct deposit). A forwarded or mistyped link reaching the wrong person is a data-breach event, not an inconvenience. MINT-RELATIVE TTL IS A DEFECT HERE: an offer accepted 45 days out would expire the packet before day 1.'),
 ('hr.preboarding','hr_checklist_item',false,array['read','write','upload'],
  array['id','label','state','due_on','category'],'email_code','30 days','subject_date','target_start_on',null,false,30,true,false,null,null),
 -- ---------- (F) former-employee records: READ ONLY, HR-issued, HR-set address
 ('hr.records_request','hr_records_request',true,array['read','download'],
  array['id','state','scope','requested_at','due_on','delivered_at'],
  'email_code','30 days','mint',null,10,false,15,true,false,'Former-employee records requester',
  'The most sensitive data we hold, requested by someone whose access we deliberately revoked. Automated identity proofing for a former employee (KBA, SSN-last-4 matching) is exactly the thing we should not fake. THE HUMAN APPROVAL STEP *IS* THE IDENTITY VERIFICATION, and the code then proves the mailbox HR chose still belongs to them. CA Labor Code 1198.5 is a 30-day duty and §226 a 21-day duty, so the default must be at least the tightest statutory window.'),
 -- ---------- (G) anonymous reporter: 🚨 `none`, AND NO FACTOR MAY EVER BE ADDED
 ('hr.anonymous_report','hr_incident',true,array['create','append','read_replies'],
  array['id','state','updated_at'],'none','180 days','mint',null,null,false,30,false,true,
  'Anonymous reporter',
  'THE PURPOSE *IS* ANONYMITY. A verification factor would require an address, and an address destroys the thing the channel exists to provide (D9 named anonymous complaint intake as v1). This is the one purpose where a stronger factor makes the product WRONG, not safer. The token is the reporter''s only way back and the intake page must say so BEFORE submission, not after.'),
 -- ---------- (H) external investigator: the MOST privileged outsider token in the system
 ('hr.investigation_external','hr_incident',true,
  array['read','write_note','upload_evidence','submit_finding','close'],
  array['id','incident_kind','state','summary','occurred_at','reported_at'],
  'email_code','90 days','subject_date','follow_up_on',null,false,30,true,false,
  'External investigator',
  'It reads a live investigation containing named parties and allegations. It exists precisely BECAUSE internal roles are compromised (the accused-hr_owner path), so it cannot lean on internal authentication and it must not be forwardable. Every read writes hr.access_audit with basis=external_investigator, not merely the token ledger.'),
 ('hr.investigation_external','hr_incident_party',false,array['read','write_note'],
  array['id','party_role','external_name'],'email_code','90 days','subject_date','follow_up_on',null,false,30,true,false,null,null),
 ('hr.investigation_external','hr_restricted_note',false,array['read','write_note'],
  array['id','note_kind','title','body','occurred_at'],'email_code','90 days','subject_date','follow_up_on',null,false,30,true,false,null,null)
) as v(ck,res,subj,acts,cols,fac,ttl,anchor,anchor_col,uses,single,smin,ip,noid,label,just)
where not exists (select 1 from platform.outsider_consumer c
                   where c.consumer_key = v.ck and c.resource = v.res and c.deleted_at is null);

-- ============================================================ §5.3 the scope validator
-- Three laws, and the mint refuses otherwise: no wildcards ever; actions from the closed
-- per-resource verb set; column allowlists mandatory on every read.
create or replace function platform.validate_outsider_scope(p_consumer_key text, p_scope jsonb)
returns void
language plpgsql stable
as $fn$
declare g jsonb; a text; v_allowed text[];
begin
  if p_scope is null or jsonb_typeof(p_scope -> 'grants') <> 'array'
     or jsonb_array_length(p_scope -> 'grants') = 0 then
    raise exception 'outsider scope: `grants` must be a non-empty array' using errcode = '22023';
  end if;

  for g in select * from jsonb_array_elements(p_scope -> 'grants') loop
    -- LAW 1: no wildcards, ever. Every grant names a concrete resource plus EITHER an id OR a
    -- parent_id. There is no syntax for "all envelopes", "this org", or "resource type X".
    if (g ->> 'resource') is null then
      raise exception 'outsider scope: every grant names a concrete resource' using errcode = '22023';
    end if;
    if (g ->> 'id') is null and (g ->> 'parent_id') is null then
      raise exception 'outsider scope: grant on % has neither id nor parent_id — there is no syntax for a wildcard',
        g ->> 'resource' using errcode = '22023';
    end if;

    select oc.allowed_actions into v_allowed
      from platform.outsider_consumer oc
     where oc.consumer_key = p_consumer_key and oc.resource = (g ->> 'resource')
       and oc.deleted_at is null and oc.is_active;
    if v_allowed is null then
      raise exception 'outsider scope: % is not a registered resource for consumer %',
        g ->> 'resource', p_consumer_key using errcode = '22023';
    end if;

    -- LAW 2: actions come from the closed per-resource verb set in the registry
    for a in select jsonb_array_elements_text(coalesce(g -> 'actions','[]'::jsonb)) loop
      if not (a = any(v_allowed)) then
        raise exception 'outsider scope: action % is not allowed on % for consumer %',
          a, g ->> 'resource', p_consumer_key using errcode = '22023';
      end if;
    end loop;
  end loop;
end
$fn$;

-- ============================================================ §5.4 the ONE mint
create or replace function platform.mint_outsider_token(
  p_consumer_key   text,
  p_subject_type   text,
  p_subject_id     uuid,
  p_scope          jsonb,
  p_organization_id uuid,
  p_recipient      jsonb default '{}'::jsonb,
  p_overrides      jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = platform, public
as $fn$
declare
  c platform.outsider_consumer%rowtype;
  v_secret text; v_hash text; v_id uuid; v_expires timestamptz; v_anchor_at timestamptz;
  v_factor text; v_target text; v_anchor text; v_uses int;
begin
  select * into c from platform.outsider_consumer
   where consumer_key = p_consumer_key and resource = p_subject_type
     and is_subject_resource and is_active and deleted_at is null;
  if not found then
    raise exception 'mint_outsider_token: % is not a registered subject resource for consumer %',
      p_subject_type, p_consumer_key using errcode = '22023';
  end if;

  perform platform.validate_outsider_scope(p_consumer_key, p_scope);

  v_factor := coalesce(p_overrides ->> 'verification_factor', c.default_verification_factor);
  v_target := nullif(p_recipient ->> 'verification_target','');
  v_anchor := coalesce(p_overrides ->> 'expiry_anchor', c.default_expiry_anchor);
  v_uses   := coalesce(nullif(p_overrides ->> 'max_uses','')::int, c.default_max_uses);

  -- 🚨 THE ANONYMOUS PURPOSE REFUSES AN ADDRESSEE. §5.6(G): recipient_email and recipient_name are
  -- NULL by construction and the mint REJECTS a non-null value — anonymity that records who to
  -- email is not anonymity.
  if c.forbid_recipient_identity then
    if (p_recipient ->> 'email') is not null or (p_recipient ->> 'name') is not null
       or v_target is not null then
      raise exception 'mint_outsider_token: consumer % records no addressee, by construction', p_consumer_key
        using errcode = '22023',
              hint = 'The purpose IS anonymity. A verification factor would require an address, and an address destroys the thing the channel exists to provide.';
    end if;
    v_factor := 'none';
  end if;

  -- ---- THE TTL ANCHOR RULE (§5.2). mint-relative, or anchored to a date on the SUBJECT.
  if v_anchor = 'subject_date' and c.anchor_source_column is not null then
    execute format('select (%I)::timestamptz from %I.%I where id = $1',
                   c.anchor_source_column,
                   (select schema_name from platform.entity_types where token = p_subject_type),
                   (select table_name  from platform.entity_types where token = p_subject_type))
      into v_anchor_at using p_subject_id;
  end if;
  if v_anchor = 'subject_date' and v_anchor_at is null then
    -- the anchor date is not set yet: fall back to mint-relative and say so on the row, rather
    -- than minting a token with an expiry nobody can explain
    v_anchor := 'mint';
  end if;
  v_expires := coalesce(nullif(p_overrides ->> 'expires_at','')::timestamptz,
                        coalesce(v_anchor_at, now()) + c.default_ttl);

  -- ---- §5.4: 256 bits of CSPRNG, base32-ish, returned EXACTLY ONCE and stored only as SHA-256
  v_secret := encode(extensions.gen_random_bytes(32), 'base64');
  v_secret := replace(replace(replace(v_secret,'+','A'),'/','B'),'=','');
  v_hash   := encode(extensions.digest(v_secret, 'sha256'), 'hex');

  insert into platform.actor_token
    (organization_id, consumer_key, subject_type, subject_id, scope, token_hash, token_prefix,
     verification_factor, verification_target, expires_at, expiry_anchor, expiry_anchor_at,
     max_uses, single_session, issued_by, issued_by_actor_type, recipient_name, recipient_email)
  values (p_organization_id, p_consumer_key, p_subject_type, p_subject_id,
          coalesce(p_scope,'{}'::jsonb), v_hash, left(v_secret, 8), v_factor, v_target, v_expires,
          v_anchor, v_anchor_at, v_uses, c.default_single_session, auth.uid(),
          coalesce(p_overrides ->> 'issued_by_actor_type',
                   case when auth.uid() is null then 'automation' else 'hr_admin' end),
          nullif(p_recipient ->> 'name',''), nullif(p_recipient ->> 'email',''))
  returning id into v_id;

  insert into platform.actor_token_event (organization_id, actor_token_id, event_type, detail)
  values (p_organization_id, v_id, 'minted',
          jsonb_build_object('consumer_key', p_consumer_key, 'subject_type', p_subject_type,
                             'expiry_anchor', v_anchor, 'expires_at', v_expires));

  -- THE SECRET IS RETURNED EXACTLY ONCE, to the sender, and goes straight into the outbound
  -- message. It exists nowhere else, ever.
  return jsonb_build_object('actor_token_id', v_id, 'secret', v_secret, 'expires_at', v_expires,
                            'verification_factor', v_factor, 'expiry_anchor', v_anchor);
end
$fn$;

create or replace function platform.revoke_outsider_token(p_token_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = platform, public
as $fn$
declare v_org uuid;
begin
  update platform.actor_token
     set is_active = false, revoked_at = now(), revoked_reason = p_reason
   where id = p_token_id and revoked_at is null
  returning organization_id into v_org;
  if v_org is null then return jsonb_build_object('revoked', false, 'reason','not_found_or_already_revoked'); end if;

  -- revocation is IMMEDIATE and CASCADING: every live session dies with the token
  update platform.actor_session set revoked_at = now()
   where actor_token_id = p_token_id and revoked_at is null;

  insert into platform.actor_token_event (organization_id, actor_token_id, event_type, detail)
  values (v_org, p_token_id, 'revoked', jsonb_build_object('reason', p_reason));
  return jsonb_build_object('revoked', true);
end
$fn$;

-- §5.2's anchor rule: when a subject's date moves, RECOMPUTE — never re-mint, so the link already
-- in the hire's inbox keeps working.
create or replace function platform.reanchor_outsider_token(p_token_id uuid)
returns jsonb
language plpgsql security definer set search_path = platform, public
as $fn$
declare t platform.actor_token%rowtype; c platform.outsider_consumer%rowtype;
        v_at timestamptz; v_new timestamptz;
begin
  select * into t from platform.actor_token where id = p_token_id;
  if not found or t.expiry_anchor <> 'subject_date' then
    return jsonb_build_object('reanchored', false);
  end if;
  select * into c from platform.outsider_consumer
   where consumer_key = t.consumer_key and resource = t.subject_type and is_subject_resource;
  execute format('select (%I)::timestamptz from %I.%I where id = $1', c.anchor_source_column,
                 (select schema_name from platform.entity_types where token = t.subject_type),
                 (select table_name  from platform.entity_types where token = t.subject_type))
    into v_at using t.subject_id;
  if v_at is null or v_at = t.expiry_anchor_at then
    return jsonb_build_object('reanchored', false);
  end if;
  v_new := v_at + c.default_ttl;
  update platform.actor_token set expiry_anchor_at = v_at, expires_at = v_new where id = p_token_id;
  insert into platform.actor_token_event (organization_id, actor_token_id, event_type, detail)
  values (t.organization_id, p_token_id, 'reanchored',
          jsonb_build_object('was', t.expires_at, 'now', v_new));
  return jsonb_build_object('reanchored', true, 'expires_at', v_new);
end
$fn$;

-- ============================================================ §5.4 the anon-callable surface
-- 🚨 THE EXHAUSTIVE LIST. `anon` receives ZERO table grants anywhere in platform, hr or esign —
-- matching the live share_links posture exactly — and EXECUTE on nothing but these and hr_kiosk_*.
create or replace function public.outsider_begin(p_secret text)
returns jsonb
language plpgsql security definer set search_path = public, platform
as $fn$
declare t platform.actor_token%rowtype; v_hash text; v_masked text;
begin
  v_hash := encode(extensions.digest(coalesce(p_secret,''), 'sha256'), 'hex');
  select * into t from platform.actor_token where token_hash = v_hash;

  -- §5.7 UNIFORM FAILURE: unknown, expired, revoked, exhausted and wrong-consumer all return the
  -- SAME client-facing message. The true reason goes into the event row. No enumeration oracle.
  if not found or not t.is_active or t.revoked_at is not null or t.expires_at <= now()
     or (t.max_uses is not null and t.use_count >= t.max_uses) then
    if t.id is not null then
      insert into platform.actor_token_event (organization_id, actor_token_id, event_type, detail)
      values (t.organization_id, t.id, 'rate_limited',
              jsonb_build_object('true_reason',
                case when not t.is_active or t.revoked_at is not null then 'revoked'
                     when t.expires_at <= now() then 'expired'
                     when t.max_uses is not null and t.use_count >= t.max_uses then 'exhausted'
                     else 'unknown' end));
    end if;
    return jsonb_build_object('ok', false,
      'message', 'This link is no longer valid — ask the sender for a new one.');
  end if;

  -- 🚨 RESOLUTION DOES NOT CONSUME A USE (RECORDED DECISION 3).
  insert into platform.actor_token_event (organization_id, actor_token_id, event_type)
  values (t.organization_id, t.id, 'resolved');

  v_masked := case when t.verification_target is null then null
                   else regexp_replace(t.verification_target, '^(.).*(@.*)$', '\1•••\2') end;

  -- returns NO object data — only what the UI needs to ask for the code
  return jsonb_build_object('ok', true, 'consumer_key', t.consumer_key,
                            'verification_factor', t.verification_factor,
                            'masked_target', v_masked,
                            'subject_summary', jsonb_build_object('type', t.subject_type));
end
$fn$;

create or replace function public.outsider_send_code(p_secret text)
returns jsonb
language plpgsql security definer set search_path = public, platform
as $fn$
declare t platform.actor_token%rowtype; v_hash text; v_code text;
begin
  v_hash := encode(extensions.digest(coalesce(p_secret,''), 'sha256'), 'hex');
  select * into t from platform.actor_token where token_hash = v_hash;
  if not found or not t.is_active or t.revoked_at is not null or t.expires_at <= now() then
    return jsonb_build_object('ok', false, 'message','This link is no longer valid — ask the sender for a new one.');
  end if;
  if t.verification_factor = 'none' then
    return jsonb_build_object('ok', true, 'no_code_required', true);
  end if;
  if t.verification_locked_until is not null and t.verification_locked_until > now() then
    insert into platform.actor_token_event (organization_id, actor_token_id, event_type)
    values (t.organization_id, t.id, 'rate_limited');
    return jsonb_build_object('ok', false, 'message','This link is no longer valid — ask the sender for a new one.');
  end if;

  -- §5.7: 6 digits, single-use, TTL 10 minutes, invalidated on issue of a new one
  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  update platform.actor_token
     set verification_code_hash = encode(extensions.digest(v_code,'sha256'),'hex'),
         verification_code_expires_at = now() + interval '10 minutes'
   where id = t.id;
  insert into platform.actor_token_event (organization_id, actor_token_id, event_type, detail)
  values (t.organization_id, t.id, 'verification_sent', jsonb_build_object('factor', t.verification_factor));

  -- the code goes out over the communication spine; it is NEVER returned to the caller
  return jsonb_build_object('ok', true, 'sent', true, 'code_for_delivery', v_code);
end
$fn$;

create or replace function public.outsider_verify(p_secret text, p_code text, p_ip inet default null)
returns jsonb
language plpgsql security definer set search_path = public, platform
as $fn$
declare t platform.actor_token%rowtype; c platform.outsider_consumer%rowtype;
        v_hash text; v_sess text; v_sid uuid;
begin
  v_hash := encode(extensions.digest(coalesce(p_secret,''), 'sha256'), 'hex');
  select * into t from platform.actor_token where token_hash = v_hash;
  if not found or not t.is_active or t.revoked_at is not null or t.expires_at <= now()
     or (t.max_uses is not null and t.use_count >= t.max_uses) then
    return jsonb_build_object('ok', false, 'message','This link is no longer valid — ask the sender for a new one.');
  end if;
  if t.verification_locked_until is not null and t.verification_locked_until > now() then
    return jsonb_build_object('ok', false, 'message','This link is no longer valid — ask the sender for a new one.');
  end if;

  if t.verification_factor <> 'none' then
    if t.verification_code_hash is null or t.verification_code_expires_at <= now()
       or t.verification_code_hash <> encode(extensions.digest(coalesce(p_code,''),'sha256'),'hex') then
      update platform.actor_token
         set verification_attempts = verification_attempts + 1,
             verification_locked_until = case when verification_attempts + 1 >= 5
                                              then now() + interval '15 minutes' end
       where id = t.id;
      insert into platform.actor_token_event (organization_id, actor_token_id, event_type, ip)
      values (t.organization_id, t.id, 'verification_failed', p_ip);
      return jsonb_build_object('ok', false, 'message','This link is no longer valid — ask the sender for a new one.');
    end if;
  end if;

  select * into c from platform.outsider_consumer
   where consumer_key = t.consumer_key and resource = t.subject_type and is_subject_resource;

  -- single_session: a second session invalidates the first
  if t.single_session then
    update platform.actor_session set revoked_at = now()
     where actor_token_id = t.id and revoked_at is null;
  end if;

  v_sess := encode(extensions.gen_random_bytes(32), 'hex');
  insert into platform.actor_session
    (organization_id, actor_token_id, session_hash, expires_at, verified_at, ip)
  values (t.organization_id, t.id, encode(extensions.digest(v_sess,'sha256'),'hex'),
          now() + make_interval(mins => coalesce(c.session_ttl_minutes, 30)), now(),
          case when coalesce(c.ip_pinned,true) then p_ip end)
  returning id into v_sid;

  -- 🚨 THE USE IS CONSUMED HERE, on VERIFIED SESSION ISSUANCE — not on resolution.
  update platform.actor_token
     set use_count = use_count + 1, verification_attempts = 0, verification_locked_until = null,
         verification_code_hash = null, last_used_at = now(), last_used_ip = p_ip
   where id = t.id;

  insert into platform.actor_token_event (organization_id, actor_token_id, session_id, event_type, ip)
  values (t.organization_id, t.id, v_sid, 'verification_passed', p_ip),
         (t.organization_id, t.id, v_sid, 'session_issued', p_ip);

  return jsonb_build_object('ok', true, 'session', v_sess, 'session_id', v_sid,
                            'expires_at', now() + make_interval(mins => coalesce(c.session_ttl_minutes,30)));
end
$fn$;

create or replace function public.outsider_session_ping(p_session text)
returns jsonb
language plpgsql security definer set search_path = public, platform
as $fn$
declare s platform.actor_session%rowtype;
begin
  select * into s from platform.actor_session
   where session_hash = encode(extensions.digest(coalesce(p_session,''),'sha256'),'hex');
  if not found or s.revoked_at is not null or s.expires_at <= now() then
    if s.id is not null then
      insert into platform.actor_token_event (organization_id, actor_token_id, session_id, event_type)
      values (s.organization_id, s.actor_token_id, s.id, 'replay_rejected');
    end if;
    return jsonb_build_object('ok', false, 'message','This link is no longer valid — ask the sender for a new one.');
  end if;
  return jsonb_build_object('ok', true, 'expires_at', s.expires_at);
end
$fn$;

-- ============================================================ §5.4 the ONE scope assertion
-- No RPC hand-rolls this check.
create or replace function platform.assert_outsider_scope(
  p_session text, p_resource text, p_id uuid, p_action text)
returns jsonb
language plpgsql security definer set search_path = platform, public
as $fn$
declare s platform.actor_session%rowtype; t platform.actor_token%rowtype; g jsonb; ok boolean := false;
begin
  select * into s from platform.actor_session
   where session_hash = encode(extensions.digest(coalesce(p_session,''),'sha256'),'hex');
  if not found or s.revoked_at is not null or s.expires_at <= now() then
    raise exception 'outsider session is not valid' using errcode = '42501';
  end if;
  select * into t from platform.actor_token where id = s.actor_token_id;
  if not t.is_active or t.revoked_at is not null or t.expires_at <= now() then
    raise exception 'outsider token is not valid' using errcode = '42501';
  end if;

  for g in select * from jsonb_array_elements(t.scope -> 'grants') loop
    if (g ->> 'resource') = p_resource
       and ((g ->> 'id')::uuid is not distinct from p_id or (g ->> 'parent_id') is not null)
       and p_action in (select jsonb_array_elements_text(coalesce(g -> 'actions','[]'::jsonb)))
    then ok := true; exit; end if;
  end loop;
  if not ok then
    raise exception 'outsider scope does not cover (%, %, %)', p_resource, p_id, p_action
      using errcode = '42501';
  end if;

  return jsonb_build_object('actor_token_id', t.id, 'session_id', s.id,
                            'organization_id', t.organization_id, 'consumer_key', t.consumer_key,
                            'subject_type', t.subject_type, 'subject_id', t.subject_id);
end
$fn$;

-- ============================================================ the three wrappers C3 owns
-- §7: HR APPROVAL OF A RECORDS REQUEST ONLY. There is no self-service mint. The delivery address
-- is SET BY HR at grant time and is never supplied by the requester, so the token cannot be
-- redirected by whoever filed the row.
create or replace function public.hr_mint_records_request_token(
  p_request_id uuid, p_delivery_address text, p_scope text[], p_reason text)
returns jsonb
language plpgsql security definer set search_path = public, hr, platform
as $fn$
declare v_uid uuid := auth.uid(); rq hr.records_request%rowtype; v_out jsonb; v_audit uuid;
begin
  if v_uid is null then
    raise exception 'hr_mint_records_request_token: no authenticated caller' using errcode = '42501';
  end if;
  select * into rq from hr.records_request where id = p_request_id and deleted_at is null;
  if not found then
    raise exception 'hr_mint_records_request_token: no hr.records_request with id %', p_request_id
      using errcode = 'P0002';
  end if;

  if not (hr.capability(v_uid,'records.govern', rq.employment_id)
          or hr.capability(v_uid,'identity.read', rq.employment_id)) then
    return hr._governance_refusal(rq.organization_id, 'hr_records_request', 'no_capability',
      'only hr_admin / hr_owner may open the records door; anyone may ASK, only HR opens it (§7)',
      rq.employment_id, ARRAY[p_request_id]);
  end if;
  if p_delivery_address is null or p_delivery_address = '' then
    return hr._governance_refusal(rq.organization_id, 'hr_records_request', 'address_required',
      'the address of record is set by HR at grant time and is never supplied by the requester',
      rq.employment_id, ARRAY[p_request_id]);
  end if;

  v_out := platform.mint_outsider_token(
    'hr.records_request', 'hr_records_request', p_request_id,
    jsonb_build_object('consumer_key','hr.records_request',
      'subject', jsonb_build_object('type','hr_records_request','id', p_request_id),
      'grants', jsonb_build_array(jsonb_build_object(
        'resource','hr_records_request','id', p_request_id, 'actions', jsonb_build_array('read','download')))),
    rq.organization_id,
    jsonb_build_object('email', p_delivery_address, 'verification_target', p_delivery_address,
                       'name', rq.requester_name));

  perform set_config('hr.privileged_write','on',true);
  -- 🚨 THE LIVE STATE VOCABULARY HAS NO `approved`, and it does not need one: HR approving the
  -- request IS minting the token, and the row's next honest state is `preparing`. The live CHECK
  -- admits received | verifying | preparing | delivered | denied | partially_delivered — a state
  -- machine about DELIVERY, which is the right grain, so this lane conforms to it rather than
  -- widening it. `requester_verified_at` is what records that the human approval step happened,
  -- and §7 is explicit that THAT step *is* the identity verification.
  update hr.records_request
     set outsider_token_ref = (v_out ->> 'actor_token_id')::uuid,
         state = 'preparing', verification_method = 'hr_approved_email_code',
         requester_verified_at = now(), delivery_method = 'token_link'
   where id = p_request_id;

  v_audit := hr._record_access_audit(
    p_organization_id => rq.organization_id, p_action => 'write',
    p_target_token => 'hr_records_request', p_purpose => 'employee_request', p_basis => 'role',
    p_granted => true, p_target_ids => ARRAY[p_request_id], p_sensitivity_tier => 'confidential',
    p_subject_employment_id => rq.employment_id, p_justification => p_reason,
    p_request_context => jsonb_build_object('scope', p_scope, 'token_id', v_out ->> 'actor_token_id'));

  return v_out || jsonb_build_object('granted', true, 'audit_id', v_audit);
end
$fn$;

-- §5: the accused-hr_owner escalation. Scoped to ONE incident, expiring, fully audited.
create or replace function public.hr_mint_investigation_token(
  p_incident_id uuid, p_investigator_email text, p_investigator_name text, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public, hr, platform
as $fn$
declare v_uid uuid := auth.uid(); i hr.incident%rowtype; v_out jsonb; v_audit uuid;
begin
  if v_uid is null then
    raise exception 'hr_mint_investigation_token: no authenticated caller' using errcode = '42501';
  end if;
  select * into i from hr.incident where id = p_incident_id and deleted_at is null;
  if not found then
    raise exception 'hr_mint_investigation_token: no hr.incident with id %', p_incident_id using errcode = 'P0002';
  end if;

  -- the veto applies to the MINTER too: a party to the case cannot hand it to an outsider
  if hr.incident_excluded(v_uid, p_incident_id) then
    return hr._governance_refusal(i.organization_id, 'hr_incident', 'subject_excluded',
      'SPEC-ACCESS §5: a party to this case may not escalate it', i.subject_employment_id,
      ARRAY[p_incident_id]);
  end if;
  if not (hr.capability(v_uid,'incident.investigate') or hr.capability(v_uid,'role.assign')) then
    return hr._governance_refusal(i.organization_id, 'hr_incident', 'no_capability',
      'only an ER case owner or hr_owner escalates to an external investigator',
      i.subject_employment_id, ARRAY[p_incident_id]);
  end if;

  v_out := platform.mint_outsider_token(
    'hr.investigation_external', 'hr_incident', p_incident_id,
    jsonb_build_object('consumer_key','hr.investigation_external',
      'subject', jsonb_build_object('type','hr_incident','id', p_incident_id),
      'grants', jsonb_build_array(
        jsonb_build_object('resource','hr_incident','id', p_incident_id,
                           'actions', jsonb_build_array('read','write_note','upload_evidence','submit_finding','close')),
        jsonb_build_object('resource','hr_incident_party','parent_id', p_incident_id,
                           'actions', jsonb_build_array('read','write_note')),
        jsonb_build_object('resource','hr_restricted_note','parent_id', p_incident_id,
                           'actions', jsonb_build_array('read','write_note')))),
    i.organization_id,
    jsonb_build_object('email', p_investigator_email, 'verification_target', p_investigator_email,
                       'name', p_investigator_name));

  v_audit := hr._record_access_audit(
    p_organization_id => i.organization_id, p_action => 'write', p_target_token => 'hr_incident',
    p_purpose => 'investigation', p_basis => 'authority', p_granted => true,
    p_target_ids => ARRAY[p_incident_id], p_sensitivity_tier => 'restricted',
    p_subject_employment_id => i.subject_employment_id, p_justification => p_reason,
    p_request_context => jsonb_build_object('token_id', v_out ->> 'actor_token_id'));

  return v_out || jsonb_build_object('granted', true, 'audit_id', v_audit);
end
$fn$;

-- §5.1: THE ONE ANON-CALLABLE MINTER. Requiring an authenticated minter would defeat anonymous
-- intake. It is rate-limited per IP instead, and it REFUSES any recipient identity.
create or replace function public.anonymous_report_open(p_organization_id uuid, p_ip inet default null)
returns jsonb
language plpgsql security definer set search_path = public, hr, platform
as $fn$
declare v_recent int; v_out jsonb;
begin
  if p_organization_id is null then
    raise exception 'anonymous_report_open: organization is required' using errcode = '22023';
  end if;

  -- §5.7 per-IP sliding window; a breach is a uniform failure plus a rate_limited event
  if p_ip is not null then
    select count(*) into v_recent from platform.actor_token_event e
      join platform.actor_token t on t.id = e.actor_token_id
     where t.consumer_key = 'hr.anonymous_report' and e.event_type = 'minted'
       and e.ip = p_ip and e.occurred_at > now() - interval '1 hour';
    if v_recent >= 10 then
      return jsonb_build_object('ok', false,
        'message','This link is no longer valid — ask the sender for a new one.');
    end if;
  end if;

  v_out := platform.mint_outsider_token(
    'hr.anonymous_report', 'hr_incident', gen_random_uuid(),
    jsonb_build_object('consumer_key','hr.anonymous_report',
      'grants', jsonb_build_array(jsonb_build_object(
        'resource','hr_incident','parent_id', p_organization_id,
        'actions', jsonb_build_array('create','append','read_replies')))),
    p_organization_id, '{}'::jsonb,
    jsonb_build_object('issued_by_actor_type','system'));

  -- 🚨 THE ABUSE LEDGER KEEPS THE IP ON `minted` ONLY, for rate limiting. The report itself
  -- carries none. Anonymity that leaks an IP into the case file is not anonymity.
  if p_ip is not null then
    update platform.actor_token_event set ip = p_ip
     where actor_token_id = (v_out ->> 'actor_token_id')::uuid and event_type = 'minted';
  end if;

  return v_out || jsonb_build_object(
    'ok', true,
    'warning','This link is the only way back to your report. We cannot resend it, because we do not know who you are.');
end
$fn$;

-- ============================================================ §6.3 the kiosk vocabulary
-- 🚨 §6.3's TWO-STEP NEEDS ONE MORE `auth_method` VALUE, and a probe found it missing.
-- §6.3 is explicit: `hr_kiosk_authenticate(p_device_id, p_device_secret)` yields "a row in
-- hr.kiosk_session with session_token and expires_at", and the EMPLOYEE's PIN is presented
-- afterwards. The live CHECK admits only pin | pin_photo | badge | manager_override — every value
-- describing how the PERSON authenticated — so the device leg of the session had no expressible
-- value at all and the first live call died on the constraint. `device` is added for the leg
-- BEFORE a person is bound; the row flips to `pin` the moment the PIN is verified, so a session
-- that ever carried a punch still records how its human proved themselves.
-- OWED: SPEC-DATA-MODEL §7.11's auth_method CHECK.
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'kiosk_session_auth_method_check'
              and conrelid = 'hr.kiosk_session'::regclass
              and pg_get_constraintdef(oid) not like '%device%') then
    alter table hr.kiosk_session drop constraint kiosk_session_auth_method_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'kiosk_session_auth_method_check'
                  and conrelid = 'hr.kiosk_session'::regclass) then
    alter table hr.kiosk_session add constraint kiosk_session_auth_method_check
      check (auth_method in ('device','pin','pin_photo','badge','manager_override'));
  end if;
end $$;

-- ============================================================ §6.3 the kiosk device actor
-- 🚨 HOW RLS ADMITS THE KIOSK: IT DOES NOT. hr.punch carries zero anon table grants, so a leaked
-- anon key alone reaches nothing — the definer function is the only door, and the device secret
-- plus the PIN are the two factors on it.
create or replace function public.hr_set_employment_pin(p_employment_id uuid, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_uid uuid := auth.uid(); v_org uuid; v_len int; v_id uuid; v_prev uuid; v_audit uuid; v_actor uuid;
begin
  if v_uid is null then
    raise exception 'hr_set_employment_pin: no authenticated caller' using errcode = '42501';
  end if;
  select organization_id into v_org from hr.employment where id = p_employment_id and deleted_at is null;
  if v_org is null then
    raise exception 'hr_set_employment_pin: no hr.employment with id %', p_employment_id using errcode = 'P0002';
  end if;

  -- HR writes a PIN, or the subject sets their own
  if not (hr.capability(v_uid,'working_record.write', p_employment_id)
          or p_employment_id = any(hr.employments_of(v_uid))) then
    return hr._governance_refusal(v_org, 'hr_employment_pin', 'no_capability',
      'only an HR writer or the employee themselves may set a kiosk PIN', p_employment_id);
  end if;

  v_len := (hr._knob('hr.time_and_attendance','kiosk_pin_length') #>> '{}')::integer;
  if p_pin is null or p_pin !~ '^[0-9]+$' or length(p_pin) <> v_len then
    return hr._governance_refusal(v_org, 'hr_employment_pin', 'pin_shape',
      format('the PIN must be exactly %s digits (hr.time_and_attendance.kiosk_pin_length)', v_len),
      p_employment_id);
  end if;

  perform set_config('hr.privileged_write','on',true);
  select id into v_prev from hr.employment_pin
   where employment_id = p_employment_id and revoked_at is null and deleted_at is null;
  if v_prev is not null then
    -- a PIN retires via revoked_at + a ROTATED row; it is never edited and never deleted
    update hr.employment_pin set revoked_at = now(), revoked_reason = 'rotated' where id = v_prev;
  end if;
  select em.id into v_actor from hr.employment em where em.id = any(hr.employments_of(v_uid))
    and em.organization_id = v_org limit 1;

  insert into hr.employment_pin
    (organization_id, employment_id, pin_hash, pin_algo, pin_length, set_at, set_by_employment_id,
     rotated_from_id)
  values (v_org, p_employment_id,
          extensions.crypt(p_pin, extensions.gen_salt('bf')), 'bcrypt', v_len, now(), v_actor, v_prev)
  returning id into v_id;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'write', p_target_token => 'hr_employment_pin',
    p_purpose => 'operational', p_basis => case when p_employment_id = any(hr.employments_of(v_uid))
                                                then 'self' else 'role' end,
    p_granted => true, p_target_ids => ARRAY[v_id], p_sensitivity_tier => 'restricted',
    p_subject_employment_id => p_employment_id,
    p_is_self_access => p_employment_id = any(hr.employments_of(v_uid)));

  -- the PIN itself is never returned, never logged, and cannot be read back
  return jsonb_build_object('granted', true, 'employment_pin_id', v_id, 'audit_id', v_audit);
end
$fn$;

create or replace function hr.verify_employment_pin(p_employment_id uuid, p_pin text)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare p hr.employment_pin%rowtype; v_max int; v_lock int;
begin
  select * into p from hr.employment_pin
   where employment_id = p_employment_id and revoked_at is null and deleted_at is null
   order by set_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason','no_pin_set'); end if;

  v_max  := (hr._knob('hr.time_and_attendance','kiosk_pin_max_attempts') #>> '{}')::integer;
  v_lock := (hr._knob('hr.time_and_attendance','kiosk_lockout_minutes') #>> '{}')::integer;

  if p.locked_until is not null and p.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason','locked', 'locked_until', p.locked_until);
  end if;

  perform set_config('hr.privileged_write','on',true);
  if p.pin_hash = extensions.crypt(coalesce(p_pin,''), p.pin_hash) then
    update hr.employment_pin
       set failed_attempt_count = 0, locked_until = null, last_used_at = now() where id = p.id;
    return jsonb_build_object('ok', true, 'employment_pin_id', p.id);
  end if;

  update hr.employment_pin
     set failed_attempt_count = failed_attempt_count + 1, last_failed_at = now(),
         locked_until = case when failed_attempt_count + 1 >= v_max
                             then now() + make_interval(mins => v_lock) end
   where id = p.id;
  return jsonb_build_object('ok', false, 'reason','bad_pin',
                            'attempts', p.failed_attempt_count + 1, 'max_attempts', v_max);
end
$fn$;

create or replace function public.hr_kiosk_authenticate(p_device_id uuid, p_device_secret text)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare d hr.kiosk_device%rowtype; v_ttl int; v_tok text; v_sid uuid;
begin
  select * into d from hr.kiosk_device where id = p_device_id and deleted_at is null;
  -- uniform failure: a wrong device id and a wrong secret are indistinguishable to the caller
  -- 🚨 THE COLUMN IS `trust_state`, NOT §6.3's `is_active`/`trust_level` — caught by probe, not by
  -- reading. Live it is a four-value CHECK (pending | trusted | suspended | revoked), so a device
  -- that has been paired but not yet trusted, or has been suspended, authenticates NOTHING. That
  -- is strictly better than a boolean and it is what shipped. OWED: §6.3's hr.kiosk_device fields.
  if not found or d.trust_state <> 'trusted'
     or d.device_secret_hash is null
     or d.device_secret_hash <> extensions.crypt(coalesce(p_device_secret,''), d.device_secret_hash) then
    return jsonb_build_object('ok', false, 'reason','device_not_authenticated');
  end if;

  v_ttl := (hr._knob('hr.time_and_attendance','kiosk_session_ttl_hours') #>> '{}')::integer;
  v_tok := encode(extensions.gen_random_bytes(32), 'hex');

  perform set_config('hr.privileged_write','on',true);
  insert into hr.kiosk_session
    (organization_id, kiosk_device_id, session_token_hash, auth_method, expires_at)
  values (d.organization_id, d.id, encode(extensions.digest(v_tok,'sha256'),'hex'), 'device',
          now() + make_interval(hours => v_ttl))
  returning id into v_sid;
  update hr.kiosk_device set last_seen_at = now() where id = d.id;

  -- the session token is returned exactly once; only its hash is stored
  return jsonb_build_object('ok', true, 'session_token', v_tok, 'kiosk_session_id', v_sid,
                            'expires_at', now() + make_interval(hours => v_ttl),
                            'location_id', d.location_id);
end
$fn$;

-- §6.3 + SPEC-TIME's p_kiosk_session_id contract: the employee opens their leg of the session with
-- their PIN, and the session id is what every punch is stamped with.
create or replace function public.hr_kiosk_session_open(
  p_session_token text, p_employee_number text, p_employment_pin text)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare s hr.kiosk_session%rowtype; v_empl uuid; v_ver jsonb;
begin
  select * into s from hr.kiosk_session
   where session_token_hash = encode(extensions.digest(coalesce(p_session_token,''),'sha256'),'hex')
     and ended_at is null and deleted_at is null;
  if not found or s.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason','session_not_valid');
  end if;

  select em.id into v_empl
    from hr.employee e join hr.employment em on em.employee_id = e.id and em.deleted_at is null
   where e.organization_id = s.organization_id and e.employee_number = p_employee_number
     and e.deleted_at is null and em.status <> 'terminated'
   order by em.hire_date desc limit 1;
  if v_empl is null then
    return jsonb_build_object('ok', false, 'reason','not_authenticated');
  end if;

  v_ver := hr.verify_employment_pin(v_empl, p_employment_pin);
  if not (v_ver ->> 'ok')::boolean then
    perform set_config('hr.privileged_write','on',true);
    update hr.kiosk_session set failed_attempt_count = failed_attempt_count + 1 where id = s.id;
    -- the reason is uniform to the kiosk; the true reason is on the PIN row
    return jsonb_build_object('ok', false, 'reason',
      case when (v_ver ->> 'reason') = 'locked' then 'locked' else 'not_authenticated' end,
      'locked_until', v_ver -> 'locked_until');
  end if;

  perform set_config('hr.privileged_write','on',true);
  update hr.kiosk_session set employment_id = v_empl, auth_method = 'pin', started_at = now()
   where id = s.id;

  return jsonb_build_object('ok', true, 'kiosk_session_id', s.id, 'employment_id', v_empl,
                            'expires_at', s.expires_at);
end
$fn$;

create or replace function public.hr_kiosk_session_heartbeat(p_session_token text)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare s hr.kiosk_session%rowtype;
begin
  select * into s from hr.kiosk_session
   where session_token_hash = encode(extensions.digest(coalesce(p_session_token,''),'sha256'),'hex')
     and ended_at is null and deleted_at is null;
  if not found or s.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason','session_not_valid');
  end if;
  perform set_config('hr.privileged_write','on',true);
  update hr.kiosk_device set last_seen_at = now() where id = s.kiosk_device_id;
  return jsonb_build_object('ok', true, 'kiosk_session_id', s.id, 'expires_at', s.expires_at,
                            'employment_id', s.employment_id);
end
$fn$;

create or replace function public.hr_kiosk_session_close(p_session_token text, p_reason text default 'completed')
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare s hr.kiosk_session%rowtype;
begin
  select * into s from hr.kiosk_session
   where session_token_hash = encode(extensions.digest(coalesce(p_session_token,''),'sha256'),'hex')
     and ended_at is null and deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'reason','session_not_valid'); end if;
  perform set_config('hr.privileged_write','on',true);
  -- the live end_reason vocabulary is completed | expired | timeout | revoked | device_suspended |
  -- superseded; anything else is normalised rather than refused, because a kiosk closing a session
  -- must never fail on a word
  update hr.kiosk_session
     set ended_at = now(),
         end_reason = case when p_reason in ('completed','expired','timeout','revoked',
                                             'device_suspended','superseded')
                           then p_reason else 'completed' end
   where id = s.id;
  return jsonb_build_object('ok', true, 'kiosk_session_id', s.id);
end
$fn$;

-- ============================================================ the recorded FK debt, discharged
-- 🚨 `{{ACTOR}}.actor_token_id` HAS BEEN CARRIED BARE SINCE CORE TRANCHE 2, on every table that
-- expands the actor block, because platform.actor_token did not exist. It exists now.
do $$
declare r record; v_n int := 0;
begin
  for r in
    select c.relname as tbl
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'hr' and a.attname = 'actor_token_id'
       and a.attnum > 0 and not a.attisdropped and c.relkind = 'r'
       and not exists (
         select 1 from pg_constraint fk
          where fk.conrelid = c.oid and fk.contype = 'f'
            and fk.confrelid = 'platform.actor_token'::regclass
            and a.attnum = any(fk.conkey))
  loop
    execute format(
      'alter table hr.%I add constraint %I foreign key (actor_token_id) references platform.actor_token(id)',
      r.tbl, r.tbl || '_actor_token_fk');
    v_n := v_n + 1;
  end loop;
  raise notice 'hr_c3_07: wired % actor_token_id foreign keys', v_n;
end $$;

-- ============================================================ grants
do $$
declare f text;
begin
  -- §9 T-34: the ONLY anon EXECUTE grants in this domain are the outsider_* and hr_kiosk_* families
  foreach f in array ARRAY[
    'public.outsider_begin(text)',
    'public.outsider_send_code(text)',
    'public.outsider_verify(text, text, inet)',
    'public.outsider_session_ping(text)',
    'public.anonymous_report_open(uuid, inet)',
    'public.hr_kiosk_authenticate(uuid, text)',
    'public.hr_kiosk_session_open(text, text, text)',
    'public.hr_kiosk_session_heartbeat(text)',
    'public.hr_kiosk_session_close(text, text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;

  foreach f in array ARRAY[
    'public.hr_mint_records_request_token(uuid, text, text[], text)',
    'public.hr_mint_investigation_token(uuid, text, text, text)',
    'public.hr_set_employment_pin(uuid, text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;

  foreach f in array ARRAY[
    'platform.mint_outsider_token(text, text, uuid, jsonb, uuid, jsonb, jsonb)',
    'platform.revoke_outsider_token(uuid, text)',
    'platform.reanchor_outsider_token(uuid)',
    'platform.validate_outsider_scope(text, jsonb)',
    'platform.assert_outsider_scope(text, text, uuid, text)',
    'hr.verify_employment_pin(uuid, text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ============================================================ DDL guard acknowledgement
do $$
declare r record;
begin
  for r in select distinct object_ref, rule from platform.ddl_guard_log
            where acknowledged_at is null
              and (object_ref like 'hr.%' or object_ref like 'platform.actor_%'
                   or object_ref like 'platform.outsider_%')
              and rule = 'org_not_null_no_backstop' loop
    perform platform.ddl_guard_ack(
      p_reason => 'The actor lane is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; a token that does not name its tenant is a token nobody can scope (SPEC-ESIGN §5.2)',
      p_by     => 'hr-domain-migration hr_c3_07',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => r.object_ref);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare v_bad integer; v_rules text; v_n integer;
begin
  -- all eight purposes are registered, and the set closes at what the registry holds (U-01)
  select count(distinct consumer_key) into v_n from platform.outsider_consumer where deleted_at is null;
  if v_n <> 8 then
    raise exception 'hr_c3_07: % outsider purposes registered, expected the settled 8', v_n;
  end if;

  -- 🚨 the anonymous purpose can never acquire a factor
  if exists (select 1 from platform.outsider_consumer
              where consumer_key = 'hr.anonymous_report'
                and (default_verification_factor <> 'none' or not forbid_recipient_identity)) then
    raise exception 'hr_c3_07: the anonymous-report purpose must be factorless and addressee-less, by construction';
  end if;

  -- 🚨 preboarding is START-DATE-RELATIVE by ruling
  if not exists (select 1 from platform.outsider_consumer
                  where consumer_key = 'hr.preboarding' and is_subject_resource
                    and default_expiry_anchor = 'subject_date' and anchor_source_column is not null) then
    raise exception 'hr_c3_07: hr.preboarding must be subject_date-anchored; a mint-relative TTL expires the packet before day 1';
  end if;

  -- the secret is never stored in plaintext
  if exists (select 1 from information_schema.columns
              where table_schema = 'platform' and table_name = 'actor_token' and column_name = 'token') then
    raise exception 'hr_c3_07: platform.actor_token carries a plaintext token column';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'platform' and table_name = 'actor_token'
                    and column_name = 'expires_at' and is_nullable = 'NO') then
    raise exception 'hr_c3_07: actor_token.expires_at must be NOT NULL — an eternal link to a personnel record';
  end if;

  -- 🚨 §5.5 THE OUTSIDER-WRITABLE TABLE LAW, ASSERTED AT ITS REAL BAR (RECORDED DECISION 8).
  -- The law's HARM is a row that is silently unreachable by the HR team that needs it. An
  -- audited-tier token is reached through a SECURITY DEFINER DOOR, never through RLS, so being
  -- `restricted` is not the harm there — it is §4.1's whole design. The honest test is therefore:
  -- an outsider-WRITABLE resource that is owner-only AND has no recorded door decision at all.
  select string_agg(distinct oc.resource, ', ') into v_rules
    from platform.outsider_consumer oc
    join platform.entity_types et on et.token = oc.resource
   where oc.deleted_at is null and oc.is_active
     and et.rls_variant = 'restricted'
     and exists (select 1 from unnest(oc.allowed_actions) a
                  where a in ('create','write','append','write_note','upload','upload_evidence',
                              'submit','save','sign','consent','decline','delegate','submit_finding','close'))
     and not exists (select 1 from hr._door_spec(oc.resource));
  if v_rules is not null then
    raise exception 'hr_c3_07: §5.5 outsider-writable table law — these writable resources are owner-only AND have no recorded door decision, so an outsider write would land somewhere nobody can reach: %', v_rules;
  end if;

  -- §9 T-34: the anon EXECUTE surface is EXACTLY the outsider_* + hr_kiosk_* families
  select string_agg(n.nspname || '.' || p.proname, ', ') into v_rules
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public','hr','platform')
     and has_function_privilege('anon', p.oid, 'execute')
     and (p.proname like 'hr\_%' or p.proname like 'outsider\_%' or p.proname like 'anonymous\_report%')
     and p.proname not like 'hr\_kiosk\_%'
     and p.proname not like 'outsider\_%'
     and p.proname <> 'anonymous_report_open';
  if v_rules is not null then
    raise exception 'hr_c3_07: unexpected anon EXECUTE grants (§9 T-34): %', v_rules;
  end if;

  -- zero anon TABLE grants anywhere in hr (§9 T-34)
  select count(*) into v_bad
    from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'hr';
  if v_bad > 0 then
    raise exception 'hr_c3_07: % anon table grants exist in the hr schema', v_bad;
  end if;

  -- the recorded FK debt is discharged
  select count(*) into v_bad
    from pg_attribute a join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'hr' and a.attname = 'actor_token_id' and a.attnum > 0
     and not a.attisdropped and c.relkind = 'r'
     and not exists (select 1 from pg_constraint fk
                      where fk.conrelid = c.oid and fk.contype = 'f'
                        and fk.confrelid = 'platform.actor_token'::regclass
                        and a.attnum = any(fk.conkey));
  if v_bad > 0 then
    raise exception 'hr_c3_07: % hr tables still carry a bare actor_token_id', v_bad;
  end if;

  -- the three new platform tables certify
  foreach v_rules in array ARRAY['actor_token','actor_session','actor_token_event','outsider_consumer'] loop
    if not iam.canonical_certify_ok('platform', v_rules, 'platform_' || v_rules) then
      raise exception 'hr_c3_07: platform.% does not certify', v_rules;
    end if;
  end loop;

  -- and the hr schema still does, entirely
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  if v_bad > 0 then
    raise exception 'hr_c3_07: % hr tokens no longer certify', v_bad;
  end if;

  select count(*), string_agg(distinct rule, ', ') into v_bad, v_rules
    from platform.ddl_guard_log where acknowledged_at is null
      and (object_ref like 'hr.%' or object_ref like 'platform.actor_%'
           or object_ref like 'platform.outsider_%');
  if v_bad > 0 then
    raise exception 'hr_c3_07: % unacked guard rows under rule(s): %', v_bad, v_rules;
  end if;
end $$;
