"use client";

/**
 * LiveRunWindow — the ONE floating home for "watch this AI run".
 *
 * 🚨 WHY THIS EXISTS. Surfaces used to render a live run by inserting a block
 * at the top of the page while the model worked. That is a layout shift on
 * every run, and it puts the model's output somewhere it does not belong —
 * above the thing the user is actually editing, pushing it down. This window
 * is the alternative: the run floats, the page never moves, and the user can
 * drag it, resize it, minimize it to the tray, or watch it while they keep
 * working on the surface underneath.
 *
 * It is deliberately thin. The content is `LiveRunDisplay`, which is itself
 * only a binding to the canonical pipeline (`MarkdownStream` →
 * `EnhancedChatMarkdown` → `BlockRenderer` → the kind registry). So a run whose
 * output is a registered content-IR kind renders as that kind's COMPONENT,
 * token by token, instead of a wall of raw JSON — and it does so here for free,
 * because this window parses nothing itself (`matrx/no-bespoke-stream-renderer`).
 *
 * Multi-instance and ephemeral: each run opens its own window, and a live run
 * is not restored across reloads (the durable record is whatever the run's
 * own feature persisted — never this window).
 */

import React from "react";

import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import { WindowPanel } from "@/features/window-panels/WindowPanel";

export interface LiveRunWindowProps {
  windowInstanceId: string;
  onClose: () => void;

  /** Preferred binding — a conversation-backed run. */
  conversationId?: string | null;
  /** Adopted server-pipeline runs (`adoptForeignStream`) bind by request id. */
  requestId?: string | null;
  /** What the user is watching, e.g. "Drafting brief". */
  label?: string | null;
  /** The run has been launched but no stream has connected yet. */
  pending?: boolean;
  /** Optional line under the title — where the result will land. */
  subtitle?: string | null;
}

export default function LiveRunWindow({
  windowInstanceId,
  onClose,
  conversationId = null,
  requestId = null,
  label = null,
  pending = false,
  subtitle = null,
}: LiveRunWindowProps) {
  return (
    <WindowPanel
      id={`live-run-window-${windowInstanceId}`}
      title={label ?? "AI is working"}
      overlayId="liveRunWindow"
      minWidth={380}
      minHeight={260}
      width={620}
      height={480}
      onClose={onClose}
    >
      <div className="flex h-full w-full flex-col overflow-hidden bg-background">
        {subtitle ? (
          <p className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-hidden px-3 py-2">
          <LiveRunDisplay
            conversationId={conversationId}
            requestId={requestId}
            label={label ?? undefined}
            pending={pending}
            // The window frame owns the height; the display must fill it
            // rather than apply its own inline max-height cap.
            className="h-full"
            bodyClassName="max-h-none h-full overflow-y-auto"
          />
        </div>
      </div>
    </WindowPanel>
  );
}
