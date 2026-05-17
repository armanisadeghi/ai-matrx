---
name: connect-matrx-extend
description: Wire matrx-frontend into the matrx-extend Chrome extension's bridge — adding or modifying a `FRONTEND_RPC` action handler, declaring a new window-panels deep-link entry point for the extension to trigger, exposing a new headless API route for the extension to call, or debugging a silent `chrome.runtime.sendMessage` / Broadcast round-trip. Scope guardrail: this skill is for the matrx-frontend side of the bridge (Next.js admin UI at aimatrx.com). Do NOT use it for changes that live inside the matrx-extend repo itself, the matrx-local Tauri desktop app, or the aidream backend — each of those has its own connect-* skill.
---

# Connect matrx-extend (frontend side)

This skill is the matrx-frontend-side how-to for the cross-repo bridge to
matrx-extend. The runtime channel does not exist yet — Phase 2 of the
master plan ships it. For the full architectural reference and master
spec, see [`docs/MATRX_EXTEND_CONNECTION.md`](../../../docs/MATRX_EXTEND_CONNECTION.md).

---

## 30-second mental model

matrx-frontend is the UI; matrx-extend is a Chrome extension. They
coordinate through **two substrates** that share **one envelope**:

- `chrome.runtime.onMessageExternal` (same-machine RPC; whitelisted
  origins in `wxt.config.ts`).
- Supabase Broadcast on `matrx-extension-bridge:<userId>` (cross-machine).

Both carry the same `{ channel: "FRONTEND_RPC", action, payload, requestId }`
envelope. Auth is the same Supabase project on both sides — JWTs are
reusable. UI-bound actions usually route through the existing
window-panels deep-link (`?panels=<typeKey>:<instanceId>`) instead of a
bespoke RPC.

---

## When to use this skill

- Adding a new `FRONTEND_RPC` action handler that the extension can
  invoke (e.g. `conversation.appendMessage`).
- Wiring a new window-panels deep-link entry point that the extension
  will trigger via `?panels=...`.
- Exposing a new headless API route under `app/api/extension/...` for
  extension consumption.
- Debugging silent failures in the extension → frontend round-trip
  (whitelist mismatch, auth mismatch, `requestId` not being echoed).

## When NOT to use this skill

- UI-only changes that don't cross the extension boundary (use
  `window-panels` skill instead).
- Pure Next.js routing / SSR / Server Component work (use `nextjs` /
  `nextjs-ssr-architecture`).
- Changes inside the matrx-extend repo itself (use that repo's own
  skills via the worktree).
- Authentication scheme changes — Supabase auth is shared; touch
  `protected-resources` skill territory only when adding a new
  Super-Admin-locked surface.

---

## Quick start — adding a new `FRONTEND_RPC` action

The bridge ships in Phase 2; this is the planned shape.

1. **Pick a dot-namespaced action name** —
   `conversation.appendMessage`, `panel.open`, `task.create`. Treat
   action names as public API; renaming is a breaking change.
2. **Decide where the handler lives.** Extension → frontend traffic
   lands in one of:
   - A planned headless API route (`app/api/extension/<action>/route.ts`),
     called via `fetch` from the extension SW. Use the dual-auth
     pattern from `app/api/mcp/[transport]/route.ts` (cookie OR
     Bearer; cookie wins).
   - The window-panels deep-link if the action is "open this UI" —
     add a `urlSync.key` to the registry and a `registerPanelHydrator`
     in `features/window-panels/url-sync/initUrlHydration.ts`. No
     new RPC needed.
   - A Broadcast subscriber inside the relevant Redux slice when the
     action is "react to extension event" rather than "do something
     and reply."
3. **Reply with the same `requestId`** — every reply carries the
   request's `requestId` so the caller can match. Failure replies
   include `{ ok: false, error: { code, message } }`; never throw
   across the substrate.
4. **Update both docs** — list the action in
   `docs/MATRX_EXTEND_CONNECTION.md` § Inbound actions and in the
   matrx-extend master at `docs/CROSS_REPO_INTEGRATION.md`. Stale docs
   cascade across the four repos.

---

## File index

| Path | Role |
|---|---|
| `docs/MATRX_EXTEND_CONNECTION.md` | Architecture + protocol reference for this side of the bridge. |
| `lib/supabase/messaging.ts` | Broadcast / Presence / Postgres Changes substrate. Add the `matrx-extension-bridge:<userId>` channel here. |
| `features/window-panels/registry/windowRegistry.ts` | Window registry — declare `urlSync.key` for any panel the extension will deep-link into. |
| `features/window-panels/url-sync/initUrlHydration.ts` | `registerPanelHydrator(...)` for each `urlSync.key`. |
| `app/api/agent/feedback/route.ts` | Reference Bearer-`AGENT_API_KEY` route for headless calls. |
| `app/api/mcp/[transport]/route.ts` | Reference dual-auth route (cookie OR Bearer, with `?token=` fallback). |
| `app/api/extension/append-message/route.ts` | **Planned (Phase 2 — does not exist).** First headless route the bridge will add. |

### Known dead references (do NOT build on these)

These two fragments mention `chrome-extension` but are not the bridge.
Future agents see them and think the bridge already exists; it does
not. Leave them alone in unrelated PRs.

- `features/surfaces/data/surface-candidates.ts:24` —
  `chrome-extension` in the `client_name` type union, no surface declared.
- `utils/errorContext.ts:10` — defensive stack-frame filter for
  `chrome-extension://` URLs in reported errors.

---

## Failure modes

### Silent — `chrome.runtime.sendMessage` returns nothing

The page origin is not in `wxt.config.ts` `externally_connectable.matches`.
No error is thrown; the callback never fires. Verify by:

1. Open the extension's service worker console (`chrome://extensions`,
   click "service worker").
2. Watch for the inbound message. If it never arrives, check the
   matches list against the current `window.location.origin`.
3. Common miss: a new Vercel preview URL pattern that the
   `https://*-armani-sadeghis-projects.vercel.app/*` rule doesn't
   cover.

### Silent — Broadcast publish succeeds, no reply

Channel name typo or the receiver isn't subscribed. Verify by:

1. Both sides MUST use the exact same channel string —
   `matrx-extension-bridge:<userId>`. No prefix drift.
2. Run `client.getChannels()` on both sides to confirm the channel is
   joined. Broadcast silently drops messages with no subscribers.
3. The subscriber must call `.subscribe()` after `.on('broadcast', ...)`.
   Forgetting this is a common silent failure.

### Loud — 401 Unauthorized on the planned headless API route

Auth check failed. Verify by:

1. If using cookie auth, the request must originate from a tab on
   this app's origin (cookies are scoped, the SW does not carry them).
2. If using Bearer, confirm the token is the user's Supabase JWT
   (not `AGENT_API_KEY` — that's for the agent feedback route only).
3. Read `app/api/mcp/[transport]/route.ts` for the canonical
   dual-auth pattern.

### Loud — Deep-link `?panels=...` does nothing

A registry entry has `urlSync.key` but no hydrator. Verify by:

1. Open the JS console after navigating with the URL — a dev assertion
   in `initUrlHydration.ts` logs an error for any `urlSync.key`
   without a matching hydrator.
2. Add the missing `registerPanelHydrator(key, (dispatch, id, args) => ...)`.

---

## Where to look next

- `docs/MATRX_EXTEND_CONNECTION.md` — full protocol, auth model, and
  pointer to the master.
- `.matrx/AGENT_INSTRUCTIONS.md` — how cross-repo task hand-offs flow
  through this repo.
- Master cross-repo doc (in matrx-extend):
  `/Users/armanisadeghi/code/matrx-extend/.claude/worktrees/exciting-moser-4b984f/docs/CROSS_REPO_INTEGRATION.md`.
