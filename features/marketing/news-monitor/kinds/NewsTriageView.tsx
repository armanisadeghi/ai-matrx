"use client";

/**
 * `news_triage` (NEWS-ENGINE-SPEC §6.12) — the triage job's verdict on each
 * fresh story: pitch-ready, big story, or watch, with the client's standing
 * and why. The ONE triage renderer.
 */

import type { ReactNode } from "react";

import { counts, humanize, isRecord, num, records, str } from "../run-document";
import { KindCard, Pill } from "./shared";

const TIER_ORDER = ["pitch_ready", "big_story", "watch"] as const;
const TIER_LABEL: Record<string, string> = {
  pitch_ready: "Pitch-ready",
  big_story: "Big stories worth a look",
  watch: "Watch / context",
};

function standingTone(standing: string): "good" | "info" | "neutral" {
  if (standing === "strong") return "good";
  if (standing === "partial") return "info";
  return "neutral";
}

export function NewsTriageView({
  value,
  storyActions,
}: {
  value: Record<string, unknown>;
  storyActions?: (storyKey: string) => ReactNode;
}) {
  const triaged = records(value.triaged);
  const summary = isRecord(value.summary) ? value.summary : {};
  const standing = counts(summary.standing_counts);
  return (
    <KindCard
      testId="news-triage"
      title={`Triage — ${num(summary.pitch_ready_count)} pitch-ready · ${num(summary.big_story_count)} big · ${num(summary.watch_count)} watch`}
      subtitle={
        Object.keys(standing).length
          ? `Standing: ${Object.entries(standing).map(([k, n]) => `${n} ${k}`).join(" · ")}`
          : `${num(summary.input_count)} fresh stories judged`
      }
    >
      {triaged.length === 0 ? (
        <p className="text-xs text-muted-foreground">No story reached triage.</p>
      ) : (
        TIER_ORDER.map((tier) => {
          const rows = triaged.filter((t) => str(t.tier) === tier);
          if (!rows.length) return null;
          return (
            <div key={tier}>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {TIER_LABEL[tier]} · {rows.length}
              </p>
              <ul className="mt-1 flex flex-col gap-2">
                {rows.map((t) => (
                  <li key={str(t.signal_id)} className="flex flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="text-sm font-medium text-foreground">{str(t.signal_title)}</span>
                      <Pill tone={standingTone(str(t.standing))}>
                        standing {str(t.standing) || "unknown"}
                      </Pill>
                      {t.proof_gated === true ? (
                        <Pill tone="warn" title="No spokesperson or proof on file for this claim">
                          proof-gated
                        </Pill>
                      ) : null}
                      {t.off_policy === true ? (
                        <Pill tone="bad" title={str(t.policy_rule)}>off your brief</Pill>
                      ) : null}
                      {str(t.watch_reason) ? <Pill>{humanize(str(t.watch_reason))}</Pill> : null}
                      {str(t.relevance_confidence) ? (
                        <span className="text-[11px] text-muted-foreground">
                          confidence {str(t.relevance_confidence)}
                        </span>
                      ) : null}
                      {storyActions?.(str(t.signal_id))}
                    </div>
                    {str(t.standing_rationale) ? (
                      <p className="text-xs text-muted-foreground">{str(t.standing_rationale)}</p>
                    ) : null}
                    {str(t.bridge_note) ? (
                      <p className="text-xs text-foreground">Bridge: {str(t.bridge_note)}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </KindCard>
  );
}
