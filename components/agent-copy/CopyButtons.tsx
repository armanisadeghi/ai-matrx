"use client";

import * as React from "react";
import { Copy, Bot, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  buildAgentPayload,
  type AgentPayloadInput,
} from "@/components/agent-copy/buildAgentPayload";

/**
 * CopyButtons — the reusable "copy this data" primitive.
 *
 * Renders two actions side by side:
 *   - Copy (human-readable text)
 *   - Copy for AI (xml-ish agent payload with live URL/route/timestamp + full
 *     JSON dump, via {@link buildAgentPayload})
 *
 * Drop this onto any row, card, or page header. Pass the human text and the
 * agent payload as values or as builder functions (functions are preferred for
 * the agent payload so the URL/timestamp are captured at click time). The
 * clipboard write (with legacy fallback) and toast feedback are handled here so
 * no page reimplements them.
 *
 * Forward-looking: the "Copy for AI" button is the seam where these become
 * "connect this to an agent" actions — swapping the handler is a one-file
 * change, every callsite comes along for free.
 */

type Resolvable<T> = T | (() => T);

function resolve<T>(value: Resolvable<T>): T {
  return typeof value === "function" ? (value as () => T)() : value;
}

export interface CopyButtonsProps {
  /** Human-readable text to copy (or a builder fn). */
  human: Resolvable<string>;
  /**
   * Agent payload: an {@link AgentPayloadInput} (passed to buildAgentPayload),
   * a prebuilt string, or a builder fn returning either.
   */
  agent: Resolvable<AgentPayloadInput | string>;
  /** Used in toasts and tooltips, e.g. "Sandbox sbx-123" or "All sandboxes". */
  label: string;
  /** "icon" = compact icon-only pair (rows/cards); "sm" = icon + text (headers). */
  size?: "icon" | "sm";
  /** Disable both buttons. */
  disabled?: boolean;
  /** Wrapper className. */
  className?: string;
}

async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

export function CopyButtons({
  human,
  agent,
  label,
  size = "icon",
  disabled = false,
  className,
}: CopyButtonsProps) {
  const [copied, setCopied] = React.useState<"human" | "agent" | null>(null);

  const flash = (which: "human" | "agent") => {
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleHuman = async () => {
    await writeClipboard(resolve(human));
    flash("human");
    toast.success(`${label} copied to clipboard`);
  };

  const handleAgent = async () => {
    const resolved = resolve(agent);
    const text =
      typeof resolved === "string" ? resolved : buildAgentPayload(resolved);
    await writeClipboard(text);
    flash("agent");
    toast.success(`${label} copied for AI agent`);
  };

  const isIcon = size === "icon";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        type="button"
        variant="ghost"
        size={isIcon ? "icon" : "sm"}
        className={isIcon ? "h-7 w-7" : undefined}
        disabled={disabled}
        onClick={handleHuman}
        title={`Copy ${label} (human-readable)`}
      >
        {copied === "human" ? (
          <Check className={isIcon ? "h-3.5 w-3.5" : "h-4 w-4"} />
        ) : (
          <Copy className={isIcon ? "h-3.5 w-3.5" : "h-4 w-4"} />
        )}
        {!isIcon && <span className="ml-1">Copy</span>}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size={isIcon ? "icon" : "sm"}
        className={isIcon ? "h-7 w-7" : undefined}
        disabled={disabled}
        onClick={handleAgent}
        title={`Copy ${label} with full context, formatted for an AI agent`}
      >
        {copied === "agent" ? (
          <Check className={isIcon ? "h-3.5 w-3.5" : "h-4 w-4"} />
        ) : (
          <Bot className={isIcon ? "h-3.5 w-3.5" : "h-4 w-4"} />
        )}
        {!isIcon && <span className="ml-1">Copy for AI</span>}
      </Button>
    </div>
  );
}
