/**
 * The chat composer's right-click agent menu (v3 EditableContextMenu) — the
 * `matrx-user/chat` surface over the live draft. Lifted from the retired
 * /chat/new hero input so the ONE composer carries it at every size (the
 * conversation composer had no menu at all).
 *
 * The scope is read at CLICK time off the textarea (selection + draft) and the
 * store (the run configuration Chat Options edits) — never a stale snapshot.
 */

import type { AppStore } from "@/lib/redux/store";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import type { ComposerTextMenu } from "@/features/agents/components/inputs/smart-input/composer/composer-types";
import { buildChatContextData, CHAT_CONTEXT_MENU_PROPS } from "./buildChatContextData";
import { buildChatRunConfiguration } from "./buildChatRunConfiguration";

export function buildChatComposerTextMenu(args: {
  store: AppStore;
  conversationId: string;
  agentId: string;
}): ComposerTextMenu {
  const { store, conversationId, agentId } = args;
  return {
    ...CHAT_CONTEXT_MENU_PROPS,
    // The draft is plain text the person is writing.
    contentSource: { type: "raw" },
    getApplicationScope: (el) => {
      const start = el?.selectionStart ?? 0;
      const end = el?.selectionEnd ?? 0;
      const contextData = buildChatContextData({
        inputDraft: el?.value ?? "",
        selectionStart: start,
        selectionEnd: end,
        agentId,
        runConfiguration: buildChatRunConfiguration(store.getState(), conversationId),
      });
      return buildApplicationScopeFromMenuContext({
        selectedText:
          start !== end && el ? el.value.slice(Math.min(start, end), Math.max(start, end)) : "",
        selectionRange: el ? { type: "editable", element: el, start, end } : null,
        contextData,
      });
    },
  };
}
