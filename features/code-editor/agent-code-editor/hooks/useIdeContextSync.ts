"use client";

/**
 * useIdeContextSync — keeps the agent's IDE state in sync with the live
 * editor.
 *
 * Dual-dispatch:
 *
 *   1. **Legacy `instanceContext` `vsc_*` keys** — feeds the server's
 *      `ctx_get(vsc_*)` lookups for prompt-time variable substitution.
 *
 *   2. **Structured `editorState` slice** — feeds the new `editor-state`
 *      client capability, which the request envelope ships under
 *      `client.state["editor-state"]`. Auto-brings the `vsc_get_state`
 *      tool online server-side.
 *
 * Both populate from the same `CodeContextInput`, so the editor surface
 * doesn't need two providers.
 */

import { useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setContextEntries } from "@ai-matrx/chat/agents/redux/execution-system/instance-context/instance-context.slice";
import { setEditorState } from "@/features/code-editor/redux/editor-state.slice";
import type { CodeContextInput } from "../types";
import {
  buildIdeContextEntries,
  buildIdeState,
} from "../utils/ideContextVariables";

/**
 * Synchronize IDE context entries (`vsc_*`) AND the structured editor-state
 * payload onto the given conversation.
 *
 * No-ops while `conversationId` is falsy (e.g. before modal launch resolves).
 */
export function useIdeContextSync(
  conversationId: string | null | undefined,
  input: CodeContextInput,
): void {
  const dispatch = useAppDispatch();

  // Snapshot ref for diff-gating; avoids dispatching when nothing changed.
  // We can't rely on JSON.stringify of the whole input on every render (it's
  // cheap but still allocates). Gate on a compact signature instead.
  const signatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!conversationId) return;

    const signature = JSON.stringify({
      code: input.code,
      language: input.language,
      filePath: input.filePath ?? null,
      selection: input.selection ?? null,
      diagnostics: input.diagnostics ?? null,
      workspaceName: input.workspaceName ?? null,
      workspaceFolders: input.workspaceFolders ?? null,
      gitBranch: input.gitBranch ?? null,
      gitStatus: input.gitStatus ?? null,
    });
    if (signatureRef.current === signature) return;
    signatureRef.current = signature;

    const entries = buildIdeContextEntries(input);
    if (entries.length > 0) {
      dispatch(setContextEntries({ conversationId, entries }));
    }

    // The structured shape feeds the `editor-state` capability envelope.
    // null payload deactivates the capability for this conversation.
    dispatch(setEditorState({ conversationId, state: buildIdeState(input) }));
  }, [
    conversationId,
    input.code,
    input.language,
    input.filePath,
    input.selection,
    input.diagnostics,
    input.workspaceName,
    input.workspaceFolders,
    input.gitBranch,
    input.gitStatus,
    dispatch,
  ]);
}
