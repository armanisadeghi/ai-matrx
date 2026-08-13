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

import {
  LiveRunDisplay,
  useLiveRunStatus,
} from "@/features/agents/components/live-run/LiveRunDisplay";
import {
  LiveRunProgress,
  type LiveRunProgressState,
} from "@/features/agents/components/live-run/LiveRunProgress";
import { WindowPanel } from "@/features/window-panels/WindowPanel";

/**
 * 🚨 THE SIZING RULE — the reading column must match `/chat`, exactly.
 *
 * Content-IR kinds are authored and visually tuned against the canonical chat
 * column (`max-w-3xl`, 768px, minus its own gutters → ~720px of usable width).
 * A live run rendering the SAME components in a narrower box reflows tables,
 * wraps headings, and makes a kind look broken in the window while looking
 * right in chat. So this window is sized from the reading column outward, not
 * picked by eye.
 *
 * Chrome between the window edge and the text is only the frame itself:
 *   frame border 2 + WindowPanel body `p-1.5` 12 = 14px.
 * There is deliberately NO padding of our own — see the body comment below.
 *
 * Never hardcode a smaller number here to make a screenshot fit. If ONE kind
 * genuinely needs a different box, pass `width` / `height` at the callsite
 * (see below) — the default stays the chat-matched baseline.
 */
const LIVE_RUN_CHROME_X = 14;
const CHAT_READING_WIDTH = 720;
const LIVE_RUN_WIDTH = CHAT_READING_WIDTH + LIVE_RUN_CHROME_X;

/**
 * Height is viewport-relative on purpose: a fixed pixel height is either a
 * scrollbar on a laptop or a band of dead white space on a monitor. 80% of the
 * viewport leaves the page visible underneath (the whole point of a floating
 * run) while giving structured output room to render without scrolling.
 */
const LIVE_RUN_HEIGHT = "80vh";

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
  /**
   * Per-kind size override. Only pass these once you have WATCHED that kind
   * render and seen the default box be wrong — a kind whose output is three
   * lines shouldn't open at 80vh, and a kind that renders a wide table may
   * need more than the chat column. Untested guesses belong nowhere.
   * Accepts pixels or viewport strings ("70vh").
   */
  width?: number | string;
  height?: number | string;
  progress?: LiveRunProgressState | null;
}

export default function LiveRunWindow({
  windowInstanceId,
  onClose,
  conversationId = null,
  requestId = null,
  label = null,
  pending = false,
  width = LIVE_RUN_WIDTH,
  height = LIVE_RUN_HEIGHT,
  progress = null,
}: LiveRunWindowProps) {
  const { statusText } = useLiveRunStatus(conversationId, requestId, pending);

  // The phase rides in the frame's OWN title bar. It is not a second row, not
  // a subtitle strip, and not a status bar inside the body — the window
  // already has exactly one place for "what is happening", so it goes there.
  const title = statusText
    ? `${label ?? "AI is working"} — ${statusText}`
    : (label ?? "AI is working");

  return (
    <WindowPanel
      id={`live-run-window-${windowInstanceId}`}
      title={title}
      overlayId="liveRunWindow"
      minWidth={380}
      minHeight={320}
      width={width}
      height={height}
      onClose={onClose}
    >
      {/* 🚨 ONE layer. The WindowPanel body is the frame; the kind component is
          the content. Do NOT add a background here (it fights the component's
          own `bg-card` and produces the two-tone box), and do NOT add padding
          (the body already has `p-1.5`, and every kind component brings its
          own internal spacing). Anything added between these two lines shows
          up as a band of dead space the user can see. */}
      <div className="h-full min-h-0 overflow-hidden">
        {progress ? (
          <LiveRunProgress progress={progress} />
        ) : (
          <LiveRunDisplay
            conversationId={conversationId}
            requestId={requestId}
            pending={pending}
            variant="bare"
            className="h-full"
            bodyClassName="max-h-none h-full overflow-y-auto"
          />
        )}
      </div>
    </WindowPanel>
  );
}
