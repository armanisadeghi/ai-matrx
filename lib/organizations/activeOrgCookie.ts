// lib/organizations/activeOrgCookie.ts — the ONE binding of the shared
// active-organization cookie to THIS app's identity (its apex domain).
//
// The cookie (`matrx-active-org`, `Domain=.aimatrx.com`) is how every Matrx
// surface on the apex — this app, Workflow Studio at workflows.aimatrx.com —
// remembers the SAME last-active organization for the same person. This app
// also keeps its own IndexedDB/localStorage cache (the sync engine's
// `appContextPolicy`), which is per-origin and therefore invisible to Studio;
// the cookie is the cross-origin memory on top of it. The cookie is
// identity-keyed (user id + org id); a second person on this browser reads
// null. Everything hard lives in the package (`@ai-matrx/data/db`).
//
// Where it is read and written:
//   - written by `activeOrgCookieMiddleware` on every REAL change of
//     `appContext.organization_id` (switch, first choice, cache restore);
//   - read by `resolveActiveOrgContext` as rung 1 of the canonical order
//     (stored selection → durable default → sole membership → null);
//   - read by `appContextPolicy.deserialize` so a choice made in Studio beats
//     this app's stale local cache at boot;
//   - cleared on explicit sign-out (SignOutMenuItem, AuthSessionWatcher).

import { createActiveOrgCookie } from "@ai-matrx/data/db";

export const activeOrgCookie = createActiveOrgCookie({
  apexDomains: ["aimatrx.com"],
});
