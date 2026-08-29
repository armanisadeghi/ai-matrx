# Landing invitation system

**Last verified:** 2026-08-28

**Current state:** Public access requests and admin review are operational. Invitation codes are not yet enforced or consumed by account creation, so the site is not end-to-end invitation-only.

This document describes what the invitation surfaces actually do. It deliberately does not treat a generated code, an email, or the words “Invitation Only” as proof that signup is gated.

## User-facing entry points

- The public landing page offers **Enter Invitation Code** and **Request Access**.
- `RequestAccessModal` collects the required request fields, saves step 1, and offers optional follow-up questions in step 2.
- `InvitationCodeModal` validates an exact code candidate at a server-only boundary, then routes to `/sign-up?invitation=...` when it is active, unexpired, and has remaining uses.
- `/request-access/thank-you` confirms that the request was saved. Email delivery is best effort and is not the source of truth for whether the database write succeeded.

## Request flow

```text
Landing page
  -> submitInvitationRequestStep1
  -> users.invitation_requests (pending, step_completed = 1)
  -> best-effort applicant acknowledgement email
  -> best-effort admin notification email
  -> optional submitInvitationRequestStep2
  -> same request row (step_completed = 2)
```

The public form calls server actions in `features/landing/actions.ts`. Those actions use the server-only Supabase admin client because the request table contains private applicant data and is not directly writable or readable by anonymous browser clients. Every new request is explicitly assigned to the platform system organization with personal visibility.

An email address with an existing pending or approved request receives the same success-shaped response without exposing the existing private request ID. A previously rejected email may submit a new request.

The admin notification links to the canonical production review surface:

`https://manage.aimatrx.com/administration/users/invitations`

## Admin review and code issuance

The invitations table is owned by the protected users administration surface. Its mutation route is `app/api/admin/invitation-requests/[id]/route.ts` and requires a super-admin session.

Approval currently performs these operations:

1. Refuse the action unless the request is still pending.
2. Generate a random `XXXX-XXXX-XXXX` code with `public.generate_invitation_code()`.
3. Insert a personal-visibility row in `users.invitation_codes`, explicitly assigned to the platform system organization, with one allowed use and a 30-day expiry.
4. Mark the request approved with reviewer identity, timestamp, and optional notes.
5. Attempt to email the code and signup link to the applicant.

Rejection records the reviewer, timestamp, notes, and optional rejection reason, then attempts a notification email. The admin UI distinguishes a completed database decision from a failed email instead of claiming the applicant was notified.

Code issuance and request approval are currently two database writes rather than one atomic RPC. If the second write fails after the code row is created, an orphan code is possible. This is a known integrity gap.

## Code privacy and validation

Invitation codes are credentials. Code rows use personal visibility and anonymous roles have no table or column privileges on `users.invitation_codes`. Exact-code validation happens in `validateInvitationCode()` using the server-only admin client and returns only `{ valid: boolean }`; it never returns a row ID or code record to the browser.

`public.mark_invitation_code_used(text, uuid)` is restricted to the service role. The helper in `features/landing/actions.ts` is not currently called by signup and must not be treated as proof of code consumption.

## What account creation actually does

As of the verification date, `/sign-up` ignores the `invitation` query parameter. Email/password signup and OAuth signup do not validate, reserve, or consume an invitation code. The route can be visited directly without first requesting access.

Therefore:

- **Requesting access works.**
- **Admin approval and code email exist.**
- **Code validation in the landing modal works.**
- **Account creation is not invitation-gated.**
- **Issued codes are not marked used by signup.**
- **The `invited` and `converted` request statuses are not currently advanced by signup.**

Closing this gap requires one atomic server-side account-creation contract that validates and consumes the code exactly once, associates the resulting user, advances the request lifecycle, and covers both password and OAuth signup without losing the invitation during redirects.

## Data and delivery

Primary tables:

- `users.invitation_requests`: applicant details, optional follow-up answers, lifecycle status, and review metadata.
- `users.invitation_codes`: private code credential, request relationship, usage count, expiry, recipient, and eventual user relationship.

Application email uses the shared Resend client in `lib/email/client.ts`. Invitation templates live in `features/invitations/emailService.ts`. `RESEND_API_KEY`, `EMAIL_FROM`, and `ADMIN_EMAIL` configure this application-email path; Supabase authentication email uses a separate SMTP configuration.

Request and review database writes do not roll back when email delivery fails. That is intentional for intake durability, but delivery failures must stay visible to administrators and logs.

## Known gaps

- Signup does not enforce or consume invitation codes.
- Approval is not atomic across code creation and request status update.
- The 30-day expiry is hardcoded rather than governed by a feature knob.
- Public request submission has no dedicated rate limit or abuse challenge.
- Review actions rely on row metadata and application logs; there is no separate durable review-event ledger.
- Invitation email templates interpolate applicant/admin-provided text and need an explicit HTML-escaping audit.

Do not describe the system as fully invitation-only until the signup contract is implemented and verified through both password and OAuth paths.

## Operational checks

When request submission fails:

1. Check application logs for `submitInvitationRequestStep1` and structured Supabase errors.
2. Verify the server runtime has valid Supabase service-role configuration.
3. Confirm the write carried the platform system organization and personal visibility.
4. Verify the row in `users.invitation_requests`; do not infer database failure from an email failure.
5. Test with a transaction-rolled-back canary whenever possible so no applicant record or email is retained.

After schema changes, apply and verify the migration live, update the shared migration ledger, regenerate database types, and run the migration and type gates.

## Change log

- `2026-08-28` — Restored public request intake through a server-only write boundary after regenerated RLS removed the legacy anonymous insert policy; added explicit organization/visibility ownership, duplicate-request privacy, private code validation, honest email status, repeat-review protection, canonical admin links, and this verified system map.
