"use client";

/**
 * KindAgentButton — the one seam that hands a kind + a specific part to the
 * platform kind-creator agent. Mirrors NewShapeClient's handoff (compose intent
 * → stashChatDraftTransfer → /chat/a/[agentId]) but is droppable next to any
 * doctor-row part, on both the admin kind-registry page and the /shapes owner
 * editor. Loud when the creator agent is not configured — never a silent no-op.
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, PencilRuler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { stashChatDraftTransfer } from "@/features/agents/components/chat/chat-draft-transfer";
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [launching, setLaunching] = useState(false);

  function launch() {
    const agentId = shapeCreatorAgentId();
    if (!agentId) {
      toast.error("The Shape creator agent is not configured", {
        description:
          "Set SHAPE_CREATOR_AGENT_ID in features/content-ir/studio/constants.ts.",
      });
      return;
    }
    setLaunching(true);
    stashChatDraftTransfer({
      text: composeKindAgentIntent(intent),
      targetAgentId: agentId,
    });
    startTransition(() => {
      router.push(`/chat/a/${agentId}`);
    });
  }

  const busy = launching || pending;
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={busy}
      onClick={launch}
    >
      {busy ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <PencilRuler className="mr-1.5 h-3.5 w-3.5" />
      )}
      {children}
    </Button>
  );
}
