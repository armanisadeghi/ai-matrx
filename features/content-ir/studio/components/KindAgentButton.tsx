"use client";

/**
 * KindAgentButton — the one seam that hands a kind + a specific part to the
 * platform kind-creator agent. Mirrors NewShapeClient's handoff (compose intent
 * → open the run in-place) but is droppable next to any doctor-row part, on both
 * the admin kind-registry page and the /shapes owner editor. The agent runs in a
 * floating window on the current page, so the user watches every kind_* tool
 * call stream without leaving the registry. Loud when the creator agent is not
 * configured — never a silent no-op.
 */

import { PencilRuler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { useOpenAgentRunWindow } from "@/features/overlays/openers/agentRunWindow";
import { KIND_CREATOR_MANDATE_KEY } from "@/features/content-ir/studio/constants";
import { resolveMandate } from "@/features/agents/mandates/service";
import {
  composeKindAgentIntent,
  type KindAgentIntentInput,
} from "@/features/content-ir/studio/kind-agent-intents";

interface KindAgentButtonProps extends KindAgentIntentInput {
  label: string;
  /** Button text (defaults per part elsewhere). */
  children: React.ReactNode;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm";
  className?: string;
}

export default function KindAgentButton({
  children,
  variant = "outline",
  size = "sm",
  className,
  ...intent
}: KindAgentButtonProps) {
  const openRun = useOpenAgentRunWindow();

  function launch() {
    // Resolve the `content_ir.kind_creator` mandate at click time (the user's
    // own binding wins), then open the creator agent in a floating window on
    // this page, pre-loaded with the composed brief. The user reviews and
    // sends; the run streams in-place. Loud on failure — never a silent no-op.
    void resolveMandate(KIND_CREATOR_MANDATE_KEY)
      .then((resolved) => {
        const seed = composeKindAgentIntent(intent);
        openRun({
          initialAgentId: resolved.agentId,
          initialDraftText: seed.draftText,
          initialVariableValues: seed.variables,
        });
      })
      .catch((error: unknown) => {
        console.error(
          `[KindAgentButton] mandate "${KIND_CREATOR_MANDATE_KEY}" failed to resolve:`,
          error,
        );
        toast.error("The Shape creator agent is unavailable", {
          description: error instanceof Error ? error.message : String(error),
        });
      });
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={launch}
    >
      <PencilRuler className="mr-1.5 h-3.5 w-3.5" />
      {children}
    </Button>
  );
}
