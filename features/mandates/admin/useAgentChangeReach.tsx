"use client";

/**
 * THE POST-EDIT BADGE (Agent Change Impact, I6) — Arman's single-agent moment.
 *
 * "Imagine I'm working on an individual agent, and I've just modified the
 * system prompt… at that moment, I typically know if I've done something that
 * would break things or not. So if the system shows me… oh, yeah, this agent
 * is used in a mandate…" (MANDATE.md).
 *
 * After a successful save of an agent definition, ONE read through the
 * public door — `POST /mandates/impact/mine`, which answers only about the
 * mandates this person can already see (R31) — scoped to this agent WITH its
 * duplicated descendants (R4). Then:
 *   • ≥1 verdict → a NON-BLOCKING badge beside the save pill and a toast with
 *     a "Review" door. Both open the EXISTING batch panel (I5) scoped to this
 *     agent; there is no second panel body. Never a wall (R2).
 *   • 0 verdicts → nothing. The absence of a badge is the honest "this reaches
 *     no job you can see" — but what the server WITHHELD is still said, once,
 *     as a plain info toast, because a silent short answer is forbidden (R31).
 *   • a failed read → a dismissible notice carrying the server's sentence.
 *     Never silent: an unknown reach is not a clean one.
 *
 * Whether the badge also OPENS the panel by itself is an organization knob
 * (`agent_impact.post_edit_auto_open`, default off — opinions become knobs).
 */

import { useState } from "react";
import { Loader2, Radar, X } from "lucide-react";
import { TapTargetButton } from "@ai-matrx/tap-target";
import { Badge } from "@/components/ui/badge";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { useOpenImpactBatchWindow } from "@/features/overlays/openers/impactBatchWindow";
import {
  countBatchTiers,
  describeReach,
  fetchImpact,
  readPostEditAutoOpen,
  type BatchTierCounts,
  type StandingImpact,
} from "./impact";
import type { AppDispatch } from "@/lib/redux/store";

/** What one post-save read decided — exported so a test can pin every branch. */
export type AgentReach =
  | { state: "reading" }
  | { state: "none"; withheldTotal: number; withheldSentences: string[] }
  | {
      state: "reached";
      counts: BatchTierCounts;
      sentence: string;
      impact: StandingImpact;
    }
  | { state: "failed"; why: string };

/**
 * The read, as a pure step: this agent, descendants walked, the public
 * posture. Throws nothing — a failure is a value the badge can show.
 */
export async function readAgentReach(
  dispatch: AppDispatch,
  agentId: string,
): Promise<AgentReach> {
  try {
    const impact = await fetchImpact(dispatch, [agentId], {
      includeDescendants: true,
      posture: "mine",
    });
    if (impact.verdicts.length === 0) {
      return {
        state: "none",
        withheldTotal: impact.withheldTotal,
        withheldSentences: impact.withheldSentences,
      };
    }
    const counts = countBatchTiers(impact.verdicts);
    return { state: "reached", counts, sentence: describeReach(counts), impact };
  } catch (error) {
    return {
      state: "failed",
      why: error instanceof Error ? error.message : String(error),
    };
  }
}

/** The badge's tone follows the worst pile it carries — red before check before safe. */
export function reachToneClassName(counts: BatchTierCounts): string {
  if (counts.byTier.red > 0) {
    return "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400";
  }
  if (counts.byTier.drift > 0) {
    return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  }
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
}

const REACH_TOAST_MS = 20_000;

export function useAgentChangeReach(agentId: string) {
  const dispatch = useAppDispatch();
  const openImpactBatchWindow = useOpenImpactBatchWindow();
  const [reach, setReach] = useState<AgentReach | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);

  // The name is passed in, not read from state: the toast's Review door is a
  // closure from the render that started the read, before any state landed.
  const openPanel = (name: string | null) =>
    openImpactBatchWindow({
      agentIds: [agentId],
      mode: "post_batch",
      posture: "mine",
      focusAgentId: agentId,
      batchLabel: `Edit of ${name ?? "agent"}`,
      sourceSentence: `You just saved ${name ?? "this agent"} — these are the jobs that change reaches.`,
      surfaceName: "agent-post-edit",
    });

  /**
   * Call after a save has succeeded. Resolves when the read has answered; the
   * caller never awaits it on the save's critical path.
   */
  const announce = async (name: string | null): Promise<AgentReach> => {
    setAgentName(name);
    setReach({ state: "reading" });
    const result = await readAgentReach(dispatch, agentId);
    setReach(result);
    if (result.state === "reached") {
      toast.info(result.sentence, {
        duration: REACH_TOAST_MS,
        description:
          "Nothing moved. Review the jobs, compare the versions, test it, and advance the safe ones when you are ready.",
        action: { label: "Review", onClick: () => openPanel(name) },
      });
      const autoOpen = await readPostEditAutoOpen();
      if (autoOpen.state === "known" && autoOpen.value) {
        openPanel(name);
      } else if (autoOpen.state === "unknown") {
        // The knob could not be read: the badge and the toast still stand, so
        // the person loses nothing but the automatic open — said once, quietly.
        console.warn(
          `[agent-change-reach] agent_impact.post_edit_auto_open could not be read (${autoOpen.why}); the panel was not opened automatically.`,
        );
      }
    } else if (result.state === "failed") {
      toast.error(
        `Saved, but this change's reach is unknown: ${result.why}`,
        {
          duration: REACH_TOAST_MS,
          description:
            "The mandates this agent serves were not checked — nothing here says the change is safe.",
        },
      );
    } else if (result.state === "none" && result.withheldTotal > 0) {
      toast.info(
        `Saved. No job you can see pins this agent; ${result.withheldTotal} pin${result.withheldTotal === 1 ? "" : "s"} on it ${result.withheldTotal === 1 ? "is" : "are"} not yours to see.`,
        {
          duration: REACH_TOAST_MS,
          description: result.withheldSentences.join(" ") || undefined,
        },
      );
    }
    return result;
  };

  const badge =
    reach === null || reach.state === "none" ? null : reach.state === "reading" ? (
      <span
        className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
        title="Checking which jobs this change reaches…"
      >
        <Loader2 className="h-3 w-3 animate-spin" /> reach
      </span>
    ) : reach.state === "failed" ? (
      <span className="inline-flex items-center gap-0.5">
        <Badge
          variant="outline"
          className="h-5 gap-1 border-rose-500/40 bg-rose-500/10 px-1.5 text-[10px] text-rose-700 dark:text-rose-400"
          title={`This change's reach is unknown: ${reach.why}`}
        >
          <Radar className="h-3 w-3" /> reach unknown
        </Badge>
        <button
          type="button"
          onClick={() => setReach(null)}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted"
          title="Dismiss"
          aria-label="Dismiss the reach notice"
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    ) : (
      <span className="inline-flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => openPanel(agentName)}
          className="rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          title={`${reach.sentence}. Open the impact panel — compare versions, test, advance the safe ones.`}
          aria-label={reach.sentence}
          data-testid="agent-change-reach-badge"
        >
          <Badge
            variant="outline"
            className={`h-5 gap-1 px-1.5 text-[10px] ${reachToneClassName(reach.counts)}`}
          >
            <Radar className="h-3 w-3" />
            reaches {reach.counts.mandates}
          </Badge>
        </button>
        <button
          type="button"
          onClick={() => setReach(null)}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted"
          title="Dismiss"
          aria-label="Dismiss the reach badge"
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    );

  // The mobile header is a fixed row of 44pt tap targets, so the chip above
  // would squeeze the mode pill. This is the same badge as ONE tap target: a
  // radar with the count in a bubble; tapping opens the scoped panel, and a
  // failed read is a red radar that tapping dismisses (the toast already
  // carried the sentence).
  const tapBadge =
    reach === null || reach.state === "none" || reach.state === "reading" ? null : (
      <div className="relative shrink-0" data-testid="agent-change-reach-tap">
        <TapTargetButton
          icon={
            <Radar
              className={`h-4 w-4 ${reach.state === "failed" ? "text-rose-600 dark:text-rose-400" : "text-primary"}`}
            />
          }
          ariaLabel={
            reach.state === "failed"
              ? `This change's reach is unknown: ${reach.why}. Tap to dismiss.`
              : `${reach.sentence}. Open the impact panel.`
          }
          tooltip={false}
          onClick={() => (reach.state === "failed" ? setReach(null) : openPanel(agentName))}
        />
        {reach.state === "reached" ? (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute -right-0.5 -top-0.5 min-w-[1.1rem] rounded-full border px-1 text-center text-[10px] font-semibold leading-4 tabular-nums ${reachToneClassName(reach.counts)}`}
          >
            {reach.counts.mandates}
          </span>
        ) : null}
      </div>
    );

  return { reach, announce, badge, tapBadge } as const;
}
