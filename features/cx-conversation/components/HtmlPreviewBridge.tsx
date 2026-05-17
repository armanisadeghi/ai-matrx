"use client";

import React, { useEffect, useCallback, useRef } from "react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
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
  onSave,
  showSaveButton,
  isAgentSystem,
}: HtmlPreviewBridgeProps) {
  const dispatch = useAppDispatch();
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

  return (
    <HtmlPreviewFullScreenEditor
      isOpen={true}
      isAgentSystem={isAgentSystem}
      onClose={handleClose}
      htmlPreviewState={htmlPreviewState}
      title={title}
      description={description}
      messageId={messageId}
      onSave={onSave}
      showSaveButton={showSaveButton}
    />
  );
}
