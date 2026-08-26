"use client";

import React, { useState, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SendTapButton } from "@/components/icons/tap-buttons";
import { AttachReferenceButton } from "@/features/matrx-envelope/components/AttachReferenceButton";
import { ReferencePickerChip } from "@/features/matrx-envelope/components/ReferencePickerChip";
import {
  composeTextWithAttachments,
  type AttachedReference,
} from "@/features/matrx-envelope/referenceText";

interface MessageInputProps {
  onSendMessage: (content: string) => void;
  onTyping?: (isTyping: boolean) => void;
  isSending?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /**
   * Text pushed INTO the composer from outside (the transcript's right-click
   * "Quote in a reply"). `nonce` is what makes a repeat of the same quote a
   * new insert — the text alone would dedupe to a no-op the second time.
   */
  draftInsert?: { text: string; nonce: number };
}

export function MessageInput({
  onSendMessage,
  onTyping,
  isSending = false,
  disabled = false,
  placeholder = "Type a message...",
  className,
  draftInsert,
}: MessageInputProps) {
  const [content, setContent] = useState("");
  // Attached references live as chips, NEVER as fence JSON in the textarea —
  // they are serialized into the message body only on send.
  const [attachments, setAttachments] = useState<AttachedReference[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  // Auto-focus on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  // Outside-in insert (quote a message). Appends rather than replaces — the
  // user never loses what they had already typed.
  const lastInsertNonce = useRef<number | null>(null);
  useEffect(() => {
    if (!draftInsert || draftInsert.nonce === lastInsertNonce.current) return;
    lastInsertNonce.current = draftInsert.nonce;
    setContent((prev) =>
      prev ? `${prev}\n${draftInsert.text}` : draftInsert.text,
    );
    textareaRef.current?.focus();
  }, [draftInsert]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        150,
      )}px`;
    }
  }, [content]);

  // Handle typing indicator
  const handleTyping = () => {
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // If not already typing, start typing
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTyping?.(true);
    }

    // Set timeout to stop typing after 2 seconds of no input
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      onTyping?.(false);
    }, 2000);
  };

  // Handle content change
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    handleTyping();
  };

  const canSend = Boolean(content.trim() || attachments.length > 0);

  // Handle send
  const handleSend = () => {
    if (!canSend || isSending || disabled) return;

    // Stop typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (isTypingRef.current) {
      isTypingRef.current = false;
      onTyping?.(false);
    }

    onSendMessage(composeTextWithAttachments(content, attachments));
    setContent("");
    setAttachments([]);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  // Handle key press (Enter to send, Shift+Enter for new line)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      className={cn(
        "w-full shrink-0 border-t border-border bg-background px-3 py-2",
        className,
      )}
    >
      {attachments.length > 0 && (
        <ul className="mb-1.5 flex flex-wrap gap-1.5">
          {attachments.map((ref, i) => (
            <li key={`${ref.type}:${i}`} className="min-w-0 max-w-full">
              <ReferencePickerChip
                className="max-w-[16rem]"
                item={ref.item}
                type={ref.type}
                onRemove={() =>
                  setAttachments((prev) => prev.filter((_, j) => j !== i))
                }
              />
            </li>
          ))}
        </ul>
      )}
      <div className="relative w-full">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "w-full min-h-[44px] max-h-[150px] resize-none text-base pl-10 pr-12",
            "rounded-xl border-border",
            "bg-muted",
            "focus-visible:ring-1 focus-visible:ring-primary",
            "placeholder:text-muted-foreground",
          )}
          rows={1}
        />
        {/* Attach a note / file / task / agent / link — no fence JSON typed by
            a human, ever (features/matrx-envelope/referenceText.ts). */}
        <div className="absolute bottom-0 left-0">
          <AttachReferenceButton
            disabled={disabled || isSending}
            pickerScope="direct-message"
            onAttach={(refs) => setAttachments((prev) => [...prev, ...refs])}
          />
        </div>
        <div className="absolute bottom-0 right-0">
          {isSending ? (
            <span
              className="flex h-11 w-11 items-center justify-center text-primary"
              role="status"
              aria-label="Sending message"
            >
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            </span>
          ) : (
            <SendTapButton
              variant="transparent"
              ariaLabel="Send message"
              onClick={handleSend}
              disabled={!canSend || disabled}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default MessageInput;
