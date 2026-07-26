/**
 * skill-tiers.ts
 *
 * ONE definition of the three per-agent skill assignment tiers — label,
 * hint, icon, and active styling. Consumed by `SkillConfigPicker` (catalogue
 * rows + review pane) and `SkillDetailView` (detail pane) so the two can
 * never drift on what "Included" means or how it looks.
 */

import { BookOpen, EyeOff, ListOrdered } from "lucide-react";

/** The three explicit tiers stored on `agx_agent.skill_config`. Unassigned
 * skills are `null` — the implicit DEFAULT bucket (see `SkillTier`). */
export type SkillTierKey = "included" | "listed" | "forbidden";

export const SKILL_TIER_META = {
  included: {
    label: "Included",
    shortLabel: "Include",
    hint: "Full instructions are always in the agent's context.",
    icon: BookOpen,
    activeClass:
      "border-violet-500/50 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  listed: {
    label: "Listed",
    shortLabel: "List",
    hint: "The agent sees the summary and can load the full skill.",
    icon: ListOrdered,
    activeClass:
      "border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  forbidden: {
    label: "Forbidden",
    shortLabel: "Forbid",
    hint: "The skill is hidden from this agent completely.",
    icon: EyeOff,
    activeClass:
      "border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
} satisfies Record<
  SkillTierKey,
  {
    label: string;
    shortLabel: string;
    hint: string;
    icon: typeof BookOpen;
    activeClass: string;
  }
>;

export const SKILL_TIER_ORDER: SkillTierKey[] = [
  "included",
  "listed",
  "forbidden",
];
