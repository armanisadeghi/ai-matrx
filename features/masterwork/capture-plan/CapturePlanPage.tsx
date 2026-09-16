"use client";

// features/masterwork/capture-plan/CapturePlanPage.tsx
//
// THE CAPTURE PLAN — the whole program on one screen.
//
// What the Expert sees, top to bottom, and nothing else:
//   1. the one session that is ready now, what it asks, and why the plan chose
//      it — with Start and "Not today" side by side;
//   2. the schedule;
//   3. what every method has actually produced for THIS Expert (the meta-asset);
//   4. what the plan is not using, and why each one is out;
//   5. the settings the plan is running under, and the rule that will end it.
//
// Numbers and lists, never paragraphs of explanation (Arman, 2026-09-12: a
// dashboard is data, not prose). Every sentence on this page is either the
// Expert's own goal, a method's one-line ask, or a fact with an arithmetic
// derivation behind it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import LoadingSpinner from "@/components/ui/loading-spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProTextarea } from "@/components/official/ProTextarea";
import { useAppStore } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import {
  fetchDistillationApproaches,
  type DistillationApproach,
} from "../browse/approaches";
import type { Rulebook } from "../types";
import { liveMethods, plannableMethod } from "./methods";
import {
  benchNote,
  buildPlan,
  chosenBecause,
  completeSession,
  emptyYield,
  nextSession,
  replan,
  skipSession,
} from "./planner";
import {
  mutatePlan,
  planOf,
  reconcileReminders,
  type ReminderOutcome,
} from "./service";
import {
  OpenSessionButton,
  SessionHost,
  resolveSessionDoor,
} from "./SessionHost";
import {
  readCapturePlan,
  yieldOfRuleIds,
  type Cadence,
  type CapturePlanState,
  type PlanSession,
  type PlanSettings,
  type ReminderChannel,
  type StopRule,
} from "./types";
import { useCapturePlanSettings } from "./useCapturePlanSettings";

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `cp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const CADENCE_WORDS: Record<Cadence, string> = {
  daily: "Every day",
  weekdays: "Weekdays only",
  every_other_day: "Every other day",
  weekly: "Once a week",
};

const CHANNEL_WORDS: Record<ReminderChannel, string> = {
  preferences: "However you normally get notifications",
  in_app: "In AI Matrx only",
  email: "Email",
  sms: "Text message",
  off: "Don't remind me",
};

const STOP_WORDS: Record<StopRule, string> = {
  either: "When it stops paying, or when I've got what I came for",
  yield_flat: "Only when it stops paying",
  coverage_met: "Only when I've got what I came for",
  horizon_only: "Run the whole time, whatever happens",
};

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (dayKey(iso) === today.toISOString().slice(0, 10)) return "Today";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * The session the Expert opened and has not yet logged.
 *
 * 🚨 `localStorage`, NOT `sessionStorage`. A page lane (the interview, the
 * triad game, the probe) is a whole screen, and an Expert who opens one and
 * comes back in a different tab would otherwise find the plan with no memory
 * that they had ever started — the session still sitting there as "ready now"
 * with the rules it produced counted against nothing. Found while driving this
 * live on 2026-09-15. Per browser, per Rulebook; every read and write is
 * wrapped, because a private window is not a reason to break the plan.
 */
function openKey(rulebookId: string) {
  return `matrx.capture-plan.open.${rulebookId}`;
}

interface OpenSessionMark {
  sessionId: string;
  ruleIdsBefore: string[];
  openedAt: string;
}

function readOpenMark(rulebookId: string): OpenSessionMark | null {
  try {
    const raw = localStorage.getItem(openKey(rulebookId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OpenSessionMark;
    return parsed && typeof parsed.sessionId === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeOpenMark(rulebookId: string, mark: OpenSessionMark | null) {
  try {
    if (mark) localStorage.setItem(openKey(rulebookId), JSON.stringify(mark));
    else localStorage.removeItem(openKey(rulebookId));
  } catch {
    /* a private window is not a reason to break the plan */
  }
}

export function CapturePlanPage({
  rulebook,
  canEdit,
  setRulebook,
  reload,
}: {
  rulebook: Rulebook;
  canEdit: boolean;
  setRulebook: (rulebook: Rulebook) => void;
  reload: () => void;
}) {
  const store = useAppStore();
  const settings = useCapturePlanSettings(rulebook.id, rulebook.organization_id);
  const [approaches, setApproaches] = useState<DistillationApproach[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reminder, setReminder] = useState<ReminderOutcome | null>(null);
  const [refusalOpen, setRefusalOpen] = useState(false);
  const [hostSessionId, setHostSessionId] = useState<string | null>(null);
  const [openMark, setOpenMark] = useState<OpenSessionMark | null>(null);
  const markLoaded = useRef(false);

  const state = useMemo<CapturePlanState>(
    () => readCapturePlan(rulebook.metadata),
    [rulebook.metadata],
  );
  const plan = state.plan;

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const rows = await fetchDistillationApproaches();
        if (live) setApproaches(rows);
      } catch (error) {
        if (live) {
          setCatalogError(
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (markLoaded.current) return;
    markLoaded.current = true;
    setOpenMark(readOpenMark(rulebook.id));
  }, [rulebook.id]);

  const live = useMemo(() => {
    if (!approaches) return null;
    const allowed = plan?.settings.methodsAllowed ??
      (settings.state === "ready" ? settings.defaults.methodsAllowed : "all");
    return liveMethods(approaches, allowed);
  }, [approaches, plan, settings]);

  const approachByKey = useMemo(() => {
    const map = new Map<string, DistillationApproach>();
    for (const a of approaches ?? []) map.set(a.key, a);
    return map;
  }, [approaches]);

  // ── writes ────────────────────────────────────────────────────────────────

  const save = useCallback(
    async (
      transform: (s: CapturePlanState) => CapturePlanState,
      afterward?: (s: CapturePlanState) => Promise<void>,
    ) => {
      setBusy(true);
      try {
        const result = await mutatePlan(rulebook.id, transform);
        if (result.status === "conflict") {
          toast.error(
            "Somebody else changed this Rulebook while you were working. Reload and try again.",
          );
          return null;
        }
        if (result.status === "not_found") {
          toast.error("This Rulebook is gone.");
          return null;
        }
        setRulebook(result.rulebook);
        if (afterward) await afterward(result.state);
        return result.state;
      } finally {
        setBusy(false);
      }
    },
    [rulebook.id, setRulebook],
  );

  const pushReminders = useCallback(
    async (s: CapturePlanState) => {
      if (!s.plan) return;
      const outcome = await reconcileReminders(store, {
        rulebookId: rulebook.id,
        rulebookName: rulebook.name,
        planId: s.plan.id,
        sessions: s.plan.sessions,
        channel: s.plan.settings.reminderChannel,
        leadMinutes: s.plan.settings.reminderLeadMinutes,
        horizonHours: s.plan.settings.reminderHorizonHours,
      });
      setReminder(outcome);
    },
    [rulebook.id, rulebook.name, store],
  );

  // ── setup ─────────────────────────────────────────────────────────────────

  /**
   * 🚨 THE GOAL STARTS AS THE EXPERT'S OWN WORDS, not as an example of somebody
   * else's job (jobs-bar-2026-09-16, item 1). The field used to open empty
   * behind a placeholder that read like a finished answer — "How I decide what a
   * commercial teardown is worth…" — on a Masterwork about e-waste pallets. A
   * first-timer reads a grey sentence in a box as something already filled in,
   * presses the only button on the screen, and nothing happens, because the
   * button is dead until the box has real text and the placeholder is not text.
   * The Masterwork's own description is the sentence the Expert already wrote
   * for exactly this question, so the plan starts from it and stays editable.
   */
  const [goal, setGoal] = useState(() => rulebook.description?.trim() ?? "");
  const [minutesPerDay, setMinutesPerDay] = useState(30);
  const [cadence, setCadence] = useState<Cadence | null>(null);
  const [channel, setChannel] = useState<ReminderChannel | null>(null);
  const [stopRule, setStopRule] = useState<StopRule | null>(null);
  const [horizonDays, setHorizonDays] = useState<number | null>(null);
  const [buildRefusal, setBuildRefusal] = useState<string | null>(null);

  const startPlan = useCallback(async () => {
    if (settings.state !== "ready" || !approaches) return;
    const merged: PlanSettings = {
      ...settings.defaults,
      cadence: cadence ?? settings.defaults.cadence,
      reminderChannel: channel ?? settings.defaults.reminderChannel,
      stopRule: stopRule ?? settings.defaults.stopRule,
      horizonDays: horizonDays ?? settings.defaults.horizonDays,
      minutesPerDay,
    };
    const built = buildPlan({
      goal,
      settings: merged,
      approaches,
      yields: state.yields,
      rules: rulebook.rules,
      now: new Date(),
      newId,
    });
    if (!built.ok) {
      setBuildRefusal(built.reason);
      setRefusalOpen(true);
      return;
    }
    setBuildRefusal(null);
    await save(
      (s) => ({ ...s, plan: built.plan }),
      pushReminders,
    );
  }, [
    settings,
    approaches,
    cadence,
    channel,
    stopRule,
    horizonDays,
    minutesPerDay,
    goal,
    state.yields,
    rulebook.rules,
    save,
    pushReminders,
  ]);

  // ── running a session ─────────────────────────────────────────────────────

  const next = useMemo(() => nextSession(plan), [plan]);
  const nextDoor = useMemo(
    () =>
      next ? resolveSessionDoor(approachByKey.get(next.method), rulebook.id) : null,
    [next, approachByKey, rulebook.id],
  );

  const markOpen = useCallback(
    (session: PlanSession) => {
      const mark: OpenSessionMark = {
        sessionId: session.id,
        ruleIdsBefore: rulebook.rules.map((r) => r.id),
        openedAt: new Date().toISOString(),
      };
      writeOpenMark(rulebook.id, mark);
      setOpenMark(mark);
    },
    [rulebook.id, rulebook.rules],
  );

  const logSession = useCallback(
    async (mark: OpenSessionMark, session: PlanSession) => {
      const before = new Set(mark.ruleIdsBefore);
      const produced = rulebook.rules
        .map((r) => r.id)
        .filter((id) => !before.has(id));
      const minutes = Math.max(
        1,
        Math.round(
          (Date.now() - new Date(mark.openedAt).getTime()) / 60_000,
        ),
      );
      const now = new Date();
      const saved = await save(
        (s) => {
          const done = completeSession({
            state: s,
            sessionId: session.id,
            ruleIds: produced,
            minutes: Math.min(minutes, session.plannedMinutes * 4),
            rules: rulebook.rules,
            now,
          });
          if (!approaches) return done;
          return replan({ state: done, approaches, rules: rulebook.rules, now, newId })
            .state;
        },
        pushReminders,
      );
      writeOpenMark(rulebook.id, null);
      setOpenMark(null);
      if (saved) {
        toast.success(
          produced.length > 0
            ? `${produced.length} new rule${produced.length === 1 ? "" : "s"} logged against ${session.method.replace(/_/g, " ")}. The plan is updated.`
            : `Nothing came of that one. ${session.method.replace(/_/g, " ")} drops down the order.`,
        );
      }
    },
    [rulebook.rules, rulebook.id, save, approaches, pushReminders],
  );

  const notToday = useCallback(
    async (session: PlanSession) => {
      const now = new Date();
      await save(
        (s) => {
          const skipped = skipSession({ state: s, sessionId: session.id, now });
          if (!approaches) return skipped;
          return replan({ state: skipped, approaches, rules: rulebook.rules, now, newId })
            .state;
        },
        pushReminders,
      );
      writeOpenMark(rulebook.id, null);
      setOpenMark(null);
      toast.success("Moved on. Nothing is held against that method.");
    },
    [save, approaches, rulebook.rules, rulebook.id, pushReminders],
  );

  const endPlan = useCallback(async () => {
    const now = new Date();
    await save(
      (s) =>
        s.plan
          ? {
              ...s,
              plan: {
                ...s.plan,
                sessions: s.plan.sessions.filter((x) => x.status !== "scheduled"),
                status: "stopped",
                stopReason: "ended_by_expert",
                stoppedAt: now.toISOString(),
              },
            }
          : s,
      pushReminders,
    );
  }, [save, pushReminders]);

  // ── render ────────────────────────────────────────────────────────────────

  if (settings.state === "loading" || !approaches) {
    if (catalogError) {
      return (
        <Refusal
          title="We could not read the catalog of methods"
          body={catalogError}
        />
      );
    }
    return (
      <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
        <LoadingSpinner /> Reading your settings and the catalog of methods…
      </div>
    );
  }
  if (settings.state === "failed") {
    return (
      <Refusal
        title="We could not read this plan's settings"
        body={`${settings.reason} Nothing is guessed — the plan waits until the settings can be read.`}
        action={<Button size="sm" onClick={settings.retry}>Try again</Button>}
      />
    );
  }

  const openSession =
    openMark && plan
      ? plan.sessions.find((s) => s.id === openMark.sessionId) ?? null
      : null;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 pb-16 pt-4">
      {!plan || plan.status !== "active" ? (
        <>
          {plan && plan.status !== "active" ? (
            <EndedPlan state={state} rulebook={rulebook} />
          ) : null}
          <section className="rounded-lg border p-4">
            <h2 className="text-base font-semibold">
              {plan ? "Start another plan" : "Tell us two things"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              What you want covered, and how much time you can give. We do the
              rest — the method, the schedule, the reminder, and dropping
              whatever stops paying.
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <Label htmlFor="cp-goal">What do you want covered?</Label>
                <ProTextarea
                  id="cp-goal"
                  value={goal}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setGoal(e.target.value)
                  }
                  placeholder="In one sentence: the call you want this to cover."
                  rows={3}
                  enableVoice={settings.voiceDefaultOn}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {rulebook.description
                    ? "Filled in from what you wrote when you started this Masterwork. Change it to anything you like."
                    : "One sentence is enough — the call you make most often, or the one people get wrong."}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="cp-minutes">Minutes you can give a day</Label>
                  {/* A PLAIN NUMBER FIELD, not `FancyInput` — that primitive
                      always paints a "Copy to clipboard" button inside itself,
                      which on a field holding "30" is a control with no purpose
                      that also sits in the keyboard tab order between every
                      other field on this form (jobs-bar-2026-09-16, item 3). */}
                  <Input
                    id="cp-minutes"
                    type="number"
                    min={3}
                    max={480}
                    value={minutesPerDay}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setMinutesPerDay(Math.max(1, Number(e.target.value) || 0))
                    }
                  />
                </div>
                <Picker
                  id="cp-cadence"
                  label="How often"
                  value={cadence ?? settings.defaults.cadence}
                  onChange={(v) => setCadence(v as Cadence)}
                  options={Object.entries(CADENCE_WORDS)}
                />
                <Picker
                  id="cp-channel"
                  label="Remind me"
                  value={channel ?? settings.defaults.reminderChannel}
                  onChange={(v) => setChannel(v as ReminderChannel)}
                  options={Object.entries(CHANNEL_WORDS)}
                />
                <Picker
                  id="cp-stop"
                  label="Stop the plan"
                  value={stopRule ?? settings.defaults.stopRule}
                  onChange={(v) => setStopRule(v as StopRule)}
                  options={Object.entries(STOP_WORDS)}
                />
                <div>
                  <Label htmlFor="cp-horizon">For how many days at most</Label>
                  <Input
                    id="cp-horizon"
                    type="number"
                    min={1}
                    max={90}
                    value={horizonDays ?? settings.defaults.horizonDays}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setHorizonDays(Math.max(1, Number(e.target.value) || 0))
                    }
                  />
                </div>
              </div>
              {buildRefusal ? (
                <Refusal title="The plan refused to start" body={buildRefusal} />
              ) : null}
              {/* STACKS ON A PHONE. Side by side at 390px the helper sentence
                  squeezed the button until its own label was clipped —
                  "Build my plan" with the "n" cut off (jobs-bar item 2). */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <Button
                  className="w-full sm:w-auto"
                  onClick={startPlan}
                  disabled={!canEdit || busy || goal.trim().length < 5}
                >
                  {busy ? (
                    <>
                      <LoadingSpinner size="sm" />
                      Building your plan…
                    </>
                  ) : (
                    "Build my plan"
                  )}
                </Button>
                {goal.trim().length < 5 ? (
                  <span className="text-xs text-muted-foreground">
                    Say what you want covered first — one sentence is enough.
                  </span>
                ) : null}
              </div>
            </div>
          </section>
          {live ? <MethodsLeftOut live={live} open={refusalOpen} /> : null}
          <MethodLedger state={state} rulebook={rulebook} />
        </>
      ) : (
        <>
          <header className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">{plan.goal}</h2>
              {/* 🚨 NOT A VERSION NUMBER (jobs-bar-2026-09-16, item 28). This
                  printed "Plan v1" on every plan from the moment it was built.
                  `protocolVersion` bumps each time the planner REPLANS — so on
                  a new plan the badge says nothing at all, and on a replanned
                  one it says it in a developer's notation. Say the fact, and
                  only when there is a fact to say. */}
              {plan.protocolVersion > 1 ? (
                <Badge variant="secondary">
                  Rescheduled {plan.protocolVersion - 1}{" "}
                  {plan.protocolVersion - 1 === 1 ? "time" : "times"} as it
                  learned
                </Badge>
              ) : null}
              <Badge variant="outline">
                {CADENCE_WORDS[plan.settings.cadence]} · {plan.settings.minutesPerDay} min
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {STOP_WORDS[plan.settings.stopRule]} · at most {plan.settings.horizonDays} days ·
              reminders: {CHANNEL_WORDS[plan.settings.reminderChannel].toLowerCase()}
            </p>
          </header>

          {reminder?.problem ? (
            <Refusal title="About the reminders" body={reminder.problem} />
          ) : null}

          {openSession ? (
            <section className="rounded-lg border border-blue-300 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/30">
              <h3 className="text-sm font-semibold">
                You opened “{methodName(openSession.method)}”.
              </h3>
              <p className="mt-1 text-sm">
                {countNew(openMark!, rulebook) === 1
                  ? "1 new rule has"
                  : `${countNew(openMark!, rulebook)} new rules have`}{" "}
                appeared in this Rulebook since. Log it and the plan works out
                what comes next.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void logSession(openMark!, openSession)}
                >
                  Log it
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void notToday(openSession)}
                >
                  I didn&apos;t get to it
                </Button>
              </div>
            </section>
          ) : next ? (
            <section className="rounded-lg border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {dueNow(next) ? "Ready now" : whenReady(next)} ·{" "}
                  {methodName(next.method)}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {next.plannedMinutes} minutes · session {next.seq}
                </span>
              </div>
              <p className="mt-2 text-sm">
                {plannableMethod(next.method)?.ask ?? "Your next session."}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Why this one: {next.chosenBecause}
              </p>
              {plannableMethod(next.method)?.bringsMaterial ? (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  Have something of yours to hand before you start.
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {nextDoor ? (
                  <OpenSessionButton
                    door={nextDoor}
                    label={`Start · ${next.plannedMinutes} min`}
                    disabled={!canEdit || busy}
                    onOpenDialog={() => {
                      markOpen(next);
                      setHostSessionId(next.id);
                    }}
                    onNavigating={() => markOpen(next)}
                  />
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canEdit || busy}
                  onClick={() => void notToday(next)}
                >
                  Not today
                </Button>
                <span className="text-xs text-muted-foreground">
                  {dueNow(next)
                    ? "Nothing expires — a session waits until you open it."
                    : "Nothing expires, and nothing stops you doing it early."}
                </span>
              </div>
            </section>
          ) : (
            <Refusal
              title="Nothing is scheduled"
              body="Every remaining slot has been used or moved. The plan will schedule more the next time it runs its numbers."
            />
          )}

          <Schedule plan={plan} rulebook={rulebook} />
          <MethodLedger state={state} rulebook={rulebook} />
          {live ? <MethodsLeftOut live={live} open={false} /> : null}

          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              disabled={!canEdit || busy}
              onClick={() => void endPlan()}
            >
              End this plan
            </Button>
          </div>
        </>
      )}

      {hostSessionId && next && nextDoor && hostSessionId === next.id ? (
        <SessionHost
          door={nextDoor}
          rulebook={rulebook}
          canEdit={canEdit}
          onClosed={() => setHostSessionId(null)}
          onProduced={() => {
            setHostSessionId(null);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🚨 THE CARD NEVER SAYS "READY NOW" ABOUT A SESSION SCHEDULED FOR TOMORROW.
 *
 * Found live on 2026-09-15: after "Not today" filled the current day, the next
 * session was Wednesday's and the card still read "Ready now". Nothing expires
 * and an Expert with a spare ten minutes is welcome to do it early, so the
 * button stays — but the heading says WHEN, because a screen is honest or it is
 * a defect.
 */
function dueNow(session: PlanSession): boolean {
  return new Date(session.dueAt).getTime() <= Date.now();
}

function whenReady(session: PlanSession): string {
  const label = dayLabel(session.dueAt);
  return label === "Today" ? "Later today" : label;
}

function methodName(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function countNew(mark: OpenSessionMark, rulebook: Rulebook): number {
  const before = new Set(mark.ruleIdsBefore);
  return rulebook.rules.filter((r) => !before.has(r.id)).length;
}

/**
 * 🚨 A LABEL THAT IS ONLY PAINTED IS NOT A LABEL (jobs-bar-2026-09-16, item 4).
 * These three pickers carried a `<Label>` with nothing tying it to the control,
 * so a screen reader announced "How often" as loose text and then an unnamed
 * combobox — three of them in a row, indistinguishable. `id` + `htmlFor` is the
 * whole fix, and it also makes the words a click target for the control.
 *
 * And the TRIGGER WRAPS. Every one of these answers is a sentence in the
 * Expert's own language ("When it stops paying, or when I've got what I came
 * for"), and a one-line trigger cut it to "…or when I've got w" — a setting the
 * Expert cannot read is a setting the Expert did not choose.
 */
function Picker({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          className="h-auto min-h-10 items-start whitespace-normal py-2 text-left [&>span]:line-clamp-none [&>span]:whitespace-normal"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([key, word]) => (
            <SelectItem key={key} value={key}>
              {word}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Refusal({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/30">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 whitespace-pre-line text-sm">{body}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </section>
  );
}

function Schedule({ plan, rulebook }: { plan: NonNullable<CapturePlanState["plan"]>; rulebook: Rulebook }) {
  const days = useMemo(() => {
    const map = new Map<string, PlanSession[]>();
    for (const s of [...plan.sessions].sort(
      (a, b) => a.dueAt.localeCompare(b.dueAt) || a.seq - b.seq,
    )) {
      const key = dayKey(s.dueAt);
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()];
  }, [plan.sessions]);

  return (
    <section className="rounded-lg border">
      <h3 className="border-b px-4 py-2 text-sm font-semibold">The schedule</h3>
      <div className="divide-y">
        {days.map(([key, sessions]) => (
          <div key={key} className="px-4 py-2">
            <div className="text-xs font-medium text-muted-foreground">
              {dayLabel(sessions[0].dueAt)} ·{" "}
              {sessions.reduce((n, s) => n + s.plannedMinutes, 0)} min
            </div>
            <ul className="mt-1 space-y-1">
              {sessions.map((s) => {
                const tally = yieldOfRuleIds(s.ruleIds, rulebook.rules);
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm"
                  >
                    <span className="w-6 text-xs text-muted-foreground">{s.seq}</span>
                    <span className="font-medium">{methodName(s.method)}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.plannedMinutes} min
                    </span>
                    {s.status === "completed" ? (
                      <Badge variant={s.ruleIds.length ? "default" : "outline"}>
                        {s.ruleIds.length
                          ? `${s.ruleIds.length} rules · ${tally.approved} kept`
                          : "nothing"}
                      </Badge>
                    ) : s.status === "skipped" ? (
                      <Badge variant="outline">moved</Badge>
                    ) : (
                      /* 🚨 WHAT THIS SESSION WILL ASK ME, not why the planner
                         picked it (jobs-bar-2026-09-16, item 6). Every one of
                         the thirty-two rows printed the SAME sentence — "You
                         have not tried this one yet, so the plan is finding out
                         what it gives you" — because on a fresh plan that is
                         true of all of them. Thirty-two identical lines is
                         wallpaper: it tells the Expert nothing, and it buries
                         the only thing she wants from a schedule, which is what
                         each day actually asks of her. The reason the planner
                         chose one lives on the "Ready now" card, once, where it
                         is about a decision she is being asked to make today.
                         `ask` is already authored for every plannable method in
                         `methods.ts` — it was simply never shown here. */
                      <span className="text-xs text-muted-foreground">
                        {plannableMethod(s.method)?.ask ?? s.chosenBecause}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * THE META-ASSET, on screen. Doctrine CORE.md §5: "the elicitation protocol is
 * itself a versioned, scored artifact". This table IS that artifact for one
 * Expert, and the bench note says plainly which half of the doctrine's unit
 * (load-bearing rules per expert-hour) we can actually measure today.
 */
function MethodLedger({
  state,
  rulebook,
}: {
  state: CapturePlanState;
  rulebook: Rulebook;
}) {
  const rows = useMemo(
    () =>
      Object.values(state.yields).sort(
        (a, b) => b.ruleIds.length - a.ruleIds.length || a.method.localeCompare(b.method),
      ),
    [state.yields],
  );
  if (rows.length === 0) {
    return (
      <section className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
        Nothing measured yet. After your first session this table shows what each
        method actually produces for you, and the plan starts spending your time
        accordingly. Build a plan above and the first session is waiting at the
        top of this page.
      </section>
    );
  }
  return (
    <section className="rounded-lg border">
      <h3 className="border-b px-4 py-2 text-sm font-semibold">
        What each method gives you
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-1.5 text-left font-medium">Method</th>
              <th className="px-2 py-1.5 text-right font-medium">Sessions</th>
              <th className="px-2 py-1.5 text-right font-medium">Minutes</th>
              <th className="px-2 py-1.5 text-right font-medium">Rules</th>
              <th className="px-2 py-1.5 text-right font-medium">Kept</th>
              <th className="px-2 py-1.5 text-right font-medium">Kept / hour</th>
              <th className="px-4 py-1.5 text-left font-medium">Standing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const tally = yieldOfRuleIds(row.ruleIds, rulebook.rules);
              const perHour =
                row.minutes > 0 ? (tally.approved / (row.minutes / 60)).toFixed(1) : "—";
              return (
                <tr key={row.method} className="border-b last:border-0">
                  <td className="px-4 py-1.5">{methodName(row.method)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{row.sessions}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{row.minutes}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{tally.drafted}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{tally.approved}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{perHour}</td>
                  <td className="px-4 py-1.5 text-xs">
                    {row.dropped ? (
                      <span className="text-amber-700 dark:text-amber-400">
                        Dropped — {row.droppedReason}
                      </span>
                    ) : plannableMethod(row.method)?.deferredYield ? (
                      <>Pays later — rules appear when the cases land</>
                    ) : row.zeroYieldStreak > 0 ? (
                      <>One empty session; one more go before it is dropped.</>
                    ) : (
                      <>In the rotation</>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t px-4 py-2 text-xs text-muted-foreground">
        {benchNote(false)}
      </p>
    </section>
  );
}

function MethodsLeftOut({
  live,
  open,
}: {
  live: NonNullable<ReturnType<typeof liveMethods>>;
  open: boolean;
}) {
  const [show, setShow] = useState(open);
  useEffect(() => {
    if (open) setShow(true);
  }, [open]);
  if (live.refused.length === 0) return null;
  return (
    <section className="rounded-lg border">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-2 text-left text-sm font-semibold"
        onClick={() => setShow((v) => !v)}
      >
        <span>
          {live.methods.length} method{live.methods.length === 1 ? "" : "s"} in
          use · {live.refused.length} left out
        </span>
        <span className="text-xs font-normal text-muted-foreground">
          {show ? "Hide" : "Why?"}
        </span>
      </button>
      {show ? (
        <ul className="divide-y border-t">
          {live.refused.map((r) => (
            <li key={r.method} className="px-4 py-2 text-sm">
              <span className="font-medium">{methodName(r.method)}</span>
              <span className="ml-2 text-muted-foreground">{r.why}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function EndedPlan({
  state,
  rulebook,
}: {
  state: CapturePlanState;
  rulebook: Rulebook;
}) {
  const plan = state.plan!;
  const completed = plan.sessions.filter((s) => s.status === "completed");
  const allIds = completed.flatMap((s) => s.ruleIds);
  const tally = yieldOfRuleIds(allIds, rulebook.rules);
  const said =
    plan.stopReason === "coverage_met"
      ? `You approved ${tally.approved} rules from this plan — what you were aiming for.`
      : plan.stopReason === "yield_flat"
        ? "The last few sessions produced nothing at all, so the plan stopped rather than keep asking."
        : plan.stopReason === "no_methods_left"
          ? "Every method this plan could use had been dropped for producing nothing."
          : plan.stopReason === "horizon_reached"
            ? "The plan reached the end of the time it was set to run for."
            : "You ended this plan.";
  return (
    <section className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{plan.goal}</h2>
        <Badge variant="outline">
          {plan.status === "completed" ? "Done" : "Stopped"}
        </Badge>
      </div>
      <p className="mt-1 text-sm">{said}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {completed.length} session{completed.length === 1 ? "" : "s"} ·{" "}
        {completed.reduce((n, s) => n + s.plannedMinutes, 0)} minutes ·{" "}
        {tally.drafted} rules produced · {tally.approved} kept ·{" "}
        {tally.waiting} still waiting on you
      </p>
    </section>
  );
}
