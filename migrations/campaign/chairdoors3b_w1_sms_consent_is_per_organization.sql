-- chair-step: DROPS the unique constraint communication.sms_consent (phone_number, consent_type) and ADDS the unique constraint (organization_id, phone_number, consent_type) in its place. Each ALTER TABLE takes ACCESS EXCLUSIVE on communication.sms_consent for the moment of each statement (6 rows on 2026-10-03), which is why this file waits for Arman's watched window. No function, grant, policy, column or row is touched. THE UPSERT CHANGES WITH THE KEY: matrx-frontend app/api/sms/verify/route.ts line 225 `onConflict: "phone_number,consent_type"` must become `onConflict: "organization_id,phone_number,consent_type"` in the same window (it refuses with 42P10 otherwise); the lane notes name the one-line change.
-- lane: CHAIR-DOORS-3B (asked by v6 lane 11 AUTOMATIONS-AND-PAGES, need 1e) — WINDOW FILE: proven on the clone, left for the window
--
-- SMS CONSENT IS PER ORGANIZATION. communication.sms_consent records organization_id, but its unique key
-- was (phone_number, consent_type), so one phone number could hold only ONE organization's consent per
-- type, and the verify route's upsert on that key silently moved a number's consent from organization A
-- to organization B (a live bug today, not only for workflows). Workflow texts require consent for the
-- SENDING organization (applied live 2026-10-02 by lane 11), so with the old key a second organization
-- could never pass. Proven on the clone 2026-10-03 in a rolled-back transaction before this file was written.
--
-- The key is a table constraint (the upsert names it by its columns), so it is dropped and added as one; the
-- table holds 6 rows and the runner's lock_timeout is 2 s. The old constraint goes first so the new key is the
-- only one; no duplicate (organization_id, phone_number, consent_type) exists on production (checked 2026-10-03).
--
-- INVERSE: migrations/inverse/chairdoors3b_w1_sms_consent_is_per_organization_down.sql

alter table communication.sms_consent drop constraint if exists sms_consent_phone_number_consent_type_key;
alter table communication.sms_consent add constraint sms_consent_organization_phone_consent_type_key
  unique (organization_id, phone_number, consent_type);
comment on constraint sms_consent_organization_phone_consent_type_key on communication.sms_consent is
  'Chair (v6, CHAIR-DOORS-3B for lane 11): one consent row per organization, phone number and consent type — a number consents to each organization on its own.';
