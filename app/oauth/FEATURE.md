# OAuth consent and application handoff

This route is the first-party Supabase OAuth consent surface used by AI Matrx clients. It verifies
the current browser user, asks Supabase for the authoritative authorization details, and redirects
only to the exact `redirect_url` returned by Supabase after an existing, approved, or denied
authorization.

## Redirect invariant

The page attempts the normal automatic redirect immediately. The redirecting state must also keep
an ordinary user-gesture link to the same provider-issued URL. Browsers can require a gesture or
confirmation before handing an OAuth result to a desktop custom protocol such as `vscode://`; an
infinite spinner is not an acceptable fallback. The page never constructs, rewrites, logs, or
persists a callback URL or token.

## Entry points

- `consent/page.tsx` — Suspense boundary and route entry.
- `consent/ConsentClient.tsx` — authentication check, authorization details, consent actions, and
  redirect recovery.
- `callback/[app]` — separate named web-app callback flow; it is not the desktop custom-protocol
  handoff.

## Change log

- 2026-08-09 — Added a user-gesture continuation for provider-issued redirect URLs so browsers
  that suppress automatic custom-protocol handoff do not strand an already-authorized user.
