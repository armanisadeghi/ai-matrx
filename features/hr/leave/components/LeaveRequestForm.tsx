/**
 * features/hr/leave/components/LeaveRequestForm.tsx — SPEC-LEAVE §4.1's request form.
 *
 * 🚨 THE COST IS SHOWN BEFORE SUBMIT, ALWAYS. *"A request whose cost the employee cannot see
 * is a request they will dispute."* Every change to the type, the dates or a partial day
 * re-reads `hr_leave_request_preview`, and what is rendered is the server's own
 * `breakdown_sentence` plus its day-by-day table. **Nothing on this form computes hours.**
 *
 * 🚨 ABSENCE, NOT DISABLEMENT (SPEC-UI-IA §4.2). The type select carries ONLY the policies
 * `hr_my_time_off` returned — which are, by the SQL's own `where`, the enrolled and active
 * ones. A policy the person is not on is not a greyed row; it is not in the DOM. Likewise the
 * whole form is absent when `can_request` is false.
 *
 * 🚨 A REFUSAL IS THE SERVER'S SENTENCE, NEVER A TOAST AND NEVER A CODE. When the workflow
 * rejects at intake, every `conflict_check.hard[].message` is rendered verbatim, with its
 * numbers, in place. `code` is a machine token and does not reach the page.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, Info, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@ai-matrx/design-system";
import { isHrDenied, isHrFailed } from "@/features/hr/types";
import { cn } from "@/lib/utils";

import { previewLeaveRequest, submitLeaveRequest } from "../api/service";
import type {
  LeaveConflictFinding,
  LeaveDayPart,
  LeaveReasonCategory,
  LeaveRequestPreview,
  MyLeavePolicy,
} from "../api/types";
import { LeaveBalanceBlock, formatHours } from "./LeaveBalanceBlock";
import { ProTextarea } from "@/components/official/ProTextarea";

/** How long after the last keystroke the preview re-reads. */
const PREVIEW_DEBOUNCE_MS = 350;

/**
 * 🚨 MINTED ONCE PER USER INTENT AND REUSED ON EVERY RETRY. That is what makes a double
 * submit and a flaky network produce ONE request. A fresh key on retry produces a second
 * request for the same days and a conflict for a human to untangle.
 *
 * `features/hr/time/api/idempotencyKey.ts` is deliberately not reused: it mints a
 * PUNCH key — its input is typed `PunchKind` and its whole design is the same-minute
 * collapse a time clock needs. A leave request has no minute and no punch kind.
 */
function mintKey(): string {
  return `leave-request:${crypto.randomUUID()}`;
}

function todayIso(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export interface LeaveRequestFormProps {
  employmentId: string;
  /** Enrolled, ACTIVE policies, exactly as `hr_my_time_off` returned them. */
  policies: MyLeavePolicy[];
  reasonCategories: LeaveReasonCategory[];
  /** Re-read the surface after a successful submit. */
  onSubmitted: () => void;
  /**
   * A refusal the FORM cannot render, because acting on it unmounts the form.
   *
   * 🚨 A stale selection makes the picker refetch, and if the refetch leaves no enrolled active
   * policy this component returns null — taking its own `role="alert"` with it. The employee
   * clicks Send, the form disappears, and nothing says why: the exact swallow round 30 reported,
   * recreated by the fix for it. So this class of refusal is handed UP to a host that survives.
   */
  onDetachedRefusal: (message: string) => void;
}

export function LeaveRequestForm({
  employmentId,
  policies,
  reasonCategories,
  onSubmitted,
  onDetachedRefusal,
}: LeaveRequestFormProps) {
  const [policyId, setPolicyId] = useState<string>(policies[0]?.policyId ?? "");
  const [startsOn, setStartsOn] = useState<string>(todayIso());
  const [endsOn, setEndsOn] = useState<string>(todayIso());
  const [partialDay, setPartialDay] = useState(false);
  const [dayHours, setDayHours] = useState<Record<string, string>>({});
  const [reasonCategoryId, setReasonCategoryId] = useState<string>("");
  const [note, setNote] = useState("");

  const [preview, setPreview] = useState<LeaveRequestPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRefusal, setPreviewRefusal] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [hardFindings, setHardFindings] = useState<LeaveConflictFinding[]>([]);
  const [submitRefusal, setSubmitRefusal] = useState<string | null>(null);

  /** Held across retries of THE SAME intent; re-minted only when the intent changes. */
  const idempotencyKey = useRef<string>(mintKey());

  const policy = useMemo(
    () => policies.find((p) => p.policyId === policyId) ?? null,
    [policies, policyId],
  );

  /** The parts actually sent. Empty unless the partial-day toggle is on. */
  const dayParts: LeaveDayPart[] = useMemo(() => {
    if (!partialDay) return [];
    return Object.entries(dayHours)
      .map(([date, raw]) => ({ date, hours: Number(raw) }))
      .filter((p) => Number.isFinite(p.hours) && p.hours > 0);
  }, [partialDay, dayHours]);

  const datesValid = startsOn !== "" && endsOn !== "" && endsOn >= startsOn;

  /**
   * Whether a preview can exist at all. This is DERIVED, not stored — an effect that cleared
   * the preview state synchronously would cascade a render on every keystroke, and the answer
   * is a pure function of the inputs anyway.
   */
  const previewPossible = policyId !== "" && datesValid;
  /** Never show a preview that belongs to inputs that are no longer valid. */
  const shownPreview = previewPossible ? preview : null;

  // ── the live preview ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!previewPossible) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      void previewLeaveRequest(
        { employmentId, leavePolicyId: policyId, startsOn, endsOn, dayParts },
        { signal: controller.signal },
      )
        .then((res) => {
          if (controller.signal.aborted) return;
          if (res.ok) {
            setPreview(res.data);
            setPreviewRefusal(null);
            return;
          }
          setPreview(null);
          setPreviewRefusal(
            isHrDenied(res)
              ? (res.detail ??
                "We cannot price these dates for you. Ask an administrator for help.")
              : isHrFailed(res)
                ? res.message
                : null,
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setPreviewLoading(false);
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [employmentId, policyId, startsOn, endsOn, dayParts, previewPossible]);

  /**
   * Turning the partial-day toggle ON seeds each working day with the hours the SERVER
   * already computed for it — never with a guessed 4, never with the whole day. The seed
   * comes from the preview that was just made with no parts at all.
   */
  const enablePartialDay = useCallback(
    (on: boolean) => {
      setPartialDay(on);
      if (!on) {
        setDayHours({});
        return;
      }
      const seed: Record<string, string> = {};
      for (const day of preview?.span.days ?? []) {
        if (day.date && day.hours !== null && day.hours > 0) {
          seed[day.date] = String(day.hours);
        }
      }
      setDayHours(seed);
    },
    [preview],
  );

  // ── the reason select ─────────────────────────────────────────────────────
  /**
   * §4.1: the policy's `mandated_uses` are listed FIRST and labelled *"protected — no
   * explanation needed"*. Mandated-ness is a property of the CATEGORY ON THIS POLICY, which
   * is why it is resolved here and not baked into the category rows.
   */
  const orderedReasons = useMemo(() => {
    const mandated = new Set(policy?.mandatedUses ?? []);
    const marked = reasonCategories.map((c) => ({ ...c, mandated: mandated.has(c.slug) }));
    return [
      ...marked.filter((c) => c.mandated),
      ...marked.filter((c) => !c.mandated),
    ];
  }, [reasonCategories, policy]);

  const reasonRequired = (policy?.mandatedUses.length ?? 0) > 0;
  const isSickPolicy = policy?.leaveKind === "sick";

  const incrementMinutes = preview?.incrementMinutes ?? policy?.incrementMinutes ?? null;

  /**
   * Each part must be a multiple of the policy's increment. The server clamps a part DOWNWARD
   * to the scheduled day on its own; this check exists so the person is told before they
   * submit, in the policy's own units — it is a courtesy, never the authority.
   */
  const incrementProblem = useMemo(() => {
    if (incrementMinutes === null || incrementMinutes <= 0) return null;
    const offender = dayParts.find(
      (p) => Math.abs(((p.hours * 60) % incrementMinutes + incrementMinutes) % incrementMinutes) > 1e-6,
    );
    if (!offender) return null;
    return `${offender.date} is not a multiple of this policy's ${incrementMinutes}-minute booking increment.`;
  }, [dayParts, incrementMinutes]);

  /*
    🚨 THE FREE WEEK, CAUGHT BEFORE THE BUTTON. `hr.leave_request_preview` returns
    `submittable: false` with a `blocker` sentence when the span would cost ZERO hours for a
    dishonest reason — no published shift on those days AND no `standard_hours_per_week` on
    the position — and the SUBMIT door refuses the same span in the same words. Letting the
    person press the button to learn that is the avoidable failure this closes.

    `null` (an older door that does not send the field) does NOT block: the submit door is
    still the authority, and blocking on not-knowing would lock out every valid request.
  */
  const blockedBySpan = shownPreview?.submittable === false;

  const canSubmit =
    !!policyId &&
    datesValid &&
    !submitting &&
    !blockedBySpan &&
    incrementProblem === null &&
    (!reasonRequired || reasonCategoryId !== "");

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setHardFindings([]);
    setSubmitRefusal(null);

    const res = await submitLeaveRequest({
      employmentId,
      leavePolicyId: policyId,
      startsOn,
      endsOn,
      dayParts,
      reasonCategoryId: reasonCategoryId || null,
      reasonNote: note.trim() || null,
      idempotencyKey: idempotencyKey.current,
    });

    setSubmitting(false);

    if (!res.ok) {
      /*
        A refusal is DATA and it is rendered in place, saying what the server actually
        checked. `reason` is a machine token and never becomes page text.
      */
      setSubmitRefusal(
        isHrDenied(res)
          ? (res.detail ?? "That request was not accepted, and no reason was given.")
          : isHrFailed(res)
            ? res.message
            : "That request was not accepted.",
      );
      /*
        🚨 THE DISPLAY-PINNED-TO-DOOR LAW, closed the rest of the way. Round 30 found the form
        OFFERING a leave type the door then refused, because the policy had been changed or
        removed while this page sat open. The door now says so explicitly with
        `staleSelection`, and the honest response is not to make the person reload — it is to
        REFETCH so the picker stops offering something that no longer exists. The sentence still
        renders, because they are owed the reason for the outcome they just got.
      */
      if (isHrDenied(res) && res.payload?.staleSelection === true) {
        /*
          Hand the sentence UP and let the host refetch. This deliberately does NOT call
          `onSubmitted` — that is the SUCCESS path, and it clears the very message being set
          here. The first version of this fix called both, in that order, and the clear won: the
          employee clicked Send, the form vanished, and no reason appeared. Exactly the swallow
          round 30 reported, recreated by its own fix.
        */
        /*
          The DOOR states the fact; THIS surface states what it did about it. A door cannot know
          whether its caller refetches — a phone app, an export script and this page all get the
          same envelope — so it stopped prescribing "reload the page" (hr_l5_24) and we append the
          remedy that is actually true here, because we do refetch.
        */
        onDetachedRefusal(
          `${
            res.detail ?? "That leave type changed while this page was open."
          } The list has been updated.`,
        );
      }
      return;
    }

    if (res.data.rejectedAtIntake) {
      /*
        🚨 EVERY HARD FINDING, VERBATIM, WITH ITS NUMBERS. Not a generic failure toast, not a
        count, not a code. This is the whole answer to "why can't I book this?".
      */
      setHardFindings(res.data.conflictCheck?.hard ?? []);
      return;
    }

    idempotencyKey.current = mintKey();
    setNote("");
    setHardFindings([]);
    onSubmitted();
  }

  if (policies.length === 0) return null;

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Request time off</h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="leave-policy">Leave type</Label>
          <Select
            value={policyId}
            onValueChange={(v) => {
              setPolicyId(v);
              setReasonCategoryId("");
              idempotencyKey.current = mintKey();
            }}
          >
            <SelectTrigger id="leave-policy">
              <SelectValue placeholder="Choose a leave type" />
            </SelectTrigger>
            <SelectContent>
              {policies.map((p) =>
                p.policyId ? (
                  <SelectItem key={p.policyId} value={p.policyId}>
                    {p.policyName ?? "Unnamed policy"}
                  </SelectItem>
                ) : null,
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="leave-starts-on">First day</Label>
          <Input
            id="leave-starts-on"
            type="date"
            value={startsOn}
            onChange={(e) => {
              setStartsOn(e.target.value);
              if (e.target.value > endsOn) setEndsOn(e.target.value);
              setDayHours({});
              idempotencyKey.current = mintKey();
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="leave-ends-on">Last day</Label>
          <Input
            id="leave-ends-on"
            type="date"
            min={startsOn}
            value={endsOn}
            onChange={(e) => {
              setEndsOn(e.target.value);
              setDayHours({});
              idempotencyKey.current = mintKey();
            }}
          />
        </div>

        <div className="flex flex-col justify-end gap-1.5">
          <div className="flex items-center gap-2 pb-2">
            <Switch
              id="leave-partial-day"
              checked={partialDay}
              onCheckedChange={enablePartialDay}
            />
            <Label htmlFor="leave-partial-day" className="cursor-pointer">
              Part of a day
            </Label>
          </div>
        </div>
      </div>

      {!datesValid ? (
        <p className="text-sm text-destructive">
          The last day is before the first day.
        </p>
      ) : null}

      {partialDay ? (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">
            Hours per day. Each is capped at what you were scheduled to work that day
            {incrementMinutes ? `, in ${incrementMinutes}-minute steps` : ""}.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(shownPreview?.span.days ?? [])
              .filter((d) => d.date && d.excluded !== true)
              .map((d) => (
                <div key={d.date} className="flex flex-col gap-1">
                  <Label htmlFor={`leave-part-${d.date}`} className="text-xs">
                    {d.date}
                  </Label>
                  <Input
                    id={`leave-part-${d.date}`}
                    type="number"
                    min={0}
                    step={incrementMinutes ? incrementMinutes / 60 : 0.25}
                    value={dayHours[d.date as string] ?? ""}
                    onChange={(e) =>
                      setDayHours((prev) => ({
                        ...prev,
                        [d.date as string]: e.target.value,
                      }))
                    }
                  />
                </div>
              ))}
          </div>
          {incrementProblem ? (
            <p className="text-sm text-destructive">{incrementProblem}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="leave-reason">
            Reason{reasonRequired ? "" : " (optional)"}
          </Label>
          <Select value={reasonCategoryId} onValueChange={setReasonCategoryId}>
            <SelectTrigger id="leave-reason">
              <SelectValue placeholder="Choose a reason" />
            </SelectTrigger>
            <SelectContent>
              {orderedReasons.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                  {c.mandated ? " — protected, no explanation needed" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          {/*
            §4.1: the form SAYS "optional" next to a sick-leave policy.
            "Never require an employee to type a diagnosis."
          */}
          <Label htmlFor="leave-note">Note (optional)</Label>
          <ProTextarea
            id="leave-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={
              isSickPolicy
                ? "Optional. You do not need to describe a medical condition."
                : "Anything your approver should know."
            }
          />
          {isSickPolicy ? (
            <p className="text-xs text-muted-foreground">
              This is optional. You never have to explain a medical condition here.
            </p>
          ) : null}
        </div>
      </div>

      {/* ── the live preview ─────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-3 rounded-md border border-border bg-textured p-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium text-foreground">What this will cost you</span>
          {previewLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />
          ) : null}
        </div>

        {previewRefusal ? (
          <p className="text-sm text-destructive">{previewRefusal}</p>
        ) : null}

        {!shownPreview && !previewRefusal ? (
          previewLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-72 max-w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Choose a leave type and your dates.
            </p>
          )
        ) : null}

        {shownPreview ? (
          <>
            {/* 🚨 THE SERVER'S SENTENCE, VERBATIM. */}
            {shownPreview.breakdownSentence ? (
              <p className="text-sm font-medium text-foreground">
                {shownPreview.breakdownSentence}
              </p>
            ) : null}

            <div className="overflow-x-auto rounded-md border border-border bg-card">
              <table className="w-full min-w-[26rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="px-3 py-1.5 font-medium text-muted-foreground">Day</th>
                    <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">
                      Hours
                    </th>
                    <th className="px-3 py-1.5 font-medium text-muted-foreground">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {shownPreview.span.days.map((d, i) => (
                    <tr
                      key={d.date ?? i}
                      className={cn(
                        "border-b border-border last:border-b-0",
                        /* An excluded day is EXCLUDED BECAUSE THE SERVER SAID SO — never
                           because hours happened to be zero. */
                        d.excluded === true ? "bg-muted/30 text-muted-foreground" : null,
                      )}
                    >
                      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">
                        {d.date ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                        {formatHours(d.hours) ?? "Not provided"}
                      </td>
                      <td className="px-3 py-1.5">
                        {d.excluded === true ? (
                          <span>
                            Excluded
                            {d.label ? ` — ${d.label}` : ""}
                          </span>
                        ) : d.partial === true ? (
                          "Part of a day"
                        ) : (
                          ""
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <LeaveBalanceBlock
              figures={shownPreview.figures}
              /* The request form's preview shows the SAME five figures as every other block. */
              sentence={null}
              ledgerHref={null}
            />

            {/*
              🚨 WHAT THIS REQUEST IS SPENT AGAINST — SAID BEFORE THE BUTTON, NOT AFTER (D3).

              Round 42: an employee with 24 hours available sent a 40-hour September request, got
              NO warning on this preview, was accepted silently, and then read `Available −16 h`
              on their own panel. The engine was right — `hr.leave_wf_validate` decides on the
              PROJECTED balance at the start date, and 40 hours were affordable by September — but
              nothing on this screen said which balance it was about to be judged against.

              The number was already here. `hr.leave_request_preview` makes the identical
              `hr.leave_project_balance(…, greatest(starts_on, current_date))` call the validator
              makes, and this block used to render only `projection.projectionNote`, which is
              non-null ONLY for policies that do not project at all. So on every accruing policy
              the engine's own figure was fetched and dropped.

              `projectionSentence` is the server's, verbatim (§5 — a client that composes policy
              prose is a second implementation of policy). It covers the not-projected case too,
              which is why `projectionNote` is no longer rendered separately: two lines saying the
              same thing is how they drift.
            */}
            {shownPreview.projectionSentence ? (
              <p className="rounded-md border border-border bg-card p-3 text-sm text-foreground">
                {shownPreview.projectionSentence}
              </p>
            ) : null}

            {/*
              The server's own wording, VERBATIM — it names what is missing (no shift, no
              standard hours) and what to do about it, which a generic "cannot submit" does not.
            */}
            {shownPreview.blocker ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-3"
              >
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                  aria-hidden
                />
                <p className="text-sm text-destructive/90">{shownPreview.blocker}</p>
              </div>
            ) : null}

            {shownPreview.documentationRequired === true ? (
              <div className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-sm">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <p className="text-muted-foreground">
                  This policy asks for documentation once a span runs longer than{" "}
                  {shownPreview.documentationRequiredAfterDays} days. You can file the request now;
                  HR will tell you what they need and how to send it privately. Nothing medical
                  is ever attached to your own documents.
                </p>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {policy && policy.blackoutRules.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-md border border-border p-3">
          <span className="text-xs font-medium text-muted-foreground">
            When this policy is restricted
          </span>
          {policy.blackoutRules.map((rule, i) => (
            <p key={rule.key ?? i} className="text-sm text-muted-foreground">
              {rule.label ?? rule.key ?? "A restricted window"}
              {rule.from && rule.to ? ` · ${rule.from} to ${rule.to}` : ""}
              {rule.note ? ` — ${rule.note}` : ""}
            </p>
          ))}
        </div>
      ) : null}

      {/* ── refusals ─────────────────────────────────────────────────────── */}
      {hardFindings.length > 0 ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-destructive bg-destructive/10 p-3"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
            <span className="text-sm font-semibold text-destructive">
              This request was not accepted.
            </span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {hardFindings.map((f, i) => (
              /* VERBATIM, WITH ITS NUMBERS. `f.code` is not rendered anywhere. */
              <li key={f.code ?? i} className="text-sm text-destructive/90">
                {f.message ??
                  "The check that stopped this did not say what it found. Ask an administrator to look at it."}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {submitRefusal ? (
        <p role="alert" className="text-sm text-destructive">
          {submitRefusal}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
          Send request
        </Button>
      </div>
    </section>
  );
}
