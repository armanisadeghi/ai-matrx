# HRB-001 completeness — what hr_c4_52 and hr_c4_53 actually did

The auto-committer swept these changes into `ffe3889faa`, whose message bundles them with another
lane's work. This file carries the reasoning that commit does not.

## The shape of both defects: a door that was BUILT AND UNUSED

Neither item was a missing feature. Both were a working door with nothing walking through it — the
failure a door-count audit cannot see, because the door passes every test you point at it.

## Item 1 — `outcome` had zero producers (0 of 498), closed by `hr_c4_52`

`communication.record_notification_outcome` worked and refused bad values. It had no callers.

The root cause was **not a forgotten call but an authorization shape**. The public door authorizes
on `recipient_user_id = auth.uid() OR created_by = auth.uid() OR is_platform_admin()`. Three of
SPEC-NOTIFICATIONS §5.2's five outcomes — `ignored`, `superseded`, `undeliverable` — are the ENGINE
speaking about somebody *else's* notice. There was no door those producers could walk through, so
adding call sites to the existing door would have failed. Hence the internal writer
`communication._set_notification_outcome`, executable by nobody outside the definer chain (anon,
authenticated and service_role are all denied), plus `hr._wf_notice_outcome` to select the notices
a step's event speaks for.

Four producers wired at the real events: `hr.wf_decide` (attestation -> `acknowledged`, any other
decision -> `decided`), `hr._wf_not_attested` (`no_response` -> `ignored`), `hr._wf_target_changed`
(-> `superseded`), `communication.finalize_notification` (dead-letter -> `undeliverable`).

Two rules the wiring encodes, both of which the proof would go red without:
- **First outcome wins.** `and n.outcome is null` — a later producer cannot rewrite what happened.
- **A `skipped` notice never gets an outcome.** It was never in front of anybody to act on
  (the hr_c4_41/44 law).

## Item 2 — `delivered_at` was 0 of 142 on email, closed by `hr_c4_53` + the route

**Investigated before building, and the verdict was the good one: the Resend webhook pipe ALREADY
EXISTED.** `app/api/webhooks/resend/route.ts` is a live receiver — Svix headers, HMAC against
`RESEND_WEBHOOK_SECRET`, a typed switch over all seven Resend events — sitting in the established
family beside the Twilio receivers. So there was **no new endpoint, no new secret, and no config
question for Arman**.

What was missing was one handler body. `handleEmailDelivered` was a stub:

```ts
console.log("Email delivered:", data.email_id);
// Update delivery status in database if needed
```

The provider told us and nobody wrote it down. The join key already existed and was already
populated: our sender stores Resend's id in `communication.notification.provider_message_id`, and
Resend's webhook carries the same value as `data.email_id`.

`communication.record_provider_delivery` is service_role-only, idempotent (a Svix redelivery never
moves the recorded moment of delivery — delivery evidence is evidence, and the first report is the
true one), and match-scoped (an unknown id stamps nothing and returns 0, a normal no-op).

**Deliberately NOT wired: `opened`.** §5.2 rules out tracking pixels as read state; `read_at` is
stamped only by a deep-link follow. `bounced` and `complained` are real delivery evidence and are
one line each on this same pipe, but they change failure semantics, so they are reported as
available rather than bundled in.

## Historical rows were left alone, on purpose

Neither migration backfills. Existing notices keep `outcome IS NULL` and `delivered_at IS NULL`
because no outcome and no delivery report was ever observed for them — inventing one would be
writing false evidence. Both fields fill from real events going forward.

## Proof

`scripts/hr/hrb001_outcome_and_delivery_proof.py` — 33 assertions, 0 RED, database left
byte-identical. The load-bearing nodes drive the real engine (`public.hr_wf_decide` on unmodified
live steps, `hr._wf_target_changed`, `communication.finalize_notification`) and read the outcome
back off the notice; they never call the new helper directly, since that would only prove the
helper works, which was never in doubt.

Two limits are stated in the proof rather than papered over: `acknowledged` and `ignored` have no
real-event node, because no live attestation step is decidable (both active subjects are no-login
employees, and `wf_decide` authorizes against `resolved_approver_ids` frozen at activation) and
both live attestation steps close as `no_reach` rather than `no_response`. §1G asserts what
actually matters there — that a no-reach close does NOT stamp `ignored`, because an employee must
never be recorded as having ignored a message nobody could send them.
