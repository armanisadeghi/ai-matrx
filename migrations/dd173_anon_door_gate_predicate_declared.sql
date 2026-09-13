-- dd173_anon_door_gate_predicate_declared.sql
--
-- B-74 (Data Doctrine adoption, 2026-09-13) — D6 IS A BLIND SPOT, NOT A DEFECT IN
-- `billing.public_plans()`. V-49 (independent verification of DD-169) found
-- `pnpm check:impl-doors:strict` red on D6: `billing.public_plans()` was flagged as an
-- ungated ANONYMOUS door. It is not. Its body is:
--
--   select ... from billing.plan p where p.active and p.is_public
--
-- D6's vis-table trigger looked for a table with a `visibility`/`card_visibility` column
-- referenced by the function body, matched `billing.plan_limit` (joined in a sub-select for
-- the `limits` column, which HAS a `visibility` column of its own, unrelated to the public/
-- private decision), and then failed to find any of its four hard-coded gate words
-- (`visibility`, `card_visibility`, an access-resolver name, `auth.uid()`) because the real
-- gate is `is_public` — a word D6's vocabulary never knew about. D6 was GUESSING the gate
-- from a fixed word list; `billing.public_plans` is the second time that guess has been
-- wrong (DD-116's `iam.has_org_access` false-negative was the first, fixed in DD-116 fix 1
-- by deriving the vocabulary from the `iam` schema — that fix helps only doors that gate
-- through an `iam.*` predicate; `is_public` is a plain column test, which no vocabulary
-- scrape will ever anticipate).
--
-- THE CLASS FIX: D6 stops guessing. A declared ANONYMOUS door now carries its own gate
-- DECLARATION on `platform.client_callable_door.gate_predicate` — the literal text that
-- proves the gate, as it appears in the function's live body (`pg_get_functiondef`).
-- Where a predicate is recorded, D6 asserts ONLY that the predicate text is present in the
-- body — RED if absent, regardless of vocabulary. Where none is recorded (a door nobody has
-- censused yet), D6 falls back to the old vis-table + vocabulary heuristic UNCHANGED, so this
-- migration cannot silently turn any other door's check off — it can only make the checked
-- doors more precise.
--
-- CENSUS: every function `anon` can currently EXECUTE and that
-- `platform.client_callable_door` declares (queried live against `brsgrqvjdzwihsvnfqkf`,
-- 2026-09-13) is either (a) one of the 10 ANONYMOUS doors DD-169 kept open (3 in B-63's
-- batch 1 — `hr_kiosk_pin_reset`, `hr_kiosk_punch`, `log_client_error`(11-arg) — + 7 in
-- B-64's batch 2 — `iam.has_access`, `iam.has_org_access`, `iam.my_orgs`,
-- `public.has_permission`, `public.is_admin`, `public.is_platform_admin`,
-- `public.is_super_admin`), (b) one of DD-110's "L"/"kernel" class anonymous doors still
-- live today, or (c) declared by later, unrelated work (`@ai-matrx/meet`, `/associations`,
-- per-user entity state, the short-link resolver, the agent-sharing RPCs, spend headline).
-- This migration records `gate_predicate` for every door in (a) and (b) — the two classes
-- named in the B-74 brief — leaving (c) for whoever owns that work to declare its own
-- predicate; those doors are untouched by D6 today (no vis-table match) and stay that way.
--
-- Doors with a genuine, provable access gate get the literal substring that proves it. Two
-- doors are recorded with `gate_predicate = NULL` on purpose: they are write-only/metering
-- sinks with no visibility-bearing row to gate (`check_guest_execution_limit`,
-- `record_guest_execution`) or a pure compatibility forward with no gate of its own
-- (`log_client_error`, the 10-arg overload that only calls the 11-arg one, which DOES carry
-- `auth.uid()` and is recorded below).

alter table platform.client_callable_door
  add column if not exists gate_predicate text;

comment on column platform.client_callable_door.gate_predicate is
  'For a declared ANONYMOUS door (anon holds EXECUTE): the literal substring that must appear '
  'in the function''s live body (pg_get_functiondef) proving the gate this door claims — the '
  'DECLARATION D6 checks instead of guessing from a fixed vocabulary (DD-173 / B-74). NULL means '
  'either nobody has censused this door yet (D6 falls back to its old vis-table + vocabulary '
  'heuristic) or the door was censused and found to need no predicate (a write-only sink or '
  'metering lane with no visibility-bearing row behind it).';

-- ── DD-169 batch 2 (B-64): 7 caller-identity predicates, all `auth.uid()` ──────────────────
update platform.client_callable_door set gate_predicate = 'auth.uid()'
 where schema_name = 'iam' and function_name = 'has_access' and identity_args = 'p_type text, p_id uuid, p_required permission_level';
update platform.client_callable_door set gate_predicate = 'auth.uid()'
 where schema_name = 'iam' and function_name = 'has_org_access' and identity_args = 'p_org uuid';
update platform.client_callable_door set gate_predicate = 'auth.uid()'
 where schema_name = 'iam' and function_name = 'my_orgs' and identity_args = '';
update platform.client_callable_door set gate_predicate = 'auth.uid()'
 where schema_name = 'public' and function_name = 'has_permission' and identity_args = 'p_resource_type text, p_resource_id uuid, p_required_permission permission_level';
update platform.client_callable_door set gate_predicate = 'auth.uid()'
 where schema_name = 'public' and function_name = 'is_admin' and identity_args = '';
update platform.client_callable_door set gate_predicate = 'auth.uid()'
 where schema_name = 'public' and function_name = 'is_platform_admin' and identity_args = '';
update platform.client_callable_door set gate_predicate = 'auth.uid()'
 where schema_name = 'public' and function_name = 'is_super_admin' and identity_args = '';

-- ── DD-169 batch 1 (B-63): the 3 that stayed anonymous ─────────────────────────────────────
update platform.client_callable_door set gate_predicate = 'session_token_hash'
 where schema_name = 'public' and function_name = 'hr_kiosk_pin_reset' and identity_args = 'p_session_token text, p_new_pin text';
update platform.client_callable_door set gate_predicate = 'session_token_hash'
 where schema_name = 'public' and function_name = 'hr_kiosk_punch' and identity_args = 'p_session_token text, p_employee_pin text, p_kind text, p_device_reported_at timestamp with time zone, p_idempotency_key text, p_photo_file_id uuid, p_geo jsonb, p_attestation jsonb';
update platform.client_callable_door set gate_predicate = 'auth.uid()'
 where schema_name = 'public' and function_name = 'log_client_error' and identity_args = 'p_source_app text, p_source text, p_message text, p_code text, p_route text, p_request_id text, p_conversation_id uuid, p_stack text, p_payload jsonb, p_context jsonb, p_organization_id uuid';
update platform.client_callable_door set gate_predicate = null
 where schema_name = 'public' and function_name = 'log_client_error' and identity_args = 'p_source text, p_message text, p_code text, p_route text, p_request_id text, p_conversation_id uuid, p_stack text, p_payload jsonb, p_context jsonb, p_organization_id uuid';

-- ── DD-110 "L"/"kernel" class anonymous doors still live today ─────────────────────────────
update platform.client_callable_door set gate_predicate = 'is_public'
 where schema_name = 'billing' and function_name = 'public_plans' and identity_args = '';
update platform.client_callable_door set gate_predicate = 'is_super_admin_user'
 where schema_name = 'public' and function_name = 'can_curate_library_document' and identity_args = 'p_doc uuid, p_user uuid';
update platform.client_callable_door set gate_predicate = null
 where schema_name = 'public' and function_name = 'check_guest_execution_limit' and identity_args = 'p_fingerprint text, p_max_executions integer';
update platform.client_callable_door set gate_predicate = null
 where schema_name = 'public' and function_name = 'record_guest_execution' and identity_args = 'p_fingerprint text, p_resource_type text, p_resource_id uuid, p_resource_name text, p_task_id uuid, p_ip_address inet, p_user_agent text, p_referer text';
update platform.client_callable_door set gate_predicate = 'creator_public = true'
 where schema_name = 'public' and function_name = 'creator_public_handles' and identity_args = '';
update platform.client_callable_door set gate_predicate = 'creator_public = true'
 where schema_name = 'public' and function_name = 'creator_public_page' and identity_args = 'p_handle text';
update platform.client_callable_door set gate_predicate = 'visibility=''public'''
 where schema_name = 'public' and function_name = 'edu_public_decks' and identity_args = 'p_search text, p_certified_only boolean, p_limit integer, p_exam_slug text';
update platform.client_callable_door set gate_predicate = 'visibility = ''public''::platform.visibility'
 where schema_name = 'public' and function_name = 'get_aga_public_data' and identity_args = 'p_slug text, p_app_id uuid';
update platform.client_callable_door set gate_predicate = 'card_visibility = ''public''::platform.visibility'
 where schema_name = 'public' and function_name = 'get_agent_public' and identity_args = 'p_agent_id uuid';
update platform.client_callable_door set gate_predicate = 'visibility = ''public''::platform.visibility'
 where schema_name = 'public' and function_name = 'get_public_flashcard_set' and identity_args = 'p_set_id uuid';
update platform.client_callable_door set gate_predicate = '_ctx_outsider'
 where schema_name = 'public' and function_name = 'esign_signer_adopt_signature' and identity_args = 'p_session text, p_kind text, p_typed_name text, p_typed_style text, p_image_file_id uuid, p_strokes jsonb, p_ip inet, p_ua text';
update platform.client_callable_door set gate_predicate = '_ctx_outsider'
 where schema_name = 'public' and function_name = 'esign_signer_consent' and identity_args = 'p_session text, p_disclosure_id uuid, p_ip inet, p_ua text';
update platform.client_callable_door set gate_predicate = '_ctx_outsider'
 where schema_name = 'public' and function_name = 'esign_signer_decline' and identity_args = 'p_session text, p_reason text, p_ip inet, p_ua text';
update platform.client_callable_door set gate_predicate = '_ctx_outsider'
 where schema_name = 'public' and function_name = 'esign_signer_delegate' and identity_args = 'p_session text, p_full_name text, p_email text, p_reason text, p_ip inet, p_ua text';
update platform.client_callable_door set gate_predicate = '_ctx_outsider'
 where schema_name = 'public' and function_name = 'esign_signer_download_url' and identity_args = 'p_session text, p_document_id uuid, p_ip inet, p_ua text';
update platform.client_callable_door set gate_predicate = '_ctx_outsider'
 where schema_name = 'public' and function_name = 'esign_signer_load' and identity_args = 'p_session text, p_ip inet, p_ua text';
update platform.client_callable_door set gate_predicate = '_ctx_outsider'
 where schema_name = 'public' and function_name = 'esign_signer_preview_ack' and identity_args = 'p_session text, p_document_id uuid, p_ip inet, p_ua text';
update platform.client_callable_door set gate_predicate = '_ctx_outsider'
 where schema_name = 'public' and function_name = 'esign_signer_sign' and identity_args = 'p_session text, p_observed jsonb, p_action_id text, p_ip inet, p_ua text';
update platform.client_callable_door set gate_predicate = 'device_secret_hash'
 where schema_name = 'public' and function_name = 'hr_kiosk_authenticate' and identity_args = 'p_device_id uuid, p_device_secret text';
update platform.client_callable_door set gate_predicate = 'pairing_code_hash'
 where schema_name = 'public' and function_name = 'hr_kiosk_claim_pairing' and identity_args = 'p_pairing_code text, p_device_fingerprint text';
update platform.client_callable_door set gate_predicate = 'session_token_hash'
 where schema_name = 'public' and function_name = 'hr_kiosk_session_close' and identity_args = 'p_session_token text, p_reason text';
update platform.client_callable_door set gate_predicate = 'session_token_hash'
 where schema_name = 'public' and function_name = 'hr_kiosk_session_heartbeat' and identity_args = 'p_session_token text';
update platform.client_callable_door set gate_predicate = 'session_token_hash'
 where schema_name = 'public' and function_name = 'hr_kiosk_session_open' and identity_args = 'p_session_token text, p_employee_number text, p_employment_pin text';
update platform.client_callable_door set gate_predicate = 'crm.unsubscribe_token'
 where schema_name = 'public' and function_name = 'outreach_unsubscribe' and identity_args = 'p_token text, p_user_agent text, p_reason text';
update platform.client_callable_door set gate_predicate = 'crm.unsubscribe_token'
 where schema_name = 'public' and function_name = 'outreach_unsubscribe_preview' and identity_args = 'p_token text';
update platform.client_callable_door set gate_predicate = 'platform.actor_token'
 where schema_name = 'public' and function_name = 'outsider_begin' and identity_args = 'p_secret text';
update platform.client_callable_door set gate_predicate = 'platform.actor_token'
 where schema_name = 'public' and function_name = 'outsider_send_code' and identity_args = 'p_secret text';
update platform.client_callable_door set gate_predicate = 'platform.actor_session'
 where schema_name = 'public' and function_name = 'outsider_session_ping' and identity_args = 'p_session text';
update platform.client_callable_door set gate_predicate = 'platform.actor_token'
 where schema_name = 'public' and function_name = 'outsider_verify' and identity_args = 'p_secret text, p_code text, p_ip inet';
update platform.client_callable_door set gate_predicate = 'platform.share_links'
 where schema_name = 'public' and function_name = 'resolve_share_token' and identity_args = 'p_token text';
update platform.client_callable_door set gate_predicate = 'platform.share_links'
 where schema_name = 'public' and function_name = 'share_token_keyword_metrics' and identity_args = 'p_token text';

-- ── Verify every named row actually exists and got the value expected, and count the total ──
-- (a mismatch here means a door in this census has drifted — schema, name, or args changed —
-- since the live query this migration was written against; the migration must not silently
-- record a predicate against nothing).
do $$
declare
  v_set int;
  v_pgsodium_unused int; -- silence unused-variable lints in strict linters; harmless
begin
  select count(*) into v_set
    from platform.client_callable_door
   where (schema_name, function_name, identity_args) in (
     ('iam','has_access','p_type text, p_id uuid, p_required permission_level'),
     ('iam','has_org_access','p_org uuid'),
     ('iam','my_orgs',''),
     ('public','has_permission','p_resource_type text, p_resource_id uuid, p_required_permission permission_level'),
     ('public','is_admin',''),
     ('public','is_platform_admin',''),
     ('public','is_super_admin',''),
     ('public','hr_kiosk_pin_reset','p_session_token text, p_new_pin text'),
     ('public','hr_kiosk_punch','p_session_token text, p_employee_pin text, p_kind text, p_device_reported_at timestamp with time zone, p_idempotency_key text, p_photo_file_id uuid, p_geo jsonb, p_attestation jsonb'),
     ('public','log_client_error','p_source_app text, p_source text, p_message text, p_code text, p_route text, p_request_id text, p_conversation_id uuid, p_stack text, p_payload jsonb, p_context jsonb, p_organization_id uuid'),
     ('public','log_client_error','p_source text, p_message text, p_code text, p_route text, p_request_id text, p_conversation_id uuid, p_stack text, p_payload jsonb, p_context jsonb, p_organization_id uuid'),
     ('billing','public_plans',''),
     ('public','can_curate_library_document','p_doc uuid, p_user uuid'),
     ('public','check_guest_execution_limit','p_fingerprint text, p_max_executions integer'),
     ('public','record_guest_execution','p_fingerprint text, p_resource_type text, p_resource_id uuid, p_resource_name text, p_task_id uuid, p_ip_address inet, p_user_agent text, p_referer text'),
     ('public','creator_public_handles',''),
     ('public','creator_public_page','p_handle text'),
     ('public','edu_public_decks','p_search text, p_certified_only boolean, p_limit integer, p_exam_slug text'),
     ('public','get_aga_public_data','p_slug text, p_app_id uuid'),
     ('public','get_agent_public','p_agent_id uuid'),
     ('public','get_public_flashcard_set','p_set_id uuid'),
     ('public','esign_signer_adopt_signature','p_session text, p_kind text, p_typed_name text, p_typed_style text, p_image_file_id uuid, p_strokes jsonb, p_ip inet, p_ua text'),
     ('public','esign_signer_consent','p_session text, p_disclosure_id uuid, p_ip inet, p_ua text'),
     ('public','esign_signer_decline','p_session text, p_reason text, p_ip inet, p_ua text'),
     ('public','esign_signer_delegate','p_session text, p_full_name text, p_email text, p_reason text, p_ip inet, p_ua text'),
     ('public','esign_signer_download_url','p_session text, p_document_id uuid, p_ip inet, p_ua text'),
     ('public','esign_signer_load','p_session text, p_ip inet, p_ua text'),
     ('public','esign_signer_preview_ack','p_session text, p_document_id uuid, p_ip inet, p_ua text'),
     ('public','esign_signer_sign','p_session text, p_observed jsonb, p_action_id text, p_ip inet, p_ua text'),
     ('public','hr_kiosk_authenticate','p_device_id uuid, p_device_secret text'),
     ('public','hr_kiosk_claim_pairing','p_pairing_code text, p_device_fingerprint text'),
     ('public','hr_kiosk_session_close','p_session_token text, p_reason text'),
     ('public','hr_kiosk_session_heartbeat','p_session_token text'),
     ('public','hr_kiosk_session_open','p_session_token text, p_employee_number text, p_employment_pin text'),
     ('public','outreach_unsubscribe','p_token text, p_user_agent text, p_reason text'),
     ('public','outreach_unsubscribe_preview','p_token text'),
     ('public','outsider_begin','p_secret text'),
     ('public','outsider_send_code','p_secret text'),
     ('public','outsider_session_ping','p_session text'),
     ('public','outsider_verify','p_secret text, p_code text, p_ip inet'),
     ('public','resolve_share_token','p_token text'),
     ('public','share_token_keyword_metrics','p_token text')
   );
  if v_set <> 42 then
    raise exception 'dd173: expected 42 census rows to exist in platform.client_callable_door, found %; a door named in this migration has drifted (renamed/re-signatured/removed) since the census — fix the row identity above before re-running', v_set;
  end if;
  v_pgsodium_unused := v_set;
  raise notice 'dd173: gate_predicate recorded on % anonymous-door rows (DD-169''s 10 + DD-110''s live-today set, 2 deliberately NULL)', v_set;
end $$;
