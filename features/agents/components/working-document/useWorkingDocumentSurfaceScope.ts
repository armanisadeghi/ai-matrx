"use client";

/**
 * Build the conversation-document surface scope (`matrx-user/working-document`
 * or `matrx-user/scratchpad`) at agent-trigger time.
 *
 * Returns a stable `() => SurfaceScopePayload` builder (mirrors
 * `useNotesSurfaceScope`): the textarea selection lives in the DOM, so the
 * caller wants the CURRENT selection at click time, not a stale render snapshot.
 * The document's own parts come from the working-document slice; the
 * conversation context comes from the host (via `surfaceContext.getHostContext`)
 * or, by default, is derived from Redux by `conversationId`.
 */

import { useCallback } from "react";
import type { RefObject } from "react";

import { useAppSelector } from "@/lib/redux/hooks";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import { selectInstanceContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.selectors";
import { selectScopeSelectionsContext } from "@/lib/redux/slices/appContextSlice";
import {
  selectWorkingDocBinding,
  selectWorkingDocContent,
  selectWorkingDocTitle,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import type { WorkingDocumentKind } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";
import {
  buildConversationDocumentContextData,
  type WorkingDocumentSurfaceContext,
} from "./workingDocumentSurface";

export interface UseWorkingDocumentSurfaceScopeParams {
  conversationId: string;
  kind: WorkingDocumentKind;
  /** Live editor body — the panel's in-flight draft. */
  content: string;
  /** Editor textarea ref — selection is read live from the DOM. */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** Host page context (conversation context + scope selections). */
  surfaceContext?: WorkingDocumentSurfaceContext;
}

export function useWorkingDocumentSurfaceScope(
  params: UseWorkingDocumentSurfaceScopeParams,
): () => SurfaceScopePayload {
  const { conversationId, kind, content, textareaRef, surfaceContext } = params;

  const title = useAppSelector(selectWorkingDocTitle(conversationId, kind));
  const binding = useAppSelector(selectWorkingDocBinding(conversationId, kind));
  const canonicalContent = useAppSelector(
    selectWorkingDocContent(conversationId, kind),
  );

  // Default host context, derived from Redux by conversationId. The host can
  // override via surfaceContext.getHostContext (read at call time below).
  const contextEntries = useAppSelector(
    selectInstanceContextEntries(conversationId),
  );
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);

  return useCallback(() => {
    const ta = textareaRef.current;
    const text = ta?.value ?? content ?? "";
    const selectionStart = ta?.selectionStart ?? 0;
    const selectionEnd = ta?.selectionEnd ?? selectionStart;

    // Host-supplied context wins; otherwise derive from Redux.
    const host = surfaceContext?.getHostContext?.();
    const conversationContext =
      host?.conversationContext ??
      contextEntries.reduce<Record<string, unknown>>((acc, entry) => {
        acc[entry.key] = entry.value;
        return acc;
      }, {});
    const activeScopeIds =
      host?.activeScopeIds ??
      Object.values(scopeSelections).filter(
        (v): v is string => typeof v === "string" && v.length > 0,
      );

    return buildConversationDocumentContextData({
      conversationId,
      kind,
      content: text,
      selectionStart,
      selectionEnd,
      title,
      binding,
      isDirty: text !== canonicalContent,
      conversationContext,
      activeScopeIds,
    }) as SurfaceScopePayload;
  }, [
    textareaRef,
    content,
    conversationId,
    kind,
    title,
    binding,
    canonicalContent,
    contextEntries,
    scopeSelections,
    surfaceContext,
  ]);
}
