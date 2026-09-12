# Extension ↔ Frontend bridge

> Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/clients/extension/CHANNELS.md — read it before touching this feature in ANY repo.

The bridge has two transports with one request/reply contract:

- Same machine: the AI Matrx page sends a `FRONTEND_RPC` envelope through
  `chrome.runtime.sendMessage(extensionId, ...)`; matrx-extend's manifest and
  runtime origin checks gate the sender.
- Cross machine: both signed-in clients use Supabase Broadcast topic
  `matrx-extension-bridge:<userId>`, event `FRONTEND_RPC`, with direction and
  `requestId` fields for routing and correlation.

`lib/types/bridge-envelope.ts` is the wire-format source of truth — including
`EXTENSION_BRIDGE_CHANNEL`, the `@ai-matrx/realtime` namespace whose
`foreignTopic` keeps `matrx-extension-bridge:<userId>` on the wire verbatim.
🚨 **Nothing here opens a Supabase channel by hand.** The channel is
`@ai-matrx/realtime`'s, in RAW-WIRE mode (`wire: {mode:"raw"}`), because the
deployed extension parses the bare `BridgeEnvelope`; wrapping it in the Matrx
envelope would make both halves go mute with nothing failing loudly.
`bridgeChannel.ts` is identity only — the channel spec and the envelope factory.
Full contract, including the coordinated-release order for any wire change:
CHANNELS.md §4.
`lib/extension-bridge/chrome-rpc.ts` owns same-machine transport and extension
discovery. `lib/extension-bridge/matrx-extend-client.ts` discovers the installed
extension's live `capabilities` catalog before forwarding a delegated Chat tool
through `callTool`; **never copy an extension tool list into the frontend.** The
extension remains the authority for argument schemas, permission tiers, sender
origin, and confirmation of browser-changing actions.
`hooks/useExtensionBridgeChannel.ts` owns the frontend request/reply lifecycle.
`ExtensionBridgeSubscriber.tsx` is mounted once in `app/Providers.tsx` and
handles extension-initiated `openPanel` requests through
`openPanelHandler.ts`. The production visual test harness lives at
`/demos/tests/extension-bridge` and must prove direct ping/capabilities/tool,
Broadcast ping/capabilities/tool, and append-message auth after bridge changes.

Do not describe a per-user topic name as authorization by itself. Supabase
Realtime authorization requires private channels plus matching
`realtime.messages` RLS policies. Until those are both deployed, the Broadcast
transport is functionally per-user by convention but not access-controlled by
the database.

## Change Log

- `2026-09-07` — The bridge's hand-rolled Supabase channel is gone: both this app
  and matrx-extend now open it through `@ai-matrx/realtime` 0.5.0's raw-wire
  mode, which the package grew for exactly this case. `bridgeChannel.ts` is
  identity-only, `useExtensionBridgeChannel` rides `useChannel` (the 5s readiness
  poll is gone — status is real; an unsendable request now fails immediately
  instead of after 30 silent seconds), and `reply()` is a first-class door so a
  reply always echoes the inbound `requestId`. Dedup on this channel went from
  none to `direction:requestId`. Verified live on the real socket against a
  stand-in extension built on raw supabase-js. **`subscribeToBridge`,
  `sendBridgeMessage`, `isBridgeSubscribed` and `resetBridgeChannels` were
  DELETED with the hand-rolled channel and must never be re-added** — the
  package's room registry does the subscribing, ref-counting and status, and
  `useChannel`'s `status` is what "is it subscribed?" now means. A build error
  naming one of them is a half-saved working tree mid-refactor, not a missing
  export: check both files are at the same commit before "restoring" anything.

- `2026-08-20` — Normal Chat delegates otherwise-unowned client tool calls to
  the installed Matrx Extend catalog, then resumes through the canonical
  durable tool-result path. The demo and Chat share one direct-RPC transport.
