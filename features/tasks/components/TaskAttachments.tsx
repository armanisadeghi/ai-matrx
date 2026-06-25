"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Paperclip,
  Upload,
  X,
  FileText,
  Image,
  File,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import * as taskService from "@/features/tasks/services/taskService";
import type { TaskAttachment } from "@/features/tasks/services/taskService";

interface TaskAttachmentsProps {
  taskId: string;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function getFileIcon(fileType: string | null) {
  if (!fileType) return <File size={14} />;
  if (fileType.startsWith("image/")) return <Image size={14} />;
  if (
    fileType.includes("pdf") ||
    fileType.includes("text") ||
    fileType.includes("document")
  )
    return <FileText size={14} />;
  return <File size={14} />;
}

export default function TaskAttachments({ taskId }: TaskAttachmentsProps) {
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAttachments = async () => {
    const data = await taskService.getTaskAttachments(taskId);
    setAttachments(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadAttachments();
  }, [taskId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const result = await taskService.uploadTaskAttachment(taskId, file);
    if (result) {
      setAttachments((prev) => [...prev, result]);
    }
    setIsUploading(false);
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async (attachment: TaskAttachment) => {
    if (deletingId) return;
    setDeletingId(attachment.id);
    const ok = await taskService.deleteTaskAttachment(
      attachment.id,
      attachment.file_path,
    );
    if (ok) {
      setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
    }
    setDeletingId(null);
  };

  const handleOpen = async (filePath: string) => {
    // getAttachmentUrl is async since the cloud-files migration (signed URLs
    // are short-lived, so we fetch one on demand). Fire-and-forget window.open
    // works because we call it synchronously after the await resolves, while
    // still inside the click handler's gesture window.
    const url = await taskService.getAttachmentUrl(filePath);
    if (url) window.open(url, "_blank");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
          <Paperclip size={13} />
          Attachments {attachments.length > 0 && `(${attachments.length})`}
        </label>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            disabled={isUploading}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Upload size={12} />
            )}
            {isUploading ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-3">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      ) : attachments.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full border-2 border-dashed border-border rounded-lg p-3 text-center text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
        >
          <Upload size={14} className="mx-auto mb-1 opacity-50" />
          Click to attach a file
        </button>
      ) : (
        <div className="space-y-1.5">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-2 group rounded-md px-2 py-1.5 bg-muted/50 hover:bg-muted transition-colors"
            >
              <span className="text-muted-foreground flex-shrink-0">
                {getFileIcon(attachment.file_type)}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-xs text-foreground truncate block">
                  {attachment.file_name}
                </span>
                {attachment.file_size && (
                  <span className="text-xs text-muted-foreground/60">
                    {formatBytes(attachment.file_size)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => void handleOpen(attachment.file_path)}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                  title="Open file"
                >
                  <ExternalLink size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(attachment)}
                  disabled={deletingId === attachment.id}
                  className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete attachment"
                >
                  {deletingId === attachment.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <X size={12} />
                  )}
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 px-2 py-1"
          >
            <Upload size={11} />
            Add another file
          </button>
        </div>
      )}
    </div>
  );
}
