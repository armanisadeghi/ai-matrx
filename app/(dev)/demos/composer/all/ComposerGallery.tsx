"use client";

/**
 * /demos/composer/all — the final composer styles, each ONE real composer on
 * its own real conversation (surface-owned, default chat job): variables,
 * agent switching, Work/Advanced, outputs and streaming all behave exactly as
 * where it lives. Nothing here is a stand-in.
 *
 * One component (SmartAgentInput's `composer` prop), three styles:
 *   Full — top on a new chat, bottom in a conversation · Compact — panels and
 *   windows · Launcher — the quiet box at a page's foot that starts a quick chat.
 * Each sits in a frame you drag from 340 to 768, or snap to a fixed width.
 * The drag writes the frame's width straight to the DOM (no React state per
 * pixel), so resizing never re-renders the composer.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setShowFreeformInput } from "@ai-matrx/chat/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
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
import { ErrorNotice } from "@ai-matrx/design-system";
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
import { cn } from "@/lib/utils";
import { Button } from "@ai-matrx/design-system/controls";

const MIN_W = 340;
const MAX_W = 768;
const PRESETS = [768, 640, 560, 480, 400, 340] as const;

interface StyleSpec {
  key: string;
  title: string;
  size: ComposerSize;
  /** Form style: the conversation takes no typed message — variables + Run. */
  form?: boolean;
}

const STYLES: StyleSpec[] = [
  { key: "full-top", title: "Full · top (new chat)", size: "splash" },
  { key: "full-bottom", title: "Full · bottom (conversation)", size: "page" },
  { key: "compact", title: "Compact", size: "compact" },
  { key: "launcher", title: "Launcher (foot of notes, education, data, landings)", size: "launcher" },
  { key: "form", title: "Form (an agent with no typed message: its variables + Run)", size: "page", form: true },
];

export function ComposerGallery({ initialMode }: { initialMode: ComposerMode | null }) {
  const { mode } = useComposerMode(initialMode);
  return (
    <div className="flex h-[calc(100dvh-var(--shell-header-h,2.75rem))] min-h-0 flex-col bg-background pt-[var(--shell-header-h,2.75rem)]">
      <div className="flex shrink-0 items-center justify-center gap-3 px-4 py-2.5">
        <ComposerModeSwitch initialMode={initialMode} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[900px] flex-col gap-12 px-4 pb-16">
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
  const dispatch = useAppDispatch();
  // Form style is the agent's setting, not the host's: show it by turning the
  // demo conversation's typed message off (an app or shortcut sets the same).
  useEffect(() => {
    if (spec.form && conversationId) dispatch(setShowFreeformInput({ conversationId, value: false }));
  }, [dispatch, spec.form, conversationId]);
  const composer: ComposerPresentation = {
    size: spec.size,
    mode,
    agent: { onSelectAgent: chat.startWith },
    placeholder: spec.size === "compact" ? "Reply" : "How can I help you today?",
  };

  let body: ReactNode;
  if (chat.conversation.state === "failed") {
    body = (
      <ErrorNotice
        className="m-auto max-w-xs"
        title="This conversation could not be opened"
        message={chat.conversation.reason}
        operation="Open the demo conversation"
        actions={
          <Button variant="outline" icon={<RotateCcw />} onClick={chat.conversation.retry}> Try again
          </Button>
        }
      />
    );
  } else if (chat.conversation.state === "needs-organization") {
    body = (
      <Button variant="outline" icon={<Building2 />} onClick={chat.conversation.choose} className="m-auto"> Choose organization
      </Button>
    );
  } else if (!conversationId) {
    body = <div className="m-auto h-24 w-4/5 animate-pulse rounded-[22px] bg-muted" aria-busy="true" />;
  } else if (spec.size === "launcher") {
    // As the page hosts mount it: faded until hovered or focused, at the foot.
    body = (
      <div className="mt-auto p-4">
        <div className="opacity-75 transition-opacity hover:opacity-100 focus-within:opacity-100">
          <SmartAgentInput conversationId={conversationId} surfaceKey={surfaceKey} composer={composer} />
        </div>
      </div>
    );
  } else if (spec.size === "splash") {
    body = (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-3">
        <ComposerGreeting className="mb-2" />
        <SmartAgentInput conversationId={conversationId} surfaceKey={surfaceKey} composer={composer} />
      </div>
    );
  } else {
    body = (
      <AgentConversationColumn
        conversationId={conversationId}
        surfaceKey={surfaceKey}
        smartInputProps={{ composer }}
      />
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-foreground">{spec.title}</h2>
        {/* Form has no pill row, so the agent is chosen here: pick any agent
            to see its variables as a form with Run. */}
        {spec.form ? (
          <AgentListDropdown onSelect={(agentId: string) => chat.startWith(agentId)} />
        ) : null}
      </div>
      <ResizableFrame>{body}</ResizableFrame>
    </section>
  );
}

/** A frame dragged between 340 and 768 px, or snapped to a preset. */
function ResizableFrame({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const [preset, setPreset] = useState<number | null>(560);

  const apply = (width: number) => {
    const w = Math.max(MIN_W, Math.min(MAX_W, Math.round(width)));
    if (frameRef.current) frameRef.current.style.width = `${w}px`;
    if (labelRef.current) labelRef.current.textContent = `${w}px`;
    return w;
  };

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const startX = e.clientX;
    const startW = frameRef.current?.offsetWidth ?? 560;
    let frame = 0;
    let lastX = startX;
    setPreset(null);
    const move = (ev: PointerEvent) => {
      lastX = ev.clientX;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        apply(startW + (lastX - startX));
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (frame) cancelAnimationFrame(frame);
      const w = apply(startW + (lastX - startX));
      if ((PRESETS as readonly number[]).includes(w)) setPreset(w);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((w) => (
          <Button variant="quiet" pressed={preset === w} key={w} onClick={() => {
              apply(w);
              setPreset(w);
            }}>
            {w}
          </Button>
        ))}
        <span ref={labelRef} className="ml-2 type-secondary tabular-nums text-muted-foreground">
          560px
        </span>
      </div>
      <div className="flex items-stretch">
        <div
          ref={frameRef}
          style={{ width: 560 }}
          className="flex h-[520px] min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card/40"
        >
          {children}
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Drag to resize"
          onPointerDown={startDrag}
          className="flex w-4 touch-none select-none items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
