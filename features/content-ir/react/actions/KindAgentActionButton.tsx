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
 * Agent-authored (DB-sourced, sandboxed) kind components must NOT reimplement
 * this — they declare the action in kind data and the bundled renderer (or a
 * future compiler-scope export) mediates execution.
 */

import { useCallback, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import type { LLMParams } from "@/features/agents/types/agent-api-types";
import type { SourceFeature } from "@/features/agents/types/instance.types";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

export interface KindAgentActionButtonProps {
  /** The agent the click launches. Access is checked as the viewing user. */
  agentId: string;
  /** Button text. Default: "Run agent". */
  label?: string | null;
  /** Variable values injected on launch, keyed by variable NAME. */
  variables: Record<string, unknown>;
  /** Partial settings delta (e.g. aspect_ratio, duration_seconds). */
  llmOverrides?: Partial<LLMParams> | null;
  /** Launch attribution — a REGISTERED source feature (SOURCE_FEATURES). */
  sourceFeature: SourceFeature;
  className?: string;
  size?: "default" | "sm" | "lg";
}

export function KindAgentActionButton({
  agentId,
  label,
  variables,
  llmOverrides,
  sourceFeature,
  className,
  size = "sm",
}: KindAgentActionButtonProps) {
  const { launchAgent } = useAgentLauncher();
  const [isLaunching, setIsLaunching] = useState(false);

  const handleClick = useCallback(async () => {
    if (isLaunching) return;
    setIsLaunching(true);
    try {
      await launchAgent(agentId, {
        surfaceKey: `${sourceFeature}:kind-action:${agentId}`,
        sourceFeature,
        config: {
          displayMode: "modal-full",
          autoRun: true,
          ...(llmOverrides ? { llmOverrides } : null),
        },
        runtime: { variables },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The agent failed to launch.";
      toast.error(message);
      captureError({
        source: "content-ir",
        message: `[KindAgentActionButton] launch of agent "${agentId}" from "${sourceFeature}" failed: ${message}`,
        raw: { agentId, sourceFeature, error },
      });
    } finally {
      setIsLaunching(false);
    }
  }, [agentId, isLaunching, launchAgent, llmOverrides, sourceFeature, variables]);

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
