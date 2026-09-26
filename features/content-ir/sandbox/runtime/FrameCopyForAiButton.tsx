/**
 * FrameCopyForAiButton — the sandbox-safe Copy-for-AI capability.
 *
 * The page component carries an IntelligenceIndicator so its host surface can
 * disclose the Alchemy mandate. That indicator reads mandate data and links
 * through Next, neither of which belongs in the opaque, no-network frame.
 * This stand-in preserves the copy action over caller-supplied content while
 * deliberately omitting page-level mandate disclosure; the host page owns
 * that disclosure outside the sandbox.
 */
import { useId } from "react";
import {
  MatrxCopyMenu,
  type AlchemyCopyVariant,
} from "@ai-matrx/design-system/content-transfer";
import { cn } from "@/lib/utils";
import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";

type Resolvable<T> = T | (() => T | Promise<T>);

export interface CopyForAiButtonProps {
  label: string;
  agent: Resolvable<AgentPayloadInput | string>;
  size?: "icon" | "sm";
  disabled?: boolean;
  className?: string;
  showLabel?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  compact?: boolean;
}

/** The frame variant keeps the public CopyForAiButton contract, without app data. */
export function CopyForAiButton({
  label,
  agent,
  size = "sm",
  disabled = false,
  className,
  showLabel: _showLabel = true,
  icon: _icon,
  compact = false,
}: CopyForAiButtonProps) {
  const sourceId = useId();
  const directAiCopy: AlchemyCopyVariant = {
    id: "direct-ai-copy",
    label: "Copy for AI",
    hint: `Copy ${label} with full context, formatted for an AI agent`,
    ariaLabel: `Copy ${label} for AI`,
    successMessage: `${label} copied for AI`,
    build: async () =>
      typeof agent === "function"
        ? await (
            agent as () =>
              AgentPayloadInput | string | Promise<AgentPayloadInput | string>
          )()
        : agent,
  };

  return (
    <MatrxCopyMenu
      sourceId={`direct-ai:${sourceId}`}
      label={label}
      aiVariants={[directAiCopy]}
      hide={["copy", "export"]}
      disabled={disabled}
      size={compact ? "xs" : size}
      className={cn(compact && "matrx-alchemy-compact", className)}
    />
  );
}
