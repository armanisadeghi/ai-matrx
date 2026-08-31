"use client";

// features/mandates/authoring/AutomationButton.tsx
//
// An affordance that runs a MANDATE BY KEY — mandates all the way down. The
// moment that mandate exists (Arman creates it, no deploy) it just runs. Never
// a hardcoded agent id, never a silent no-op.
//
// ── 1. WHAT AN UNRESOLVABLE KEY LOOKS LIKE (Arman, live, 2026-08-31) ─────────
//
// This used to leave the button fully ENABLED when the key resolved to nothing,
// with the explanation in a TOOLTIP and a toast fired on click. The button was
// indistinguishable from a working one until he pressed it, and what came back
// was "…which does not exist". `constants.ts` had described the intended
// behaviour correctly the whole time ("renders honestly disabled naming the
// missing key"); the component did something else.
//
// So: ABSENT OR HONEST. When the key does not resolve the control is visibly
// disabled AND the reason is printed BESIDE IT, naming the exact key to create
// — a tooltip is not words on the screen, and a disabled button with no
// sentence teaches nothing. "Does not resolve" covers every dead state the
// resolver knows — no row, a SOFT-DELETED row, a disabled row, a holderless or
// version-pinned one — and they are all one fact to a person.
//
// ── 2. THE CALLER MUST SUPPLY THE JOB'S ACTUAL INPUTS (Arman, live, same day) ─
//
// 🚨 With the key fixed, Refine-with-AI still failed on every mandate:
// *"required agent value does not exist in the calling code path"*. The caller
// passed four variables it had INVENTED (`mandate_key`, `mandate_label`,
// `current_goal`, `description`) and the job declares five quite different ones
// plus a person-answered question from its binding. Nothing was broken on
// either side; the two sides had never been introduced.
//
// A call site does not get to name a job's inputs. The SERVED SURFACE names
// them, the call site says what it HOLDS by those names (`knownValues`), and
// `planInvocation` decides the rest: what to send, what a PERSON must answer
// (asked INLINE, right here, before the run), and what is going unsent and why.
// A job that changes its inputs must never require a client deploy, and a
// caller that guesses names is the defect this seam removes.
//
// This lives on the shared button on purpose. Every place code invokes a
// mandate inherits it, so this is THE pattern for the class rather than a fix
// for the one call site that exposed it.

import React, { useMemo, useState } from "react";
import { BrainCircuit, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { useMandate } from "../useMandate";
import { useMandateInputSurface } from "../input-surface";
import {
  planInvocation,
  skippedSentence,
  type KnownValues,
} from "../invoke/supplied-values";

export function notifyMissingAutomationMandate(mandateKey: string): void {
  toast.info(
    `Not yet — this needs the mandate "${mandateKey}", which does not exist. Create it and this runs.`,
  );
}

/** The sentence the screen prints when the key resolves to nothing. Exported so
 * the guard asserts the copy a person actually reads, not a paraphrase. */
export function missingAutomationMandateLine(mandateKey: string): string {
  return `Not available yet — this runs the job "${mandateKey}", and no live job has that name. Create it and this button works, with no deploy.`;
}

export function AutomationButton({
  mandateKey,
  label,
  runningLabel,
  running,
  onRun,
  knownValues = {},
}: {
  mandateKey: string;
  /** Tight copy — two or three words ("Refine with AI"). */
  label: string;
  runningLabel: string;
  running: boolean;
  /**
   * Run it, with the variables THIS JOB ACTUALLY DECLARES — served names only,
   * the person's inline answers merged in. The caller passes them straight to
   * the run; it never adds names of its own.
   */
  onRun: (variables: Record<string, string>) => void;
  /**
   * What this screen HOLDS, keyed by SERVED INPUT NAME. A key nothing serves is
   * simply never sent — a caller that knows more than the job asked for is
   * fine; a caller that guesses names is not.
   */
  knownValues?: KnownValues;
}) {
  // optional: an absent automation mandate is the expected starting state —
  // the screen says so; it is not a console error.
  const { mandate, loading } = useMandate(mandateKey, { optional: true });
  const available = mandate !== null;

  // Only read the surface once the key resolves — a dead key has no inputs to
  // ask about, and reading them would be a request about nothing.
  const surfaceState = useMandateInputSurface(available ? mandateKey : null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const plan = useMemo(
    () =>
      surfaceState.status === "ready"
        ? planInvocation({
            inputs: surfaceState.surface.inputs,
            known: knownValues,
            answers,
          })
        : null,
    [surfaceState, knownValues, answers],
  );

  const unanswered = plan?.asks.filter((a) => !answers[a.name]?.trim()) ?? [];
  const surfacePending = available && surfaceState.status === "loading";
  const surfaceBroken = available && surfaceState.status === "error";

  const button = (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1.5 text-[12px]"
      // The control cannot do what it offers, so it does not offer it. Every
      // blocked state has its own sentence below; none of them is silence.
      disabled={
        running ||
        loading ||
        !available ||
        surfacePending ||
        surfaceBroken ||
        unanswered.length > 0
      }
      onClick={() => {
        if (!available) {
          notifyMissingAutomationMandate(mandateKey);
          return;
        }
        if (!plan) return;
        onRun(plan.variables);
      }}
    >
      {running ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <BrainCircuit className="h-3.5 w-3.5" />
      )}
      {running ? runningLabel : label}
    </Button>
  );

  if (loading) return button;

  if (!available) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {button}
        <span className="text-[11px] leading-snug text-muted-foreground">
          {missingAutomationMandateLine(mandateKey)}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {button}
        {surfacePending ? (
          <span className="text-[11px] text-muted-foreground">
            Reading what this job needs…
          </span>
        ) : null}
        {/* A surface that cannot be read is a REFUSAL with its reason, never a
            run fired hopefully into a job whose inputs are unknown. */}
        {surfaceBroken ? (
          <span className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">
            {surfaceState.status === "error" ? surfaceState.message : ""} Until
            it can be read, this cannot run — nothing else on this page is
            blocked by it.
          </span>
        ) : null}
        {plan && plan.skipped.length > 0 && unanswered.length === 0 ? (
          <span className="text-[11px] leading-snug text-muted-foreground">
            {skippedSentence(plan)}
          </span>
        ) : null}
      </div>

      {/* 🚨 THE BINDING'S OWN QUESTIONS, ASKED. Whoever bound this job chose to
          be asked; before this seam that choice made the run fail instead. */}
      {plan && plan.asks.length > 0 ? (
        <div className="space-y-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-2">
          <p className="text-[11px] leading-snug text-muted-foreground">
            This job asks {plan.asks.length === 1 ? "one thing" : `${plan.asks.length} things`} before it runs.
          </p>
          {plan.asks.map((ask) => (
            <div key={ask.name} className="space-y-1">
              <Label
                htmlFor={`ask-${mandateKey}-${ask.name}`}
                className="text-[11.5px] font-medium"
              >
                {ask.label || ask.name}
              </Label>
              {ask.help ? (
                <p className="text-[10.5px] leading-snug text-muted-foreground">
                  {ask.help}
                </p>
              ) : null}
              {/* 🚨 A PLAIN CONTROLLED TEXTAREA, deliberately (walk, 2026-08-31).
                  This was `ProTextarea` — an authoring surface with its own
                  refs, sync effects, toolbar, menus and mic streaming — and
                  answering the ask then pressing Run immediately sent only the
                  FIRST CHARACTER of what was typed ("M" of a full sentence).
                  An inline one-line question is not an authoring surface; the
                  primitive with no machinery between the keystroke and the
                  state is the right component, and it cannot lose characters. */}
              <Textarea
                id={`ask-${mandateKey}-${ask.name}`}
                value={answers[ask.name] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [ask.name]: e.target.value }))
                }
                rows={2}
                placeholder={ask.placeholder || ""}
                className="text-[12px]"
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
