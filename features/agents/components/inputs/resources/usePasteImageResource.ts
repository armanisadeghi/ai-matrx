"use client";

/**
 * useUploadAgentResources / usePasteImageResource
 *
 * The ONE place local files become agent input attachments. Paste handlers and
 * SmartAgentInput drag/drop both consume this so the
 * stage → upload → durable attach flow cannot drift between inputs.
 *
 * Flow: stage a pending resource synchronously (including a bounded local
 * object-URL preview for images) → upload through the canonical file handler →
 * replace the staging resource with the canonical durable attachment produced
 * by `useAttachResource`. The local object URL is UI-only and is revoked as
 * soon as the durable attachment exists.
 *
 * Pair the returned handler with `useClipboardPaste({ textareaRef, onPasteImage,
 * disabled })` on whatever textarea the composer owns.
 */

import { useEffect, useRef } from "react";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { composeUploadFolderPath } from "@/features/files/handler/utils/upload-folder-path";
import { normalize } from "@/features/files/handler/input/normalize";
import {
  addResource,
  removeResource,
  setResourceStatus,
} from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import { generateResourceId } from "@/features/agents/redux/execution-system/utils/ids";
import {
  ensureExecutionOrganization,
  requireExecutionOrganizationId,
} from "@/features/agents/redux/execution-system/utils/required-organization";
import { isOrganizationSelectionCancelled } from "@/lib/organization/organization-gate";
import { isUploadCancelledError } from "@/features/files/handler/errors";
import { useAttachResource } from "@/features/agents/components/inputs/resources/attach-resource";
import { revokeTrackedObjectUrl } from "@/lib/media/object-url-registry";
import type { ResourceBlockType } from "@/features/agents/types/instance.types";

export interface UsePasteImageResourceOptions {
  /** Logical top-level Files folder. */
  uploadRoot?: string;
  /** Subfolder inside the upload root. */
  uploadPath?: string;
}

/**
 * Upload local files and attach them to one agent conversation. Every file gets
 * a pending resource before the first asynchronous upload step, so paste and
 * drop interactions always provide immediate visual feedback.
 */
export function useUploadAgentResources(
  conversationId: string,
  options: UsePasteImageResourceOptions = {},
): (files: File[]) => Promise<void> {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { upload } = useFileUpload();
  const attachResource = useAttachResource(conversationId);
  const { uploadRoot, uploadPath } = options;
  const livePreviewUrls = useRef(new Set<string>());

  useEffect(
    () => () => {
      for (const url of livePreviewUrls.current) {
        revokeTrackedObjectUrl(url);
      }
      livePreviewUrls.current.clear();
    },
    [],
  );

  return async (files: File[]) => {
    if (files.length === 0) return;

    // The file and the conversation will be joined later, so the upload must
    // land in the SAME workspace the conversation will. Resolving it here —
    // asking the person if nothing is selected — is what stops an attachment
    // from silently filing itself in a personal workspace nobody chose.
    //
    // Declining is not an error: no chips are staged, nothing is uploaded, and
    // the composer is untouched.
    let organizationId: string;
    try {
      // `null` = could not ask (no picker mounted / non-interactive). Fall
      // through to the synchronous guard, which owns this surface's message.
      organizationId =
        (await ensureExecutionOrganization(store.getState(), conversationId)) ??
        requireExecutionOrganizationId(store.getState(), conversationId);
    } catch (err) {
      if (isOrganizationSelectionCancelled(err)) return;
      throw err;
    }

    const staged = files.map((file) => {
      const local = normalize({ kind: "file", file });
      let blockType: ResourceBlockType = "document";
      switch (local.meta.category) {
        case "IMAGE":
          blockType = "image";
          break;
        case "AUDIO":
          blockType = "audio";
          break;
        case "VIDEO":
          blockType = "video";
          break;
      }

      const previewUrl = blockType === "image" ? (local.url ?? null) : null;
      if (previewUrl) {
        livePreviewUrls.current.add(previewUrl);
      } else {
        revokeTrackedObjectUrl(local.url);
      }

      const resourceId = generateResourceId();
      dispatch(
        addResource({
          conversationId,
          blockType,
          resourceId,
          source: {
            filename: file.name,
            mime_type: file.type || undefined,
            url: previewUrl ?? undefined,
          },
        }),
      );

      return { file, resourceId, previewUrl };
    });

    for (const { file, resourceId, previewUrl } of staged) {
      try {
        const normalized = await upload(
          { kind: "file", file },
          {
            folderPath: composeUploadFolderPath(
              uploadRoot ?? "attachments",
              uploadPath,
            ),
            visibility: "personal",
            metadata: {
              scope: { organization_id: organizationId },
            },
            createShareLink: true,
            shareLinkPermissionLevel: "viewer",
          },
        );

        // The user may remove a pending chip while its bytes are still moving.
        // In that case the cloud upload remains valid, but it must not
        // re-attach itself after the user explicitly dismissed it.
        const stillAttached =
          store.getState().instanceResources.byConversationId[conversationId]?.[
            resourceId
          ] !== undefined;
        if (!stillAttached) {
          if (previewUrl) {
            livePreviewUrls.current.delete(previewUrl);
            revokeTrackedObjectUrl(previewUrl);
          }
          continue;
        }

        const attached = await attachResource({
          type: "file",
          data: {
            id: normalized.fileId,
            // The local File name is the user's display identity. The storage
            // record may deliberately use a checksum/key as its physical
            // filename; never let that overwrite the chip/message label.
            filename: file.name,
            url: normalized.url,
            type: normalized.meta.mime ?? file.type,
            mime_type: normalized.meta.mime ?? file.type,
            size: file.size,
            details: {
              filename: file.name,
            },
          },
        });
        if (!attached) {
          throw new Error("The uploaded file could not be attached");
        }

        dispatch(removeResource({ conversationId, resourceId }));
        if (previewUrl) {
          livePreviewUrls.current.delete(previewUrl);
          revokeTrackedObjectUrl(previewUrl);
        }
      } catch (err) {
        if (isUploadCancelledError(err)) {
          dispatch(removeResource({ conversationId, resourceId }));
          if (previewUrl) {
            livePreviewUrls.current.delete(previewUrl);
            revokeTrackedObjectUrl(previewUrl);
          }
          continue;
        }
        const reason = err instanceof Error ? err.message : "Upload failed";
        dispatch(
          setResourceStatus({
            conversationId,
            resourceId,
            status: "error",
            errorMessage: reason,
          }),
        );
        toast.error(`Couldn't upload ${file.name}: ${reason}`);
      }
    }
  };
}

/**
 * Paste-compatible single-image adapter retained for every composer that
 * already consumes the canonical hook.
 */
export function usePasteImageResource(
  conversationId: string,
  options: UsePasteImageResourceOptions = {},
): (file: File) => Promise<void> {
  const uploadResources = useUploadAgentResources(conversationId, options);
  return async (file: File) => uploadResources([file]);
}
