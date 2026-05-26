// Constants for the matrx-extend bridge test harness.
//
// Two known extension install IDs (dev unpacked + Web Store) plus a
// curated set of default RPC payloads per action so the user has a
// click-to-send experience instead of having to remember the wire shape.
//
// The list of RPC actions is imported from
// `@/lib/types/bridge-envelope` (the single source of truth) so adding
// a new action upstream automatically surfaces here.

import {
  KNOWN_FRONTEND_RPC_ACTIONS,
  type KnownFrontendRpcAction,
} from "@/lib/types/bridge-envelope";

export const KNOWN_EXTENSION_IDS = [
  {
    id: "cihdmkcdjjckfhjpgoedmgfpoljebaml",
    label: "Dev (unpacked)",
  },
  {
    id: "hnfolienncfklkgmdjjmhhegglimlamg",
    label: "Web Store (v0.1.x)",
  },
] as const;

export type RpcAction = KnownFrontendRpcAction;

export const RPC_ACTIONS: ReadonlyArray<RpcAction> = KNOWN_FRONTEND_RPC_ACTIONS;

/** Wire-format payload defaults per action (JSON pretty-printed). */
export const DEFAULT_PAYLOADS: Record<RpcAction, string> = {
  ping: JSON.stringify({}, null, 2),
  capabilities: JSON.stringify({}, null, 2),
  openPanel: JSON.stringify({ panelId: "notes" }, null, 2),
  callTool: JSON.stringify(
    { toolName: "get_active_tab", args: {} },
    null,
    2,
  ),
};

export const APPEND_MESSAGE_ENDPOINT = "/api/extension/append-message";

export const DEFAULT_APPEND_BODY = JSON.stringify(
  {
    role: "user",
    content: "hello from the extension-bridge demo page",
    metadata: { source: "extension-bridge-demo" },
  },
  null,
  2,
);
