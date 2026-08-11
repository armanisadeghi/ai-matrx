/**
 * Shared display tokens for the Hindsight surface. Dark-mode pairs only —
 * every colour here is declared for both themes.
 */
import { Bot, Globe, Workflow, Wrench } from "lucide-react";

import type { Lever, SubjectKind, Verdict } from "../types";

export const KIND_ICON: Record<SubjectKind, typeof Bot> = {
  agent: Bot,
  workflow: Workflow,
  tool: Wrench,
  environment: Globe,
};

export const KIND_COLOR: Record<SubjectKind, string> = {
  agent: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  workflow: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  tool: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  environment: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

export const KIND_LABEL: Record<SubjectKind, string> = {
  agent: "Agent",
  workflow: "Workflow",
  tool: "Tool",
  environment: "Environment",
};

export const LEVER_LABEL: Record<Lever, string> = {
  instructions: "Instructions",
  resources: "Resources",
  tools: "Tool / Interface",
  architecture: "Architecture",
};

export const LEVER_COLOR: Record<Lever, string> = {
  instructions: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  resources: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  tools: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  architecture: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
};

export const VERDICT_COLOR: Record<Verdict, string> = {
  better: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  same: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  worse: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  regressed: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Money, always with its unit. Never used for a value that was never spent. */
export function fmtCost(value: number | null | undefined): string {
  if (value == null) return "—";
  return `$${Number(value).toFixed(3)}`;
}

export function fmtElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
