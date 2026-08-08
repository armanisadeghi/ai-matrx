"use client";

import * as React from "react";
import { Braces, Copy, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import {
  buildAgentPayload,
  type AgentPayloadInput,
} from "@/components/agent-copy/buildAgentPayload";
import { CopyForAiIcon } from "@/components/agent-copy/CopyForAiIcon";
import { writeClipboard } from "@/components/agent-copy/clipboard";
import {
  AiCopyMenu,
  type AiCustomSource,
  type AiVariant,
} from "@/components/agent-copy/AiCopyMenu";

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
  /**
   * When set, renders a third "Copy JSON" button that copies this value as
   * pretty-printed JSON. Pass the raw record/rows — any surface showing
   * structured data should offer it.
   */
  json?: Resolvable<unknown>;
  /** Used in toasts and tooltips, e.g. "Sandbox sbx-123" or "All sandboxes". */
  label: string;
  /**
   * "xs" = micro icon-only pair (dense list items, metric cards, per-field);
   * "icon" = compact icon-only pair (rows/cards); "sm" = icon + text (headers).
   */
  size?: "xs" | "icon" | "sm";
  /**
   * Stop click events from bubbling (rows/cards with their own onClick).
   * Default true — copying should never also select/navigate.
   */
  stopPropagation?: boolean;
  /** Disable both buttons. */
  disabled?: boolean;
  /** Wrapper className. */
  className?: string;
  /**
   * Graded AI variants (e.g. a focused/short view). When set, the single
   * "Copy for AI" button upgrades in place to an {@link AiCopyMenu} dropdown:
   * these variants first, then the `agent` payload as the automatic
   * "Everything" escape hatch. Use for medium/massive data — a giant page
   * offering only an everything-dump is useless the moment data grows.
   */
  aiVariants?: AiVariant[];
  /**
   * Custom-preview source (options + live size counts dialog). Implies the
   * dropdown upgrade. Reserve for data with real shortening knobs.
   */
  aiCustom?: AiCustomSource;
}

export function CopyButtons({
  human,
  agent,
  json,
  label,
  size = "icon",
  disabled = false,
  stopPropagation = true,
  className,
  aiVariants,
  aiCustom,
}: CopyButtonsProps) {
  const [copied, setCopied] = React.useState<"human" | "agent" | "json" | null>(
    null,
  );

  const flash = (which: "human" | "agent" | "json") => {
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

  const handleJson = async () => {
    await writeClipboard(JSON.stringify(resolve(json), null, 2));
    flash("json");
    toast.success(`${label} copied as JSON`);
  };

  const isText = size === "sm";
  const buttonCls =
    size === "xs"
      ? "h-11 w-11 lg:h-5 lg:w-5"
      : size === "icon"
        ? "h-11 w-11 lg:h-7 lg:w-7"
        : "min-h-11 lg:min-h-8";
  const iconCls =
    size === "xs" ? "h-3 w-3" : size === "icon" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <div
      className={cn(
        "flex items-center",
        size === "xs" ? "gap-0.5" : "gap-1",
        className,
      )}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      <Button
        type="button"
        variant="ghost"
        size={isText ? "sm" : "icon"}
        className={buttonCls}
        disabled={disabled}
        onClick={handleHuman}
        aria-label={`Copy ${label} (human-readable)`}
        title={`Copy ${label} (human-readable)`}
      >
        {copied === "human" ? (
          <Check className={iconCls} />
        ) : (
          <Copy className={iconCls} />
        )}
        {isText && <span className="ml-1">Copy</span>}
      </Button>
      {json !== undefined ? (
        <Button
          type="button"
          variant="ghost"
          size={isText ? "sm" : "icon"}
          className={buttonCls}
          disabled={disabled}
          onClick={handleJson}
          aria-label={`Copy ${label} as JSON`}
          title={`Copy ${label} as JSON`}
        >
          {copied === "json" ? (
            <Check className={iconCls} />
          ) : (
            <Braces className={iconCls} />
          )}
          {isText && <span className="ml-1">JSON</span>}
        </Button>
      ) : null}
      {aiVariants?.length || aiCustom ? (
        <AiCopyMenu
          size={size}
          label={label}
          disabled={disabled}
          stopPropagation={false}
          variants={[
            ...(aiVariants ?? []),
            {
              id: "everything",
              label: "Everything",
              hint: "Full faithful payload — never lossy",
              build: () => resolve(agent),
            },
          ]}
          custom={aiCustom}
        />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size={isText ? "sm" : "icon"}
          className={buttonCls}
          disabled={disabled}
          onClick={handleAgent}
          aria-label={`Copy ${label} for AI agent`}
          title={`Copy ${label} with full context, formatted for an AI agent`}
        >
          {copied === "agent" ? (
            <Check className={iconCls} />
          ) : (
            <CopyForAiIcon className={iconCls} />
          )}
          {isText && <span className="ml-1">Copy for AI</span>}
        </Button>
      )}
    </div>
  );
}
