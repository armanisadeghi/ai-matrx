"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
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
}

export function MessageInput({
  onSendMessage,
  onTyping,
  isSending = false,
  disabled = false,
  placeholder = "Type a message...",
  className,
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

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        150
      )}px`;
    }
  }, [content]);

  // Handle typing indicator
  const handleTyping = useCallback(() => {
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
  }, [onTyping]);

  // Handle content change
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    handleTyping();
  };

  const canSend = Boolean(content.trim() || attachments.length > 0);

  // Handle send
  const handleSend = useCallback(() => {
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
  }, [content, attachments, canSend, isSending, disabled, onSendMessage, onTyping]);

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
        "w-full shrink-0 border-t border-zinc-200 dark:border-zinc-800 bg-background px-3 py-2",
        className
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
            "rounded-xl border-zinc-300 dark:border-zinc-700",
            "bg-zinc-100 dark:bg-zinc-800/50",
            "focus-visible:ring-1 focus-visible:ring-primary",
            "placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
          )}
          rows={1}
        />
        {/* Attach a note / file / task / agent / link — no fence JSON typed by
            a human, ever (features/matrx-envelope/referenceText.ts). */}
        <AttachReferenceButton
          className="absolute left-2.5 bottom-2.5"
          disabled={disabled || isSending}
          pickerScope="direct-message"
          onAttach={(refs) => setAttachments((prev) => [...prev, ...refs])}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend || isSending || disabled}
          className={cn(
            "absolute right-3 bottom-2.5 p-1 rounded-full transition-colors",
            "text-zinc-400 hover:text-primary",
            "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-zinc-400",
            canSend && !isSending && !disabled && "text-primary hover:text-primary/80"
          )}
        >
          {isSending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

export default MessageInput;
