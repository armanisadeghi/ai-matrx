/**
 * features/hr/time/clock/ClockOutAttestationCard.tsx — the clock-out attestation (L3-47, §3.2).
 *
 * Four rules, and each one is the difference between an attestation and a checkbox:
 *
 * 1. 🚨 **It shows the total it is asking about.** *An attestation to an unstated number is not an
 *    attestation.* 🚨 **The server sends NO day total** (G2 F6) — `dayTotalHours` was this lane's
 *    invention and rendered as "undefined hours" against the live function. What the server does
 *    send is `elapsed_worked_minutes`, computed server-side over the punch's stamped zone, so that
 *    is the figure this card states and the figure it records as having stated. It is deliberately
 *    NOT dressed up as a paid-hours total. The figure displayed and the figure written are the same
 *    value, so what the employee saw and what was recorded can never disagree.
 * 2. 🚨 **A meal waiver is offered ONLY where `attestation.mealWaiverOffered` is true** — the
 *    resolved rule permits one for that shift length. Where it does not, the option is **absent —
 *    not greyed, not refused after the fact**. Offering a waiver a jurisdiction does not allow and
 *    then rejecting it teaches people the form is theatre.
 * 3. 🚨 **A "no" answer NEVER blocks the clock-out.** Submit always writes the punch. *"I did not
 *    get my meal break"* and *"these hours are wrong"* become an exception and, where a rule says
 *    so, a premium line — they do not trap a person at a screen at the end of their shift.
 * 4. 🚨 **The answers ride the punch as ONE combined `attestation_response` object** in §3.2's
 *    declared shape (§14 D9). `attestation_kind` is set to `hours_confirmed` by the server on any
 *    combined attestation and **cannot carry this on its own** — a detector keying on
 *    `attestation_kind = 'meal_waived'` silently misses every combined attestation and
 *    under-reports premiums.
 */

"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatElapsedMinutes } from "./liveElapsed";
import {
  attestationShownMinutes,
  mealMinimumMinutes,
  mealRuleResolved,
  mealWaiverOffered,
  restBreaksOwed,
  restRuleResolved,
} from "./clockStateView";
import { Textarea } from "@/components/ui/textarea";
import type { AttestationResponse, ClockState } from "@/features/hr/time/api/types";

export interface ClockOutAttestationCardProps {
  state: ClockState;
  busy: boolean;
  onSubmit: (response: AttestationResponse) => void;
  onCancel: () => void;
}

type YesNo = "yes" | "no" | null;

function ChoiceRow({
  question,
  value,
  onChange,
  yesLabel = "Yes",
  noLabel = "No",
}: {
  question: string;
  value: YesNo;
  onChange: (next: YesNo) => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-base text-foreground">{question}</legend>
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant={value === "yes" ? "default" : "outline"}
          onClick={() => onChange("yes")}
          className="min-h-[52px] text-base"
        >
          {yesLabel}
        </Button>
        <Button
          type="button"
          variant={value === "no" ? "default" : "outline"}
          onClick={() => onChange("no")}
          className="min-h-[52px] text-base"
        >
          {noLabel}
        </Button>
      </div>
    </fieldset>
  );
}

export function ClockOutAttestationCard({
  state,
  busy,
  onSubmit,
  onCancel,
}: ClockOutAttestationCardProps) {
  const shownMinutes = attestationShownMinutes(state);
  const shownLabel = formatElapsedMinutes(shownMinutes);
  const askAboutRest = restRuleResolved(state);
  const restOwed = restBreaksOwed(state) ?? 0;
  const waiverOffered = mealWaiverOffered(state);

  // `asked_at` is stamped when the card mounts, not when it is submitted — the pair
  // (asked_at, answered_at) is what shows an attestation was read rather than reflexed through.
  const [askedAt] = useState(() => new Date().toISOString());
  const [mealProvided, setMealProvided] = useState<YesNo>(null);
  const [mealTaken, setMealTaken] = useState<YesNo>(null);
  const [mealInterrupted, setMealInterrupted] = useState<YesNo>(null);
  const [mealWaived, setMealWaived] = useState(false);
  const [restTaken, setRestTaken] = useState(restOwed);
  const [hoursConfirmed, setHoursConfirmed] = useState<YesNo>(null);
  const [disagreementNote, setDisagreementNote] = useState("");

  const askAboutMeal = mealRuleResolved(state);
  const answered =
    hoursConfirmed !== null && (!askAboutMeal || mealWaived || mealProvided !== null);

  function submit() {
    const response: AttestationResponse = {
      // The envelope carries no prompt version; the rule set it was resolved from is named instead.
      prompt_version: state.jurisdictionKey ?? "unspecified",
      asked_at: askedAt,
      answered_at: new Date().toISOString(),
      ...(askAboutMeal
        ? {
            meal: {
              required: true,
              provided: mealWaived ? true : mealProvided === "yes",
              taken: mealWaived ? false : mealTaken === "yes",
              waived: mealWaived,
              interrupted: mealInterrupted === "yes",
            },
          }
        : {}),
      ...(askAboutRest
        ? {
            rest: {
              count_owed: restOwed,
              count_taken: restTaken,
              missed: restTaken < restOwed,
            },
          }
        : {}),
      hours: {
        confirmed: hoursConfirmed === "yes",
        /*
          🚨 The figure the employee was shown, written verbatim. `shown_total_hours` is null
          because the server sends no day total on this read and this client will not manufacture
          one; `shown_elapsed_worked_minutes` is what was actually on screen.
        */
        shown_total_hours: null,
        shown_elapsed_worked_minutes: shownMinutes,
        disagreement_note: disagreementNote.trim() === "" ? null : disagreementNote.trim(),
      },
    };
    onSubmit(response);
  }

  return (
    <section className="flex flex-col gap-6 rounded-xl border border-border bg-card p-5">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">Before you clock out</h2>
        <p className="text-sm text-muted-foreground">
          Answer honestly. Nothing here stops you clocking out — a disagreement is recorded and goes
          to your manager.
        </p>
      </header>

      {/* Rule 1: the total this attestation is ABOUT, stated. Server-computed, never derived here. */}
      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <p className="text-sm text-muted-foreground">Time recorded for today so far</p>
        <p className="text-3xl font-semibold tabular-nums text-foreground">{shownLabel}</p>
      </div>

      {askAboutMeal && (
        <div className="flex flex-col gap-5">
          <ChoiceRow
            question="Were you provided a meal break today?"
            value={mealWaived ? "yes" : mealProvided}
            onChange={(next) => {
              setMealWaived(false);
              setMealProvided(next);
            }}
          />
          {mealProvided === "yes" && !mealWaived && (
            <>
              <ChoiceRow
                question="Did you take it?"
                value={mealTaken}
                onChange={setMealTaken}
              />
              <ChoiceRow
                question="Were you interrupted during it?"
                value={mealInterrupted}
                onChange={setMealInterrupted}
              />
            </>
          )}

          {/*
            Rule 2: ABSENT, not greyed, where the resolved rule permits no waiver for this shift
            length. `mealWaiverOffered` is the server's answer to that question, not ours.
          */}
          {waiverOffered && (
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant={mealWaived ? "default" : "outline"}
                onClick={() => {
                  setMealWaived((on) => !on);
                  setMealProvided(null);
                  setMealTaken(null);
                  setMealInterrupted(null);
                }}
                className="min-h-[52px] text-base"
              >
                I chose to waive my meal break
              </Button>
              <p className="text-xs text-muted-foreground">
                A waiver is your choice. You can take your meal break instead at any time.
              </p>
            </div>
          )}
        </div>
      )}

      {askAboutRest && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-base text-foreground">
            You were owed {restOwed} rest {restOwed === 1 ? "break" : "breaks"} today. How many did
            you take?
          </legend>
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="One fewer rest break"
              onClick={() => setRestTaken((n) => Math.max(0, n - 1))}
              className="size-[52px]"
            >
              <Minus className="size-5" />
            </Button>
            <span className="min-w-12 text-center text-2xl font-semibold tabular-nums text-foreground">
              {restTaken}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="One more rest break"
              onClick={() => setRestTaken((n) => Math.min(restOwed, n + 1))}
              className="size-[52px]"
            >
              <Plus className="size-5" />
            </Button>
          </div>
        </fieldset>
      )}

      <ChoiceRow
        question={`Is ${shownLabel} correct for today?`}
        value={hoursConfirmed}
        onChange={setHoursConfirmed}
        yesLabel="Yes, that's right"
        noLabel="No, that's wrong"
      />

      {hoursConfirmed === "no" && (
        <div className="flex flex-col gap-2">
          <label htmlFor="hr-attestation-disagreement" className="text-base text-foreground">
            Tell us what is wrong, in your own words.
          </label>
          <Textarea
            id="hr-attestation-disagreement"
            value={disagreementNote}
            onChange={(event) => setDisagreementNote(event.target.value)}
            rows={3}
            /* ≥16px so iOS does not zoom on focus (ios-mobile-first). */
            className="text-base"
            placeholder="For example: I clocked out at 4:30, not 5:00."
          />
          <p className="text-xs text-muted-foreground">
            Your words are recorded exactly as you write them and are never edited by anyone else.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {/*
          Rule 3: this button submits on any answer set. There is no branch that refuses, and there
          is deliberately no "you must say yes to continue".
        */}
        <Button
          type="button"
          size="lg"
          disabled={busy || !answered}
          onClick={submit}
          className="min-h-[64px] text-lg font-semibold"
        >
          Submit and clock out
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel} className="min-h-[48px]">
          Not yet — go back
        </Button>
      </div>
    </section>
  );
}
