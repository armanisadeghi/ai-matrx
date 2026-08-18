"use client";

/**
 * The evidence ladder — the ONE proof component on this surface.
 *
 * `proof_required` × `missing_evidence` × `evidence_refs`, joined by key into
 * rungs that count UP. The tone is set by BACKEND FACT 1: because the producer
 * only ever emits `pitch_now` for an angle with nothing outstanding, an angle
 * with proof still to gather is the NORMAL state of a healthy account. So this
 * reads as progress — "3 of 4 in hand", "One thing away from pitchable" —
 * never as a backlog of errors. Nothing here is destructive-red except
 * `contradictions`, which is the only field on the table that means something
 * is actually WRONG.
 *
 * Every gap ships with its fix (no-dead-ends §3.2): the concrete `how_to_get`,
 * who owns it, what it will cost in time, a one-click "I have this" that moves
 * the item into `evidence_refs` and recomputes readiness across the whole page,
 * and a copy pair that produces the exact request to send to whoever owns it.
 *
 * Two honesty rules you can see on screen:
 *  • a proof with no artefact linked says so instead of showing a green tick it
 *    did not earn;
 *  • jsonb entries the readers could not parse are counted and surfaced.
 */

import type { ComponentType } from "react";
import {
  BarChart3,
  Check,
  CircleCheckBig,
  CircleDashed,
  ExternalLink,
  FileText,
  Gauge,
  Quote,
  ShieldCheck,
  Scale,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { cn } from "@/lib/utils";
import {
  ladderVerdict,
  readLadder,
  type LadderRead,
  type LadderRung,
} from "@/features/marketing/pr/ladder";
import {
  readContradictions,
  type GapEffort,
  type GapOwner,
  type ProofKind,
  type StoryAngle,
} from "@/features/marketing/pr/types";

const KIND_ICON: Record<ProofKind, ComponentType<{ className?: string }>> = {
  document: FileText,
  data: BarChart3,
  quote: Quote,
  third_party: ShieldCheck,
  metric: Gauge,
};

const OWNER_LABEL: Record<GapOwner, string> = {
  you: "You",
  team: "Your team",
  client: "The client",
  third_party: "Someone outside",
};

const EFFORT_LABEL: Record<GapEffort, string> = {
  quick: "a few minutes",
  medium: "under an hour",
  heavy: "multi-day",
};

/** The dense, always-visible summary that lives in the collapsed row. */
export function ProofPill({
  angle,
  className,
}: {
  angle: StoryAngle;
  className?: string;
}) {
  const read = readLadder(angle);
  if (read.total === 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[11px] text-muted-foreground",
          className,
        )}
      >
        No proof recorded
      </span>
    );
  }
  const gaps = read.total - read.held;
  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-1.5", className)}
      title={`${read.held} of ${read.total} proofs in hand`}
    >
      {/* The rungs themselves, as a shape — one segment per proof. */}
      <span className="flex shrink-0 items-center gap-[2px]" aria-hidden>
        {read.rungs.slice(0, 8).map((rung) => (
          <span
            key={rung.key}
            className={cn(
              "h-1.5 w-2.5 rounded-full",
              rung.missing
                ? "bg-muted-foreground/25"
                : "bg-emerald-500/70 dark:bg-emerald-400/70",
            )}
          />
        ))}
      </span>
      <span className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
        {gaps === 0 ? `${read.total} in hand` : `${read.held}/${read.total} in hand`}
      </span>
    </span>
  );
}

function gapAsRequest(angle: StoryAngle, rung: LadderRung): string {
  return [
    `Evidence needed for a press angle: "${angle.headline}"`,
    "",
    `What we need: ${rung.label}`,
    rung.missing ? `How to get it: ${rung.missing.how_to_get}` : null,
    rung.missing ? `Best placed to get it: ${OWNER_LABEL[rung.missing.owner]}` : null,
    rung.missing ? `Rough effort: ${EFFORT_LABEL[rung.missing.effort]}` : null,
    rung.note ? `Why it matters: ${rung.note}` : null,
    "",
    "Once we have this, the angle can go to a journalist.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function LadderHeader({ read }: { read: LadderRead }) {
  const verdict = ladderVerdict(read);
  const percent = read.total === 0 ? 0 : Math.round((read.held / read.total) * 100);
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p
          className={cn(
            "text-[11px] font-semibold",
            verdict.tone === "ready"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-foreground",
          )}
        >
          {verdict.text}
        </p>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {read.held} of {read.total} in hand
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            verdict.tone === "ready" ? "bg-emerald-500" : "bg-primary",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function EvidenceLadder({
  angle,
  onHoldEvidence,
}: {
  angle: StoryAngle;
  /**
   * "I have this" — moves the gap into `evidence_refs` and recomputes
   * readiness across the whole page. Held in this session; the status bar says
   * so and offers to discard.
   */
  onHoldEvidence: (proofKey: string) => void;
}) {
  const read = readLadder(angle);
  const contradictions = readContradictions(angle.contradictions);

  if (read.total === 0 && contradictions.items.length === 0) {
    return (
      <p className="text-[11px] leading-4 text-muted-foreground">
        No proof requirements and no supporting artefacts are recorded on this
        angle. That is itself a gap — the analysis has not run against your own
        data yet, or it ran before evidence capture was switched on.
      </p>
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      {read.total > 0 ? <LadderHeader read={read} /> : null}

      {read.malformed > 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5">
          <p className="text-[11px] leading-4 text-amber-700 dark:text-amber-300">
            {read.malformed} evidence {read.malformed === 1 ? "entry" : "entries"}{" "}
            on this angle could not be read and{" "}
            {read.malformed === 1 ? "is" : "are"} not counted above — the stored
            payload does not match any shape this surface understands. Counting
            it is not enough, so here it is verbatim: a person can often read
            what a parser cannot.
          </p>
          <ul className="mt-1 space-y-0.5">
            {read.malformedRaw.map((raw, index) => (
              <li
                key={`malformed-${index}`}
                className="overflow-x-auto whitespace-pre rounded bg-background/60 px-1.5 py-0.5 font-mono text-[10px] text-foreground scrollbar-thin"
              >
                {raw}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="space-y-1.5">
        {read.rungs.map((rung) => {
          const Icon = KIND_ICON[rung.kind];
          return (
            <li
              key={rung.key}
              className={cn(
                "group/rung rounded-md border px-2 py-1.5",
                rung.missing
                  ? "border-border bg-background"
                  : rung.evidence
                    ? "border-emerald-500/25 bg-emerald-500/5"
                    : "border-amber-500/30 bg-amber-500/5",
              )}
            >
              <div className="flex min-w-0 items-start gap-2">
                <span
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                    rung.missing
                      ? "bg-muted text-primary"
                      : rung.evidence
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                  )}
                >
                  {rung.missing ? (
                    <CircleDashed className="h-3 w-3" aria-hidden />
                  ) : (
                    <Check className="h-3 w-3" aria-hidden />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-start gap-1.5 text-[11px] font-medium leading-4 text-foreground">
                    <Icon className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">{rung.label}</span>
                  </p>

                  {rung.missing ? (
                    <>
                      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                        {rung.missing.how_to_get}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 gap-1 px-2 text-[10px]"
                          onClick={() => onHoldEvidence(rung.key)}
                        >
                          <Check className="h-3 w-3" />I have this
                        </Button>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
                          {OWNER_LABEL[rung.missing.owner]} ·{" "}
                          {EFFORT_LABEL[rung.missing.effort]}
                        </span>
                      </div>
                    </>
                  ) : rung.evidence ? (
                    <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                      <span className="min-w-0">{rung.evidence.source}</span>
                      {rung.evidence.url ? (
                        <a
                          href={rung.evidence.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex shrink-0 items-center gap-0.5 font-medium text-primary hover:underline"
                        >
                          Open source
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </p>
                  ) : (
                    // HONEST GREEN: satisfied on paper, nothing behind it.
                    <p className="mt-0.5 text-[11px] leading-4 text-amber-700 dark:text-amber-300">
                      Marked satisfied, but no artefact is linked to it — attach
                      one before a fact-checker asks.
                    </p>
                  )}

                  {rung.note && !rung.missing ? (
                    <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground/80">
                      {rung.note}
                    </p>
                  ) : null}
                </div>

                {rung.missing ? (
                  <span className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/rung:opacity-100">
                    <CopyButtons
                      size="xs"
                      label={`Request: ${rung.label}`}
                      human={() => gapAsRequest(angle, rung)}
                      agent={() => ({
                        kind: "press-evidence-request",
                        location: "AI Matrx — Marketing — Press Room",
                        description: `The outstanding evidence "${rung.label}" blocking the press angle "${angle.headline}".`,
                        data: {
                          angle_id: angle.id,
                          angle_key: angle.angle_key,
                          headline: angle.headline,
                          proof_key: rung.key,
                          requirement: rung.label,
                          how_to_get: rung.missing?.how_to_get ?? null,
                          owner: rung.missing?.owner ?? null,
                          effort: rung.missing?.effort ?? null,
                        },
                        summary: gapAsRequest(angle, rung),
                        attributes: { angle_key: angle.angle_key },
                      })}
                    />
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {read.total > 0 && read.held === read.total ? (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
          <CircleCheckBig className="h-3 w-3" aria-hidden />
          Nothing is blocking this one.
        </p>
      ) : null}

      {contradictions.items.length > 0 ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5">
          {/* Named in the USER's language, not the column's. Nobody who has
              never pitched a reporter knows what a `contradictions` field is —
              but everybody understands being challenged on a claim. This stays
              the one warning-coloured thing in the proof area, because a gap is
              work and this is something actually wrong. */}
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-destructive">
            <Scale className="h-3.5 w-3.5" aria-hidden />
            A reporter will push back on{" "}
            {contradictions.items.length === 1
              ? "this"
              : `these ${contradictions.items.length}`}
          </p>
          <p className="mt-0.5 text-[10px] leading-4 text-destructive/80">
            Your own data disagrees with the story. Settle it before you pitch —
            a reporter who finds it first will not run the piece.
          </p>
          <ul className="mt-1 space-y-1">
            {contradictions.items.map((item, index) => (
              <li key={`contradiction-${index}`} className="min-w-0">
                <p className="text-[11px] leading-4 text-foreground">
                  {item.statement}
                </p>
                {item.detail ? (
                  <p className="text-[10px] leading-4 text-muted-foreground">
                    {item.detail}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
