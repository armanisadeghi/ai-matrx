"use client";

// features/masterwork/encore/AuditionProof.tsx
//
// WHAT IS A CHECK, AND WHAT IS A PROOF — in Operator words.
//
// Encore's pitch is "this runs with a real expert's judgment built in". Two
// different things can back that up, and until 2026-09-15 this component
// presented the weaker one as THE PROOF:
//
//   The Audition — a QUICK CHECK. Our output judged rule by rule against work
//   the Expert actually published, sometimes with a second arm (a plain model
//   with no Rulebook). Two or three arms, one reference. It says how close we
//   came; it cannot establish that anyone was beaten.
//
//   The Bench — THE PROOF. A logged five-arm trial (A0/A1/A2/B/C/GT) with a
//   blind panel the expert's own withheld work has to win, dollars and seconds
//   on every arm, and a claim that names the arm and the budget it was made
//   against. Doctrine: common-docs/systems/masterwork/doctrine/CORE.md §6, and
//   §9's standing verdict of 2026-09-14 — the shipped Audition's "Expert match"
//   score is not proof, and the bench replaces it.
//
// So the score is labelled "Quick check", never "Expert match" and never THE
// PROOF; beside it sits the Bench verdict when a record exists, and a plain
// "No bench proof yet" when none does. Honest by construction: no audition, no
// line. And no dead control — the Bench has no button in the app yet, so the
// screen SAYS where it runs instead of showing one that does nothing.

import { BadgeCheck, FlaskConical, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { withoutRepeatedLead } from "@/lib/copy/withoutRepeatedLead";
import { formatRelativeTime } from "@/utils/datetime";
import type { BenchProofState } from "./benchProof";
import { benchFacts } from "./benchFacts";

export interface AuditionProofProps {
  /** 0-100, judged against the Expert's own published work. 50 = parity. */
  score: number | null;
  /** The judge's plain sentence — it now carries its own "not a proof" label. */
  verdict?: string | null;
  /** When the audition ran — a score with no date is not evidence. */
  auditionedAt?: string | null;
  /**
   * The Bench answer for this Masterwork's Rulebook. Undefined = this surface
   * does not ask (a compact card); a state = it asked and this is the answer,
   * including the honest "none yet".
   */
  bench?: BenchProofState;
  /** `line` for a card; `panel` for the run page (adds the verdict + date). */
  variant?: "line" | "panel";
  className?: string;
}

/**
 * LEGACY SENTENCES STILL SAY "BEAT". The verdict is PERSISTED on the run row,
 * so auditions judged before 2026-09-15 carry the old claim ("The Masterwork
 * beat vanilla AI on 2 of 4 rules") and would keep making it on this screen
 * forever. The server can never claim a win from two arms, and neither can a
 * stored copy of one — so a legacy claim is not rendered, and the screen SAYS
 * it was set aside and why. Never silently dropped (a screen is absent or
 * honest, never quietly edited).
 */
export function auditionSentence(verdict: string | null | undefined): {
  text: string;
  legacy: boolean;
} | null {
  const text = (verdict ?? "").trim();
  if (!text) return null;
  if (/\bbeat\b/i.test(text)) {
    return {
      legacy: true,
      text:
        "This audition ran before 2026-09-15 and recorded a “beat vanilla AI” " +
        "sentence. Two arms against one reference cannot establish that, so it " +
        "is not shown. Re-run the audition for the current wording — and the " +
        "Bench for a proof.",
    };
  }
  return { text, legacy: false };
}

/**
 * A trial that is running RIGHT NOW. Shown ABOVE whatever else the panel has
 * to say, because "it is happening" is the most important true thing on the
 * screen while it is happening — and because the alternative, which is what
 * shipped, was a permission message shown to the person who started it.
 */
function BenchRunningLine({ bench }: { bench: BenchProofState }) {
  if (bench.status === "loading" || !bench.running) return null;
  return (
    <div
      className="mt-2 rounded-md border border-border px-2 py-1.5"
      data-testid="bench-running"
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Loader2
          className="h-3.5 w-3.5 shrink-0 animate-spin"
          aria-hidden="true"
        />
        {/* The SERVER's sentence, with the estimate already in it. */}
        <span>{bench.running.headline}</span>
      </p>
    </div>
  );
}

/** The Bench half: a record, or a plain no — never silence, never a fake door. */
function BenchLine({ bench }: { bench: BenchProofState }) {
  if (bench.status === "loading") {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        Checking for a bench proof…
      </p>
    );
  }

  if (bench.running) {
    // A trial in flight answers the question the panel is asking. Any banked
    // record still shows underneath it — both are true at once.
    return (
      <>
        <BenchRunningLine bench={bench} />
        {bench.status === "record" ? <BenchRecordLine bench={bench} /> : null}
      </>
    );
  }

  return <BenchRecordLine bench={bench} />;
}

/** The banked record, or the honest no. Split out so a running trial can show
 *  its own line above an existing record without duplicating either. */
function BenchRecordLine({ bench }: { bench: BenchProofState }) {
  if (bench.status === "loading") return null;
  if (bench.status === "record") {
    const { proof } = bench;
    // Built by the shared `benchFacts` so the live dialog and this banked
    // record can never say the same fact two different ways.
    const facts = benchFacts(proof);
    return (
      <div className="mt-2 rounded-md border border-border px-2 py-1.5">
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{proof.headline}</span>
        </p>
        {facts.length > 0 ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {facts.join(" · ")}
          </p>
        ) : null}
        {proof.win_rationale ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {proof.win_rationale}
          </p>
        ) : null}
        {proof.report_path ? (
          // A server-side file, not a URL: the Bench writes files today, and a
          // link that 404s would be worse than the path itself.
          <p className="mt-0.5 break-all text-[10px] text-muted-foreground">
            Full report: <code>{proof.report_path}</code>
          </p>
        ) : null}
      </div>
    );
  }

  // "unavailable" and "none" both say the true thing and what would change it.
  // The unavailable headline comes FROM THE STATE: "can't tell from here" is a
  // permission sentence and is said only when the server actually refused, not
  // whenever a read failed (wall W3).
  const benchHeadline =
    bench.status === "none" ? "No bench proof yet" : bench.headline;
  return (
    <div className="mt-2 rounded-md border border-dashed border-border px-2 py-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{benchHeadline}</span>
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {withoutRepeatedLead(bench.reason, benchHeadline)}
      </p>
      {/* THE TRACE ID BELONGS HERE AND NOWHERE ELSE (fifteenth cold walk).
          It sat in the middle of the sentence above, 32 hex characters at a
          non-technical Expert. It is genuinely useful when she reports this,
          so it is kept — muted, secondary, out of the prose. */}
      {bench.status === "unavailable" && bench.traceId ? (
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          Recorded as {bench.traceId}
        </p>
      ) : null}
    </div>
  );
}


export function AuditionProof({
  score,
  verdict = null,
  auditionedAt = null,
  bench,
  variant = "line",
  className,
}: AuditionProofProps) {
  // Honest by construction: nothing checked, nothing claimed. A bench block on
  // its own still shows, because a run that HAS a proof should say so.
  if (score === null && !bench) return null;

  const rounded = score === null ? null : Math.round(score);
  const sentence = auditionSentence(verdict);
  const headline =
    rounded === null
      ? "Not checked against the expert's work yet"
      : `Quick check: ${rounded}/100 against the expert's published work`;

  if (variant === "line") {
    return (
      <p
        className={cn(
          "flex items-center gap-1.5 text-xs text-muted-foreground",
          className,
        )}
      >
        <BadgeCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{headline}</span>
      </p>
    );
  }

  return (
    <div className={cn("mt-3", className)}>
      <p
        className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-foreground"
        title="50 means it matched the expert's published work, rule by rule"
      >
        <BadgeCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{headline}</span>
        {auditionedAt ? (
          <span className="font-normal text-muted-foreground">
            · {formatRelativeTime(auditionedAt)}
          </span>
        ) : null}
      </p>
      {/* The judge's own sentence — it states what it is, including that a
          two-arm comparison is not a proof. A pre-2026-09-15 sentence that
          claims a win is replaced by a line saying so. */}
      {sentence ? (
        <p
          className={cn(
            "mt-1 text-xs",
            sentence.legacy
              ? "italic text-muted-foreground"
              : "line-clamp-3 text-muted-foreground",
          )}
        >
          {sentence.text}
        </p>
      ) : null}
      {bench ? <BenchLine bench={bench} /> : null}
    </div>
  );
}
