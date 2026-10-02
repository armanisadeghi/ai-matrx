"use client";

import React from "react";
import { X } from "lucide-react";
import { Button } from "@ai-matrx/design-system";
import { MessageList } from "./MessageList";
import { ConversationInput } from "./ConversationInput";
import type { ConversationInputProps } from "./ConversationInput";
import { UnsavedChangesIndicator } from "./UnsavedChangesIndicator";
import { useUnsavedChangesGuard } from "./hooks/useUnsavedChangesGuard";

// ============================================================================
// PROPS
// ============================================================================

export interface ConversationShellProps {
  sessionId: string;

  // ── Layout ─────────────────────────────────────────────────────────────────
  title?: string;
  onClose?: () => void;
  className?: string;

  // ── Message list options ───────────────────────────────────────────────────
  showSystemMessages?: boolean;
  compact?: boolean;

  // ── Input feature flags — forwarded to ConversationInput ─────────────────
  inputProps?: Partial<ConversationInputProps>;

  // ── Optional header slot ──────────────────────────────────────────────────
  headerSlot?: React.ReactNode;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Thin layout wrapper for a conversation UI.
 * Replaces PromptRunner's flex layout. Routes to ConversationInput and MessageList.
 *
 * All state is managed by chatConversationsSlice[sessionId].
 * Parent only needs to provide sessionId and ensure the session is initialized.
 */
export function ConversationShell({
  sessionId,
  title,
  onClose,
  className,
  showSystemMessages = false,
  compact = false,
  inputProps = {},
  headerSlot,
}: ConversationShellProps) {
  // Warn user on page leave if unsaved edits exist
  useUnsavedChangesGuard(sessionId);

  return (
    <div
      className={`flex flex-col h-full overflow-hidden bg-textured w-full ${className ?? ""}`}
    >
      {/* ── Optional header ─────────────────────────────────────────── */}
      {(title || onClose || headerSlot) && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {title && (
              <h2 className="text-sm font-medium text-foreground truncate">
                {title}
              </h2>
            )}
            {headerSlot}
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground flex-shrink-0"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {/* ── Unsaved changes indicator ──────────────────────────────── */}
      <UnsavedChangesIndicator sessionId={sessionId} />

      {/* ── Main content: messages ─────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto overscroll-contain min-h-0">
          <div className="max-w-[800px] mx-auto w-full">
            <MessageList
              sessionId={sessionId}
              showSystemMessages={showSystemMessages}
              compact={compact}
            />
          </div>
        </div>
      </div>

      {/* ── Input ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 p-2 pb-safe">
        <div className="max-w-[800px] mx-auto">
          <ConversationInput
            sessionId={sessionId}
            showVoice={true}
            showResourcePicker={true}
            {...inputProps}
          />
        </div>
      </div>
    </div>
  );
}

export default ConversationShell;
