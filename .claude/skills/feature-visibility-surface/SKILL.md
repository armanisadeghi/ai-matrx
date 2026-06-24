---
name: feature-visibility-surface
description: >-
  Use whenever you build or extend a feature whose results the user would
  otherwise not see — especially one backed by a server capability in aidream.
  The rule: in the SAME work, ship a live visibility/test page — a no-privilege
  DEMO page, or an ADMIN page when it needs special access — that reads the LIVE
  backend and lets the user trigger/test it with a few controls, so they have one
  place to verify your results after every change instead of being blind for
  multiple turns. Triggers on "I added a backend endpoint", "new feature with no
  UI to see it", "how do I test this", or any capability whose output only shows
  up in logs / the DB / an agent run. Worked example: features/action-catalog/ +
  /administration/action-catalog.
---

# Ship a visibility surface with every feature (frontend recipe)

> **A feature the user can't open and watch work is a feature you'll both burn turns
> guessing about.** Build the page in the SAME change — it's the next file, not a ticket.

## Demo page or admin page?

- **No privileges to view** → **demo**: `(dev)/demos/<name>/page.dev.tsx` (auth shell) or
  `(public-demos)/demos/public/<name>/page.tsx` (no auth). Auto-listed at `/demos`. Use the
  `new-route-scaffold` skill to place it.
- **Needs privileged / cross-user / admin data or actions** → **admin**:
  `(admin)/administration/<name>/page.tsx` (super-admin gated at the layout; lower with an
  in-page `selectIsAdmin` seam if org-admins should reach it later).

Prefer the lower bar (demo) when unsure.

## The recipe (self-contained `features/<name>/`)

- **Read the live backend, never hardcode the URL.** Resolve the base from
  `selectResolvedBaseUrl` (`apiConfigSlice`) — the same value every backend call uses, so
  the admin server toggle routes it. Runtime-guard the JSON (untrusted). For authed
  POST/execute calls use the canonical backend client (`lib/api/backend-client.ts` →
  `createAuthenticatedClient`), not a hand-rolled fetch.
- **Make it a test bench, not just a viewer.** A few `Select`/inputs to drive the feature;
  show the REAL result (and, for actions, the receipt). Reuse existing renderers — e.g. the
  `features/matrx-envelope` block renderer for live reference chips — never fork one.
- **Real states + real-time.** Component-library loading/empty/error states (never plain
  "Loading…"), a manual Refresh + light polling so it mirrors the live server with no
  redeploy.
- **Standards.** Semantic tokens only, Lucide icons, no emojis, dense + scannable for an
  admin surface (see `ui-dense` / `data-dense-panels`). No new barrels; import from source.

## Reuse, never fork

Base URL resolver, backend client, component library, admin gate, envelope renderer — all
exist. If you're writing a second fetch layer or a second renderer, stop.

## Worked example (copy its shape)

`features/action-catalog/` → `/administration/action-catalog`: a live grid of every
capability (read from `GET /actions/catalog`) + a dropdown builder that runs one and shows
the receipt (`POST /actions/execute`). That's the bar.

## Done means

The page opens, reads the **live** backend, shows the real output, lets the user
trigger/test the meaningful path, is reachable (feature admin map / `/demos` index), and you
told the user the exact URL + what they'll see in your turn summary.
