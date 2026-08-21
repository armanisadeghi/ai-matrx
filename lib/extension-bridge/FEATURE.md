# Extension ↔ Frontend bridge

The bridge has two transports with one request/reply contract:

- Same machine: the AI Matrx page sends a `FRONTEND_RPC` envelope through
  `chrome.runtime.sendMessage(extensionId, ...)`; matrx-extend's manifest and
  runtime origin checks gate the sender.
- Cross machine: both signed-in clients use Supabase Broadcast topic
  `matrx-extension-bridge:<userId>`, event `FRONTEND_RPC`, with direction and
  `requestId` fields for routing and correlation.

`lib/types/bridge-envelope.ts` is the wire-format source of truth.
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

- `2026-08-20` — Normal Chat delegates otherwise-unowned client tool calls to
  the installed Matrx Extend catalog, then resumes through the canonical
  durable tool-result path. The demo and Chat share one direct-RPC transport.
