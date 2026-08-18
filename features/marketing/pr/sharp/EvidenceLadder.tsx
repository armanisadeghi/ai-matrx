"use client";

/**
 * The Press Room — the evidence ladder.
 *
 * THE HONEST HEART. `proof_required` and `missing_evidence` are the two columns
 * that make this product truthful, and the brief is explicit about the tone: an
 * angle that is not provable yet is a TO-DO, not an error. So:
 *
 *   - the ladder is a progress object, not a warning panel — it counts UP
 *   - nothing missing is painted destructive; the only red on this surface is a
 *     source-request deadline, which is the one thing that can actually be lost
 *   - every gap ships with its fix (`how_to_get`), its owner, and its cost,
 *     plus the one control that closes it — no complaint without an action
 *     (no-dead-ends §3.2)
 *   - a proof with no artefact behind it says so instead of showing a green
 *     tick it did not earn (§3.4: never report green for data you could not read)
 */

import * as React from "react";
import {
  BarChart3,
  Check,
  CircleDashed,
  ExternalLink,
  FileText,
  Gauge,
  Quote,
  ShieldCheck,
  CircleCheckBig,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  readEvidenceRefs,
  readMissingEvidence,
  readProofRequired,
  type EvidenceRef,
  type MissingEvidenceItem,
  type ProofItem,
  type StoryAngleRow,
} from "./types";

const KIND_ICON: Record<ProofItem["kind"], React.ComponentType<{ className?: string }>> =
  {
    document: FileText,
    data: BarChart3,
    quote: Quote,
    third_party: ShieldCheck,
    metric: Gauge,
  };

const OWNER_LABEL: Record<MissingEvidenceItem["owner"], string> = {
  you: "You",
  team: "Your team",
  client: "The client",
  third_party: "Someone outside",
};

const EFFORT_LABEL: Record<MissingEvidenceItem["effort"], string> = {
  quick: "a few minutes",
  medium: "under an hour",
  heavy: "multi-day",
};

export interface LadderRung {
  key: string;
  label: string;
  kind: ProofItem["kind"];
  note: string | null;
  missing: MissingEvidenceItem | null;
  evidence: EvidenceRef | null;
}

export interface LadderRead {
  rungs: LadderRung[];
  held: number;
  total: number;
  /** jsonb entries no reader could understand, across all three columns. */
  malformed: number;
}

export function readLadder(angle: StoryAngleRow): LadderRead {
  const proof = readProofRequired(angle.proof_required);
  const missing = readMissingEvidence(angle.missing_evidence);
  const refs = readEvidenceRefs(angle.evidence_refs);

  const missingByKey = new Map(missing.items.map((item) => [item.key, item]));
  const refsByKey = new Map(refs.items.map((item) => [item.key, item]));

  const rungs: LadderRung[] = proof.items.map((item) => ({
    key: item.key,
    label: item.label,
    kind: item.kind,
    note: item.note,
    missing: missingByKey.get(item.key) ?? null,
    evidence: refsByKey.get(item.key) ?? null,
  }));

  // A gap the analysis named without listing it as a required proof is still a
  // gap. Dropping it would hide the honest part.
  for (const item of missing.items) {
    if (rungs.some((rung) => rung.key === item.key)) continue;
    rungs.push({
      key: item.key,
      label: item.label,
      kind: "document",
      note: null,
      missing: item,
      evidence: null,
    });
  }

  const held = rungs.filter((rung) => rung.missing === null).length;
  return {
    rungs,
    held,
    total: rungs.length,
    malformed: proof.malformed + missing.malformed + refs.malformed,
  };
}

export function LadderMeter({
  read,
  className,
}: {
  read: LadderRead;
  className?: string;
}) {
  if (read.total === 0) return null;
  return (
    <span
      className={cn("inline-flex items-center gap-[3px]", className)}
      aria-label={`${read.held} of ${read.total} proofs in hand`}
    >
      {read.rungs.map((rung) => (
        <span
          key={rung.key}
          className={cn(
            "h-1.5 w-3 rounded-full",
            rung.missing
              ? "bg-muted-foreground/25"
              : "bg-emerald-500/70 dark:bg-emerald-400/70",
          )}
        />
      ))}
    </span>
  );
}

/** The one line that decides whether a gap feels like momentum or like failure. */
export function ladderVerdict(read: LadderRead): {
  text: string;
  tone: "ready" | "close" | "work" | "none";
} {
  if (read.total === 0)
    return {
      text: "No proof requirements recorded for this angle yet.",
      tone: "none",
    };
  const gaps = read.total - read.held;
  if (gaps === 0)
    return {
      text: "Every proof a journalist will ask for is already in hand.",
      tone: "ready",
    };
  if (gaps === 1)
    return { text: "One thing away from pitchable.", tone: "close" };
  return { text: `${gaps} things away from pitchable.`, tone: "work" };
}

export function EvidenceLadder({
  angle,
  onResolve,
}: {
  angle: StoryAngleRow;
  /** Records a missing proof as obtained. Real transition, not a no-op. */
  onResolve: (key: string) => void;
}) {
  const read = readLadder(angle);
  const verdict = ladderVerdict(read);

  if (read.total === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No proof requirements were recorded for this angle. That is itself a gap
        — re-run the analysis to get one.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <LadderMeter read={read} />
        <p
          className={cn(
            "text-xs font-medium",
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

      {read.malformed > 0 ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
          {read.malformed} evidence {read.malformed === 1 ? "entry" : "entries"}{" "}
          on this angle could not be read and {read.malformed === 1 ? "is" : "are"}{" "}
          not counted above. The stored payload does not match the expected
          shape.
        </p>
      ) : null}

      <ul className="space-y-1.5">
        {read.rungs.map((rung) => {
          const Icon = KIND_ICON[rung.kind];
          return (
            <li
              key={rung.key}
              className={cn(
                "rounded-lg border px-3 py-2.5 transition-colors",
                rung.missing
                  ? "border-border bg-muted/30"
                  : "border-emerald-500/25 bg-emerald-500/5",
              )}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                    rung.missing
                      ? "bg-muted text-muted-foreground"
                      : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {rung.missing ? (
                    <CircleDashed className="h-3 w-3" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-start gap-1.5 text-xs font-medium leading-snug text-foreground">
                    <Icon className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                    <span>{rung.label}</span>
                  </p>

                  {rung.missing ? (
                    <>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                        {rung.missing.how_to_get}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          data-ladder-action="true"
                          className="h-6 gap-1 px-2 text-[11px]"
                          onClick={() => onResolve(rung.key)}
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
                    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                      <span>{rung.evidence.source}</span>
                      {rung.evidence.url ? (
                        <a
                          href={rung.evidence.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                        >
                          Open source
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Marked satisfied, but no artefact is linked to it — attach
                      one before a fact-checker asks.
                    </p>
                  )}

                  {rung.note && !rung.missing ? (
                    <p className="mt-1 text-[11px] text-muted-foreground/80">
                      {rung.note}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {verdict.tone === "ready" ? (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
          <CircleCheckBig className="h-3 w-3" />
          Nothing is blocking this one.
        </p>
      ) : null}
    </div>
  );
}
