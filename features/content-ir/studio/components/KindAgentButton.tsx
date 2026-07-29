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
import { shapeCreatorAgentId } from "@/features/content-ir/studio/constants";
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
    const agentId = shapeCreatorAgentId();
    if (!agentId) {
      toast.error("The Shape creator agent is not configured", {
        description:
          "Set SHAPE_CREATOR_AGENT_ID in features/content-ir/studio/constants.ts.",
      });
      return;
    }
    // Open the creator agent in a floating window on this page, pre-loaded with
    // the composed brief. The user reviews and sends; the run streams in-place.
    openRun({
      initialAgentId: agentId,
      initialDraftText: composeKindAgentIntent(intent),
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
