-- chair-step: undo chairdoors3b_w1_sms_consent_is_per_organization.sql: drops the per-organization unique constraint and re-adds (phone_number, consent_type) — which FAILS by design if two organizations now hold consent for the same number and type, because reverting would silently merge them; ACCESS EXCLUSIVE on communication.sms_consent for the moment of each statement.
-- lane: CHAIR-DOORS-3B
alter table communication.sms_consent drop constraint if exists sms_consent_organization_phone_consent_type_key;
alter table communication.sms_consent add constraint sms_consent_phone_number_consent_type_key
  unique (phone_number, consent_type);
