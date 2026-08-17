"use client";

/**
 * "Analyze this conversation" — the product consumption layer over the five
 * conversation-analysis agents (see `catalog.ts`).
 *
 * THE INVENTORY LAW — this panel builds no execution and no renderer of its
 * own. Every run goes through the ONE canonical path
 * (`launchAgentExecution`, mandate-resolved) and streams in the floating
 * `LiveRunWindow` (THE FLOATING LAW: never a spinner, never an inline block
 * that shifts the page; registered kinds render through their canonical
 * components inside the window for free).
 *
 * NO DEAD ENDS — every finished analysis IS a canonical conversation; the
 * panel keeps a door to it (`EntityRef` → `/chat/<id>`), so the report never
 * lives only inside a dismissable window.
 *
 * The conversation being analyzed is passed as the agent's `conversation_id`
 * runtime variable; the agent's own registered `conversations` tool reads the
 * history server-side under the caller's RLS.
 */

import { useState } from "react";
import { CircleAlert, Loader2, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useAppDispatch } from "@/lib/redux/hooks";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import { useOpenLiveRunWindow } from "@/features/overlays/openers/liveRunWindow";
import {
  CONVERSATION_ANALYSIS_KINDS,
  type ConversationAnalysisKind,
} from "./catalog";

type RunState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; analysisConversationId: string }
  | { phase: "error"; message: string };

export function ConversationAnalyzePanel({
  conversationId,
  conversationTitle,
}: {
  /** The conversation being analyzed (AI Matrx chat or provider mirror). */
  conversationId: string;
  /** Used only to label the floating run window and result doors. */
  conversationTitle?: string;
}) {
  const dispatch = useAppDispatch();
  const openLiveRun = useOpenLiveRunWindow();
  const [runs, setRuns] = useState<Record<string, RunState>>({});

  const runAnalysis = async (kind: ConversationAnalysisKind) => {
    setRuns((current) => ({ ...current, [kind.key]: { phase: "running" } }));
    const handle = openLiveRun({
      label: `${kind.label} — ${conversationTitle?.trim() || "this conversation"}`,
      pending: true,
      instanceId: `conversation-analysis:${conversationId}:${kind.key}`,
    });
    try {
      const result = await dispatch(
        launchAgentExecution({
          mandateKey: kind.mandateKey,
          sourceFeature: "chat",
          surfaceKey: `conversation-analysis:${conversationId}:${kind.key}`,
          apiEndpointMode: "agent",
          config: { displayMode: "direct", autoRun: true, allowChat: true },
          runtime: { variables: { conversation_id: conversationId } },
          onConversationCreated: (id) =>
            handle.update({ conversationId: id, pending: false }),
        }),
      ).unwrap();
      setRuns((current) => ({
        ...current,
        [kind.key]: {
          phase: "done",
          analysisConversationId: result.conversationId,
        },
      }));
    } catch (error) {
      handle.close();
      const message =
        error instanceof Error && error.message
          ? error.message
          : "The analysis could not start.";
      console.error(
        `[conversation-analysis] "${kind.mandateKey}" launch failed for ${conversationId}`,
        error,
      );
      setRuns((current) => ({
        ...current,
        [kind.key]: { phase: "error", message },
      }));
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">
            Analyze this conversation
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Each reviewer reads this conversation&apos;s full history and
            streams its report in a floating window. Every finished report is
            saved as its own conversation you can reopen anytime.
          </p>
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {CONVERSATION_ANALYSIS_KINDS.map((kind) => {
          const state = runs[kind.key] ?? { phase: "idle" };
          return (
            <li
              key={kind.key}
              className="rounded-lg border border-border bg-background p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-foreground">
                    {kind.label}
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {kind.description}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={state.phase === "running"}
                  onClick={() => void runAnalysis(kind)}
                >
                  {state.phase === "running" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Running…
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      {state.phase === "done" ? "Run again" : "Run"}
                    </>
                  )}
                </Button>
              </div>
              {state.phase === "done" ? (
                <div className="mt-2 border-t border-border pt-2">
                  <EntityRef
                    token="conversation"
                    id={state.analysisConversationId}
                    name={`Open the "${kind.label}" report`}
                    href={`/chat/${state.analysisConversationId}`}
                    className="text-xs font-medium"
                  />
                </div>
              ) : null}
              {state.phase === "error" ? (
                <p className="mt-2 flex items-start gap-1.5 border-t border-border pt-2 text-xs text-destructive">
                  <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {state.message}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
