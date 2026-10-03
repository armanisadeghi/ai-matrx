"use client";

// THE CLIENT SPEAKS UP BEFORE THE SEND (TOOL-SOURCES open question 5,
// common-docs agent-tools/CLIENT-RESPONSIBILITY.md). With the per-chat
// auto-tools switch OFF the server adds no transient tools, so an attachment
// that is only reachable through a tool (a document, a table, a Google file)
// may be only partly usable. Say so in one line, with one click to turn the
// switch back on. Nothing is shown while the switch is on.

import { Wrench } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../../../store/hooks";
import type { ChatRootState } from "../../../../store/root-state";
import { selectEffectiveAutoTools } from "../../../redux/execution-system/utils/build-tool-injection";
import { setBuilderAdvancedSettings } from "../../../redux/execution-system/instance-ui-state/instance-ui-state.slice";
import type { ResourceBlockType } from "../../../types/instance.types";

/** Attachments the agent reaches through a tool (T3 triggers). */
const TOOL_BACKED_RESOURCE_TYPES: ReadonlySet<ResourceBlockType> = new Set([
  "document",
  "input_document",
  "processed_document",
  "input_table",
  "input_data",
  "input_workbook",
  "source_ref",
]);

/** The reserved context key Google file picks travel under. */
const GOOGLE_FILES_CONTEXT_KEY = "__google_files";

/** True when something attached needs a tool the switch is keeping out. */
export function selectAttachmentNeedsAutoTools(
  state: ChatRootState,
  conversationId: string,
): boolean {
  if (selectEffectiveAutoTools(state, conversationId)) return false;
  const resources = state.instanceResources?.byConversationId[conversationId];
  if (
    resources &&
    Object.values(resources).some((r) => TOOL_BACKED_RESOURCE_TYPES.has(r.blockType))
  ) {
    return true;
  }
  const google =
    state.instanceContext?.byConversationId[conversationId]?.[GOOGLE_FILES_CONTEXT_KEY]
      ?.value;
  return Array.isArray(google) ? google.length > 0 : Boolean(google);
}

export function ComposerToolsNotice({ conversationId }: { conversationId: string }) {
  const dispatch = useAppDispatch();
  const needsTools = useAppSelector((s) =>
    selectAttachmentNeedsAutoTools(s, conversationId),
  );
  if (!needsTools) return null;
  return (
    <div className="flex items-center gap-1.5 px-1 pt-1 text-[11px] text-amber-600 dark:text-amber-500">
      <Wrench className="h-3 w-3 shrink-0" />
      <span className="min-w-0 truncate">Auto tools are off; it may not fully use this</span>
      <button
        type="button"
        onClick={() =>
          dispatch(
            setBuilderAdvancedSettings({
              conversationId,
              changes: { autoTools: true },
            }),
          )
        }
        className="shrink-0 whitespace-nowrap underline underline-offset-2 hover:text-foreground"
      >
        Turn on
      </button>
    </div>
  );
}
