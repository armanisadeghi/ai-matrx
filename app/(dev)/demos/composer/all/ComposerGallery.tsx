"use client";

/**
 * /demos/composer/all — every composer arrangement on ONE page, each on its
 * own REAL conversation (surface-owned, default chat job), so each one sends,
 * switches agents and streams exactly as it does where it lives. The mode
 * switch at the top drives every tile at once.
 *
 * Tiles: the composer at splash / page / compact (440 and 340 wide) with the
 * Scope chip's two candidate faces, and the classic arrangements still used by
 * hosts that pass no `composer` prop (stacked, single row, ambient) — the
 * drift this page exists to retire.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Building2, RotateCcw } from "lucide-react";
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

type Classic = "stacked" | "single-row" | "ambient";

interface TileSpec {
  key: string;
  title: string;
  note: string;
  width: string;
  height: string;
  size?: ComposerSize;
  scopeChipStyle?: ComposerPresentation["scopeChipStyle"];
  chipShape?: ComposerPresentation["chipShape"];
  classic?: Classic;
}

const TILES: TileSpec[] = [
  { key: "splash-a", title: "Splash", note: "New chat · Scope chip A (plain)", width: "w-[760px]", height: "h-[420px]", size: "splash", scopeChipStyle: "plain" },
  { key: "splash-b", title: "Splash", note: "New chat · chip B · soft chips (Work)", width: "w-[760px]", height: "h-[420px]", size: "splash", scopeChipStyle: "pill", chipShape: "soft" },
  { key: "page-a", title: "Page", note: "Open conversation · chip A", width: "w-[760px]", height: "h-[520px]", size: "page", scopeChipStyle: "plain" },
  { key: "page-b", title: "Page", note: "Open conversation · chip B · soft chips (Work)", width: "w-[760px]", height: "h-[520px]", size: "page", scopeChipStyle: "pill", chipShape: "soft" },
  { key: "compact-440", title: "Compact 440", note: "Chat panel, Quick Chat, windows", width: "w-[440px]", height: "h-[520px]", size: "compact" },
  { key: "compact-340", title: "Compact 340", note: "Floating panel, widgets", width: "w-[340px]", height: "h-[520px]", size: "compact" },
  { key: "classic-stacked", title: "Classic stacked", note: "No composer prop · runner, battle, code", width: "w-[560px]", height: "h-[520px]", classic: "stacked" },
  { key: "classic-single", title: "Classic single row", note: "Agent apps, execution gates", width: "w-[560px]", height: "h-[420px]", classic: "single-row" },
  { key: "classic-ambient", title: "Classic ambient", note: "Scroll / voice launchers", width: "w-[440px]", height: "h-[420px]", classic: "ambient" },
];

export function ComposerGallery({ initialMode }: { initialMode: ComposerMode | null }) {
  const { mode } = useComposerMode(initialMode);
  return (
    <div className="flex h-[calc(100dvh-var(--shell-header-h,2.75rem))] min-h-0 flex-col bg-background pt-[var(--shell-header-h,2.75rem)]">
      <div className="flex shrink-0 items-center justify-center gap-3 px-4 py-2.5">
        <ComposerModeSwitch initialMode={initialMode} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-wrap items-start justify-center gap-6 px-4 pb-10">
          {TILES.map((tile) => (
            <Tile key={tile.key} spec={tile} mode={mode} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Tile({ spec, mode }: { spec: TileSpec; mode: ComposerMode }) {
  const surfaceKey = `demo:composer-all:${spec.key}`;
  const chat = useCanvasWorkspaceConversation(surfaceKey);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState(0);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(() => setPanelHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const composer: ComposerPresentation | undefined = spec.size
    ? {
        size: spec.size,
        mode,
        agent: { onSelectAgent: chat.startWith },
        placeholder: spec.size === "compact" ? "Reply" : "How can I help you today?",
        scopeChipStyle: spec.scopeChipStyle,
        chipShape: spec.chipShape,
        maxInputHeightPx: spec.size === "compact" && panelHeight > 0 ? Math.round(panelHeight / 2) : undefined,
      }
    : undefined;
  const conversationId = chat.conversationId;

  let body: ReactNode;
  if (chat.conversation.state === "failed") {
    body = (
      <ErrorNotice
        className="m-auto max-w-xs"
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
    body = (
      <button type="button" onClick={chat.conversation.choose} className="m-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm hover:bg-accent">
        <Building2 className="h-3.5 w-3.5" /> Choose organization
      </button>
    );
  } else if (!conversationId) {
    body = <div className="m-auto h-24 w-4/5 animate-pulse rounded-[22px] bg-muted" aria-busy="true" />;
  } else if (spec.size === "splash") {
    body = (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-4">
        <ComposerGreeting className="mb-2" />
        <SmartAgentInput conversationId={conversationId} surfaceKey={surfaceKey} composer={composer} />
      </div>
    );
  } else if (spec.classic === "single-row" || spec.classic === "ambient") {
    // Input-only hosts: these arrangements launch a run, they carry no transcript.
    body = (
      <div className="mt-auto p-3">
        <SmartAgentInput
          conversationId={conversationId}
          surfaceKey={surfaceKey}
          singleRowTextarea={spec.classic === "single-row"}
          presentation={spec.classic === "ambient" ? "ambient" : "default"}
        />
      </div>
    );
  } else {
    body = (
      <AgentConversationColumn
        conversationId={conversationId}
        surfaceKey={surfaceKey}
        constrainWidth={spec.size === "page"}
        smartInputProps={composer ? { composer } : {}}
      />
    );
  }

  return (
    <section className={`flex max-w-full flex-col gap-1.5 ${spec.width}`}>
      <div className="flex items-baseline gap-2 px-1">
        <h2 className="text-sm font-medium text-foreground">{spec.title}</h2>
        <span className="truncate text-xs text-muted-foreground">{spec.note}</span>
      </div>
      <div ref={panelRef} className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card/40 ${spec.height}`}>
        {body}
      </div>
    </section>
  );
}
