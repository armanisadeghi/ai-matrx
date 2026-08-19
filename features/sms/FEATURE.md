# FEATURE.md — `sms`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-08-18`

---

## Purpose

The canonical SMS platform for verified user enrollment, consent, Twilio delivery,
inbound/status webhooks, preferences, conversations, and delivery diagnostics. The
browser uses Next.js routes only where Twilio credentials, webhook validation, or a
server-authenticated consent write require a secret boundary.

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/communications-platform/FEATURE.md — read it before touching this feature in ANY repo.

---

## Entry points

- `app/(public)/sms/page.tsx` — public, carrier-reviewable opt-in description and disclosure.
- `app/(public)/terms-and-conditions/page.tsx` — SMS program terms.
- `features/settings/tabs/MessagingTab.tsx` — production enrollment, opt-out, and personal text-assistant controls.
- `features/sms/components/SmsAssistantSettingsSection.tsx` — the canonical `sms.owner_beta` Mandate Binding, per-user pause, readiness, and safe-test controls.
- `features/sms/components/SmsNotificationPreferencesSettingsSection.tsx` — explicit notification-family choices, starting with Task reminders.
- `features/sms/hooks/useSmsAssistantProgram.ts` — direct authenticated RPC adapter for the selected assistant program.
- `features/sms/hooks/useSmsTaskNotifications.ts` — direct authenticated RPC state for the task-reminder family.
- `features/sms/task-reminder.ts` — typed direct-RPC adapter for one policy-gated task reminder.
- `app/(dev)/demos/tests/sms/` — internal testing and diagnostics.
- `app/api/sms/verify/route.ts` — Twilio Verify plus verified-consent persistence.
- `app/api/sms/preferences/route.ts` — preference reads/writes; enabling requires existing verified consent.
- `app/api/sms/send/route.ts` — authenticated outbound send path.
- `app/api/webhooks/twilio/sms/route.ts` — inbound messages and keyword handling.
- `app/api/webhooks/twilio/status/route.ts` — delivery-state updates.
- `lib/sms/` — Twilio messaging client, send/receive, verification, number management, and notification services.
- `lib/communications/providers/twilio/webhook-validation.ts` — shared Messaging/Voice signature validation.

---

## Data model

All SMS tables live in the `communication` schema. The enrollment contract primarily uses:

- `sms_notification_preferences` — the user-selected destination, notification switch, and assistant-message switch. Its legacy preferred-agent fields are constrained NULL compatibility fields, never agent authority.
- `sms_consent` — current SMS-local consent status, method, timestamp, source IP, and versioned disclosure metadata. It is transitional: its live uniqueness is only `(phone_number, consent_type)`, while `crm.contact_medium` is the intended organization/purpose-aware authority.
- `sms_phone_numbers` — owned/assigned Twilio senders; `assistant_enabled` is the operator-wide program kill switch, never the user toggle.
- `sms_conversations`, `sms_messages`, `sms_media` — durable messaging history.
- `sms_webhook_logs` — webhook diagnostics.

---

## Key flows

### Verified web opt-in

1. A signed-in user opens Communication → Messaging and enters a mobile number.
2. The unchecked disclosure must be affirmatively accepted before `/api/sms/verify` starts Twilio Verify.
3. A successful OTP check writes `sms_consent` with the exact disclosure version and public policy paths.
4. Only after that write succeeds does the route enable `sms_notification_preferences.sms_enabled`.

### Web opt-out

1. The user disables SMS in Messaging settings.
2. `/api/sms/preferences` disables delivery and marks the transactional consent row `opted_out` with `opt_out_method='web_form'`.
3. Keyword opt-out remains handled by the inbound-message trigger for STOP-like replies.

### Outbound delivery

1. Assistant/test replies are first enqueued in `sms_messages`, then claimed by the long-running aidream SMS dispatcher.
2. The dispatcher calls Twilio once and finalizes an explicit provider-creation outcome: accepted, known-failed, or uncertain. An uncertain send is never automatically retried.
3. The Twilio status callback includes the local outbound UUID. The signed webhook can safely correlate an early callback before the provider SID has been finalized, then advances delivery status monotonically.
4. Legacy callers through `lib/sms/send.ts` still call Twilio before inserting the local message; that path retains a durability gap and must not replace the assistant outbox.

### Personal text assistant

1. A signed-in user enrolls a verified phone through the ordinary SMS settings flow.
2. The Text assistant section reads transport readiness directly from `communication.get_my_sms_assistant_program` and controls only delivery through `communication.set_my_sms_assistant_enabled`.
3. **Agent identity resolves only through `sms.owner_beta`.** The canonical `MandateAgentPicker` writes its Holder/version choice through the Mandate Binding API; the settings surface never writes an agent id into communication tables.
4. The inbound webhook durably claims the provider event, gives STOP/HELP/START precedence, resolves the exact provider/account/source/destination/program/user/CRM/conversation binding, and queues only a resolved, ready assistant turn.
5. Aidream resolves `sms.owner_beta` fresh for the exact user and organization on every admitted turn, runs the resolved Holder against the reserved canonical chat conversation with its complete authored tool set, atomically enqueues the reply, and delivers it through the durable outbound worker. Read-only tools run normally; consequential invocations suspend for exact-action approval and recent app re-authentication.
6. Pause changes delivery only and preserves the Binding. Holder/version changes happen only through the canonical Mandate surface and leave ordinary SMS-notification enrollment unchanged.

### Notification-family preferences

1. After verified SMS enrollment, the Messaging surface loads the caller's task-reminder choice through `communication.get_my_sms_task_notification_preference`.
2. The checkbox is an explicit opt-in and never infers permission from global SMS consent or from the text-assistant switch.
3. `communication.configure_my_sms_task_notifications` changes only `task_notifications`, is gated by `auth.uid()`, and refuses enablement without the existing verified, opted-in program binding.
4. A blocked task-reminder action opens the exact Task reminders control through the canonical setting-door deep link, rather than dropping the user at the top of Messaging.

### Actionable task reminder

1. From the canonical task editor, the user confirms **Text reminder**.
2. The authenticated `communication.enqueue_my_task_sms_reminder` RPC proves task edit access, then requires exactly one caller+program enrollment independently of the task's workspace. Missing or ambiguous enrollment creates no durable intent.
3. After non-recurring/open-task, consent, quiet-hours, suppression, and rate-limit checks, one transaction creates the notification, durable queued outbound message, and one `platform.assists` offer whose only SMS alias is `DONE`; every communications row belongs to the enrollment organization, while the task id remains the exact action target. Duplicate clicks return the same durable identities.
4. An inbound `DONE` is initially stored as skipped/unverified. The service-role admission RPC promotes it only when exactly one well-formed offer matches the same user, organization, conversation, and outbound message. Missing, malformed, or ambiguous offers remain terminally skipped.
5. Aidream drains expired command recovery first, then fresh exact commands, then ordinary agent turns. Command execution does not require or fabricate a saved-agent binding; generic text still does.

---

## Invariants

- Phone ownership verification is not consent by itself; the explicit disclosure must also be accepted.
- `sms_notification_preferences` never manufactures a consent row. Enabling requires an existing verified, opted-in record for the same user and number.
- The public SMS page, privacy policy, terms URL, settings disclosure, and recorded consent metadata describe one program and must stay aligned.
- `siteConfig.legalOperatorName` is the single legal identity for AI Matrx public policies and carrier registration; the SMS program names both that operator and the AI Matrx product.
- Every outbound body passes through `formatSmsBody`; callers do not hand-roll or omit the `AI Matrx:` brand prefix.
- Every message recipient must have applicable consent unless the message is a system/administrative exception with its own lawful basis.
- STOP, HELP, and START take precedence over agent execution and are durably recorded before opt-out enforcement.
- **Phone number alone is not authorization.** Assistant execution requires the exact verified user/program binding returned by the canonical resolver; ambiguous or missing identity executes nothing.
- **Global and user stops are distinct.** `sms_phone_numbers.assistant_enabled` is read-only health on user surfaces; `sms_notification_preferences.ai_agent_messages` is the user's pause/resume switch.
- **Consent, notification families, and assistant replies are independent controls.** Overall verified SMS consent is the delivery prerequisite; `task_notifications` is an explicit family opt-in; `ai_agent_messages` governs only assistant replies.
- **The communication schema never chooses an agent.** `sms.owner_beta` is the named job; its system/org/user/run Binding selects the Holder. Legacy preferred-agent columns are constrained NULL and legacy configuration RPCs do not exist.
- **Transport never edits the Holder's tools.** SMS adds only its database-owned channel context. A `db_write`-or-higher call uses the canonical durable delegated-tool suspension, sends the user an authenticated conversation door, and requires a 15-minute, single-use approval bound to the exact canonical tool name, normalized arguments, user, organization, and conversation. Stale sessions complete an email OTP re-authentication before approval; secrets in arguments are redacted in the review card.
- **A word is never authority.** `DONE` executes only through one exact durable offer; zero, malformed, or ambiguous offers never enter the worker queue.
- **Task workspace is not transport tenancy.** An editable task may belong to any workspace; the caller's one active program enrollment owns the notification, conversation, message, and assist rows. Zero or multiple enrollments fail before durable intent.
- A worker crash must not mint a second chat turn or Twilio send. Expired processing/sending claims become explicit stuck/uncertain work for repair, never automatic retries.
- Twilio accepting an API request is not proof of delivery; delivery status comes from the status webhook.
- Message reads page newest-first, but conversation surfaces render each page oldest-to-newest.

## Production gaps verified 2026-08-15

- Legacy `lib/sms/send.ts` calls the provider before durable local intent/claim creation; assistant/test delivery already uses the durable outbox.
- The canonical task-reminder producer enforces both hourly and timezone-local daily caps; legacy notification senders have not all converged on that producer contract.
- The broad `system` category bypasses consent and quiet hours and needs a closed, allowlisted definition.
- Legacy notification senders can still write notification rows with `message_id = null`; the canonical task-reminder transaction links the message before commit.
- SMS consent has not converged on the canonical CRM contact-medium eligibility authority.
- Recurring-task/SNOOZE actions, tenant messaging, and the dynamic PSTN voice layer remain roadmap work in the cross-repo plan.

---

## Change log

- `2026-08-18` — Added exact-action SMS authorization without narrowing the Mandate Holder: service-role-only atomic confirm/consume RPCs, recent AMR enforcement, 15-minute single-use receipts, authenticated chat deep links, a redacted approval card with email OTP re-authentication, and cold-resume support for durable pending calls. The existing `sms/assistant` context injection remains unchanged.

- `2026-08-18` — Replaced the SMS assistant's direct agent/version pointers with the canonical `sms.owner_beta` Mandate and user Binding; runtime resolves the Holder fresh per admitted turn, Messaging uses the canonical Binding picker, and legacy agent-selection RPCs/columns are retired as authority.
- `2026-08-17` — Removed the task-workspace coupling from `enqueue_my_task_sms_reminder`: exact caller+program enrollment now resolves independently, all communication artifacts stay in the enrollment organization, and zero/multiple enrollments fail closed before any durable intent.
- `2026-08-15` — Added the production Task reminders preference: a direct authenticated getter/setter pair that can change only the caller's task-notification family, a novice-facing checkbox on Messaging, and an exact setting-door recovery from a blocked task reminder.
- `2026-08-15` — Added the first canonical actionable notification: the task editor queues a branded, consent/quiet-hours/rate-limited non-recurring task reminder through a direct authenticated RPC, with exact `DONE` offer correlation, command-first no-agent admission, crash recovery, and fail-closed zero/malformed/ambiguous handling.
- `2026-08-15` — Aligned the inbound webhook test with the canonical `www.aimatrx.com` signing host and current processor result contract; the route now accepts the standard `Request` surface it actually consumes.
- `2026-08-15` — Added the production personal text-assistant binding to Messaging settings using direct authenticated, program-scoped RPCs; added durable provider-event claims, exact identity/conversation resolution, policy-keyword precedence, canonical agent execution with tools disabled, durable agent/outbound workers, crash fences, early status-callback correlation, and separate global/user kill switches.
- `2026-08-15` — Moved the canonical Twilio signature validator to the shared communications
  provider adapter and removed the former SMS-only implementation after migrating every consumer.
- `2026-08-15` — Linked the cross-repo communications record and corrected the feature truth after a live/source audit: documented the transitional consent authority, Twilio-before-ledger ordering, broken START path, pending messages without a worker, incomplete identity resolution, unenforced daily cap, broad system bypass, and unlinked notification receipts.
- `2026-08-12` — Rendered the newest SMS history page in chronological chat order while preserving newest-first pagination.
- `2026-08-11` — Aligned the public SMS program and site policies to the registered legal operator, versioned the revised consent, and branded every outbound body before send and logging.
- `2026-07-20` — Added a public, carrier-reviewable consent path and SMS terms; moved enrollment into production Messaging settings; versioned the verified consent record; prevented preferences from creating unverified consent; and made the test surface distinguish Twilio acceptance from confirmed delivery.
