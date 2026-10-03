/**
 * widget-handle capability — the client holds the widget the agent edits.
 *
 * The widget (a note, a code file, a textarea) is CLIENT state, so the client
 * applies the `widget_*` tools to it. Declaring this capability turns on the
 * `matrx-user.widget-handle` executor for the request on the server, and every
 * widget tool bound to it is delegated back here (`tool_delegated` →
 * `surfaceDelegatedToolCall` → `dispatchWidgetAction` → the handle method).
 * Without it the server keeps those tools and, lacking the widget's content,
 * withholds them — the capability is the ONLY thing that makes them work.
 *
 * Active exactly when the conversation has a live handle exposing at least
 * one action method; the payload names those tools (the same names
 * `buildToolInjection` sends in `tools`). Mirrors aidream's `WIDGET_HANDLE`
 * capability (aidream/api/client_capabilities.py).
 */

import { callbackManager } from "@host/utils/callbackManager";
import {
  deriveClientToolsFromHandle,
  type WidgetHandle,
} from "../../../types/widget-handle.types";
import { selectWidgetHandleIdFor } from "../instance-ui-state/instance-ui-state.selectors";
import { registerClientCapability } from "./registry";

registerClientCapability({
  name: "widget-handle",
  selectPayload: (state, conversationId) => {
    const handleId = selectWidgetHandleIdFor(state, conversationId);
    const handle = handleId ? callbackManager.get<WidgetHandle>(handleId) : null;
    const tools = deriveClientToolsFromHandle(handle);
    return tools.length > 0 ? { tools } : null;
  },
});
