"use client";

/**
 * /demos/composer/variables — ONE real composer on its own real conversation
 * (surface-owned), with an agent picker, quick picks for agents that carry each
 * variable type, a Full/Compact switch, a variables-panel-style switch and a
 * width frame (340 to 768 px). Nothing here is a stand-in.
 *
 * Quick picks are real agents found by reading agent.definition (2026-10-04);
 * types with no agent yet (slider, light-switch, selection-list, datetime, time,
 * email, phone, percent, color, markdown, currency, audio, video) have no pick —
 * pick any agent from the dropdown. Structured-list-bound variables ride the
 * `picklist` key on any type.
 */

import { useRef, useState, type ReactNode } from "react";
import { Building2, RotateCcw } from "lucide-react";
import { Button, SegmentedControl } from "@ai-matrx/design-system/controls";
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
import { AgentConversationColumn } from "@ai-matrx/chat/agents/components/shared/AgentConversationColumn";
import { useCanvasWorkspaceConversation } from "@ai-matrx/chat/canvas/workspace/useCanvasWorkspaceConversation";
import { ComposerModeSwitch } from "@ai-matrx/chat/agents/components/inputs/smart-input/composer/ComposerModeSwitch";
import { useComposerMode } from "@ai-matrx/chat/agents/components/inputs/smart-input/composer/useComposerMode";
import type {
  ComposerMode,
  ComposerPresentation,
  ComposerSize,
} from "@ai-matrx/chat/agents/components/inputs/smart-input/composer/composer-types";
import {
  VARIABLE_PANEL_STYLES,
  type VariablesPanelStyle,
} from "@ai-matrx/chat/agents/components/inputs/variable-input-variations/variable-input-options";
import { ErrorNotice } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";

const SURFACE_KEY = "demo:composer-variables";
const MIN_W = 340;
const MAX_W = 900;
const PRESETS = [900, 640, 440, 340] as const;

interface QuickPick {
  id: string;
  label: string;
  types: string;
}

const QUICK_PICKS: readonly QuickPick[] = [
  { id: "35461e07-bbd1-46cc-81a7-910850815703", label: "Balanced News", types: "textarea" },
  { id: "3079bb13-6016-43bb-8dc1-db2878ed3902", label: "Content Extractor", types: "radio" },
  { id: "8b205923-3efa-4018-bb68-2088af362e4c", label: "Flashcards", types: "number" },
  { id: "6f92950c-23c9-48d2-bfe8-02d54f21c185", label: "Science Tutor", types: "select" },
  { id: "616543f2-eeb0-4b73-8c43-c777337aa8e2", label: "Multi-Perspective", types: "toggle" },
  { id: "49d3c256-fdb4-4c9c-8965-6b35e638f698", label: "Study Planner", types: "number + checkbox" },
  { id: "3bf7e37d-26b4-4581-ac29-450462c18b22", label: "Shot Studio", types: "pill-toggle" },
  { id: "1f1607f5-9866-4ab2-93e4-8dc4ef1e9376", label: "Images + Styles", types: "buttons + list" },
  { id: "44d3b270-d516-4485-86a5-a958968e15c9", label: "Feedback triage", types: "url + select" },
  { id: "c76517de-fa2e-4066-b5cf-131747b3c36b", label: "Photo Studio", types: "image" },
  { id: "bd1ee03d-b7eb-4258-b51f-88e00e446eff", label: "PDF Extract", types: "document" },
  { id: "7402d782-81ea-4765-bb24-d08a639c4aa8", label: "YouTube Research", types: "youtube + toggle" },
  { id: "4cd676c6-f55d-4426-b7eb-a9d0273566ec", label: "Your Tables", types: "table + tables" },
  { id: "04f69dff-a258-4791-a44e-b7b87f346b9d", label: "Custom speech", types: "select + list" },
  { id: "8d02d271-f007-4db3-90f2-3cc596190db0", label: "Model Config Sync", types: "textarea + list" },
];

const SIZE_OPTIONS = [
  { value: "page", label: "Full page" },
  { value: "compact", label: "Compact" },
] as const;

const STYLE_OPTIONS = VARIABLE_PANEL_STYLES.map((value) => ({ value, label: value }));

export function ComposerVariables({ initialMode }: { initialMode: ComposerMode | null }) {
  const { mode } = useComposerMode(initialMode);
  const [size, setSize] = useState<Extract<ComposerSize, "page" | "compact">>("page");
  const [style, setStyle] = useState<VariablesPanelStyle>("inline");
  const [agentId, setAgentId] = useState<string | null>(null);
  const chat = useCanvasWorkspaceConversation(SURFACE_KEY);
  const conversationId = chat.conversationId;

  const pick = (id: string) => {
    setAgentId(id);
    chat.startWith(id);
  };

  const composer: ComposerPresentation = {
    size,
    mode,
    agent: { onSelectAgent: pick },
    placeholder: size === "compact" ? "Reply" : "How can I help you today?",
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
  } else {
    body = (
      <AgentConversationColumn
        key={`${conversationId}:${size}:${style}`}
        conversationId={conversationId}
        surfaceKey={SURFACE_KEY}
        smartInputProps={{ composer, variablesPanelStyle: style }}
      />
    );
  }

  return (
    <div className="flex h-[calc(100dvh-var(--shell-header-h,2.75rem))] min-h-0 flex-col bg-background pt-[var(--shell-header-h,2.75rem)]">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 px-4 py-2.5">
        <ComposerModeSwitch initialMode={initialMode} />
        <SegmentedControl value={size} onValueChange={(v) => setSize(v as typeof size)} data={SIZE_OPTIONS} aria-label="Composer size" />
        <SegmentedControl value={style} onValueChange={(v) => setStyle(v as VariablesPanelStyle)} data={STYLE_OPTIONS} aria-label="Variables panel style" />
        <AgentListDropdown onSelect={pick} label={agentId ? "Change agent" : "Pick agent"} />
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-1.5 px-4 pb-2">
        {QUICK_PICKS.map((q) => (
          <Button variant="quiet" pressed={agentId === q.id} key={q.id} title={q.id} onClick={() => pick(q.id)}>
            {q.label} · {q.types}
          </Button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1000px] flex-col px-4 pb-8">
          <WidthFrame>{body}</WidthFrame>
        </div>
      </div>
    </div>
  );
}

/** A frame snapped to a preset width, written straight to the DOM. */
function WidthFrame({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(640);
  const apply = (w: number) => {
    const clamped = Math.max(MIN_W, Math.min(MAX_W, w));
    if (frameRef.current) frameRef.current.style.width = `${clamped}px`;
    setWidth(clamped);
  };
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-1.5">
        {PRESETS.map((w) => (
          <Button variant="quiet" pressed={width === w} key={w} onClick={() => apply(w)}>
            {w}
          </Button>
        ))}
      </div>
      <div
        ref={frameRef}
        style={{ width: 640 }}
        className="flex h-[640px] min-h-0 max-w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card/40"
      >
        {children}
      </div>
    </div>
  );
}
