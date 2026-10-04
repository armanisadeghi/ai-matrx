"use client";

/**
 * /demos/composer/all — the FINAL composer styles only, each on its own REAL
 * conversation (surface-owned, default chat job), so each one sends, switches
 * agents and streams exactly as it does where it lives. The mode switch at the
 * top drives every composer on the page.
 *
 * One component (SmartAgentInput's `composer` prop), three styles:
 *   Full (placed top on a new chat, bottom in a conversation) · Compact · Single-line.
 * Each style shows a frame you can drag from 340 to 768 — chat beside the
 * canvas and most windows resize live — then the six fixed widths.
 * Every composer of one style shares its conversation: type in one, all follow.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Building2, GripVertical, RotateCcw } from "lucide-react";
import { AgentConversationColumn } from "@ai-matrx/chat/agents/components/shared/AgentConversationColumn";
import { useCanvasWorkspaceConversation } from "@ai-matrx/chat/canvas/workspace/useCanvasWorkspaceConversation";
import { SmartAgentInput } from "@ai-matrx/chat/agents/components/inputs/smart-input/SmartAgentInput";
import { ComposerModeSwitch } from "@ai-matrx/chat/agents/components/inputs/smart-input/composer/ComposerModeSwitch";
import { useComposerMode } from "@ai-matrx/chat/agents/components/inputs/smart-input/composer/useComposerMode";
import { ComposerGreeting } from "@ai-matrx/chat/agents/components/inputs/smart-input/composer/ComposerSplash";
import type {
  ComposerMode,
  ComposerPresentation,
  ComposerSize,
} from "@ai-matrx/chat/agents/components/inputs/smart-input/composer/composer-types";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

const MIN_W = 340;
const MAX_W = 768;
const WIDTHS = [768, 640, 560, 480, 400, 340] as const;

interface StyleSpec {
  key: string;
  title: string;
  size: ComposerSize;
  /** Show the transcript above the composer in the resizable frame. */
  transcript: boolean;
}

const STYLES: StyleSpec[] = [
  { key: "full-top", title: "Full · top (new chat)", size: "splash", transcript: false },
  { key: "full-bottom", title: "Full · bottom (conversation)", size: "page", transcript: true },
  { key: "compact", title: "Compact", size: "compact", transcript: true },
  { key: "line", title: "Single-line", size: "line", transcript: false },
];

export function ComposerGallery({ initialMode }: { initialMode: ComposerMode | null }) {
  const { mode } = useComposerMode(initialMode);
  return (
    <div className="flex h-[calc(100dvh-var(--shell-header-h,2.75rem))] min-h-0 flex-col bg-background pt-[var(--shell-header-h,2.75rem)]">
      <div className="flex shrink-0 items-center justify-center gap-3 px-4 py-2.5">
        <ComposerModeSwitch initialMode={initialMode} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-12 px-4 pb-16">
          {STYLES.map((style) => (
            <StyleSection key={style.key} spec={style} mode={mode} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StyleSection({ spec, mode }: { spec: StyleSpec; mode: ComposerMode }) {
  const surfaceKey = `demo:composer-all:${spec.key}`;
  const chat = useCanvasWorkspaceConversation(surfaceKey);
  const conversationId = chat.conversationId;
  const composer = (width: number): ComposerPresentation => ({
    size: spec.size,
    mode,
    agent: { onSelectAgent: chat.startWith },
    placeholder: spec.size === "compact" || spec.size === "line" ? "Reply" : "How can I help you today?",
    maxInputHeightPx: spec.size === "compact" ? Math.round(width * 0.6) : undefined,
  });

  let gate: ReactNode = null;
  if (chat.conversation.state === "failed") {
    gate = (
      <ErrorNotice
        className="max-w-md"
        title="This conversation could not be opened"
        message={chat.conversation.reason}
        operation="Open the demo conversation"
        actions={
          <button type="button" onClick={chat.conversation.retry} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm hover:bg-accent">
            <RotateCcw className="h-3.5 w-3.5" /> Try again
          </button>
        }
      />
    );
  } else if (chat.conversation.state === "needs-organization") {
    gate = (
      <button type="button" onClick={chat.conversation.choose} className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm hover:bg-accent">
        <Building2 className="h-3.5 w-3.5" /> Choose organization
      </button>
    );
  } else if (!conversationId) {
    gate = <div className="h-24 w-full max-w-[768px] animate-pulse rounded-[22px] bg-muted" aria-busy="true" />;
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-foreground">{spec.title}</h2>
      {gate ?? (
        <>
          <ResizableFrame tall={spec.transcript || spec.size === "splash"}>
            {(width) =>
              spec.transcript ? (
                <AgentConversationColumn
                  conversationId={conversationId!}
                  surfaceKey={surfaceKey}
                  smartInputProps={{ composer: composer(width) }}
                />
              ) : (
                <div className={spec.size === "splash" ? "flex h-full flex-col items-center justify-center gap-4 px-3" : "mt-auto p-3"}>
                  {spec.size === "splash" ? <ComposerGreeting className="mb-2" /> : null}
                  <SmartAgentInput conversationId={conversationId!} surfaceKey={surfaceKey} composer={composer(width)} />
                </div>
              )
            }
          </ResizableFrame>
          <div className="flex flex-col gap-5">
            {WIDTHS.map((w) => (
              <div key={w} className="flex flex-col gap-1">
                <span className="text-xs tabular-nums text-muted-foreground">{w}px</span>
                <div style={{ width: w }} className="max-w-full">
                  <SmartAgentInput conversationId={conversationId!} surfaceKey={surfaceKey} composer={composer(w)} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** A frame the viewer drags between 340 and 768 px, its live width shown above it. */
function ResizableFrame({ tall, children }: { tall: boolean; children: (width: number) => ReactNode }) {
  const [width, setWidth] = useState(560);
  const drag = useRef<{ x: number; w: number } | null>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      const next = drag.current.w + (e.clientX - drag.current.x);
      setWidth(Math.max(MIN_W, Math.min(MAX_W, Math.round(next))));
    };
    const up = () => {
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs tabular-nums text-muted-foreground">Drag the edge · {width}px</span>
      <div className="flex items-stretch">
        <div
          style={{ width }}
          className={`flex min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card/40 ${tall ? "h-[460px]" : "h-[200px]"}`}
        >
          {children(width)}
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize"
          aria-valuemin={MIN_W}
          aria-valuemax={MAX_W}
          aria-valuenow={width}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, w: width };
          }}
          className="flex w-4 cursor-col-resize touch-none items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
