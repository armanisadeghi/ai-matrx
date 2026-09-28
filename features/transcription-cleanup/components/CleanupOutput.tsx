"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { RichDocument } from "@/features/rich-document/RichDocument";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

interface CleanupOutputProps {
  label: string;
  content: string;
  requestId: string | null;
  conversationId: string | null;
  isBusy: boolean;
  error: string | null;
  placeholder: string;
  onContentChange: (content: string) => void;
  children: ReactNode;
}

/** The core engine owns stream blocks; only answer text enters the editor/store. */
export function CleanupOutput({
  label,
  content,
  requestId,
  conversationId,
  isBusy,
  error,
  placeholder,
  onContentChange,
  children,
}: CleanupOutputProps) {
  const [editing, setEditing] = useState(false);
  return (
    <section aria-label={label} className="flex min-h-0 flex-1 flex-col">
      <div className="flex justify-end border-b px-3 py-1">
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${editing ? "Preview" : "Edit"} ${label.toLowerCase()}`}
          onClick={() => setEditing(!editing)}
        >
          {editing ? "Preview" : "Edit text"}
        </Button>
      </div>
      {error && (
        <ErrorNotice
          message={error}
          operation={`Generate ${label.toLowerCase()}`}
          size="inline"
          className="px-4 py-2"
        />
      )}
      {editing ? (
        children
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          {requestId || content ? (
            <RichDocument
              content={content}
              requestId={isBusy ? (requestId ?? undefined) : undefined}
              conversationId={conversationId ?? undefined}
              isStreamActive={isBusy}
              source={{ type: "raw", title: label }}
              imagePolicy="ai"
              onContentChange={isBusy ? undefined : onContentChange}
              applyLocalEdits={false}
              allowFullScreenEditor={!isBusy}
              actionsVariant="none"
            />
          ) : (
            <p className="text-sm text-muted-foreground">{placeholder}</p>
          )}
        </div>
      )}
    </section>
  );
}
