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
import {
  CopyActionGroup,
  copyActionCellClass,
  copyActionSegmentClass,
  type CopyActionSize,
} from "@/components/agent-copy/CopyActionGroup";
import {
  ExportMenu,
  type ExportMenuProps,
} from "@/components/agent-copy/ExportMenu";
import type { AgentCopyGroomerConfig } from "@/components/agent-copy/groomer-types";

/**
 * CopyButtons — the reusable "copy this data" primitive.
 *
 * Renders Copy + Copy-for-AI. Pass `export` and they become a three-segment
 * even-width group with Download. Copy-for-AI uses {@link buildAgentPayload}.
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
   * When set, adds a JSON entry to the Copy-for-AI dropdown. It copies this
   * value as pretty-printed JSON without adding a third top-level control.
   * Pass the raw record/rows wherever structured data should remain available.
   */
  json?: Resolvable<unknown>;
  /** Used in toasts and tooltips, e.g. "Sandbox sbx-123" or "All sandboxes". */
  label: string;
  /**
   * All sizes are icon-only: "xs" = micro pair (dense list items, metric
   * cards, per-field); "icon" = compact pair (rows/cards); "sm" = header pair.
   */
  size?: CopyActionSize;
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
   * Download dropdown. When set, Copy + Copy-for-AI + Export render as one
   * even-width {@link CopyActionGroup}. Pass the items you already build for
   * a standalone ExportMenu — do not also render ExportMenu beside this.
   */
  export?: Pick<ExportMenuProps, "items" | "sheetRows">;
  /**
   * Force the even-width group chrome without an export slot (Copy + AI
   * only). Defaults on when `export` is set.
   */
  grouped?: boolean;
  /**
   * Graded AI variants (e.g. a focused/short view). When set, the single
   * "Copy for AI" button upgrades in place to an {@link AiCopyMenu} dropdown:
   * these variants first, then the `agent` payload as the automatic
   * "Everything" escape hatch. Use for medium/massive data — a giant page
   * offering only an everything-dump is useless the moment data grows.
   */
  aiVariants?: AiVariant[];
  /**
   * Labels and positions the faithful `agent` payload inside an upgraded AI
   * menu. Defaults to the final "Everything" item. Use this when the payload
   * has a more precise name (for example "Errors") or should precede derived
   * variants. The payload itself still comes from `agent`, so there is only
   * one never-lossy builder.
   */
  agentVariant?: {
    id?: string;
    label?: string;
    hint?: string;
    position?: "first" | "last";
  };
  /**
   * Custom-preview source (options + live size counts dialog). Implies the
   * dropdown upgrade. Reserve for data with real shortening knobs.
   */
  aiCustom?: AiCustomSource;
  /** Whole-page Groomer added as "Customize…" inside the AI dropdown. */
  groomer?: () => AgentCopyGroomerConfig;
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
  export: exportConfig,
  grouped,
  aiVariants,
  aiCustom,
  agentVariant,
  groomer,
}: CopyButtonsProps) {
  const [copied, setCopied] = React.useState<"human" | "agent" | null>(null);
  const isGrouped = grouped ?? exportConfig !== undefined;

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

  const buttonCls = isGrouped
    ? copyActionSegmentClass(size)
    : size === "xs"
      ? "h-11 w-11 lg:h-5 lg:w-5"
      : size === "icon"
        ? "h-11 w-11 lg:h-7 lg:w-7"
        : "h-11 w-11 lg:h-8 lg:w-8";
  const iconCls =
    size === "xs" ? "h-3 w-3" : size === "icon" ? "h-3.5 w-3.5" : "h-4 w-4";

  const faithfulAgentVariant: AiVariant = {
    id: agentVariant?.id ?? "everything",
    label: agentVariant?.label ?? "Everything",
    hint: agentVariant?.hint ?? "Full faithful payload — never lossy",
    build: () => resolve(agent),
  };
  const jsonVariant: AiVariant | null =
    json === undefined
      ? null
      : {
          id: "json",
          label: "JSON",
          hint: "Pretty-printed structured data",
          icon: Braces,
          build: () => {
            const value = resolve(json);
            return JSON.stringify(value, null, 2) ?? String(value);
          },
        };
  const derivedVariants = [
    ...(aiVariants ?? []),
    ...(jsonVariant ? [jsonVariant] : []),
  ];
  const menuVariants =
    agentVariant?.position === "first"
      ? [faithfulAgentVariant, ...derivedVariants]
      : [...derivedVariants, faithfulAgentVariant];
  const hasAiMenu =
    menuVariants.length > 1 || aiCustom !== undefined || groomer !== undefined;

  const copyButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
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
    </Button>
  );

  const aiButton = hasAiMenu ? (
    <AiCopyMenu
      size={size}
      grouped={isGrouped}
      label={label}
      disabled={disabled}
      stopPropagation={false}
      variants={menuVariants}
      custom={aiCustom}
      groomer={groomer}
    />
  ) : (
    <Button
      type="button"
      variant="ghost"
      size="icon"
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
    </Button>
  );
  const aiControl =
    isGrouped && !hasAiMenu ? (
      <span className={copyActionCellClass(size)}>{aiButton}</span>
    ) : (
      aiButton
    );

  const exportControl = exportConfig ? (
    <ExportMenu
      label={label}
      items={exportConfig.items}
      sheetRows={exportConfig.sheetRows}
      size={size}
      grouped={isGrouped}
    />
  ) : null;

  const actions = isGrouped ? (
    <CopyActionGroup size={size}>
      <span className={copyActionCellClass(size)}>{copyButton}</span>
      {aiControl}
      {exportControl}
    </CopyActionGroup>
  ) : (
    <>
      {copyButton}
      {aiControl}
      {exportControl}
    </>
  );

  return (
    <div
      className={cn(
        "flex items-center",
        !isGrouped && (size === "xs" ? "gap-0.5" : "gap-1"),
        className,
      )}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      {actions}
    </div>
  );
}
