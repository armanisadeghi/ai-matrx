-- dd186_anon_columns_crm — THE SIGNED-OUT COLUMN SURFACE OF THE `crm` SCHEMA
-- (DD-186. SECURITY. db-rules §0/§6d/§9. GRANTS ONLY — no policy is created, altered or dropped.
--  RLS filters ROWS and cannot express a COLUMN at all; the column privilege is the only layer
--  that can, and `iam.apply_rls` issues no GRANT of any kind, so a regeneration cannot undo it.)
--
-- ═══ THE DECISION THIS FILE MAKES ══════════════════════════════════════════════════════════════
-- These 12 relations are anon-readable ON PURPOSE: each carries a permissive SELECT policy
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


-- crm.blocklist_entry — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on crm.blocklist_entry from anon;
grant select (id, subject_kind, subject_value, reason, source, party_id, expires_at, created_at, updated_at, deleted_at, visibility) on crm.blocklist_entry to anon;

-- crm.contact_medium — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on crm.contact_medium from anon;
grant select (id, channel, platform_slug, value_raw, value_key, display_value, external_id, handle, profile_url, line_type, phone_country, calling_time_zone, is_role_address, mx_valid, verification_status, verified_at, bounce_type, bounce_count, first_bounced_at, last_bounced_at, complaint_at, unsubscribed_at, dnc_state, dnc_checked_at, suppressed_at, suppression_reason, suppression_expires_at, details, created_at, updated_at, deleted_at, visibility, is_contactable, consent_basis, consent_source, consent_source_url, consent_recorded_at, consent_evidence_at, consent_expires_at, consent_jurisdiction, consent_evidence, subscriber_kind, source_disclosed_at) on crm.contact_medium to anon;

-- crm.deal — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on crm.deal from anon;
grant select (id, name, description, pipeline_id, stage_id, stage_entered_at, status, amount, currency, expected_close_date, closed_at, probability, primary_party_id, assigned_to, lost_reason_id, lost_reason_note, source, source_detail, sort_order, attributes, created_at, updated_at, deleted_at, visibility) on crm.deal to anon;

-- crm.enrichment_call — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on crm.enrichment_call from anon;
grant select (id, provider, operation, cache_key, request, response, result_count, status, error, credits_used, estimated_cost_usd, latency_ms, expires_at, party_id, created_at, updated_at, deleted_at, visibility) on crm.enrichment_call to anon;

-- crm.jurisdiction_policy — revoked: ratified_by, metadata, organization_id, created_by, updated_by, version
revoke select on crm.jurisdiction_policy from anon;
grant select (country_code, country_name, region, cold_b2b, cold_b2c, conditions, unsubscribe_validity_days, honor_within_hours, requires_postal_address, requires_source_disclosure, requires_role_relevance, distinguishes_subscriber_kind, citation, ratified_at, ratified_note, notes, is_active, created_at, updated_at, id, visibility) on crm.jurisdiction_policy to anon;

-- crm.outreach_list — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on crm.outreach_list from anon;
grant select (id, name, description, list_kind, status, definition, started_at, ended_at, created_at, updated_at, deleted_at, visibility, sending_identity_id, paused_at, paused_by, pause_reason, paused_by_kind, lane, lawful_basis, lia_interest, lia_necessity, lia_balancing, lia_completed_at, lia_completed_by) on crm.outreach_list to anon;

-- crm.party — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on crm.party from anon;
grant select (id, party_kind, display_name, sort_name, name_key, aka, first_name, middle_name, last_name, preferred_name, name_prefix, name_suffix, pronouns, date_of_birth, headline, legal_name, primary_domain, industry_id, employee_band, founded_year, tax_id, registration_number, bio, avatar_file_id, timezone, locale, canonical_id, source_party_id, source_synced_at, locked_fields, expert_status, claimed_by, claimed_at, assigned_to, lifecycle_stage_id, lifecycle_stage_changed_at, became_customer_at, rating_id, source, source_detail, do_not_contact, do_not_contact_reason, linked_organization_id, primary_employer_party_id, job_title, attributes, created_at, updated_at, deleted_at, visibility, record_class, created_by_tier, created_by_system, updated_by_tier, updated_by_system) on crm.party to anon;

-- crm.registry_ingest_run — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on crm.registry_ingest_run from anon;
grant select (id, source_slug, pass_key, params, status, cursor, lease_owner, lease_expires_at, heartbeat_at, started_at, finished_at, last_completed_at, next_due_at, run_count, requests_made, items_seen, organizations_created, organizations_matched, people_created, people_skipped_no_identifier, candidates_created, estimated_cost_usd, lifetime, error, created_at, updated_at, deleted_at, visibility) on crm.registry_ingest_run to anon;

-- crm.registry_source — revoked: contact_email, organization_id, created_by, updated_by, version, metadata
revoke select on crm.registry_source from anon;
grant select (id, slug, label, homepage_url, terms_url, terms_version, licence_class, ingest_status, allows_persistence, allows_customer_use, allows_person_promotion, permitted_fields, refresh_cadence_days, deletion_feed, crawl_policy, api_base_url, rate_limit_per_second, review_due_at, notes, declared_at, created_at, updated_at, deleted_at, visibility) on crm.registry_source to anon;

-- crm.saved_view — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on crm.saved_view from anon;
grant select (id, name, description, definition, last_used_at, created_at, updated_at, deleted_at, visibility, list_key) on crm.saved_view to anon;

-- crm.sending_identity — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on crm.sending_identity from anon;
grant select (id, display_name, provider, connection_id, provider_account, from_address, from_address_key, from_name, reply_to, sending_domain, status, status_changed_at, paused_by_kind, paused_at, paused_by, pause_reason, pause_code, resumed_at, resumed_by, domain_verification_token, domain_verified_at, domain_checked_at, domain_check_error, spf_pass, dkim_pass, dmarc_pass, auth_checked_at, auth_detail, warmup_started_at, warmup_completed_at, warmup_day, daily_cap, hourly_cap, min_interval_seconds, max_interval_seconds, quiet_hours_start, quiet_hours_end, send_weekends, default_recipient_timezone, health, health_computed_at, last_send_at, attributes, created_at, updated_at, deleted_at, visibility, postal_name, postal_line1, postal_line2, postal_city, postal_region, postal_code, postal_country, domain_registered_at, domain_age_checked_at) on crm.sending_identity to anon;

-- crm.sending_policy — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on crm.sending_policy from anon;
grant select (id, outreach_enabled, disabled_at, disabled_by, disabled_reason, disabled_by_kind, enabled_at, enabled_by, notes, attributes, created_at, updated_at, deleted_at, visibility, postal_name, postal_line1, postal_line2, postal_city, postal_region, postal_code, postal_country, postal_verified_at, privacy_notice_url) on crm.sending_policy to anon;

-- ═══ THE ASSERTION — measured, not asserted by this comment ════════════════════════════════════
do $$
declare bad text;
begin
  select string_agg(rel || '.' || col, ', ' order by rel, col) into bad
  from (
    select rel, a.attname as col
    from unnest(array['crm.blocklist_entry','crm.contact_medium','crm.deal','crm.enrichment_call','crm.jurisdiction_policy','crm.outreach_list','crm.party','crm.registry_ingest_run','crm.registry_source','crm.saved_view','crm.sending_identity','crm.sending_policy']) rel
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
      message = 'DD-186 (crm): a signed-out visitor can still read identity/bookkeeping/secret columns: ' || bad,
      hint    = 'The table-level grant was not replaced, or a column grant survives. Revoke by name.';
  end if;
end $$;

