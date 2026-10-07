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
import { createElement, useState } from "react";
import { copyText } from "@ai-matrx/kit/clipboard";
import { cn } from "@/lib/utils";
import {
  serializeFrameAgentPayload,
  type FrameAgentPayload,
} from "./FrameAgentPayload";

type Resolvable<T> = T | (() => T | Promise<T>);

export interface CopyForAiButtonProps {
  label: string;
  agent: Resolvable<FrameAgentPayload | string>;
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
  showLabel = true,
  icon,
  compact = false,
}: CopyForAiButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const copyForAi = async () => {
    try {
      const value =
        typeof agent === "function"
          ? await (
              agent as () =>
                FrameAgentPayload | string | Promise<FrameAgentPayload | string>
            )()
          : agent;
      const copied = await copyText(
        typeof value === "string" ? value : serializeFrameAgentPayload(value),
      );
      setStatus(copied ? "copied" : "error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <button
      type="button"
      aria-label={`Copy ${label} for AI`}
      title={status === "error" ? "Could not copy" : `Copy ${label} for AI`}
      onClick={() => void copyForAi()}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-border bg-background text-sm font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50",
        compact ? "h-6 px-2 text-xs" : size === "icon" ? "h-8 w-8" : "h-8 px-3",
        className,
      )}
    >
      {showLabel && size !== "icon"
        ? status === "copied"
          ? "Copied"
          : "Copy for AI"
        : icon
          ? createElement(icon, { className: "h-4 w-4" })
          : "AI"}
    </button>
  );
}
