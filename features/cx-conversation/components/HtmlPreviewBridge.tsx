"use client";

import React, { useEffect, useCallback, useRef } from "react";
import { useAppSelector, useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { emitFullScreenEditorSave } from "@/features/overlays/callbacks/fullScreenEditor";
import { selectUser } from "@/lib/redux/slices/userSlice";
import { useHtmlPreviewState } from "@/features/html-pages/hooks/useHtmlPreviewState";
import HtmlPreviewFullScreenEditor from "@/features/html-pages/components/HtmlPreviewFullScreenEditor";
import { fetchArtifactsForMessageThunk } from "@/lib/redux/thunks/artifactThunks";
import { selectHtmlPageArtifactForMessage } from "@/lib/redux/selectors/artifactSelectors";
import { setActivePageId } from "@/lib/redux/slices/htmlPagesSlice";
import { updateArtifactThunk } from "@/lib/redux/thunks/artifactThunks";
import { registerArtifactThunk } from "@/lib/redux/thunks/artifactThunks";
import {
  selectOrganizationId,
  selectProjectId,
  selectTaskId,
} from "@/lib/redux/slices/appContextSlice";

interface HtmlPreviewBridgeProps {
  content: string;
  messageId?: string;
  conversationId?: string;
  onClose: () => void;
  title?: string;
  description?: string;
  /**
   * Callback-group id (from `callbackManager`) for callers that need to own
   * the save (e.g. the rich-document source adapters saving back to a note).
   * Takes precedence over the bridge's `editMessage` self-handle. Functions
   * never travel through Redux; this string is the channel back. Reuses the
   * editor-save callback shape — see features/overlays/callbacks/fullScreenEditor.ts.
   */
  callbackGroupId?: string | null;
  onSave?: (markdownContent: string) => void;
  showSaveButton?: boolean;
  isAgentSystem?: boolean;
}

export function HtmlPreviewBridge({
  content,
  messageId,
  conversationId,
  onClose,
  title = "HTML Preview & Publishing",
  description = "Edit markdown, preview HTML, and publish your content",
  callbackGroupId,
  onSave,
  showSaveButton,
  isAgentSystem,
}: HtmlPreviewBridgeProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const user = useAppSelector(selectUser);
  const organizationId = useAppSelector(selectOrganizationId);
  const projectId = useAppSelector(selectProjectId);
  const taskId = useAppSelector(selectTaskId);

  // Look up existing artifact for this message (O(1) via secondary index)
  const existingArtifact = useAppSelector((state) =>
    messageId ? selectHtmlPageArtifactForMessage(state, messageId) : undefined,
  );

  // Ref to track the artifact ID across renders without stale closures
  const artifactIdRef = useRef<string | undefined>(existingArtifact?.id);
  useEffect(() => {
    artifactIdRef.current = existingArtifact?.id;
  }, [existingArtifact?.id]);

  // On mount: if we have a messageId, fetch artifacts for it so the bridge
  // immediately knows whether an HTML page was already published from
  // this message. Duplicate prevention lives in the API + thunk layer
  // (natural-key dedupe on user_id + message_id + artifact_type +
  // external_system), so the fetch here is purely for UX — it flips the
  // publish button from "Generate" to "Update" once resolved.
  useEffect(() => {
    if (messageId) {
      dispatch(fetchArtifactsForMessageThunk(messageId));
    }
  }, [dispatch, messageId]);

  // Derive the existing page ID from the artifact record.
  // This is passed to useHtmlPreviewState so it shows "Update Page" instead of
  // "Generate Page" when a page was already published from this message.
  const publishedPageId = existingArtifact?.externalId ?? null;

  /**
   * Called by useHtmlPreviewState after a page is first created.
   * Registers the artifact in cx_artifact and updates Redux state.
   */
  const handlePageIdChange = useCallback(
    async (newPageId: string) => {
      if (!messageId || !conversationId) {
        // No source tracking available — skip artifact registration
        dispatch(setActivePageId(newPageId));
        return;
      }

      // Don't re-register if an artifact already exists for this message
      if (artifactIdRef.current) {
        dispatch(setActivePageId(newPageId));
        return;
      }

      try {
        const artifact = await dispatch(
          registerArtifactThunk({
            messageId,
            conversationId,
            artifactType: "html_page",
            externalSystem: "html_pages",
            externalId: newPageId,
            organizationId,
            projectId,
            taskId,
            metadata: {},
          }),
        ).unwrap();
        artifactIdRef.current = artifact.id;
      } catch (err) {
        console.error("[HtmlPreviewBridge] Failed to register artifact:", err);
      }

      dispatch(setActivePageId(newPageId));
    },
    [dispatch, messageId, conversationId, organizationId, projectId, taskId],
  );

  /**
   * Called by useHtmlPreviewState after a page is updated.
   * Syncs the artifact title/URL when the page is re-published.
   */
  const handleSaveComplete = useCallback(
    (savedResult: { pageId: string; url: string; metaTitle?: string }) => {
      const currentArtifactId = artifactIdRef.current;
      if (!currentArtifactId) return;

      dispatch(
        updateArtifactThunk({
          id: currentArtifactId,
          status: "published",
          externalUrl: savedResult.url,
          title: savedResult.metaTitle,
        }),
      ).catch((err) => {
        console.error("[HtmlPreviewBridge] Failed to update artifact:", err);
      });
    },
    [dispatch],
  );

  const htmlPreviewState = useHtmlPreviewState({
    markdownContent: content,
    user,
    isOpen: true,
    publishedPageId,
    onPageIdChange: handlePageIdChange,
  });

  // Clear active page when overlay closes
  const handleClose = useCallback(() => {
    dispatch(setActivePageId(null));
    onClose();
  }, [dispatch, onClose]);

  // Save the edited markdown back to the source message. The overlay
  // controller can't pass a function through Redux (it hard-coded
  // `onSave={undefined}`, which silently broke this Save button), so the
  // bridge self-handles via `editMessage` when it has a conversation +
  // message target — preserving the message's non-text blocks. A direct-mount
  // caller that passes its own `onSave` still wins.
  const handleMarkdownSave = useCallback(
    async (markdownContent: string) => {
      // Callback group wins — the caller (e.g. a rich-document source adapter)
      // owns the save. Then a direct-mount onSave prop. Else self-handle.
      if (callbackGroupId) {
        emitFullScreenEditorSave(callbackGroupId, markdownContent);
        return;
      }
      if (onSave) {
        onSave(markdownContent);
        return;
      }
      if (!conversationId || !messageId) return;
      try {
        const { editMessage } = await import(
          "@/features/agents/redux/execution-system/message-crud/edit-message.thunk"
        );
        const { mergeEditedText } = await import(
          "@/features/agents/redux/execution-system/message-crud/content-blocks.util"
        );
        const existing =
          store.getState().messages.byConversationId[conversationId]?.byId?.[
            messageId
          ]?.content;
        await dispatch(
          editMessage({
            conversationId,
            messageId,
            newContent: mergeEditedText(existing, markdownContent),
          }),
        ).unwrap();
        const { toast } = await import("sonner");
        toast.success("Saved");
      } catch (err) {
        console.error("[HtmlPreviewBridge] markdown save failed", err);
        const { toast } = await import("sonner");
        toast.error(
          err instanceof Error ? err.message : "Failed to save changes",
        );
      }
    },
    [callbackGroupId, onSave, conversationId, messageId, dispatch, store],
  );

  return (
    <HtmlPreviewFullScreenEditor
      isOpen={true}
      isAgentSystem={isAgentSystem}
      onClose={handleClose}
      htmlPreviewState={htmlPreviewState}
      title={title}
      description={description}
      messageId={messageId}
      onSave={handleMarkdownSave}
      showSaveButton={showSaveButton}
    />
  );
}
