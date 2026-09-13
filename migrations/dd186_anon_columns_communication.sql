-- dd186_anon_columns_communication — THE SIGNED-OUT COLUMN SURFACE OF THE `communication` SCHEMA
-- (DD-186. SECURITY. db-rules §0/§6d/§9. GRANTS ONLY — no policy is created, altered or dropped.
--  RLS filters ROWS and cannot express a COLUMN at all; the column privilege is the only layer
--  that can, and `iam.apply_rls` issues no GRANT of any kind, so a regeneration cannot undo it.)
--
-- ═══ THE DECISION THIS FILE MAKES ══════════════════════════════════════════════════════════════
-- These 14 relations are anon-readable ON PURPOSE: each carries a permissive SELECT policy
-- reaching `anon` — in almost every case the generated `pub_read` (`deleted_at is null and
-- visibility = 'public'`). That ROW decision was made by the DD-173 base-contract campaign and is
-- not touched here. The COLUMN decision had never been made by anyone: every one of them answered
-- `select=*` to the published publishable key over HTTPS, so a table became a publishing decision
-- the moment a column was added to it. DD-182 found exactly this on `public.catalog_entries`
-- (a platform admin's uuid in `updated_by`, served to the internet, while the SAME feature's other
-- public path stripped it on purpose). This file is that finding applied to the rest of the surface.
--
-- WHAT IS REVOKED, and it is a closed list of exact column NAMES — never a name pattern, because a
-- gate that guesses is a gate that gets switched off:
--   who   — created_by, updated_by, deleted_by, changed_by, ratified_by, certified_by,
--           human_verified_by, verdict_by, synced_by, last_checked_by, check_claimed_by,
--           user_id, owner_id, owner_user_id, author_id, organization_id, org_id
--   books — version, metadata, is_system
--   contact/secret — email, contact_email, ip_address, fingerprint, phone, phone_number,
--           token, access_token, refresh_token, api_key, secret, password, password_hash
-- Deliberately NOT revoked: `visibility` and `deleted_at` (the gate's own columns — a row a
-- signed-out visitor can see always reads 'public'/null, so they carry no information, and clients
-- legitimately filter on them, which PostgREST cannot do without the column privilege); and names
-- that only LOOK like the list — `max_tokens`, `token_billed`, `total_tokens_used`, `min_tier`,
-- `emitted_fingerprint` (a content hash), and `content_ir.kind_surface.token`, whose values are
-- 'flashcards' and 'mermaid'.
--
-- THE MECHANISM, and why it is the durable one: each relation's TABLE-level grant is revoked and
-- replaced by a COLUMN-level grant naming exactly what stays. A column added to one of these
-- tables tomorrow is therefore NOT readable by a signed-out visitor — the default flips from
-- published to closed, which is the actual class fix. `pnpm check:anon-column-surface` fails on a
-- difference in either direction.
--
-- NOTHING SIGNED-IN CHANGES: grants are per-role, `authenticated` keeps every privilege it holds.
-- SECURITY DEFINER doors run as their owner and never consult the caller's table privileges.


-- communication.dm_conversations — revoked: created_by, organization_id, updated_by, version, metadata
revoke select on communication.dm_conversations from anon;
grant select (id, type, group_name, group_image_url, created_at, updated_at, deleted_at, visibility) on communication.dm_conversations to anon;

-- communication.meet_call_invites — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on communication.meet_call_invites from anon;
grant select (id, room_name, mode, caller_user_id, caller_name, caller_avatar_url, callee_ids, conversation_id, expires_at, state, decline_message, settled_at, created_at, updated_at, visibility, deleted_at) on communication.meet_call_invites to anon;

-- communication.meet_meetings — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on communication.meet_meetings from anon;
grant select (id, room_name, slug, title, kind, host_user_id, scheduled_for, scheduled_duration_minutes, started_at, ended_at, locked, lobby_enabled, recording_policy, ai_enabled, created_at, updated_at, deleted_at, visibility) on communication.meet_meetings to anon;

-- communication.notification — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on communication.notification from anon;
grant select (id, event_key, recipient_user_id, channel, dedupe_key, payload, subject, body, to_address, status, attempt_count, next_attempt_at, claimed_by, lease_expires_at, provider, provider_message_id, error_code, error_message, sent_at, created_at, updated_at, visibility, recipient_kind, recipient_party_id, recipient_actor_token_id, recipient_label, delivered_at, read_at, read_channel, acted_at, outcome, outcome_at, target_kind, target_id, deep_link) on communication.notification to anon;

-- communication.notification_event_override — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on communication.notification_event_override from anon;
grant select (id, event_key, enabled, default_channels, config_patch, created_at, updated_at, deleted_at, visibility) on communication.notification_event_override to anon;

-- communication.notification_event_type — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on communication.notification_event_type from anon;
grant select (id, event_key, label, description, default_channels, config, enabled, created_at, updated_at, deleted_at, visibility) on communication.notification_event_type to anon;

-- communication.notification_preference — revoked: user_id, organization_id, created_by, updated_by, version, metadata
revoke select on communication.notification_preference from anon;
grant select (id, event_key, channel, enabled, created_at, updated_at, deleted_at, visibility) on communication.notification_preference to anon;

-- communication.sms_consent — revoked: phone_number, user_id, ip_address, metadata, organization_id, created_by, updated_by, version
revoke select on communication.sms_consent from anon;
grant select (id, consent_type, status, opted_in_at, opted_out_at, opt_in_method, opt_out_method, opt_in_keyword, opt_out_keyword, created_at, updated_at, deleted_at, visibility) on communication.sms_consent to anon;

-- communication.sms_conversations — revoked: user_id, metadata, organization_id, created_by, updated_by, version
revoke select on communication.sms_conversations from anon;
grant select (id, external_phone_number, our_phone_number, status, conversation_type, ai_agent_id, last_message_at, last_message_preview, last_message_direction, message_count, unread_count, created_at, updated_at, deleted_at, visibility, provider, provider_account_id, destination_identity_id, program_key, party_id, contact_medium_id, contact_point_id, interaction_id, chat_conversation_id, agent_version_id, identity_status, agent_id, canonical_agent_version_id) on communication.sms_conversations to anon;

-- communication.sms_notification_preferences — revoked: user_id, phone_number, metadata, organization_id, created_by, updated_by, version
revoke select on communication.sms_notification_preferences from anon;
grant select (id, sms_enabled, dm_notifications, task_notifications, job_completion_notifications, system_alerts, marketing_messages, ai_agent_messages, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone, max_messages_per_hour, max_messages_per_day, created_at, updated_at, deleted_at, visibility, preferred_agent_id, preferred_agent_version_id, assistant_destination_id, assistant_program_key) on communication.sms_notification_preferences to anon;

-- communication.sms_notifications — revoked: user_id, metadata, organization_id, created_by, updated_by, version
revoke select on communication.sms_notifications from anon;
grant select (id, message_id, notification_type, category, reference_type, reference_id, status, failure_reason, scheduled_for, sent_at, created_at, deleted_at, visibility, updated_at, idempotency_key, interaction_id) on communication.sms_notifications to anon;

-- communication.sms_phone_numbers — revoked: user_id, phone_number, metadata, organization_id, created_by, updated_by, version
revoke select on communication.sms_phone_numbers from anon;
grant select (id, twilio_sid, friendly_name, capabilities, number_type, is_active, assigned_at, released_at, created_at, updated_at, deleted_at, visibility, provider, provider_account_id, program_key, assistant_enabled) on communication.sms_phone_numbers to anon;

-- communication.sms_rate_limits — revoked: phone_number
revoke select on communication.sms_rate_limits from anon;
grant select (id, window_start, window_type, message_count) on communication.sms_rate_limits to anon;

-- communication.sms_webhook_logs — revoked: (none; bounded so a new column is closed by default)
revoke select on communication.sms_webhook_logs from anon;
grant select (id, webhook_type, twilio_sid, raw_payload, processed, processing_error, created_at, provider, provider_account_id, provider_event_key, message_id, processing_attempts, claimed_at, lease_expires_at, processed_at) on communication.sms_webhook_logs to anon;

-- ═══ THE ASSERTION — measured, not asserted by this comment ════════════════════════════════════
do $$
declare bad text;
begin
  select string_agg(rel || '.' || col, ', ' order by rel, col) into bad
  from (
    select rel, a.attname as col
    from unnest(array['communication.dm_conversations','communication.meet_call_invites','communication.meet_meetings','communication.notification','communication.notification_event_override','communication.notification_event_type','communication.notification_preference','communication.sms_consent','communication.sms_conversations','communication.sms_notification_preferences','communication.sms_notifications','communication.sms_phone_numbers','communication.sms_rate_limits','communication.sms_webhook_logs']) rel
    join pg_attribute a on a.attrelid = rel::regclass and a.attnum > 0 and not a.attisdropped
    where a.attname = any (array['created_by','updated_by','deleted_by','changed_by','ratified_by',
        'certified_by','human_verified_by','verdict_by','synced_by','last_checked_by',
        'check_claimed_by','user_id','owner_id','owner_user_id','author_id','organization_id',
        'org_id','created_by_user_id','version','metadata','is_system','email','contact_email',
        'ip_address','fingerprint','phone','phone_number','access_token','refresh_token','api_key',
        'secret','password','password_hash']
        || case when rel = 'content_ir.kind_surface' then array[]::text[] else array['token'] end)
      and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')
  ) t;
  if bad is not null then
    raise exception using
      message = 'DD-186 (communication): a signed-out visitor can still read identity/bookkeeping/secret columns: ' || bad,
      hint    = 'The table-level grant was not replaced, or a column grant survives. Revoke by name.';
  end if;
end $$;

