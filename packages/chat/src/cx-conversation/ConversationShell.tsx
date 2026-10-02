"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageList } from "@/features/cx-conversation/MessageList";
import { ConversationInput } from "@/features/cx-conversation/ConversationInput";
import type { ConversationInputProps } from "@/features/cx-conversation/ConversationInput";
import { UnsavedChangesIndicator } from "@/features/cx-conversation/UnsavedChangesIndicator";
import { useUnsavedChangesGuard } from "@/features/cx-conversation/hooks/useUnsavedChangesGuard";

const ResizableCanvas = dynamic(
  () => import("@/features/canvas/core/ResizableCanvas").then((m) => ({ default: m.ResizableCanvas })),
  { ssr: false }
);
const CanvasRenderer = dynamic(
  () => import("@/features/canvas/core/CanvasRenderer").then((m) => ({ default: m.CanvasRenderer })),
  { ssr: false }
);

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

  // ── Canvas ─────────────────────────────────────────────────────────────────
  /** Enable inline side-by-side canvas (canvas always on right) */
  enableInlineCanvas?: boolean;
  enableCanvas?: boolean;

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
  enableInlineCanvas = false,
  enableCanvas = false,
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

      {/* ── Main content: messages + optional canvas ─────────────────── */}
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

        {/* Inline canvas (side-by-side, right panel) */}
        {(enableInlineCanvas || enableCanvas) && (
          <div className="flex-shrink-0 w-1/2 min-w-[300px] border-l border-border overflow-hidden">
            <Suspense
              fallback={
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  Loading canvas…
                </div>
              }
            >
              <ResizableCanvas>
                <CanvasRenderer />
              </ResizableCanvas>
            </Suspense>
          </div>
        )}
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
