/**
 * agent-fs capability — arms the durable, `code.code_files`-backed VFS so the
 * agent gets `fs_*` + `shell_execute` with NO sandbox attached. Files persist
 * per-user under `/home/agent/...` and show up in the user's Code Snippets.
 *
 * STATELESS: the backend capability has `payload_model=None`, so this rides in
 * `client.capabilities` with no `client.state` entry. `selectPayload` returns
 * an empty sentinel to activate; the `stateless` flag tells `buildToolInjection`
 * to skip the state map.
 *
 * MANUAL + default-OFF: activation is gated solely on the per-conversation
 * `builderAdvancedSettings.agentFs` toggle (set in "Chat Options → Settings").
 * It is NEVER on by default and nothing else may flip it — the capability is
 * not rolled out yet. When the toggle is off, `selectPayload` returns null and
 * the capability stays out of the request entirely.
 */

import { selectBuilderAdvancedSettings } from "../instance-ui-state/instance-ui-state.selectors";
import { registerClientCapability } from "./registry";

registerClientCapability({
  name: "agent-fs",
  stateless: true,
  selectPayload: (state, conversationId) => {
    const on =
      selectBuilderAdvancedSettings(conversationId)(state)?.agentFs ?? false;
    // Empty object = "active" sentinel; the `stateless` flag keeps it out of
    // client.state. null = inactive (capability omitted).
    return on ? {} : null;
  },
});
