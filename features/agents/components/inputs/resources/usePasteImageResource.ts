"use client";

/**
 * usePasteImageResource
 *
 * The ONE place pasted images / screenshots become agent input attachments.
 * Every composer (AgentTextarea, NewChatLandingInput, CompactAssistantInput, …)
 * consumes this so the paste → upload → attach flow can never drift between
 * inputs again.
 *
 * Flow: paste a File → upload through the canonical file handler
 * (`@/features/files` `useFileUpload`, which persists to cld_files and returns a
 * durable `file_id`) → attach as an `image` resource referencing that durable
 * id (never a blob/object URL — see the media-durability invariant). The
 * resulting resource flows into `user_input` on send and renders on the user
 * message bubble via the canonical `FileResourceChip` path.
 *
 * Pair the returned handler with `useClipboardPaste({ textareaRef, onPasteImage,
 * disabled })` on whatever textarea the composer owns.
 */

import { useCallback } from "react";
import { toast } from "sonner";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  useFileUpload,
  composeLegacyFolderPath,
  fileIdToMediaRef,
} from "@/features/files";
import {
  addResource,
  setResourcePreview,
} from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import { generateResourceId } from "@/features/agents/redux/execution-system/utils/ids";

export interface UsePasteImageResourceOptions {
  /** Legacy storage bucket hint forwarded to the file handler. */
  uploadBucket?: string;
  /** Legacy storage path hint forwarded to the file handler. */
  uploadPath?: string;
}

/**
 * Returns a stable `handlePasteImage(file)` that uploads the file via the
 * canonical handler and attaches it as a durable `image` resource on the given
 * conversation. Errors surface as a toast and never throw.
 */
export function usePasteImageResource(
  conversationId: string,
  options: UsePasteImageResourceOptions = {},
): (file: File) => Promise<void> {
  const dispatch = useAppDispatch();
  const { upload } = useFileUpload();
  const { uploadBucket, uploadPath } = options;

  return useCallback(
    async (file: File) => {
      try {
        const normalized = await upload(
          { kind: "file", file },
          {
            folderPath: composeLegacyFolderPath(uploadBucket, uploadPath),
            visibility: "private",
            createShareLink: true,
            shareLinkPermissionLevel: "read",
          },
        );
        // Prefer the cld_files UUID — durable + fastest for the backend to
        // resolve. Fall back to a public URL only if no id came back. Never a
        // blob/object URL.
        const source = normalized.fileId
          ? fileIdToMediaRef(normalized.fileId, file.type)
          : normalized.url
            ? { url: normalized.url, mime_type: file.type }
            : null;
        if (!source) return;
        const resourceId = generateResourceId();
        dispatch(
          addResource({ conversationId, blockType: "image", source, resourceId }),
        );
        dispatch(
          setResourcePreview({
            conversationId,
            resourceId,
            preview: file.name,
          }),
        );
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Upload failed";
        toast.error(`Couldn't upload pasted image: ${reason}`);
      }
    },
    [conversationId, dispatch, upload, uploadBucket, uploadPath],
  );
}
