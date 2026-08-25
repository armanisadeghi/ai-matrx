// features/education/home/types.ts
//
// The Education home's data contract.
//
// ONE snapshot, read once per visit, shared by every block. The rule that makes
// the page work at day 0 AND day 300 is here rather than in a layout: each block
// declares `signal(snapshot)` and renders NOTHING at zero, so maturity emerges
// from what the learner actually has instead of being branched on. Adding a
// block is a registry entry (mirroring how `EDU_TOOLS` drives the tool grid) —
// never a new page variant.

import type { LucideIcon } from "lucide-react";
import type { StudyKit } from "../kits/kitService";
import type { EducationLibraryRow } from "../library/types";
import type { ModeSignal } from "../study/dashboard/nextActions";
import type { PlanWithDays, StudyPlanBlockRow } from "../study/planner/types";
import type { StudyGoalRow } from "../study/types";

/** One thing worth doing right now, with a reason and a time estimate. */
export interface NextAction {
  key: string;
  icon: LucideIcon;
  label: string;
  /** Why THIS, in one line. A next action without a reason is a to-do list. */
  why: string;
  minutes: number | null;
  href: string | null;
}

/** Everything the home knows about one learner, gathered in a single pass. */
export interface EducationSnapshot {
  library: {
    /** Total artifacts the learner owns (`mine` scope). */
    total: number;
    /** Newest-first slice for the "recent" block. */
    recent: EducationLibraryRow[];
    /** Owned artifact count per library kind (`fc_set`, `assessment`, …). */
    byKind: Record<string, number>;
    /** Owned artifact count per subtype (`quiz`, `summary`, `mind_map`, …). */
    bySubtype: Record<string, number>;
  };
  kits: {
    total: number;
    /** Newest-first slice; the hero when there is no study signal yet. */
    recent: StudyKit[];
  };
  study: {
    plan: PlanWithDays | null;
    /** Today's pending plan blocks (empty on a rest day or with no plan). */
    todayBlocks: StudyPlanBlockRow[];
    isRestDay: boolean;
    goals: StudyGoalRow[];
    streakDays: number;
    /** Per-item-type due + weak counts across every study mode. */
    modes: ModeSignal[];
    totalDue: number;
    totalWeak: number;
    /** True once the learner has recorded any attempt at all. */
    hasStudied: boolean;
  };
  /** The ranked next actions synthesized from plan + spine + goals. */
  nextActions: NextAction[];
}

/**
 * A home block. `signal` returns null to render nothing — the single mechanism
 * that keeps day 0 uncluttered without a separate empty-state layout. A higher
 * number sorts earlier, so the strongest live signal becomes the hero.
 */
export interface HomeBlock {
  id: string;
  signal: (s: EducationSnapshot) => number | null;
  render: (s: EducationSnapshot) => React.ReactNode;
}
