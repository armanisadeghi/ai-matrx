"use client";

/**
 * components/cost/SpendFlagStrip.tsx
 *
 * THE spend red-flag column for every admin spend board (triggers, automation
 * costs, system jobs, agent spend, and their org twins). Owner, 2026-10-08:
 * flag pills made the tables unreadable — one small icon per flag instead, ALL
 * of them drawn in every row in one fixed order (gray when false, colored when
 * true), a tooltip naming each, so no row ever shifts.
 *
 * The flag RULES stay where they are (automationCosts.ts, agentSpend.ts,
 * workflowTriggers.ts); this file only maps a rule's id to its one icon slot.
 * A board passes the slots that can apply to it (`set`); within a board every
 * row draws the same slots in the same order.
 */
import type { ComponentType } from "react";
import {
  Banknote,
  CalendarX,
  CircleDollarSign,
  Cpu,
  FlaskConical,
  Gem,
  Infinity as InfinityIcon,
  Layers,
  Repeat,
  SaveOff,
  Scissors,
  Unlink,
  User,
  UserCog,
  Weight,
} from "lucide-react";
import { IndicatorStrip, type IndicatorItem, type IndicatorTone } from "@ai-matrx/design-system/controls";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";

export type SpendFlagSlot =
  | "automated"
  | "premium_model"
  | "avg_run_over_limit"
  | "run_over_limit"
  | "avg_turns_over_limit"
  | "max_turns_over_limit"
  | "huge_context"
  | "premium_short_output"
  | "test_account"
  | "runs_as_person"
  | "disposable"
  | "no_approval"
  | "unsaved_runs"
  | "unattributed";

type Glyph = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

const SLOT: Record<SpendFlagSlot, { icon: Glyph; label: string }> = {
  automated: { icon: Repeat, label: "Automated" },
  premium_model: { icon: Gem, label: "Premium model" },
  avg_run_over_limit: { icon: CircleDollarSign, label: "Avg run > $1" },
  run_over_limit: { icon: Banknote, label: "A run > $1" },
  avg_turns_over_limit: { icon: Layers, label: "Avg turns > 5" },
  max_turns_over_limit: { icon: InfinityIcon, label: "Max turns > 20" },
  huge_context: { icon: Weight, label: "Huge context" },
  premium_short_output: { icon: Scissors, label: "Premium with short replies" },
  test_account: { icon: UserCog, label: "Billed to admin/test account" },
  runs_as_person: { icon: User, label: "Runs as a person" },
  disposable: { icon: FlaskConical, label: "Disposable / test-looking name" },
  no_approval: { icon: CalendarX, label: "Schedule not approved" },
  unsaved_runs: { icon: SaveOff, label: "Unsaved runs" },
  unattributed: { icon: Unlink, label: "No model or agent linked" },
};

/** Every slot, in THE order. A board's `set` is a subsequence of this. */
export const SPEND_FLAG_SLOTS = Object.keys(SLOT) as SpendFlagSlot[];

/** The automation boards (costs, system jobs, triggers): every slot their rules can raise. */
export const AUTOMATION_FLAG_SET: readonly SpendFlagSlot[] = [
  "automated",
  "premium_model",
  "avg_run_over_limit",
  "run_over_limit",
  "avg_turns_over_limit",
  "max_turns_over_limit",
  "test_account",
  "runs_as_person",
  "unattributed",
];

/** The triggers board adds its own two. */
export const TRIGGER_FLAG_SET: readonly SpendFlagSlot[] = SPEND_FLAG_SLOTS.filter(
  (s) => AUTOMATION_FLAG_SET.includes(s) || s === "disposable" || s === "no_approval",
);

/** The agent spend board. */
export const AGENT_FLAG_SET: readonly SpendFlagSlot[] = [
  "automated",
  "premium_model",
  "avg_run_over_limit",
  "run_over_limit",
  "avg_turns_over_limit",
  "max_turns_over_limit",
  "huge_context",
  "premium_short_output",
  "test_account",
  "unsaved_runs",
  "unattributed",
];

/** A raised flag, as the rules return it. */
export interface SpendFlagHit {
  slot: SpendFlagSlot;
  severity: "critical" | "warning" | "info" | "hint";
  detail?: string;
}

const TONE: Record<SpendFlagHit["severity"], { tone: IndicatorTone; soft?: boolean }> = {
  critical: { tone: "danger" },
  warning: { tone: "warning" },
  info: { tone: "warning", soft: true },
  hint: { tone: "warning", soft: true },
};

export function spendFlagItems(set: readonly SpendFlagSlot[], hits: readonly SpendFlagHit[]): IndicatorItem[] {
  return set.map((slot) => {
    const hit = hits.find((h) => h.slot === slot);
    const t = hit ? TONE[hit.severity] : undefined;
    return {
      id: slot,
      icon: SLOT[slot].icon,
      label: SLOT[slot].label,
      on: hit != null,
      tone: t?.tone,
      soft: t?.soft,
      detail: hit?.detail,
    };
  });
}

export function SpendFlagStrip({ set, hits }: { set: readonly SpendFlagSlot[]; hits: readonly SpendFlagHit[] }) {
  return <IndicatorStrip items={spendFlagItems(set, hits)} />;
}

/** The strip's width for a column: 14px glyphs + 4px gaps + cell padding. */
export const flagColumnWidth = (set: readonly SpendFlagSlot[]) => set.length * 18 + 16;

/** One Flags column: sorts by how many are raised (critical counts double), filters on their names. */
export function spendFlagColumn<T>(
  set: readonly SpendFlagSlot[],
  hitsFor: (row: T) => readonly SpendFlagHit[],
  id = "flags",
): MatrxColumnDef<T> {
  return {
    id,
    header: "Flags",
    accessorFn: (row) => hitsFor(row).map((h) => SLOT[h.slot].label).join(", "),
    sortValue: (row) => hitsFor(row).reduce((s, h) => s + (h.severity === "critical" ? 2 : 1), 0),
    filter: "text",
    width: flagColumnWidth(set),
    cell: (row) => <SpendFlagStrip set={set} hits={hitsFor(row)} />,
  };
}

/** The AI column's single icon: colored when a model ran, gray otherwise. */
export function AiIcon({ state }: { state: "ai" | "spend_unattributed" | "no_spend" | "no_runs" | "not_measured" }) {
  const label =
    state === "ai"
      ? "AI involved: yes"
      : state === "spend_unattributed"
        ? "AI involved: cost recorded, no model linked"
        : state === "no_runs"
          ? "AI involved: no runs yet"
          : state === "not_measured"
            ? "AI involved: not measured"
            : "AI involved: no";
  return (
    <IndicatorStrip
      items={[
        {
          id: "ai",
          icon: Cpu,
          label: "AI",
          on: state === "ai" || state === "spend_unattributed",
          tone: state === "ai" ? "info" : "warning",
          detail: label.replace(/^AI involved: /, ""),
        },
      ]}
      aria-label={label}
    />
  );
}
