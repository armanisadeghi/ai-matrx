"use client";

/**
 * /demos/composer — the three-mode, three-size composer on a REAL
 * conversation (the default chat job, `chat.default_new_chat`), so every
 * control can be exercised end to end before it is plugged into a route.
 * Switching agents here relaunches the conversation with that agent, which is
 * what "switch agent" means on a surface that owns its own conversation.
 */

import { useEffect, useRef, useState } from "react";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { RotateCcw } from "lucide-react";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { SmartAgentInput } from "@/features/agents/components/inputs/smart-input/SmartAgentInput";
import { ComposerModeSwitch } from "@/features/agents/components/inputs/smart-input/composer/ComposerModeSwitch";
import { useComposerMode } from "@/features/agents/components/inputs/smart-input/composer/useComposerMode";
import {
  ComposerGreeting,
  ComposerQuickActions,
} from "@/features/agents/components/inputs/smart-input/composer/ComposerSplash";
import { COMPOSER_KNOBS } from "@/features/agents/components/inputs/smart-input/composer/composer-mode-cookie";
import type {
  ComposerMode,
  ComposerSize,
} from "@/features/agents/components/inputs/smart-input/composer/composer-types";
import { useSessionKnob } from "@/lib/scoped-config/sessionKnob";
import { cn } from "@/lib/utils";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

const SIZES: ComposerSize[] = ["splash", "page", "compact"];
const SURFACE_KEY = "demo:composer";

type Target = { kind: "default" } | { kind: "agent"; agentId: string };

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["user_message", "message", "detail"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return "The conversation could not be opened, and the server gave no reason.";
}

export function ComposerPlayground({ initialMode }: { initialMode: ComposerMode | null }) {
  const { launchMandate, launchAgent } = useAgentLauncher();
  const { mode } = useComposerMode(initialMode);
  const [size, setSize] = useState<ComposerSize>("page");
  const [target, setTarget] = useState<Target>({ kind: "default" });
  const [attempt, setAttempt] = useState(0);
  // Keyed by what was launched, so a new target reads as "opening" without a
  // synchronous reset inside the effect.
  const launchKey = `${target.kind === "agent" ? target.agentId : "default"}#${attempt}`;
  const [launched, setLaunched] = useState<{
    key: string;
    conversationId: string | null;
    failure: string | null;
  } | null>(null);
  const current = launched?.key === launchKey ? launched : null;
  const conversationId = current?.conversationId ?? null;
  const failure = current?.failure ?? null;
  const compactPanelRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState(0);
  const pctKnob = useSessionKnob(COMPOSER_KNOBS.compactInputMaxHeightPct);
  const pct = typeof pctKnob === "number" ? pctKnob : 50;

  useEffect(() => {
    let cancelled = false;
    const key = launchKey;
    const launch =
      target.kind === "default"
        ? launchMandate(MANDATE_KEYS.chat__default_new_chat, { surfaceKey: SURFACE_KEY, sourceFeature: "chat" })
        : launchAgent(target.agentId, { surfaceKey: SURFACE_KEY, sourceFeature: "chat" });
    launch.then(
      (result) => {
        if (!cancelled) setLaunched({ key, conversationId: result.conversationId, failure: null });
      },
      (error: unknown) => {
        console.error("[demos/composer] launch failed", error);
        if (!cancelled) setLaunched({ key, conversationId: null, failure: describeError(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [launchKey, launchMandate, launchAgent]);

  useEffect(() => {
    const el = compactPanelRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(() => setPanelHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [size]);

  const composer = {
    size,
    mode,
    agent: {
      onSelectAgent: (agentId: string, via?: { mandateKey: unknown }) =>
        setTarget(via?.mandateKey ? { kind: "default" } : { kind: "agent", agentId }),
    },
    placeholder: size === "compact" ? "Reply" : "How can I help you today?",
    maxInputHeightPx: size === "compact" && panelHeight > 0 ? Math.round((panelHeight * pct) / 100) : undefined,
  };

  return (
    <div className="flex h-[calc(100dvh-var(--shell-header-h,2.75rem))] min-h-0 flex-col bg-background pt-[var(--shell-header-h,2.75rem)]">
      <div className="flex shrink-0 items-center justify-center gap-3 border-b border-border px-4 py-2.5">
        <ComposerModeSwitch initialMode={initialMode} />
        <div role="tablist" aria-label="Composer size" className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {SIZES.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={value === size}
              onClick={() => setSize(value)}
              className={cn(
                "h-7 rounded-md px-3 text-sm font-medium capitalize",
                value === size ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 justify-center overflow-hidden">
        {failure ? (
          <ErrorNotice
            className="m-auto max-w-md"
            title="The demo conversation could not be opened"
            message={failure}
            operation="Open the demo conversation"
            actions={
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm hover:bg-accent"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Try again
              </button>
            }
          />
        ) : !conversationId ? (
          <div className="m-auto flex w-full max-w-[720px] flex-col gap-3 p-6" aria-busy="true" aria-label="Opening the conversation">
            <div className="mx-auto h-10 w-72 animate-pulse rounded-lg bg-muted" />
            <div className="h-32 w-full animate-pulse rounded-[22px] bg-muted" />
          </div>
        ) : size === "splash" ? (
          <div className="flex w-full max-w-[760px] flex-col items-center justify-center gap-4 overflow-y-auto px-4 py-10">
            <ComposerGreeting className="mb-4" />
            <SmartAgentInput conversationId={conversationId} surfaceKey={SURFACE_KEY} composer={composer} />
            <ComposerQuickActions
              className="w-full max-w-[720px]"
              onLaunchAgent={(agentId) => setTarget({ kind: "agent", agentId })}
            />
          </div>
        ) : size === "page" ? (
          <div className="flex min-h-0 w-full flex-col">
            <AgentConversationColumn
              conversationId={conversationId}
              surfaceKey={SURFACE_KEY}
              constrainWidth
              edgeToEdgeScroll
              smartInputProps={{ composer }}
            />
          </div>
        ) : (
          <div ref={compactPanelRef} className="flex h-full min-h-0 w-[440px] shrink-0 flex-col border-x border-border bg-card/40">
            <AgentConversationColumn
              conversationId={conversationId}
              surfaceKey={SURFACE_KEY}
              smartInputProps={{ composer }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
