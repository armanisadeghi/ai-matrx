/**
 * Convenience helpers for adding editor-pill resources to a conversation.
 *
 * Editor pills (`editor_error`, `editor_code_snippet`) are local — no
 * server-side resolution is required, so they're marked `ready` immediately
 * after add. The chip bar above the input shows them; on submit, the
 * `assembleRequest` thunk weaves their XML into the user message text
 * (see `selectEditorResourceXml`).
 *
 * These helpers thunk-style the dispatch so callers from the code editor
 * (hover-to-send, problems panel, "send selection to chat") only need a
 * single call site.
 */

import type { Dispatch } from "@reduxjs/toolkit";
import { generateResourceId } from "../redux/execution-system/utils/ids";
import {
  addResource,
  setResourceStatus,
} from "../redux/execution-system/instance-resources/instance-resources.slice";
import type {
  EditorErrorSource,
  EditorCodeSnippetSource,
} from "./editor-resource-xml";

/**
 * Add a single error/diagnostic resource to a conversation. Returns the
 * generated resourceId so the caller can dedupe (e.g. don't re-add the same
 * diagnostic from both hover and Problems panel).
 */
export function addEditorErrorResource(
  dispatch: Dispatch,
  conversationId: string,
  source: EditorErrorSource,
): string {
  const resourceId = generateResourceId();
  dispatch(
    addResource({
      conversationId,
      blockType: "editor_error",
      source,
      resourceId,
    }),
  );
  // Editor pills are ready immediately — there's no server-side lookup.
  dispatch(
    setResourceStatus({
      conversationId,
      resourceId,
      status: "ready",
    }),
  );
  return resourceId;
}

/**
 * Add a code-snippet resource (a captured editor selection) to a conversation.
 */
export function addEditorCodeSnippetResource(
  dispatch: Dispatch,
  conversationId: string,
  source: EditorCodeSnippetSource,
): string {
  const resourceId = generateResourceId();
  dispatch(
    addResource({
      conversationId,
      blockType: "editor_code_snippet",
      source,
      resourceId,
    }),
  );
  dispatch(
    setResourceStatus({
      conversationId,
      resourceId,
      status: "ready",
    }),
  );
  return resourceId;
}

/**
 * Stable dedupe key for an error resource — composed of file + line + code +
 * the first 80 chars of message. Two diagnostics that resolve to the same
 * key are treated as the same pill (caller can use this to avoid duplicates
 * when the user clicks "send to chat" multiple times on the same error).
 */
export function editorErrorDedupeKey(source: EditorErrorSource): string {
  const msg = (source.message ?? "").slice(0, 80);
  return [
    source.file,
    source.line,
    source.code ?? "",
    source.source ?? "",
    msg,
  ].join("|");
}
