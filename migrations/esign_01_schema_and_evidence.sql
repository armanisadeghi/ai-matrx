-- E-sign C7 — migration 1 of 6 (register item HRB-011, lane core-c7-esign).
--
-- THE SIGNATURE EVIDENCE PACKAGE. Creates the platform-level `esign` schema and the eleven
-- tables SPEC-ESIGN §2.1/§6.3 enumerate: the envelope, its frozen documents, its signers, its
-- closed-set event ledger, its completion certificate, the consent-disclosure catalog, the bulk
-- campaign pair, and the provider seam (provider / provider_binding / envelope_external_ref).
-- Every table is created through platform.create_entity_table, org-explicit, and certified.
--
-- Authority: SPEC-ESIGN §2, §4.1, §5.5, §6.3; PLATFORM-CONVENTIONS §A3/§B1/§D2. Applied live as
-- `esign_01_schema_and_evidence`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THE LIVE ACTOR TAXONOMY IS FIFTEEN VALUES AND §2.5's TEN ARE NOT A SUBSET OF IT.
--    SPEC-ESIGN §2.5 names `employee | manager | hr_admin | platform_admin | device |
--    external_signer | integration | automation | ai_agent | system`. The taxonomy that actually
--    exists — hr.access_audit.actor_type, widened by HRB-007 to "§6.1's full 15" and verified live
--    here — is `employee, manager, hr_admin, org_owner, platform_admin, kiosk_device,
--    external_signer, applicant, preboarding_hire, former_employee, anonymous_reporter,
--    external_investigator, integration, automation, ai_agent`. It has no `device` and no `system`.
--    Two ledgers with two different actor vocabularies is exactly the drift this program exists to
--    prevent, so this ledger takes the LIVE fifteen verbatim: `device` is `kiosk_device`, and every
--    system-generated event (`reminded`, `expired`, `certificate_generated`, the expiry sweep) is
--    `automation` — which is also the honest label, because a cron row was fired by our automation,
--    not by an abstract "system". OWED: SPEC-ESIGN §2.5's actor list and §8.1 test 3's roll-call.
--
-- 2. 🚨 THE OUTSIDER REGISTRY'S COLUMN ALLOWLISTS NAMED COLUMNS THAT DO NOT EXIST — the same class
--    of defect as HRB-008's unregistered shareable token: correct by design, completely inoperative.
--    HRB-007 seeded platform.outsider_consumer for `esign.signer` before this schema existed, so its
--    readable_columns guessed: `file_name` on esign_envelope_document (the spec column is `name`) and
--    `signer_name / signer_email / order_index` on esign_envelope_signer (the spec columns are
--    `full_name / email / position`). §5.3 law 3 makes readable_columns the ONLY projection an
--    outsider read may return, so a name that does not resolve returns nothing, forever, silently.
--    Fixed by repointing the three rows' readable_columns at the real columns in migration 04, where
--    the reader that consumes them lives. NOTHING ELSE in the registry is touched — no purpose row,
--    no action, no TTL, no factor: SPEC-ESIGN §9 says the lane is seeded and it is.
--
-- 3. THE CERTIFICATE IS UNIQUE PER ENVELOPE AT THE DATABASE, not merely in the code that writes it.
--    §8.5 case 43 requires that a parallel envelope whose signers all sign at once produces exactly
--    one completion and one certificate. A uniqueness constraint is the only thing that makes that
--    true under concurrency; a check-then-insert in plpgsql is a race by construction.
--
-- 4. `esign.provider` IS CREATED `entity` AT p_visibility => 'personal' AND THEN FLIPPED TO
--    `restricted`, the two-step HRB-005 recorded: platform.create_entity_table admits only
--    entity/component/ledger/system, and p_visibility => 'none' cannot certify.
--
-- 5. THE FREEZE LAW IS A TRIGGER, NOT A CONVENTION (§2.3). Once esign.envelope_document.is_frozen
--    is true, every column that describes the signed bytes is immutable against every writer,
--    including a direct authenticated UPDATE that never touches an RPC.
--
-- 6. THE EVIDENCE WRITE GUARD, STATED PRECISELY SO IT IS NOT OVERSOLD. What actually stops a
--    direct client write is `current_user`: inside a SECURITY DEFINER esign RPC it is the function
--    owner, and from PostgREST it is `authenticated`, which the guard refuses. The transaction-local
--    `esign.privileged_write` flag is the second lane, for a non-definer service path, and it is
--    armed at the top of each RPC and DISARMED ON EVERY EXIT PATH — deliberately unlike
--    `hr.privileged_write`, whose transaction scope HRB-008's sixth finding showed leaves the guard
--    open for the rest of the caller's transaction after any one HR RPC. So: the guard is real
--    against a client, the flag's window here is the function body and nothing wider, and neither
--    claim is stronger than that.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ---------------------------------------------------------------------------------
-- 1. The schema itself.
-- ---------------------------------------------------------------------------------
create schema if not exists esign;
comment on schema esign is
  'E-signature platform product (SPEC-ESIGN, D20 — a standalone product, not an HR feature). HR is its first consumer, not its owner.';

grant usage on schema esign to authenticated, service_role;
-- `anon` deliberately receives NO schema usage and NO table grant anywhere in esign (§5.4):
-- every outsider read and write goes through a SECURITY DEFINER RPC in `public`.

-- ---------------------------------------------------------------------------------
-- 2. The registry node. D20 argues e-sign is a standalone PRODUCT; whether that makes it a
--    Domain rather than a Feature under `platform` is a registry ruling and not this lane's to
--    make, so the node lands `proposed` under the platform domain and says so in its notes.
-- ---------------------------------------------------------------------------------
insert into platform.taxonomy_node (slug, name, level, parent_id, status, notes)
select 'esign', 'E-signature', 'feature',
       (select id from platform.taxonomy_node where slug = 'platform' and level = 'domain'),
       'proposed',
       'Created by HRB-011 so the esign.* tables can carry a taxonomy_node_id. D20 rules e-sign a standalone product, which argues for a DOMAIN node rather than a feature under platform — that promotion is a registry ruling for the coordinator, not this lane.'
where not exists (select 1 from platform.taxonomy_node where slug = 'esign');

-- ---------------------------------------------------------------------------------
-- 3. The envelope-type vocabulary — platform.categories, never an enum (§2.1).
-- ---------------------------------------------------------------------------------
insert into platform.categories (organization_id, dimension, name, slug, is_system, position)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'esign_envelope_type', v.name, v.slug, true, v.pos
from (values
  ('Offer letter','offer_letter',1),
  ('Handbook acknowledgment','handbook_ack',2),
  ('Tax withholding packet','tax_packet',3),
  ('NDA','nda',4),
  ('Contractor agreement','contractor_agreement',5),
  ('Verification letter','verification_letter',6),
  ('Policy acknowledgment','policy_ack',7),
  ('Background-check disclosure','background_check_disclosure',8),
  ('Direct-deposit authorization','direct_deposit_authorization',9),
  ('Form I-9','form_i9',10),
  ('Contract','contract',11),
  ('Quote','quote',12),
  ('Custom','custom',99)
) as v(name, slug, pos)
where not exists (
  select 1 from platform.categories c
   where c.dimension = 'esign_envelope_type' and c.slug = v.slug
     and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid);

-- ---------------------------------------------------------------------------------
-- 4. esign.envelope — the request (§2.2).
-- ---------------------------------------------------------------------------------
do $$ begin
  if to_regclass('esign.envelope') is null then
    perform platform.create_entity_table(
      p_schema => 'esign', p_table => 'envelope', p_token => 'esign_envelope',
      p_label => 'Signature envelope',
      p_fields => ARRAY[
        'title text NOT NULL',
        'message text',
        $f$status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','in_progress','completed','declined','voided','expired'))$f$,
        $f$signing_order text NOT NULL DEFAULT 'sequential' CHECK (signing_order IN ('sequential','parallel'))$f$,
        'consumer_key text NOT NULL',
        'source_type text',
        'source_id uuid',
        $f$sensitivity text NOT NULL DEFAULT 'standard' CHECK (sensitivity IN ('standard','sensitive'))$f$,
        'expires_at timestamptz NOT NULL',
        'sent_at timestamptz',
        'completed_at timestamptz',
        'declined_at timestamptz',
        'voided_at timestamptz',
        'void_reason text',
        'decline_summary text',
        $f$config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'certificate_id uuid',
        'retention_class text',
        'retention_trigger text',
        'callback_key text',
        'reopened_from_envelope_id uuid',
        'superseded_by_envelope_id uuid'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'internal',
      p_category => true, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

-- ---------------------------------------------------------------------------------
-- 5. esign.envelope_document — the immutable signed content (§2.3).
-- ---------------------------------------------------------------------------------
do $$ begin
  if to_regclass('esign.envelope_document') is null then
    perform platform.create_entity_table(
      p_schema => 'esign', p_table => 'envelope_document', p_token => 'esign_envelope_document',
      p_label => 'Envelope document',
      p_fields => ARRAY[
        'envelope_id uuid NOT NULL REFERENCES esign.envelope(id) ON DELETE CASCADE',
        'position integer NOT NULL DEFAULT 1',
        'name text NOT NULL',
        $f$source_kind text NOT NULL DEFAULT 'uploaded_file' CHECK (source_kind IN ('uploaded_file','rendered_template','platform_document'))$f$,
        'template_id uuid',
        'template_version integer',
        'document_id uuid',
        'document_version integer',
        'content_file_id uuid REFERENCES files.files(id)',
        'content_file_version integer',
        'content_hash text',
        $f$hash_algorithm text NOT NULL DEFAULT 'sha-256'$f$,
        'byte_size bigint',
        'page_count integer',
        'mime_type text',
        $f$field_map jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$render_source jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'is_frozen boolean NOT NULL DEFAULT false',
        'frozen_at timestamptz'
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['esign_envelope:envelope_id']);
  end if;
end $$;

-- ---------------------------------------------------------------------------------
-- 6. esign.envelope_signer — the actors (§2.4).
-- ---------------------------------------------------------------------------------
do $$ begin
  if to_regclass('esign.envelope_signer') is null then
    perform platform.create_entity_table(
      p_schema => 'esign', p_table => 'envelope_signer', p_token => 'esign_envelope_signer',
      p_label => 'Envelope signer',
      p_fields => ARRAY[
        'envelope_id uuid NOT NULL REFERENCES esign.envelope(id) ON DELETE CASCADE',
        'position integer NOT NULL',
        $f$role text NOT NULL DEFAULT 'signer' CHECK (role IN ('signer','approver','cc_recipient','in_person_host'))$f$,
        $f$actor_type text NOT NULL CHECK (actor_type IN ('internal_user','external'))$f$,
        'signer_user_id uuid REFERENCES auth.users(id)',
        'subject_ref_type text',
        'subject_ref_id uuid',
        'full_name text NOT NULL',
        'email text NOT NULL',
        'phone text',
        $f$auth_method text NOT NULL DEFAULT 'token_link' CHECK (auth_method IN ('session','token_link','token_link_email_code','token_link_sms_code','token_link_access_code','in_person_host_attested'))$f$,
        'actor_token_id uuid REFERENCES platform.actor_token(id)',
        $f$status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','notified','delivery_failed','opened','viewed','consented','signed','declined','delegated','expired'))$f$,
        'consent_disclosure_id uuid',
        'document_previewed_at timestamptz',
        'consented_at timestamptz',
        'signed_at timestamptz',
        'declined_at timestamptz',
        'decline_reason text',
        'delegated_to_signer_id uuid',
        'delegation_reason text',
        $f$signature_kind text CHECK (signature_kind IN ('typed','drawn'))$f$,
        'typed_name text',
        'typed_style text',
        'signature_image_file_id uuid REFERENCES files.files(id)',
        'signature_adopted_at timestamptz',
        'signature_payload_hash text',
        'signed_content_hash text',
        $f$verification_factor text CHECK (verification_factor IN ('none','email_code','sms_code','access_code'))$f$,
        'verification_passed boolean',
        'is_required boolean NOT NULL DEFAULT true',
        'last_notified_at timestamptz',
        'notify_attempts integer NOT NULL DEFAULT 0',
        'reminder_count integer NOT NULL DEFAULT 0',
        'delivery_error text'
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['esign_envelope:envelope_id']);
  end if;
end $$;

-- ---------------------------------------------------------------------------------
-- 7. esign.envelope_certificate — the sealed evidence snapshot (§2.6).
-- ---------------------------------------------------------------------------------
do $$ begin
  if to_regclass('esign.envelope_certificate') is null then
    perform platform.create_entity_table(
      p_schema => 'esign', p_table => 'envelope_certificate', p_token => 'esign_envelope_certificate',
      p_label => 'Completion certificate',
      p_fields => ARRAY[
        'envelope_id uuid NOT NULL REFERENCES esign.envelope(id) ON DELETE CASCADE',
        $f$payload jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'payload_hash text NOT NULL',
        'signature text NOT NULL',
        'key_id text NOT NULL',
        'rendered_file_id uuid REFERENCES files.files(id)',
        'generated_at timestamptz NOT NULL DEFAULT now()'
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['esign_envelope:envelope_id']);
  end if;
end $$;

-- ---------------------------------------------------------------------------------
-- 8. esign.envelope_event — the append-only audit ledger (§2.5).
-- ---------------------------------------------------------------------------------
do $$ begin
  if to_regclass('esign.envelope_event') is null then
    perform platform.create_entity_table(
      p_schema => 'esign', p_table => 'envelope_event', p_token => 'esign_envelope_event',
      p_label => 'Envelope event',
      p_fields => ARRAY[
        'envelope_id uuid NOT NULL',
        'signer_id uuid',
        'document_id uuid',
        $f$event_type text NOT NULL CHECK (event_type IN ('created','document_frozen','sent','delivered','delivery_failed','opened','viewed','consent_shown','consent_given','consent_withdrawn','signature_adopted','signed','declined','delegated','reminded','resent','voided','expired','downloaded','certificate_generated','hash_verified','hash_mismatch','provider_dispatched','provider_status_received','provider_completed'))$f$,
        'occurred_at timestamptz NOT NULL DEFAULT now()',
        $f$actor_type text NOT NULL CHECK (actor_type IN ('employee','manager','hr_admin','org_owner','platform_admin','kiosk_device','external_signer','applicant','preboarding_hire','former_employee','anonymous_reporter','external_investigator','integration','automation','ai_agent'))$f$,
        'actor_user_id uuid',
        'actor_token_id uuid REFERENCES platform.actor_token(id)',
        'actor_label text',
        'auth_method text',
        'ip_address inet',
        'user_agent text',
        'device_hint text',
        $f$payload jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'provider_event_id text'
      ],
      p_variant => 'ledger', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

-- ---------------------------------------------------------------------------------
-- 9. esign.consent_disclosure — the versioned, immutable-once-referenced catalog (§4.1).
-- ---------------------------------------------------------------------------------
do $$ begin
  if to_regclass('esign.consent_disclosure') is null then
    perform platform.create_entity_table(
      p_schema => 'esign', p_table => 'consent_disclosure', p_token => 'esign_consent_disclosure',
      p_label => 'E-sign consent disclosure',
      p_fields => ARRAY[
        $f$disclosure_key text NOT NULL DEFAULT 'platform.default'$f$,
        $f$locale text NOT NULL DEFAULT 'en-US'$f$,
        'version_label text NOT NULL',
        'title text NOT NULL',
        'body text NOT NULL',
        'effective_from timestamptz NOT NULL DEFAULT now()',
        'is_current boolean NOT NULL DEFAULT true',
        'is_platform_default boolean NOT NULL DEFAULT false',
        'superseded_by_id uuid'
      ],
      p_variant => 'system', p_versioned => true, p_soft_delete => true, p_visibility => 'public',
      p_category => false, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

-- ---------------------------------------------------------------------------------
-- 10. esign.campaign + esign.campaign_member — bulk (§3.4).
-- ---------------------------------------------------------------------------------
do $$ begin
  if to_regclass('esign.campaign') is null then
    perform platform.create_entity_table(
      p_schema => 'esign', p_table => 'campaign', p_token => 'esign_campaign',
      p_label => 'Signature campaign',
      p_fields => ARRAY[
        'title text NOT NULL',
        'message text',
        'consumer_key text NOT NULL',
        $f$document_source jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$audience_kind text NOT NULL DEFAULT 'explicit_list' CHECK (audience_kind IN ('saved_query','explicit_list'))$f$,
        $f$audience_ref jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','resolving','generating','sending','open','closed'))$f$,
        $f$sensitivity text NOT NULL DEFAULT 'standard' CHECK (sensitivity IN ('standard','sensitive'))$f$,
        'expires_at timestamptz NOT NULL',
        'opened_at timestamptz',
        'closed_at timestamptz',
        'close_reason text',
        $f$config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'member_count integer NOT NULL DEFAULT 0',
        'signed_count integer NOT NULL DEFAULT 0',
        'declined_count integer NOT NULL DEFAULT 0',
        'expired_count integer NOT NULL DEFAULT 0',
        'failed_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'internal',
      p_category => true, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if to_regclass('esign.campaign_member') is null then
    perform platform.create_entity_table(
      p_schema => 'esign', p_table => 'campaign_member', p_token => 'esign_campaign_member',
      p_label => 'Campaign member',
      p_fields => ARRAY[
        'campaign_id uuid NOT NULL REFERENCES esign.campaign(id) ON DELETE CASCADE',
        'subject_ref_type text',
        'subject_ref_id uuid',
        'full_name text NOT NULL',
        'email text NOT NULL',
        'member_user_id uuid REFERENCES auth.users(id)',
        'envelope_id uuid REFERENCES esign.envelope(id)',
        $f$status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generated','notified','viewed','signed','declined','expired','failed'))$f$,
        'last_state_at timestamptz',
        'failure_reason text',
        'enrolled_at timestamptz NOT NULL DEFAULT now()',
        'batch_no integer'
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['esign_campaign:campaign_id']);
  end if;
end $$;

-- ---------------------------------------------------------------------------------
-- 11. The provider seam (§6.3): provider (restricted), provider_binding, envelope_external_ref.
-- ---------------------------------------------------------------------------------
do $$ begin
  if to_regclass('esign.provider') is null then
    perform platform.create_entity_table(
      p_schema => 'esign', p_table => 'provider', p_token => 'esign_provider',
      p_label => 'E-sign provider',
      p_fields => ARRAY[
        'provider_key text NOT NULL',
        'label text NOT NULL',
        $f$adapter text NOT NULL DEFAULT 'noop'$f$,
        $f$credentials jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$config jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'is_active boolean NOT NULL DEFAULT true'
      ],
      p_variant => 'entity', p_versioned => false, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

-- RECORDED DECISION 4 — the two-step flip to `restricted` (credentials-bearing).
do $$ begin
  if (select rls_variant from platform.entity_types where token = 'esign_provider') is distinct from 'restricted' then
    update platform.entity_types set rls_variant = 'restricted', is_component = false
     where token = 'esign_provider';
    perform iam.apply_rls('esign','provider','esign_provider','restricted');
  end if;
end $$;

do $$ begin
  if to_regclass('esign.provider_binding') is null then
    perform platform.create_entity_table(
      p_schema => 'esign', p_table => 'provider_binding', p_token => 'esign_provider_binding',
      p_label => 'E-sign provider binding',
      p_fields => ARRAY[
        'provider_id uuid NOT NULL REFERENCES esign.provider(id) ON DELETE CASCADE',
        'consumer_key text',
        'is_active boolean NOT NULL DEFAULT true',
        'bound_reason text'
      ],
      p_variant => 'entity', p_versioned => false, p_soft_delete => true, p_visibility => 'internal',
      p_category => true, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if to_regclass('esign.envelope_external_ref') is null then
    perform platform.create_entity_table(
      p_schema => 'esign', p_table => 'envelope_external_ref', p_token => 'esign_envelope_external_ref',
      p_label => 'Envelope external reference',
      p_fields => ARRAY[
        'envelope_id uuid NOT NULL REFERENCES esign.envelope(id) ON DELETE CASCADE',
        'provider_key text NOT NULL',
        'external_envelope_id text',
        'external_status text',
        'last_sync_at timestamptz',
        $f$raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['esign_envelope:envelope_id']);
  end if;
end $$;

-- ---------------------------------------------------------------------------------
-- 12. Deferred FKs and constraints that could not exist until every table did.
-- ---------------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'envelope_certificate_fk') then
    alter table esign.envelope add constraint envelope_certificate_fk
      foreign key (certificate_id) references esign.envelope_certificate(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'envelope_reopened_from_fk') then
    alter table esign.envelope add constraint envelope_reopened_from_fk
      foreign key (reopened_from_envelope_id) references esign.envelope(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'envelope_superseded_by_fk') then
    alter table esign.envelope add constraint envelope_superseded_by_fk
      foreign key (superseded_by_envelope_id) references esign.envelope(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'envelope_signer_delegated_to_fk') then
    alter table esign.envelope_signer add constraint envelope_signer_delegated_to_fk
      foreign key (delegated_to_signer_id) references esign.envelope_signer(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'envelope_signer_disclosure_fk') then
    alter table esign.envelope_signer add constraint envelope_signer_disclosure_fk
      foreign key (consent_disclosure_id) references esign.consent_disclosure(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'envelope_event_envelope_fk') then
    alter table esign.envelope_event add constraint envelope_event_envelope_fk
      foreign key (envelope_id) references esign.envelope(id) on delete cascade;
  end if;
  -- §2.4: the identity columns are exclusive by actor type — an external signer never has a user id.
  if not exists (select 1 from pg_constraint where conname = 'envelope_signer_actor_identity_ck') then
    alter table esign.envelope_signer add constraint envelope_signer_actor_identity_ck
      check ((actor_type = 'internal_user' and signer_user_id is not null)
          or (actor_type = 'external'      and signer_user_id is null));
  end if;
  -- §3.5: decline requires a reason. Not overridable (§7).
  if not exists (select 1 from pg_constraint where conname = 'envelope_signer_decline_reason_ck') then
    alter table esign.envelope_signer add constraint envelope_signer_decline_reason_ck
      check (status <> 'declined' or (decline_reason is not null and length(btrim(decline_reason)) > 0));
  end if;
  -- §2.3: a frozen document has bytes and a hash, or it is not frozen.
  if not exists (select 1 from pg_constraint where conname = 'envelope_document_frozen_ck') then
    alter table esign.envelope_document add constraint envelope_document_frozen_ck
      check (not is_frozen or (content_hash is not null and content_file_id is not null and frozen_at is not null));
  end if;
  -- §3.5: void requires a reason. Not overridable (§7).
  if not exists (select 1 from pg_constraint where conname = 'envelope_void_reason_ck') then
    alter table esign.envelope add constraint envelope_void_reason_ck
      check (status <> 'voided' or (void_reason is not null and length(btrim(void_reason)) > 0));
  end if;
end $$;

-- RECORDED DECISION 3 — one certificate per envelope, enforced by the database.
create unique index if not exists envelope_certificate_one_per_envelope
  on esign.envelope_certificate (envelope_id);

create index if not exists envelope_document_envelope_idx on esign.envelope_document (envelope_id, position);
create index if not exists envelope_signer_envelope_idx  on esign.envelope_signer (envelope_id, position);
create index if not exists envelope_signer_token_idx     on esign.envelope_signer (actor_token_id) where actor_token_id is not null;
create index if not exists envelope_signer_user_idx      on esign.envelope_signer (signer_user_id) where signer_user_id is not null;
create index if not exists envelope_event_envelope_idx   on esign.envelope_event (envelope_id, occurred_at);
create index if not exists envelope_event_type_idx       on esign.envelope_event (organization_id, event_type, occurred_at desc);
create index if not exists envelope_open_expiry_idx      on esign.envelope (expires_at)
  where status in ('sent','in_progress') and deleted_at is null;
create index if not exists envelope_source_idx           on esign.envelope (source_type, source_id) where source_id is not null;
create index if not exists envelope_consumer_idx         on esign.envelope (organization_id, consumer_key, status);
create index if not exists campaign_member_campaign_idx  on esign.campaign_member (campaign_id, status);
create unique index if not exists campaign_member_one_per_email
  on esign.campaign_member (campaign_id, lower(email));
create unique index if not exists consent_disclosure_current_key
  on esign.consent_disclosure (organization_id, disclosure_key, locale)
  where is_current and deleted_at is null;
create unique index if not exists provider_key_per_org
  on esign.provider (organization_id, provider_key) where deleted_at is null;

-- ---------------------------------------------------------------------------------
-- 13. THE FREEZE LAW AND THE APPEND-ONLY LEDGER, as triggers (RECORDED DECISION 5).
-- ---------------------------------------------------------------------------------
create or replace function esign._guard_frozen_document() returns trigger
language plpgsql as $fn$
begin
  if tg_op = 'DELETE' then
    if old.is_frozen then
      raise exception 'esign: a frozen document is evidence and is never deleted (envelope %, document %)',
        old.envelope_id, old.id using errcode = '42501';
    end if;
    return old;
  end if;
  if old.is_frozen then
    -- THE FREEZE LAW (§2.3). Re-rendering after send is impossible by construction, not by
    -- convention: a template edited after send must never change what a half-signed envelope shows.
    if new.content_hash    is distinct from old.content_hash
    or new.content_file_id is distinct from old.content_file_id
    or new.content_file_version is distinct from old.content_file_version
    or new.hash_algorithm  is distinct from old.hash_algorithm
    or new.byte_size       is distinct from old.byte_size
    or new.page_count      is distinct from old.page_count
    or new.mime_type       is distinct from old.mime_type
    or new.name            is distinct from old.name
    or new.position        is distinct from old.position
    or new.source_kind     is distinct from old.source_kind
    or new.template_id     is distinct from old.template_id
    or new.template_version is distinct from old.template_version
    or new.document_id     is distinct from old.document_id
    or new.document_version is distinct from old.document_version
    or new.field_map       is distinct from old.field_map
    or new.is_frozen       is distinct from old.is_frozen
    or new.frozen_at       is distinct from old.frozen_at then
      raise exception 'esign: document % is frozen — the signed bytes are immutable (§2.3 the freeze law). A correction is a NEW envelope.', old.id
        using errcode = '42501';
    end if;
  end if;
  return new;
end $fn$;

drop trigger if exists _zz_guard_frozen_document on esign.envelope_document;
create trigger _zz_guard_frozen_document
  before update or delete on esign.envelope_document
  for each row execute function esign._guard_frozen_document();

create or replace function esign._guard_append_only() returns trigger
language plpgsql as $fn$
begin
  raise exception 'esign.%: the event ledger is append-only — % is refused', tg_table_name, tg_op
    using errcode = '42501';
end $fn$;

drop trigger if exists _zz_guard_append_only on esign.envelope_event;
create trigger _zz_guard_append_only
  before update or delete on esign.envelope_event
  for each row execute function esign._guard_append_only();

drop trigger if exists _zz_guard_certificate_immutable on esign.envelope_certificate;
create trigger _zz_guard_certificate_immutable
  before update or delete on esign.envelope_certificate
  for each row execute function esign._guard_append_only();

-- The consent disclosure is immutable once a signer has cited it (§4.1): editing creates a new
-- version, because live certificates embed the text of the version they cite.
create or replace function esign._guard_disclosure_immutable() returns trigger
language plpgsql as $fn$
begin
  if exists (select 1 from esign.envelope_signer s where s.consent_disclosure_id = old.id) then
    if tg_op = 'DELETE' then
      raise exception 'esign: consent disclosure % is cited by a live signature and is never deleted', old.id
        using errcode = '42501';
    end if;
    if new.body is distinct from old.body or new.title is distinct from old.title
    or new.version_label is distinct from old.version_label or new.locale is distinct from old.locale then
      raise exception 'esign: consent disclosure % is cited by a signature — edit creates a NEW version (§4.1)', old.id
        using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $fn$;

drop trigger if exists _zz_guard_disclosure_immutable on esign.consent_disclosure;
create trigger _zz_guard_disclosure_immutable
  before update or delete on esign.consent_disclosure
  for each row execute function esign._guard_disclosure_immutable();

-- THE EVIDENCE WRITE GUARD (RECORDED DECISION 6). Signer evidence columns and the envelope's own
-- lifecycle columns are writable only from inside an esign definer RPC, which arms the flag at
-- entry and disarms it on every exit path.
create or replace function esign._privileged() returns boolean
language sql stable as $fn$
  select coalesce(current_setting('esign.privileged_write', true), 'off') = 'on'
      or current_user in ('postgres','service_role','supabase_admin');
$fn$;

create or replace function esign._guard_signer_evidence() returns trigger
language plpgsql as $fn$
begin
  if esign._privileged() then return new; end if;
  if new.status                 is distinct from old.status
  or new.consented_at           is distinct from old.consented_at
  or new.consent_disclosure_id  is distinct from old.consent_disclosure_id
  or new.document_previewed_at  is distinct from old.document_previewed_at
  or new.signed_at              is distinct from old.signed_at
  or new.declined_at            is distinct from old.declined_at
  or new.signature_payload_hash is distinct from old.signature_payload_hash
  or new.signed_content_hash    is distinct from old.signed_content_hash
  or new.verification_passed    is distinct from old.verification_passed
  or new.actor_token_id         is distinct from old.actor_token_id then
    raise exception 'esign: signer evidence is written only by the esign RPCs, never by a direct write'
      using errcode = '42501';
  end if;
  return new;
end $fn$;

drop trigger if exists _zz_guard_signer_evidence on esign.envelope_signer;
create trigger _zz_guard_signer_evidence
  before update on esign.envelope_signer
  for each row execute function esign._guard_signer_evidence();

-- THE STATE MACHINE (§2.5). Enforced against every writer, not only the RPCs, because a client
-- that can UPDATE a row to `completed` can forge a completion.
create or replace function esign._guard_envelope_status() returns trigger
language plpgsql as $fn$
declare v_ok boolean;
begin
  if new.status = old.status then return new; end if;
  if not esign._privileged() then
    raise exception 'esign: envelope status is moved only by the esign RPCs (§2.5 the state machine)'
      using errcode = '42501';
  end if;
  v_ok := case old.status
    when 'draft'       then new.status in ('sent','voided')
    when 'sent'        then new.status in ('in_progress','completed','declined','voided','expired')
    when 'in_progress' then new.status in ('completed','declined','voided','expired')
    else false end;
  if not v_ok then
    raise exception 'esign: illegal envelope transition % -> % (§2.5; completed/declined/voided are terminal, expired is reopened as a NEW envelope)',
      old.status, new.status using errcode = '22023';
  end if;
  return new;
end $fn$;

drop trigger if exists _zz_guard_envelope_status on esign.envelope;
create trigger _zz_guard_envelope_status
  before update on esign.envelope
  for each row execute function esign._guard_envelope_status();

-- §2.4 order rule: ties in `position` are legal ONLY when the envelope signs in parallel.
create or replace function esign._guard_signer_order() returns trigger
language plpgsql as $fn$
declare v_order text; v_dupes int;
begin
  select signing_order into v_order from esign.envelope where id = new.envelope_id;
  if v_order = 'parallel' then return new; end if;
  select count(*) into v_dupes from esign.envelope_signer s
   where s.envelope_id = new.envelope_id and s.position = new.position and s.id <> new.id
     and s.role <> 'cc_recipient';
  if v_dupes > 0 and new.role <> 'cc_recipient' then
    raise exception 'esign: position % is already taken on a SEQUENTIAL envelope — ties are legal only when signing_order = parallel (§2.4)', new.position
      using errcode = '22023';
  end if;
  return new;
end $fn$;

drop trigger if exists _zz_guard_signer_order on esign.envelope_signer;
create trigger _zz_guard_signer_order
  after insert or update of position, role on esign.envelope_signer
  for each row execute function esign._guard_signer_order();

-- ---------------------------------------------------------------------------------
-- 14. Registry classification + the shareable-resource registration.
--     HRB-008's first defect: a token that receives iam.permissions grants MUST be registered in
--     platform.shareable_resource_registry first, or every grant raises at the §6c guard.
-- ---------------------------------------------------------------------------------
update platform.entity_types
   set taxonomy_node_id = (select id from platform.taxonomy_node where slug = 'esign')
 where schema_name = 'esign' and taxonomy_node_id is null;

insert into platform.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, display_label,
   url_path_template, rls_uses_has_permission, is_link_shareable, is_active, notes)
select v.tok, 'esign', v.tbl, 'id', 'created_by', v.label, v.path, true, false, true, v.note
from (values
 ('esign_envelope','envelope','Signature envelope','/esign/envelopes/{id}',
  'A signature envelope receives explicit iam.permissions grants: the requester, a countersigning authority, and the hr.workflow_instance approver reach of the signature_request flow all reach it that way. HRB-008 proved that a token stored in a grant and absent from this registry is refused by the §6c guard, so registration precedes the first grant, not the first bug. is_link_shareable stays FALSE — an outsider reaches an envelope through platform.actor_token (SPEC-ESIGN §5), never through a public share link.'),
 ('esign_campaign','campaign','Signature campaign','/esign/campaigns/{id}',
  'A campaign is delegated to an HR administrator who did not create it; the same §6c guard applies. Never link-shareable.')
) as v(tok,tbl,label,path,note)
where not exists (select 1 from platform.shareable_resource_registry s where s.resource_type = v.tok);

update platform.shareable_resource_registry
   set is_active = true, rls_uses_has_permission = true, is_link_shareable = false
 where resource_type in ('esign_envelope','esign_campaign')
   and (not is_active or not rls_uses_has_permission or is_link_shareable);

-- ---------------------------------------------------------------------------------
-- 15. DDL-guard acknowledgements — log-driven, never a hard-coded list.
-- ---------------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select distinct object_ref, rule from platform.ddl_guard_log
            where acknowledged_at is null and object_ref like 'esign.%' loop
    perform platform.ddl_guard_ack(
      p_reason => case r.rule
        when 'org_not_null_no_backstop' then
          'The esign schema is org-explicit from day one by the 2026-08-21 NO-NULL-ORG ruling: no _stamp_org_default backstop is attached anywhere, because a signature evidence row that does not name its tenant is evidence nobody can scope or retain (SPEC-ESIGN §2.2, PLATFORM-CONVENTIONS §D2).'
        else
          'Created by platform.create_entity_table under HRB-011 (SPEC-ESIGN §2.1); the shape is the provisioner''s, not hand-rolled, and it certifies.'
      end,
      p_by     => 'esign-migration esign_01_schema_and_evidence',
      p_rule   => r.rule,
      p_object_ref => r.object_ref);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------
-- 16. ASSERTIONS — this file does not commit a lie.
-- ---------------------------------------------------------------------------------
do $$
declare v_tok text; v_bad int; v_missing text;
begin
  foreach v_tok in array ARRAY[
    'esign_envelope','esign_envelope_document','esign_envelope_signer','esign_envelope_certificate',
    'esign_envelope_event','esign_consent_disclosure','esign_campaign','esign_campaign_member',
    'esign_provider','esign_provider_binding','esign_envelope_external_ref'] loop
    if not exists (select 1 from platform.entity_types where token = v_tok and is_active) then
      raise exception 'esign_01: token % is not registered', v_tok;
    end if;
    if not iam.canonical_certify_ok(
         (select schema_name from platform.entity_types where token = v_tok),
         (select table_name  from platform.entity_types where token = v_tok), v_tok) then
      raise exception 'esign_01: % does not certify — see iam.verify_canonical', v_tok;
    end if;
  end loop;

  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'esign'
     and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  if v_bad > 0 then raise exception 'esign_01: % esign tokens do not certify', v_bad; end if;

  -- NO NULL ORG: not one org-assignment trigger anywhere in this schema.
  select count(*) into v_bad from pg_trigger t
    join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'esign' and not t.tgisinternal and t.tgname = '_stamp_org_default';
  if v_bad > 0 then raise exception 'esign_01: % org-assignment triggers in esign — the NO-BACKSTOP law', v_bad; end if;

  -- §5.4: anon holds ZERO table grants anywhere in esign.
  select count(*) into v_bad from information_schema.role_table_grants
   where table_schema = 'esign' and grantee = 'anon';
  if v_bad > 0 then raise exception 'esign_01: anon holds % table grants in esign — §5.4 says zero', v_bad; end if;

  -- the shareable registration that HRB-008 proved must precede the first grant
  select string_agg(t, ', ') into v_missing from unnest(ARRAY['esign_envelope','esign_campaign']) t
   where not exists (select 1 from platform.shareable_resource_registry s
                      where s.resource_type = t and s.is_active);
  if v_missing is not null then
    raise exception 'esign_01: grant targets not registered as shareable: %', v_missing;
  end if;

  select count(*) into v_bad from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'esign.%';
  if v_bad > 0 then raise exception 'esign_01: % unacked esign guard rows remain', v_bad; end if;

  select count(*) into v_bad from platform.categories
   where dimension = 'esign_envelope_type' and deleted_at is null;
  if v_bad < 13 then raise exception 'esign_01: envelope-type vocabulary is short (% rows)', v_bad; end if;
end $$;
