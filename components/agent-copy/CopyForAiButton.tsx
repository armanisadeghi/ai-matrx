"use client";

import * as React from "react";
import { Webhook, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  buildAgentPayload,
  type AgentPayloadInput,
} from "@/components/agent-copy/buildAgentPayload";

type Resolvable<T> = T | (() => T | Promise<T>);

async function resolve<T>(value: Resolvable<T>): Promise<T> {
  const v =
    typeof value === "function" ? (value as () => T | Promise<T>)() : value;
  return await v;
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

export interface CopyForAiButtonProps {
  /** Used in toast + tooltip, e.g. "Project Alpha" or "Fix login bug". */
  label: string;
  /** Agent payload builder — runs at click time so URL/timestamp stay fresh. */
  agent: Resolvable<AgentPayloadInput | string>;
  size?: "icon" | "sm";
  disabled?: boolean;
  className?: string;
  /** Shown on sm size buttons (default true). */
  showLabel?: boolean;
  /**
   * Idle-state glyph (default {@link Webhook}). Pass the brand
   * {@link import("./CopyForAiIcon").CopyForAiIcon} to render the recognizable
   * "copy for AI" mark instead of the generic webhook icon.
   */
  icon?: React.ComponentType<{ className?: string }>;
  /**
   * Compact, icon-only chrome (h-6) for window / toolbar headers — keeps the
   * control at the uniform ~24px header height. Overrides `size`/`showLabel`.
   */
  compact?: boolean;
}

/**
 * Single "Copy for AI" action — xml-ish agent payload via {@link buildAgentPayload}.
 * Use when a surface only needs the agent flavor (not the human Copy pair).
 */
export function CopyForAiButton({
  label,
  agent,
  size = "sm",
  disabled = false,
  className,
  showLabel = true,
  icon: Icon = Webhook,
  compact = false,
}: CopyForAiButtonProps) {
  const [state, setState] = React.useState<"idle" | "loading" | "copied">(
    "idle",
  );

  const handleClick = async () => {
    if (state === "loading") return;
    setState("loading");
    try {
      const resolved = await resolve(agent);
      const text =
        typeof resolved === "string" ? resolved : buildAgentPayload(resolved);
      await writeClipboard(text);
      setState("copied");
      toast.success(`${label} copied for AI`);
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("idle");
      toast.error("Copy failed");
    }
  };

  const title = `Copy ${label} with full context, formatted for an AI agent`;

  const glyph =
    state === "loading" ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
    ) : state === "copied" ? (
      <Check className="h-3.5 w-3.5 text-emerald-500" />
    ) : (
      <Icon className="h-3.5 w-3.5" />
    );

  // Compact: a plain icon-only button at the uniform header height (h-6),
  // bypassing the Button component's larger default sizes.
  if (compact) {
    return (
      <button
        type="button"
        disabled={disabled || state === "loading"}
        onClick={() => void handleClick()}
        title={title}
        aria-label={title}
        className={cn(
          "grid h-6 w-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50",
          className,
        )}
      >
        {glyph}
      </button>
    );
  }

  const isIcon = size === "icon";

  return (
    <Button
      type="button"
      variant="ghost"
      size={isIcon ? "icon" : "sm"}
      className={cn(isIcon ? "h-7 w-7" : "h-7 gap-1.5 text-xs", className)}
      disabled={disabled || state === "loading"}
      onClick={() => void handleClick()}
      title={title}
    >
      {glyph}
      {!isIcon && showLabel ? (
        <span>{state === "copied" ? "Copied!" : "Copy for AI"}</span>
      ) : null}
    </Button>
  );
}
