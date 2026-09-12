"use client";

import { useAlchemyDisclosure } from "@/components/agent-copy/useAlchemyDisclosure";
import { useId } from "react";
import { cn } from "@/lib/utils";
import {
  MatrxCopyMenu,
  type AlchemyCopyVariant,
} from "@ai-matrx/design-system/content-transfer";
import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";

type Resolvable<T> = T | (() => T | Promise<T>);

export interface CopyForAiButtonProps {
  label: string;
  /** Runs only after the user selects the package-owned direct AI copy action. */
  agent: Resolvable<AgentPayloadInput | string>;
  size?: "icon" | "sm";
  disabled?: boolean;
  className?: string;
  /** The package owns direct-copy feedback and trigger labels. */
  showLabel?: boolean;
  /** The package owns the Alchemy glyph; retained for source compatibility. */
  icon?: React.ComponentType<{ className?: string }>;
  compact?: boolean;
}

/** A one-action Alchemy menu for legacy standalone AI-copy call sites. */
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
  useAlchemyDisclosure();
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
