# Extension ↔ Frontend bridge

The bridge has two transports with one request/reply contract:

- Same machine: the AI Matrx page sends a `FRONTEND_RPC` envelope through
  `chrome.runtime.sendMessage(extensionId, ...)`; matrx-extend's manifest and
  runtime origin checks gate the sender.
- Cross machine: both signed-in clients use Supabase Broadcast topic
  `matrx-extension-bridge:<userId>`, event `FRONTEND_RPC`, with direction and
  `requestId` fields for routing and correlation.

`lib/types/bridge-envelope.ts` is the wire-format source of truth.
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
