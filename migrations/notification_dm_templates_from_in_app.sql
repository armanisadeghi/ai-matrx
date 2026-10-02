-- draft: deep-lane(dm-pairing) — applied to the clone only; production waits for dm_soft_expiry_and_dm_pairs_with_email.sql (the pairing rule) to land first
--
-- THE PAIRED DM NEEDS WORDS ON EVERY ROW, NOT JUST THE PYTHON-DECLARED ONES.
--
-- THE PAIRING RULE (communication.notification_pair_channels) turns `dm` on beside every email to a
-- platform user. The SQL producers that walk the ladder themselves — hr._wf_notify,
-- hr._punch_notify_edited, hr._l1_notify_consent_requested, interview._decision_answer_notify — read
-- `config->'templates'->ch->'body'` and record a channel with no body as a `no_template` skip. So a
-- paired DM on an event with no `dm` template would be a named skip: an email without its DM, which
-- is the one thing the rule forbids.
--
-- aidream's declaration reconcile now seeds `templates.dm` from the row's own in-app line for every
-- event it declares (registry.declaration_templates / reconcile_notification_event_types). This
-- covers the rows it does NOT declare — the SQL-seeded catalogs (hr.workflow.*, esign.*, …) — the
-- same way: a `dm` template whose words are the row's in-app words. Data only; no function
-- replaced. Idempotent: a row that already has a `dm` template is never touched, and an admin may
-- edit the DM words independently afterwards.

update communication.notification_event_type t
   set config = jsonb_set(
         t.config,
         '{templates,dm}',
         jsonb_build_object('body', t.config -> 'templates' -> 'in_app' -> 'body'),
         true)
 where t.deleted_at is null
   and jsonb_typeof(t.config -> 'templates') = 'object'
   and not (t.config -> 'templates' ? 'dm')
   and nullif(btrim(coalesce(t.config -> 'templates' -> 'in_app' ->> 'body', '')), '') is not null;
