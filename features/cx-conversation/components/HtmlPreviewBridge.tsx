"use client";

import React, { useEffect, useCallback, useRef } from "react";
import { useAppSelector, useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { disposeFullScreenEditorCallbackGroup, emitFullScreenEditorSave } from "@/features/overlays/callbacks/fullScreenEditor";
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
  selectTaskId,
} from "@/lib/redux/slices/appContextSlice";
import { toast } from "@/lib/toast";
import { presentOrganizationRefusal } from "@/lib/organizations/organizationRefusalToast";

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
  showSaveButton,
  isAgentSystem,
}: HtmlPreviewBridgeProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const user = useAppSelector(selectUser);
  const organizationId = useAppSelector(selectOrganizationId);
  const taskId = useAppSelector(selectTaskId);

  // Look up existing artifact for this message (O(1) via secondary index)
  const existingArtifact = useAppSelector((state) =>
    messageId ? selectHtmlPageArtifactForMessage(state, messageId) : undefined,
  );

  // Ref to track the artifact ID across renders without stale closures
  const artifactIdRef = useRef<string | undefined>(existingArtifact?.id);
  // The markdown the preview opened on (then: last saved) — the splice base.
  const openedOn = useRef(content);
  useEffect(() => {
    artifactIdRef.current = existingArtifact?.id;
  }, [existingArtifact?.id]);

  // On mount: if we have a messageId, fetch artifacts for it so the bridge
  // immediately knows whether an HTML page was already published from
  // this message. Duplicate prevention lives in the API + thunk layer
  // (natural-key dedupe on owner + message_id + artifact_type +
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
            taskId,
            metadata: {},
          }),
        ).unwrap();
        artifactIdRef.current = artifact.id;
      } catch (err) {
        // 🚨 THE PAGE EXISTS, THE LINK DOES NOT — say so.
        //
        // `registerArtifactThunk` began THROWING the organization refusal on
        // 2026-09-17 (`chat.artifact` carries `_stamp_org_default`, so a row
        // sent without an organization is filed in the writer's personal
        // workspace silently). This catch swallowed it into `console.error`
        // and then opened the page, so the person saw a published page, had no
        // idea the conversation link was never written, and lost it. A silent
        // misfile became a silent LOSS — worse than what the refusal replaced.
        //
        // The page itself DID get created upstream, so hiding it would be a
        // second lie. What must not happen is the surface implying the link
        // was saved.
        if (
          !presentOrganizationRefusal(err, {
            subject: "This page",
            act: "linked to the conversation",
          })
        ) {
          console.error("[HtmlPreviewBridge] Failed to register artifact:", err);
          toast.error("This page is not linked to the conversation", {
            description:
              "Page published, but it was not linked to this message. Try publishing again.",
          });
        }
      }

      dispatch(setActivePageId(newPageId));
    },
    [dispatch, messageId, conversationId, organizationId, taskId],
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
        // Same class as the registration catch above: the page was
        // re-published, the record of it was not. Never silent.
        if (
          !presentOrganizationRefusal(err, {
            subject: "This page's record",
            act: "updated",
          })
        ) {
          console.error("[HtmlPreviewBridge] Failed to update artifact:", err);
          toast.error("This page's record was not updated", {
            description:
              "The page was re-published, but its title and link here still show the previous version.",
          });
        }
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
    disposeFullScreenEditorCallbackGroup(callbackGroupId);
    dispatch(setActivePageId(null));
    onClose();
  }, [callbackGroupId, dispatch, onClose]);

  // Save the edited markdown back to the source. A function can't travel
  // through Redux, so callers that own the save (rich-document source
  // adapters, ContentActionBar) register a callback group and pass its
  // `callbackGroupId`; the group always wins. Without one, the bridge
  // self-handles via `editMessage` when it has a conversation + message
  // target — preserving the message's non-text blocks.
  const handleMarkdownSave = useCallback(
    async (markdownContent: string) => {
      if (callbackGroupId) {
        await emitFullScreenEditorSave(callbackGroupId, markdownContent);
        return;
      }
      if (!conversationId || !messageId) {
        // No callback group AND no chat-message target — the Save button was
        // shown with nowhere to send the edit. That's a severed-callback bug
        // at the opening call site (D33 class). SCREAM, never silent.
        console.error(
          "[HtmlPreviewBridge] Save invoked with no save target: no callbackGroupId and no conversationId+messageId. " +
            "The opening call site must pass `onSave` via useOpenHtmlPreviewBridge (callback registry) or a chat target.",
        );
        throw new Error("Save is not wired for this content — nothing was saved.");
      }
      // The preview opened on the message's DISPLAY text: splice only the
      // changed span into the stored row (RC-B5), never the display text.
      const { saveMessageDisplayEdit } = await import(
        "@/features/agents/redux/execution-system/message-crud/save-answer-edit.thunk"
      );
      await saveMessageDisplayEdit(dispatch, store.getState, {
        conversationId,
        messageId,
        previous: openedOn.current,
        next: markdownContent,
      });
      openedOn.current = markdownContent;
      toast.success("Saved");
    },
    [callbackGroupId, conversationId, messageId, dispatch, store],
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
