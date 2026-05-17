# matrx-extend Connection — Frontend

**Status:** Phase 2 has shipped. The bridge runs over two substrates
(extension-side `externally_connectable` and Supabase Broadcast on
`matrx-extension-bridge:<userId>`) carrying a shared `FRONTEND_RPC`
envelope. The Broadcast subscriber lives in
`hooks/useExtensionBridgeChannel.ts`; the reference inbound route is
`app/api/extension/append-message/route.ts`; and the surface is
declared as `chrome-extension/agent-bridge` in
`features/surfaces/data/surface-candidates.ts`.

This is the matrx-frontend-side reference. The master doc lives in the
extension repo — see [§ Pointer to master](#pointer-to-master) at the
bottom.

---

## TL;DR

- matrx-frontend is the Next.js 16 admin / no-code-builder UI at
  `aimatrx.com` (and `mymatrx.com`). matrx-extend is the Chrome
  extension (the agent harness).
- The bridge has shipped: `useExtensionBridgeChannel` subscribes the
  Broadcast channel, `app/api/extension/append-message` is the
  reference inbound route, and the `chrome-extension/agent-bridge`
  surface candidate now declares it (see [§ Surface area](#surface-area)).
- Phase 2 will add **two substrates** that share one envelope:
  `chrome.runtime.onMessageExternal` (same machine) and Supabase
  Broadcast (cross machine). A single `FRONTEND_RPC` envelope rides on
  both.
- Auth is the same Supabase project (`txzxabzwovsujtloxrus`) on both
  sides — JWTs are reusable, no new identity surface to design.
- The window-panels deep-link (`?panels=<typeKey>:<instanceId>`) is the
  intended public entry point when the extension wants to drive the
  UI directly without a custom RPC.

---

## Role

matrx-frontend is the Next.js 16 (App Router) admin and no-code-builder
UI at `aimatrx.com`. It hosts conversation/agent management, the
window-panels overlay system, settings, dashboards, and every authoring
surface for the platform. It already speaks Supabase, exposes headless
API routes, and has a robust realtime substrate.

matrx-extend is a Chrome extension that runs alongside the user's
browsing session and needs to coordinate with this app for cross-surface
workflows — opening a panel from the extension, appending a message to
a conversation hosted here, or signaling that the user has captured a
page that the admin UI should react to.

The integration channel is live as of Phase 2. This doc describes
the substrates, the auth model, and how to add new commands.

---

## Surface area

Concrete files in this repo that the extension bridge will touch when
Phase 2 lands:

| Path | Role |
|---|---|
| [`lib/supabase/messaging.ts`](../lib/supabase/messaging.ts) | Broadcast / Postgres Changes / Presence substrate. Already used by conversation, typing, and presence channels. Adding a `matrx-extension-bridge:<userId>` channel slots in here. |
| [`features/window-panels/`](../features/window-panels/) | Overlay registry + URL deep-link substrate. The extension uses `?panels=<typeKey>:<instanceId>` to open a specific panel without a bespoke RPC. |
| [`features/window-panels/registry/windowRegistry.ts`](../features/window-panels/registry/windowRegistry.ts) | Per-window deep-link declarations (`urlSync.key`). |
| [`features/window-panels/url-sync/initUrlHydration.ts`](../features/window-panels/url-sync/initUrlHydration.ts) | Where each `?panels=...` key gets a hydrator. |
| [`app/api/agent/feedback/route.ts`](../app/api/agent/feedback/route.ts) | Reference Bearer-`AGENT_API_KEY` route — pattern the extension's headless calls will follow. |
| [`app/api/mcp/[transport]/route.ts`](../app/api/mcp/[transport]/route.ts) | Reference dual-auth route (Bearer or `?token=`). |
| [`app/api/extension/append-message/route.ts`](../app/api/extension/append-message/route.ts) | Headless conversation message-append endpoint — Phase 2 reference inbound route for the extension. |
| [`hooks/useExtensionBridgeChannel.ts`](../hooks/useExtensionBridgeChannel.ts) | Page-side Broadcast subscriber for `matrx-extension-bridge:<userId>`. Receives FRONTEND_RPC events on cross-machine paths. |
| [`lib/extension-bridge/openPanelHandler.ts`](../lib/extension-bridge/openPanelHandler.ts) | Translates inbound `openPanel` envelopes into `openOverlay({...})` Redux dispatches against the window-panels store. Validates the payload with `OpenPanelPayloadSchema` and rejects unknown overlayIds. |
| [`lib/extension-bridge/ExtensionBridgeSubscriber.tsx`](../lib/extension-bridge/ExtensionBridgeSubscriber.tsx) | Top-level bridge subscriber, mounted in `app/Providers.tsx`. Filters `extension->frontend` envelopes for `action: "openPanel"`, calls the handler, and publishes the structured reply on the same Broadcast channel preserving `requestId`. |
| `wxt.config.ts` (in matrx-extend, NOT this repo) | `externally_connectable.matches` whitelist. Listed here as a cross-repo reference because the whitelist must include this app's origins. |

### Recent change — `chrome-extension` is now a real surface candidate

Previously, two fragments mentioning `chrome-extension` were dead
references. With Phase 2 shipped, one is now backed by the real bridge:

- [`features/surfaces/data/surface-candidates.ts`](../features/surfaces/data/surface-candidates.ts) —
  the `client_name: "chrome-extension"` type union member is now backed
  by a `SURFACE_CANDIDATES` entry: `chrome-extension/agent-bridge`. It
  documents the two substrates (`externally_connectable` +
  `matrx-extension-bridge:<userId>` Broadcast) and links back to this
  doc. The header comment in that file has been updated to reflect the
  shipped state.
- [`utils/errorContext.ts:10`](../utils/errorContext.ts) — defensive
  stack-frame filter that strips `chrome-extension://` URLs from
  reported stack traces. Still harmless, still not a bridge — left as-is.

The real bridge lives in `hooks/useExtensionBridgeChannel.ts` (Broadcast
subscriber) and `app/api/extension/append-message/route.ts` (inbound
RPC reference route). Add new actions there, not by re-using the dead-
reference framing above.

---

## Substrates

Two substrates, one envelope. Both planned for Phase 2.

### 1. `chrome.runtime.onMessageExternal` — same-machine RPC

Direct page-to-extension messaging when the user has both surfaces
open on the same machine. The extension whitelists this app's origins
in its `wxt.config.ts` `externally_connectable.matches`:

```
https://*-armani-sadeghis-projects.vercel.app/*
https://*.aimatrx.com/*
https://*.mymatrx.com/*
http://localhost/*
http://127.0.0.1/*
```

A page in this app calls `chrome.runtime.sendMessage(extensionId, ...)`
and the extension's service worker handles it. Round-trip latency is
sub-millisecond. **Failure mode is silent** — if the page origin is not
in the whitelist, `sendMessage` returns nothing and no error is
thrown. Verify with the extension's SW console.

### 2. Supabase Broadcast — cross-machine signaling

When the user has the extension on one device and this app open on
another (laptop + phone, two laptops, etc.), `onMessageExternal` won't
reach. Broadcast over a per-user channel does:

- Channel: `matrx-extension-bridge:<userId>`
- Substrate: `lib/supabase/messaging.ts` (already wired for
  conversation/typing/presence — adding one more channel is a few
  lines).
- Same envelope as substrate 1 — see below.

### Shared envelope: `FRONTEND_RPC`

```ts
type FrontendRpc<TPayload = unknown> = {
  channel: "FRONTEND_RPC";
  action: string;       // dot-namespaced, e.g. "panel.open" / "conversation.appendMessage"
  payload: TPayload;
  requestId: string;    // UUID — replies match by this
};
```

The substrate-agnostic envelope means a handler doesn't care whether
it arrived via `onMessageExternal` or Broadcast. Replies are published
back over the same substrate and matched on `requestId`.

### Wire formats — single source of truth

[`lib/types/bridge-envelope.ts`](../lib/types/bridge-envelope.ts) is the
canonical module for every wire-format type / constant on the
matrx-frontend side of the bridge. Any new consumer (hook, API route,
demo page, Redux thunk, future server-action) MUST import from there
rather than re-defining the shapes locally.

Exports:

- `BRIDGE_CHANNEL_PREFIX` — `'matrx-extension-bridge'`.
- `BRIDGE_BROADCAST_EVENT` — `'FRONTEND_RPC'` (the Supabase Broadcast
  `event` field; matches the `channel` discriminator on the
  `chrome.runtime.sendMessage` envelope).
- `bridgeChannelName(userId)` — builds the per-user channel name.
- `BridgeDirectionSchema` / `BridgeDirection` — `'frontend->extension'`
  | `'extension->frontend'`.
- `BridgeEnvelopeSchema` / `BridgeEnvelope<T>` — direction-tagged
  Broadcast envelope (`{direction, action, requestId, payload, timestamp}`).
- `FrontendRpcEnvelopeSchema` / `FrontendRpcEnvelope<T>` —
  `chrome.runtime.sendMessage` envelope (`{channel, action, payload, requestId}`).
- `FrontendRpcResponseSchema` / `FrontendRpcResponse<T>` — normalized
  reply (`{ok, result?, error?, requestId?}`).
- `AppendMessageRequestSchema` / `AppendMessageRequest` — body for
  `POST /api/extension/append-message`.
- `AppendMessageResponseSchema` / `AppendMessageResponse` — discriminated
  union of success / error responses for the same route.
- `KNOWN_FRONTEND_RPC_ACTIONS` — documentation-only list of the actions
  the matrx-extend SW currently understands. NOT enforced as an enum;
  the bridge is open-ended.
- `OpenPanelPayloadSchema` / `OpenPanelPayload` — payload shape for the
  `openPanel` action (`{ panelId, instanceId?, data? }`). Validated by
  `lib/extension-bridge/openPanelHandler.ts` before dispatching the
  Redux `openOverlay` action.

`lib/supabase/messaging.ts` re-exports the bridge primitives so existing
imports (`from '@/lib/supabase/messaging'`) keep working, but every new
consumer should import directly from `@/lib/types/bridge-envelope`.

---

## Auth model

Both sides authenticate against the same Supabase project
(`txzxabzwovsujtloxrus`). JWTs are reusable across the boundary.

**Three auth modes, in priority order:**

1. **Supabase session cookie** (browser session for this app's
   origin). Wins when present. Server-side routes read it via
   `createClient()` from `utils/supabase/server.ts` exactly as
   today.
2. **Bearer token** (`Authorization: Bearer <token>`). Used when the
   extension calls headless API routes from a service worker context
   that doesn't carry cookies. Pattern: see
   `app/api/agent/feedback/route.ts` (single Bearer against
   `AGENT_API_KEY`) and `app/api/mcp/[transport]/route.ts` (Bearer or
   `?token=`).
3. **No auth** (rejected — every Phase 2 endpoint requires one of the
   above).

`app/api/dev-login/route.ts` is localhost-only and disabled in
production; it exists for the dev workflow, not for the extension.

---

## Adding a command — inbound (extension → matrx-frontend)

When the extension needs to drive something in this app, the model is:

1. **Define the action** in the `FRONTEND_RPC` envelope —
   `{ channel: "FRONTEND_RPC", action, payload, requestId }`. Use a
   dot-namespaced action name (`conversation.appendMessage`,
   `panel.open`, `task.create`).
2. **Pick the route** the SW-side handler will dispatch into:
   - **Existing API route** — the handler does
     `fetch("/api/...", { method, body })` against an existing
     authenticated route. Reuse where possible.
   - **Redux dispatch** — the handler imports a thunk and dispatches
     it (only valid when running in a page context, not a SW; useful
     for the cross-machine Broadcast substrate where the receiver is
     a tab in this app).
   - **Supabase write** — direct Supabase client call when the action
     is purely a DB mutation that's already covered by an RLS policy.
3. **Reply on the same substrate** — publish back over Broadcast or
   `sendResponse(...)` for `onMessageExternal`. Match on `requestId`.
4. **For UI-bound actions, prefer the deep-link** — instead of writing
   a custom RPC to "open the messages panel for conversation X", emit
   `?panels=messages:<conversationId>` and let the existing
   `initUrlHydration.ts` machinery do the work. The
   `urlSync.key`-driven hydrators are already the public surface
   for this.

**Concrete shape (Phase 2 reference, not yet implemented):**

```ts
// extension SW
chrome.runtime.sendMessage(
  extensionId,
  {
    channel: "FRONTEND_RPC",
    action: "conversation.appendMessage",
    payload: { conversationId, role: "user", content: "..." },
    requestId: crypto.randomUUID(),
  },
  (reply) => { /* match reply.requestId */ },
);
```

```ts
// matrx-frontend planned route
// app/api/extension/append-message/route.ts
export async function POST(req: NextRequest) {
  const auth = await authorizeExtensionRequest(req); // cookie OR Bearer
  if (!auth.ok) return new Response("Unauthorized", { status: 401 });
  const body = await req.json();
  // append to conversation, return updated message ID
}
```

---

## `openPanel` — opening a window-panels overlay from the extension

The extension can surface any registered window-panels overlay through
two complementary paths. They share zero code in this repo — pick the
one whose tradeoffs match your use case.

### Path A: deep-link via `?panels=<typeKey>:<instanceId>`

URL hydration (parsed in
[`features/window-panels/url-sync/UrlPanelManager.tsx`](../features/window-panels/url-sync/UrlPanelManager.tsx))
will open the matching panel on page load. Fastest to integrate when
the extension can navigate the active tab.

```ts
// Inside the extension's service worker / sidepanel:
chrome.tabs.update(tabId, {
  url: "https://aimatrx.com/?panels=notes:default",
});
```

Best for: same-machine flows where the extension is already managing the
active tab. Works without a signed-in Supabase session in the receiving
tab as long as the route's auth gate allows hydration.

### Path B: `openPanel` envelope (cross-machine via Broadcast)

When the extension cannot navigate the user's tab — different device,
or a tab the user is already working in — publish an `openPanel` envelope
on `matrx-extension-bridge:<userId>`. The
[`ExtensionBridgeSubscriber`](../lib/extension-bridge/ExtensionBridgeSubscriber.tsx)
mounted in [`app/Providers.tsx`](../app/Providers.tsx) receives it and
dispatches `openOverlay({...})` against the existing window-panels store.

**Wire format:**

```ts
// Published by the extension over the Broadcast channel:
{
  direction: "extension->frontend",
  action: "openPanel",
  requestId: "<uuid>",
  payload: {
    panelId: "notes",            // overlayId (see overlay-ids.ts)
    instanceId: "abc-123",        // optional; defaults to "default"
    data: { /* opaque per-overlay */ },
  },
  timestamp: 1714000000000,
}
```

**Reply (frontend → extension), preserves `requestId`:**

```ts
// Success
{ ok: true, opened: true, panelId: "notes", instanceId: null }

// Validation failure (Zod issues attached)
{ ok: false, error: "invalid_payload", details: [...] }

// panelId is not a registered overlayId
{ ok: false, error: "unknown_panel", details: { panelId, hint } }
```

**Extension SW snippet** (publishing the envelope and awaiting the reply):

```ts
import { bridgeChannelName } from "@/lib/types/bridge-envelope";
const requestId = crypto.randomUUID();
const channel = supabase.channel(bridgeChannelName(userId));
await channel.send({
  type: "broadcast",
  event: "FRONTEND_RPC",
  payload: {
    direction: "extension->frontend",
    action: "openPanel",
    requestId,
    payload: { panelId: "notes" },
    timestamp: Date.now(),
  },
});
// Match incoming envelopes on requestId for the reply.
```

Best for: cross-machine flows (extension on laptop, app open on phone),
or any case where you want a structured success/failure reply rather
than a navigation side-effect.

### Choosing between A and B

| Concern | Path A — deep-link | Path B — `openPanel` envelope |
|---|---|---|
| Cross-machine | No (URL only loads on the tab you navigate) | Yes |
| Reply / acknowledgement | None (rely on URL hydration) | Structured `{ ok, ... }` reply |
| Validation failures | Silent console warning | Returned to caller |
| Auth requirement | Tab must hydrate the route | User must be signed in (Broadcast is per-user) |
| Latency | Page load + hydration | Single Broadcast hop (~tens of ms) |

Both paths terminate in the same `openOverlay` Redux action; behavior
of the registry, mobile presentation, persistence, and instance
lifecycle is identical.

---

## Calling the extension — outbound (matrx-frontend → extension)

Three pathways, picked by who is running where:

### A. From a tab in this app, same machine as the extension

```ts
// In a Client Component or page handler:
declare const EXTENSION_ID: string; // from env or discovery
chrome.runtime.sendMessage(
  EXTENSION_ID,
  {
    channel: "FRONTEND_RPC",
    action: "browser.captureCurrentTab",
    payload: { reason: "...", since: Date.now() },
    requestId: crypto.randomUUID(),
  },
  (reply) => { /* reply.payload */ },
);
```

`chrome.runtime` is undefined when the extension isn't installed —
guard with `typeof chrome !== "undefined" && chrome.runtime`.

### B. From a server route, or when the extension is on a different
device

Publish to the user's Broadcast channel:

```ts
import { getMessagingClient } from "@/lib/supabase/messaging";
const client = getMessagingClient();
const channel = client.channel(`matrx-extension-bridge:${userId}`);
await channel.send({
  type: "broadcast",
  event: "FRONTEND_RPC",
  payload: { channel: "FRONTEND_RPC", action, payload, requestId },
});
// Wait for reply on the same channel, matched by requestId.
```

### C. From a server route — fire-and-forget (no reply needed)

Same as B but skip the reply-wait. Useful for "the user just did X,
the extension may want to know" notifications where the extension has
no reply obligation.

---

## Pointer to master

The four-repo cross-integration plan and the canonical envelope spec
live in the matrx-extend repo:

- `/Users/armanisadeghi/code/matrx-extend/.claude/worktrees/exciting-moser-4b984f/docs/CROSS_REPO_INTEGRATION.md`

When details in this doc and the master diverge, the master wins.
Update both in the same PR.

---

## Pointer to local skill

For agent-facing how-to (when to use, file index, failure modes),
see [`./.claude/skills/connect-matrx-extend/SKILL.md`](../.claude/skills/connect-matrx-extend/SKILL.md).
