-- chair-step: widening five check constraints is DROP + ADD of a strict superset (loosening only, CONTRACT.md §5.3); nothing else drops.
-- E-signature parity, wave A, step 1d — columns, constraints, knobs (CONTRACT.md v2 §5.1–§5.3, §5.6, §5.7, §5.9).
-- Additive only: four new tables through the canonical builder, columns added, check constraints
-- LOOSENED (drop + add with a superset), new knobs, the outsider projection widened. Nothing an
-- existing caller reads or writes changes meaning, so live signing keeps working after this file.
--
-- Tables (each through platform.create_entity_table, which applies iam.apply_rls):
--   esign.envelope_draft   — component of esign_envelope, NOT versioned (decision A: an autosave a
--                            second must not write a history row per keystroke).
--   esign.saved_signature  — entity with row visibility `personal` (§3.2 asked for the `personal`
--                            VARIANT, which is a strict class only Arman approves —
--                            platform.strict_class_refusal; the doors read created_by = auth.uid()).
--   esign.template         — entity, internal, listed, soft delete (§5.1; REGISTER ruling R11).
--   platform.device_handoff — in esign_parity_02_device_handoff.sql (the platform schema's grant pass is long).

-- (The tables themselves: esign_parity_01a/01b/01c and esign_parity_02.)

-- At most one default per person and target (§3.2).

-- §5.2 — columns added.
alter table esign.envelope
  add column if not exists email_subject text,
  add column if not exists template_id uuid,              -- provenance only (no FK: L4, a template from any org the sender may view)
  add column if not exists copied_from_envelope_id uuid;  -- provenance only

alter table esign.envelope_signer
  add column if not exists field_values jsonb not null default '{}'::jsonb,
  add column if not exists values_saved_at timestamptz,
  add column if not exists private_message text,
  add column if not exists company text,
  add column if not exists job_title text,
  add column if not exists color_index integer,
  add column if not exists signature_source text,
  add column if not exists initials_kind text,
  add column if not exists initials_text text,
  add column if not exists initials_style text,
  add column if not exists initials_image_file_id uuid references files.files(id),
  add column if not exists initials_adopted_at timestamptz,
  add column if not exists message_to_sender text,
  add column if not exists delegated_from_signer_id uuid references esign.envelope_signer(id);

-- Every new foreign key gets its covering index (provision_shape_guard).
create index if not exists envelope_signer_initials_image_idx on esign.envelope_signer (initials_image_file_id);
create index if not exists envelope_signer_delegated_from_idx on esign.envelope_signer (delegated_from_signer_id);
-- A delegate row is always on its delegator's envelope, so this validation never refuses a real write.
drop trigger if exists trg_same_org_esign_envelope_signer_delegated_from_signer_id on esign.envelope_signer;
create trigger trg_same_org_esign_envelope_signer_delegated_from_signer_id
  before insert or update of delegated_from_signer_id on esign.envelope_signer
  for each row execute function platform.assert_same_org('delegated_from_signer_id', 'esign.envelope_signer');
-- Initials images are filed in the envelope's organization, like signature images (§3.1).
drop trigger if exists trg_same_org_esign_envelope_signer_initials_image_file_id on esign.envelope_signer;
create trigger trg_same_org_esign_envelope_signer_initials_image_file_id
  before insert or update of initials_image_file_id on esign.envelope_signer
  for each row execute function platform.assert_same_org('initials_image_file_id', 'files.files');

alter table platform.outsider_consumer
  add column if not exists session_sliding boolean not null default false;

-- §5.3 — check constraints widened (each new list is a superset of the old).
alter table esign.envelope_signer drop constraint if exists envelope_signer_signature_kind_check;
alter table esign.envelope_signer add constraint envelope_signer_signature_kind_check
  check (signature_kind = any (array['typed','drawn','uploaded']));
alter table esign.envelope_signer drop constraint if exists envelope_signer_role_check;
alter table esign.envelope_signer add constraint envelope_signer_role_check
  check (role = any (array['signer','approver','cc_recipient','in_person_host','viewer']));
alter table esign.envelope_signer drop constraint if exists envelope_signer_status_check;
alter table esign.envelope_signer add constraint envelope_signer_status_check
  check (status = any (array['pending','notified','delivery_failed','opened','viewed','consented',
                             'signed','declined','delegated','expired','acknowledged']));
alter table esign.envelope_signer drop constraint if exists envelope_signer_signature_source_check;
alter table esign.envelope_signer add constraint envelope_signer_signature_source_check
  check (signature_source is null or signature_source = any (array['this_device','phone','saved']));
alter table esign.envelope_signer drop constraint if exists envelope_signer_initials_kind_check;
alter table esign.envelope_signer add constraint envelope_signer_initials_kind_check
  check (initials_kind is null or initials_kind = any (array['typed','drawn','uploaded']));
alter table esign.envelope_event drop constraint if exists envelope_event_event_type_check;
alter table esign.envelope_event add constraint envelope_event_event_type_check
  check (event_type = any (array['created','document_frozen','sent','delivered','delivery_failed',
    'opened','viewed','consent_shown','consent_given','consent_withdrawn','signature_adopted',
    'signed','declined','delegated','reminded','resent','voided','expired','downloaded',
    'certificate_generated','hash_verified','hash_mismatch','provider_dispatched',
    'provider_status_received','provider_completed',
    'authenticated','signature_handoff_started','signature_handoff_completed','acknowledged',
    'signed_copy_made']));

-- §5.7 + §5.9 — the outsider projection widened; sessions slide on activity.
update platform.outsider_consumer
   set readable_columns = (select array_agg(distinct c) from unnest(readable_columns || array['email_subject']) c),
       session_sliding = true
 where consumer_key = 'esign.signer' and resource = 'esign_envelope';
update platform.outsider_consumer
   set readable_columns = (select array_agg(distinct c) from unnest(readable_columns || array[
         'field_values','values_saved_at','private_message','company','job_title','color_index',
         'signature_source','typed_style','initials_kind','initials_text','initials_style',
         'message_to_sender','delegated_from_signer_id']) c),
       session_sliding = true
 where consumer_key = 'esign.signer' and resource = 'esign_envelope_signer';
update platform.outsider_consumer
   set session_sliding = true,
       default_verification_factor = 'none'   -- REGISTER ruling F13: the email link alone
 where consumer_key = 'esign.signer';

-- §5.6 — knobs. Existing rows whose default changes (rulings F13, A-F1, L3):
update platform.feature_knob set value = '"none"'::jsonb, default_value = '"none"'::jsonb,
       basis = 'REGISTER ruling F13 (2026-10-07): an outside signer opens from the email link alone (Docusign default); the code is a per-recipient option',
       review_due = '2026-11-01'
 where feature = 'esign.outsider' and key = 'verification.default_factor.esign_signer';
update platform.feature_knob set value = 'false'::jsonb, default_value = 'false'::jsonb,
       basis = 'ATTACK A-F1 (2026-10-07): the consumer row pins only when it asks; the knob agrees',
       review_due = '2026-11-01'
 where feature = 'esign.outsider' and key = 'session.ip_pinned';
update platform.feature_knob set value = 'true'::jsonb, default_value = 'true'::jsonb,
       basis = 'Loosening L3 (2026-10-07): defaults lean open; safe once a delegator never blocks (A-F3)',
       review_due = '2026-11-01'
 where feature = 'esign.delegation' and key = 'allowed';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description, set_by, basis, review_due,
   overridable_by, override_direction, allowed_values)
values
  ('esign.signature', 'allow_uploaded', 'true', 'true', 'boolean', 'Allow uploaded signature images',
   'A signer may upload a picture of their signature.', 'agent', 'e-sign parity S7.5 (Docusign, DocHub offer upload)', '2026-11-01',
   '{organization}', 'any', null),
  ('esign.signature', 'allow_phone', 'true', 'true', 'boolean', 'Allow signing on a phone',
   'A signer at a computer may draw on their phone (QR or text).', 'agent', 'e-sign parity S7.6 (DocHub phone handoff)', '2026-11-01',
   '{organization}', 'any', null),
  ('esign.signature', 'handoff_ttl_minutes', '10', '10', 'integer', 'Phone handoff link life (minutes)',
   'How long a phone-signing link works.', 'agent', 'e-sign parity §4: ten minutes covers a draw', '2026-11-01',
   '{organization}', 'any', null),
  ('esign.signature', 'handoff_texts_per_signer', '3', '3', 'integer', 'Phone links texted per signer',
   'Most texts one signer may send themselves.', 'agent', 'ATTACK A-R4: SMS abuse ceiling', '2026-11-01',
   '{organization}', 'lower_only', null),
  ('esign.signature', 'handoff_texts_per_ip_per_day', '10', '10', 'integer', 'Phone links texted per address per day',
   'Most texts one network address may send in a day.', 'agent', 'ATTACK A-R4: SMS abuse ceiling', '2026-11-01',
   '{}', 'any', null),
  ('esign.signature', 'fill_all_allowed', 'true', 'true', 'boolean', 'Allow fill all signature fields',
   'One press applies the adopted mark to every signature field.', 'agent', 'e-sign parity S7.8', '2026-11-01',
   '{organization}', 'any', null),
  ('esign.signature', 'frame_on_copy', 'true', 'true', 'boolean', 'Frame stamped signatures',
   'Stamped signatures carry a thin frame with the envelope id.', 'agent', 'e-sign parity S7.10 (Docusign frame)', '2026-11-01',
   '{organization}', 'any', null),
  ('esign.signed_copy', 'envelope_id_on_pages', 'true', 'true', 'boolean', 'Envelope id on every page',
   'Every page of the signed copy names the envelope id.', 'agent', 'e-sign parity D13.3', '2026-11-01',
   '{organization}', 'any', null),
  ('esign.reminder', 'expiry_warning_days', '3', '3', 'integer', 'Expiry warning (days before)',
   'Signers are warned this many days before the request expires.', 'agent', 'e-sign parity D8.4 (Docusign default 3)', '2026-11-01',
   '{organization}', 'any', null),
  ('esign.signer', 'form_view', '"available"', '"available"', 'enum', 'Form view for signers',
   'Whether signers can fill fields as a list.', 'agent', 'e-sign parity S5.9', '2026-11-01',
   '{organization}', 'any', '["off","available","default"]'),
  ('esign.signer', 'message_to_sender', 'true', 'true', 'boolean', 'Signers may message the sender',
   'A signer may add a note to the sender when they finish.', 'agent', 'e-sign parity S10.1 (owner named it)', '2026-11-01',
   '{organization}', 'any', null),
  ('esign.fields', 'date_format_default', '"MM/DD/YYYY"', '"MM/DD/YYYY"', 'enum', 'Default date format',
   'How dates are written on signed documents.', 'agent', 'REGISTER ruling 2026-10-07: Docusign default MM/DD/YYYY', '2026-11-01',
   '{organization}', 'any', '["MM/DD/YYYY","MM/DD/YY","DD/MM/YYYY","DD/MM/YY","YYYY-MM-DD","MMM D, YYYY","D MMM YYYY"]')
on conflict do nothing;
