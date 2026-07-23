"use client";

/**
 * KindAgentActionButton — the platform-owned seam that lets RENDERED kind
 * content fire an agent execution.
 *
 * Content (a kind's data, an agent's structured output) only ever DECLARES an
 * action: `{ agent_id, variable values, optional llm overrides }`. This
 * component is the single execution path: a real user click launches the
 * target agent through the canonical `launchAgentExecution` pipeline
 * (useAgentLauncher → agentFullModal chat overlay, autoRun) with the declared
 * variables pre-filled. Rules it enforces:
 *
 * - CLICK-ONLY: an action never auto-fires from streamed/persisted content.
 * - Runs as the viewing user — agent access/RLS applies; a launch the user
 *   isn't allowed fails loudly (toast + captured error), never silently.
 * - Duplicate clicks are guarded; the button shows its busy state.
 *
 * This is the BUNDLED convenience wrapper over the `trigger_agent` action in
 * the kind action registry — the same path a sandboxed component reaches via
 * its injected `runAction("trigger_agent", …)`. One authority, two entry
 * points: this button for compiled/bundled renderers, `runAction` for
 * agent-authored DB components.
 */

import { useCallback, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LLMParams } from "@/features/agents/types/agent-api-types";
import { useKindActionRunner } from "./useKindActionRunner";

export interface KindAgentActionButtonProps {
  /** The agent the click launches. Access is checked as the viewing user. */
  agentId: string;
  /** Button text. Default: "Run agent". */
  label?: string | null;
  /** Variable values injected on launch, keyed by variable NAME. */
  variables: Record<string, unknown>;
  /** Partial settings delta (e.g. aspect_ratio, duration_seconds). */
  llmOverrides?: Partial<LLMParams> | null;
  className?: string;
  size?: "default" | "sm" | "lg";
}

export function KindAgentActionButton({
  agentId,
  label,
  variables,
  llmOverrides,
  className,
  size = "sm",
}: KindAgentActionButtonProps) {
  const runAction = useKindActionRunner();
  const [isLaunching, setIsLaunching] = useState(false);

  const handleClick = useCallback(async () => {
    if (isLaunching) return;
    setIsLaunching(true);
    // The runner owns error handling (toast + capture) and never throws; the
    // returned envelope only drives this button's busy state.
    await runAction("trigger_agent", {
      agentId,
      variables,
      ...(llmOverrides ? { llmOverrides } : null),
    });
    setIsLaunching(false);
  }, [agentId, isLaunching, runAction, llmOverrides, variables]);

  return (
    <Button
      type="button"
      size={size}
      className={className}
      onClick={handleClick}
      disabled={isLaunching}
    >
      {isLaunching ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Play className="h-4 w-4" />
      )}
      {label ?? "Run agent"}
    </Button>
  );
}
