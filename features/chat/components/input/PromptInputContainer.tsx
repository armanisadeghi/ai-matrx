"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import TextInput from "./TextInput";
import InputBottomControls from "./InputBottomControls";
import { FileUploadWithStorage } from "@/components/ui/file-upload/FileUploadWithStorage";
// Legacy FileChipsWithPreview removed in Phase 11. We render chips inline
// below with the same shape (filename + remove button). For rich preview
// use FilePreview from @/features/files with a fileId.
import { X } from "lucide-react";
import { EnhancedFileDetails } from "@/utils/file-operations/constants";
import useChatBasics from "@/features/chat/hooks/useChatBasics";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useFileManagement } from "@/hooks/ai/chat/useFileManagement";
import { ResourceChips } from "@/features/agents/resources/ResourceChips";
import type { Resource } from "@/features/agents/resources/types";
import { formatResourcesToXml } from "@/features/agents/resources/utils";
import {
  saveDraft,
  clearDraft,
  getDraft,
  cleanupStaleDrafts,
} from "@/features/chat/utils/messageDraftSafety";

interface PromptInputContainerProps {
  onMessageSent?: () => void;
  disabled?: boolean;
  onContentChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => Promise<boolean>;
}

const PromptInputContainer: React.FC<PromptInputContainerProps> = ({
  onMessageSent,
  disabled = false,
  onContentChange,
  onSubmit,
}) => {
  const [localDisabled, setLocalDisabled] = useState<boolean>(false);

  useEffect(() => {
    setLocalDisabled(disabled);
  }, [disabled]);

  const dispatch = useAppDispatch();
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textInputRef.current?.focus();
  }, []);

  const { chatActions, chatSelectors, conversationId, messageId } =
    useChatBasics();

  const fileManager = useFileManagement({
    onFilesUpdate: (files) =>
      dispatch(
        chatActions.updateFiles({ value: files.map((file) => file.url) }),
      ),
  });

  const [content, setContent] = useState<string>("");

  // Non-file resources (notes, tasks, tables, webpage, youtube, url types).
  // These are formatted as XML and appended to the message content on submit.
  const [resources, setResources] = useState<Resource[]>([]);

  const activeMessageRecord = useAppSelector(chatSelectors.activeMessage);

  // --- Draft Safety: restore any unsent draft on mount ---
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;

    cleanupStaleDrafts();

    const draft = getDraft(conversationId);
    if (draft && draft.content.trim()) {
      setContent(draft.content);
      if (draft.resources && Array.isArray(draft.resources) && draft.resources.length > 0) {
        setResources(draft.resources as Resource[]);
      }
      // Clear the draft now that it's restored into the input
      clearDraft(conversationId);
    }
  }, [conversationId]);

  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent);
      if (onContentChange) {
        const syntheticEvent = {
          target: { value: newContent },
          currentTarget: { value: newContent },
        } as unknown as React.ChangeEvent<HTMLTextAreaElement>;
        onContentChange(syntheticEvent);
      }
    },
    [onContentChange],
  );

  const handleAddSpecialContent = useCallback((contentToAdd: string) => {
    setContent((prev) =>
      prev.trim() === "" ? contentToAdd : `${prev}\n\n${contentToAdd}`,
    );
  }, []);

  // Called by ResourcePickerMenu when a resource is selected.
  const handleResourceSelected = useCallback(
    (resource: Resource) => {
      // DO NOT ADD image_url and file_url resources here. They ARE NOT downloaded as files. They are just strings passed.
      const isFileType = resource.type === "file" || resource.type === "audio";

      if (isFileType && (resource.data as { url?: string }).url) {
        // File types go through the existing file manager → Redux
        const fileData = resource.data as {
          url: string;
          type?: string;
          details?: EnhancedFileDetails;
        };
        fileManager.addFiles([
          {
            url: fileData.url,
            type: fileData.type ?? "file",
            details: fileData.details,
          },
        ]);
      } else {
        // All other resource types are kept in local state and formatted on submit
        setResources((prev) => [...prev, resource]);
      }
    },
    [fileManager],
  );

  const handleRemoveResource = useCallback((index: number) => {
    setResources((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleFileUpload = useCallback(
    async (
      results: { url: string; type: string; details?: EnhancedFileDetails }[],
    ) => {
      await fileManager.addFiles(results);
    },
    [fileManager],
  );

  const handleTriggerSubmit = useCallback(async () => {
    if (!activeMessageRecord) {
      console.error(
        "PromptInputContainer: handleTriggerSubmit: activeMessageRecord was not found",
      );
      console.log("Message Id:", messageId);
      return;
    }

    const hasFileAttachments = fileManager.files.length > 0;
    const hasResources = resources.length > 0;

    if (!content.trim() && !hasFileAttachments && !hasResources) {
      return;
    }

    // Append non-file resources as XML before dispatching
    let finalContent = content;
    if (hasResources) {
      const xml = formatResourcesToXml(resources);
      if (xml) {
        finalContent = finalContent.trim() ? `${finalContent}\n\n${xml}` : xml;
      }
    }

    // Save the draft to sessionStorage BEFORE clearing the input.
    // This is the safety net: if anything crashes between here and success
    // confirmation, the draft will be restored on next mount.
    saveDraft(conversationId, finalContent, resources);

    dispatch(chatActions.updateMessageContent({ value: finalContent }));
    dispatch(chatActions.updateMessageStatus({ status: "submitted" }));
    setContent("");

    try {
      const success = await onSubmit();

      if (success) {
        // Message is confirmed in the pipeline — safe to discard the draft
        clearDraft(conversationId);
        fileManager.clearFiles();
        setResources([]);

        if (onMessageSent) {
          onMessageSent();
        }
        textInputRef.current?.focus();
      } else {
        // Submission failed — restore from the safety draft so the user
        // doesn't lose their work
        clearDraft(conversationId);
        setContent(finalContent);
        console.error("Failed to send message (handled by parent)");
      }
    } catch (error) {
      // Unexpected error — restore the content from what we captured
      clearDraft(conversationId);
      setContent(finalContent);
      console.error("Unexpected error during message submission:", error);
    } finally {
      setLocalDisabled(false);
    }
  }, [
    content,
    fileManager,
    resources,
    onSubmit,
    onMessageSent,
    chatActions,
    dispatch,
    activeMessageRecord,
    messageId,
    conversationId,
  ]);

  return (
    <div className="relative">
      {fileManager.files.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 px-1 py-1">
          {fileManager.files.map((file, idx) => {
            const name =
              (file as { details?: { filename?: string } }).details?.filename ??
              (file as { url?: string }).url?.split("/").pop() ??
              `file-${idx}`;
            return (
              <span
                key={(file as { url?: string }).url ?? idx}
                className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 text-xs"
                title={name}
              >
                <span className="truncate max-w-[16ch]">{name}</span>
                <button
                  type="button"
                  onClick={() => fileManager.removeFile(idx)}
                  aria-label="Remove"
                  className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}
      {resources.length > 0 && (
        <ResourceChips resources={resources} onRemove={handleRemoveResource} />
      )}

      <div className="relative rounded-2xl border border-border">
        <TextInput
          ref={textInputRef}
          content={content}
          disabled={localDisabled}
          onContentChange={handleContentChange}
          onSubmit={handleTriggerSubmit}
          onImagePasted={(result) => {
            fileManager.addFiles([result]);
          }}
          bucket="userContent"
          path={`chat-attachments/conversation-${conversationId}`}
        />

        <div className="absolute bottom-0 left-0 right-0 rounded-2xl">
          <InputBottomControls
            isDisabled={localDisabled}
            onSendMessage={handleTriggerSubmit}
            fileManager={fileManager}
            onAddSpecialContent={handleAddSpecialContent}
            onResourceSelected={handleResourceSelected}
          />
        </div>
      </div>

      {fileManager.showFileUpload && (
        <div className="absolute bottom-full mb-10 w-full bg-muted border border-border rounded-2xl">
          <FileUploadWithStorage
            bucket="userContent"
            path={`chat-attachments/conversation-${conversationId}`}
            onUploadComplete={handleFileUpload}
            onUploadStatusChange={fileManager.handleUploadStatusChange}
            multiple={true}
            useMiniUploader={false}
          />
        </div>
      )}
    </div>
  );
};

export default PromptInputContainer;
