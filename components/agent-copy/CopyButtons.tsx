"use client";

import { Braces, Copy } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import { CopyForAiIcon } from "@/components/agent-copy/CopyForAiIcon";
import {
  AiCopyMenu,
  type AiCustomSource,
  type AiVariant,
} from "@/components/agent-copy/AiCopyMenu";
import {
  type CopyActionAppearance,
  type CopyActionSize,
} from "@/components/agent-copy/CopyActionGroup";
import type { ExportMenuProps } from "@/components/agent-copy/ExportMenu";
import {
  resolveCopyActions,
  type CopyActionId,
} from "@/components/agent-copy/copy-actions";
import type { AgentCopyGroomerConfig } from "@/components/agent-copy/groomer-types";

/**
 * CopyButtons — the reusable "copy this data" primitive.
 *
 * The one Copy / JSON / Copy-for-AI / Export control. Every available action
 * lives behind one canonical CopyForAiIcon trigger; pass the payloads you have
 * and hide any category with `hide`. A menu item can copy, download, or open a
 * modal/workspace.
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
  /** Human-readable text to copy (or a builder fn). Omit (or `hide`) to drop Copy. */
  human?: Resolvable<string>;
  /**
   * Agent payload: an {@link AgentPayloadInput} (passed to buildAgentPayload),
   * a prebuilt string, or a builder fn returning either. Omit (or `hide`)
   * to drop Copy-for-AI unless `aiVariants` / `aiCustom` / `groomer` remain.
   */
  agent?: Resolvable<AgentPayloadInput | string>;
  /**
   * When set, adds Copy JSON as the second unified-menu action. It copies this
   * value as pretty-printed JSON without adding another top-level control.
   * Pass the raw record/rows wherever structured data should remain available.
   */
  json?: Resolvable<unknown>;
  /** Used in toasts and tooltips, e.g. "Sandbox sbx-123" or "All sandboxes". */
  label: string;
  /**
   * All sizes are icon-only: "xs" = micro control (dense list items, metric
   * cards, per-field); "icon" = compact control (rows/cards); "sm" = header.
   */
  size?: CopyActionSize;
  /** Visual chrome. `bare` removes borders and persistent/interactive fills. */
  appearance?: CopyActionAppearance;
  /**
   * Stop click events from bubbling (rows/cards with their own onClick).
   * Default true — copying should never also select/navigate.
   */
  stopPropagation?: boolean;
  /** Disable the action control. */
  disabled?: boolean;
  /** Wrapper className. */
  className?: string;
  /**
   * Download actions. Pass the items you already build for a standalone
   * ExportMenu — they are appended to the same action menu. Omit (or
   * `hide: ["export"]`) on cards that only need Copy + Copy-for-AI.
   */
  export?: Pick<ExportMenuProps, "items" | "sheetRows">;
  /**
   * Drop any action category even when its data is passed. Cards that share a
   * builder with a page header use `hide={["export"]}`.
   */
  hide?: CopyActionId[];
  /**
   * @deprecated CopyButtons is always one icon now. Retained for source
   * compatibility while older callers are migrated.
   */
  grouped?: boolean;
  /**
   * Graded AI variants (e.g. a focused/short view). When set, the single
   * "Copy for AI" button upgrades in place to an {@link AiCopyMenu} dropdown:
   * the faithful `agent` action first, then these variants. Use for
   * medium/massive data — a giant page
   * offering only an everything-dump is useless the moment data grows.
   */
  aiVariants?: AiVariant[];
  /**
   * Labels and positions the faithful `agent` payload inside an upgraded AI
   * menu. Defaults to the first AI item. Use this when the payload
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
  appearance = "segmented",
  disabled = false,
  stopPropagation = true,
  className,
  export: exportConfig,
  hide,
  aiVariants,
  aiCustom,
  agentVariant,
  groomer,
}: CopyButtonsProps) {
  const visible = resolveCopyActions({
    hide,
    hasCopy: human !== undefined,
    hasAi:
      json !== undefined ||
      agent !== undefined ||
      (aiVariants?.length ?? 0) > 0 ||
      aiCustom !== undefined ||
      groomer !== undefined,
    hasExport:
      exportConfig !== undefined &&
      (exportConfig.items.length > 0 || exportConfig.sheetRows !== undefined),
  });

  const humanVariant: AiVariant | null =
    visible.copy && human !== undefined
      ? {
          id: "copy",
          label: "Copy",
          hint: "Human-readable text",
          icon: Copy,
          section: "copy",
          ariaLabel: `Copy ${label}`,
          successMessage: `${label} copied to clipboard`,
          build: () => resolve(human),
        }
      : null;

  const faithfulAgentVariant: AiVariant | null =
    agent === undefined
      ? null
      : {
          id: agentVariant?.id ?? "copy-for-ai",
          label: agentVariant?.label ?? "Copy for AI",
          hint: agentVariant?.hint ?? "Full faithful payload — never lossy",
          icon: CopyForAiIcon,
          section: "ai",
          ariaLabel: `Copy ${label} for AI`,
          successMessage: `${label} copied for AI agent`,
          build: () => resolve(agent),
        };
  const jsonVariant: AiVariant | null =
    json === undefined
      ? null
      : {
          id: "json",
          label: "Copy JSON",
          hint: "Pretty-printed structured data",
          icon: Braces,
          section: "copy",
          ariaLabel: `Copy ${label} as JSON`,
          successMessage: `${label} JSON copied to clipboard`,
          build: () => {
            const value = resolve(json);
            return JSON.stringify(value, null, 2) ?? String(value);
          },
        };
  const derivedAiVariants = (aiVariants ?? []).map((variant) => ({
    ...variant,
    section: variant.section ?? ("ai" as const),
  }));
  const agentVariants = !faithfulAgentVariant
    ? derivedAiVariants
    : agentVariant?.position === "last"
      ? [...derivedAiVariants, faithfulAgentVariant]
      : [faithfulAgentVariant, ...derivedAiVariants];
  const menuVariants = [
    ...(humanVariant ? [humanVariant] : []),
    ...(visible.ai && jsonVariant ? [jsonVariant] : []),
    ...(visible.ai ? agentVariants : []),
  ];

  if (visible.count === 0) return null;

  return (
    <div
      className={cn("flex items-center", className)}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      <AiCopyMenu
        size={size}
        appearance={appearance}
        label={label}
        disabled={disabled}
        stopPropagation={false}
        variants={menuVariants}
        custom={visible.ai ? aiCustom : undefined}
        groomer={visible.ai ? groomer : undefined}
        exportConfig={visible.export ? exportConfig : undefined}
      />
    </div>
  );
}
