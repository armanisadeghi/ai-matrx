// features/flashcards/fast-fire/components/FastFireSetup.tsx
//
// The setup screen (REQUIREMENTS §2.1): pick a real fc_set, seconds-per-card,
// card count, and live-score vs summary. The set picker reads real sets from
// `fcService.listSets` (hard-requirement #7) — no hardcoded deck. "Start" warms
// the mic + opens the session inside the click gesture (one mic prompt).
//
// React Compiler is on: no manual memo.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Flame,
  Clock,
  Bell,
  Hash,
  Gauge,
  AlertCircle,
  Mic,
  Headphones,
  ChevronDown,
  ChevronRight,
  Keyboard,
  Plus,
  History,
  Volume2,
  Loader2,
  CheckCircle2,
  Zap,
  HelpCircle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fcService } from "@/features/flashcards/data/fcService";
import type { FcSetRow } from "@/features/flashcards/data/types";
import { MediaDevicesPanel } from "@/features/audio/components/devices/MediaDevicesPanel";
import { useAudioDevices } from "@/features/audio/useAudioDevices";
import { restoreFromTrash } from "@/features/trash/service";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { updateConfig } from "../redux/fastFireSlice";
import {
  DRILL_CONFIG_BOUNDS,
  DEFAULT_DRILL_CONFIG,
  maxVoiceAnswerSeconds,
} from "../drill-config";
import { selectFastFireConfig } from "../redux/fastFire.selectors";
import { useFastFireLauncher } from "../hooks/useFastFireLauncher";
import {
  StudyOrganizationHoldNotice,
  useHeldStudyStart,
  useStudyOrganizationReady,
} from "@/features/education/study/components/StudyOrganizationGate";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { EntitlementMeter } from "@/features/entitlements/components/EntitlementMeter";
import {
  ensureSpokenFrontsForSet,
  getSpokenFrontReadiness,
} from "../spoken-front/generateSpokenFront.thunk";
import {
  ensureHelperAudioForSet,
  getHelperAudioReadiness,
} from "../helper-audio/generateHelperAudio.thunk";
import { FastFireSetPicker } from "./FastFireSetPicker";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import { loadFastFireSets } from "./fastfire-initial-load";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export function FastFireSetup() {
  const dispatch = useAppDispatch();
  // COPPA runs BEFORE the entitlement gate and BEFORE any AI work, once per
  // session — never per card, which would stall the timed loop. A blocked
  // learner is told here, with the one-tap way to fix it, instead of speaking
  // through a whole drill whose every grade is refused server-side.
  const coppa = useAiComplianceGate();
  const config = useAppSelector(selectFastFireConfig);
  const orgReady = useStudyOrganizationReady();
  const { start, starting, startError } = useFastFireLauncher({
    enabled: orgReady,
  });
  // FastFire grades every spoken answer with AI — meter the live_grade
  // capability once at session start (a per-card check would stall the timed
  // loop). The limit shows on the setup screen; a cap opens the paywall.
  const liveGrade = useEntitlementGuard("education.live_grade");

  const [sets, setSets] = useState<FcSetRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [setsAttempt, setSetsAttempt] = useState(0);
  // Device-check gate (Zoom/Meet style): confirm + test mic/speaker BEFORE the
  // drill. Open by default so the learner sees it; reuses the shared
  // MediaDevicesPanel (the same component the avatar-menu window opens).
  const [showDevices, setShowDevices] = useState(true);
  // Spoken-front prep (TTS): generated ON-DEMAND here (a pre-step, so the mic-warm
  // in the Start gesture stays in-gesture). Cached after — instant on later runs.
  const [prepping, setPrepping] = useState(false);
  const [prepProgress, setPrepProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [prepDone, setPrepDone] = useState(false);
  // The persisted-readiness reads say their failure instead of "not prepared".
  const [prepReadError, setPrepReadError] = useState<unknown>(null);
  const [helpReadError, setHelpReadError] = useState<unknown>(null);

  const prepareAudio = async (): Promise<void> => {
    if (!config.setId) return;
    if (!(await coppa.ensureAllowed())) return;
    setPrepping(true);
    setPrepDone(false);
    setPrepProgress(null);
    setPrepReadError(null);
    try {
      let total = 0;
      const result = await dispatch(
        ensureSpokenFrontsForSet(config.setId, (done, t) => {
          total = t;
          setPrepProgress({ done, total: t });
        }),
      );
      // Same honesty rule as instant help: done counts what persisted.
      const ready = Object.keys(result).length;
      setPrepProgress({ done: ready, total });
      setPrepDone(total > 0 && ready >= total);
      if (ready < total) {
        toast.error(
          `Question audio ready for ${ready} of ${total} cards — the rest failed; try again.`,
        );
      }
    } finally {
      setPrepping(false);
    }
  };

  // Instant-help prep (Q15 zero-wait lane): pre-write + pre-record each card's
  // "I'm confused" explanation so mid-drill help plays with NO wait. Same
  // on-demand + durable-cache contract as the spoken fronts above.
  const [helpPrepping, setHelpPrepping] = useState(false);
  const [helpPrepProgress, setHelpPrepProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [helpPrepDone, setHelpPrepDone] = useState(false);

  // The instant-help batch is one `education.card_enrichment` spend per
  // missing card (capability enforced 2026-08-22) — guard before the batch,
  // commit the real generated count after success.
  const enrichGuard = useEntitlementGuard("education.card_enrichment");

  const prepareHelpAudio = async (): Promise<void> => {
    const setId = config.setId;
    if (!setId) return;
    if (!(await coppa.ensureAllowed())) return;
    await enrichGuard.guard(async () => {
      setHelpPrepping(true);
      setHelpPrepDone(false);
      const before = helpPrepProgress?.done ?? 0;
      setHelpPrepProgress(null);
      setHelpReadError(null);
      try {
        let total = 0;
        let unusableSentence: string | null = null;
        const result = await dispatch(
          ensureHelperAudioForSet(
            setId,
            (done, t) => {
              total = t;
              setHelpPrepProgress({ done, total: t });
            },
            (sentence) => {
              unusableSentence = sentence;
            },
          ),
        );
        // Done means DONE — count what actually persisted, never the attempts.
        const ready = Object.keys(result).length;
        const generated = Math.max(ready - before, 0);
        if (generated > 0) await enrichGuard.commit({ quantity: generated });
        setHelpPrepProgress({ done: ready, total });
        setHelpPrepDone(total > 0 && ready >= total);
        if (ready < total) {
          toast.error(
            unusableSentence
              ? `Instant help ready for ${ready} of ${total} cards — ${unusableSentence}`
              : `Instant help ready for ${ready} of ${total} cards — the rest failed; try again.`,
            unusableSentence ? { duration: 10000 } : undefined,
          );
        }
      } finally {
        setHelpPrepping(false);
      }
    });
  };

  // Reflect the PERSISTED helper-audio state when a set is (re)selected — same
  // never-look-unprepared contract as the spoken fronts below.
  useEffect(() => {
    const setId = config.setId;
    if (!setId) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const { ready, total } = await getHelperAudioReadiness(setId);
        if (cancelled) return;
        setHelpReadError(null);
        setHelpPrepProgress({ done: ready, total });
        setHelpPrepDone(total > 0 && ready >= total);
      } catch (e) {
        if (!cancelled) setHelpReadError(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.setId]);

  // Reflect the PERSISTED spoken-front state when a set is (re)selected — the
  // audio is cached durably in fc_detail, so returning to a prepared set must
  // show "Audio ready", never look un-prepared (which would scare the user into
  // an expensive re-run). Re-generation only ever touches cards still missing it.
  useEffect(() => {
    // Only meaningful when a set is chosen + voice is on (the prepare section is
    // hidden otherwise, so stale flags never show). All setState is post-await.
    const setId = config.setId;
    if (!setId || !config.spokenFronts) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const { ready, total } = await getSpokenFrontReadiness(setId);
        if (cancelled) return;
        setPrepReadError(null);
        setPrepProgress({ done: ready, total });
        setPrepDone(total > 0 && ready >= total);
      } catch (e) {
        if (!cancelled) setPrepReadError(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.setId, config.spokenFronts]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await loadFastFireSets((signal) =>
        fcService.listSets({ signal }),
      );
      if (cancelled) return;
      if (res.error) {
        setLoadError(res.error);
        setSets([]);
        return;
      }
      setSets(res.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [setsAttempt]);

  const retrySetsLoad = () => {
    // A retry is initiated by the learner. Reset here, not inside the effect,
    // so the request effect only synchronizes its eventual result.
    setLoadError(null);
    setSets(null);
    setSetsAttempt((attempt) => attempt + 1);
  };

  const selectedSet = sets?.find((s) => s.id === config.setId) ?? null;

  // ANSWER MODE (page-pass 2026-09-27). Voice needs a microphone the browser
  // will give us; when there is none, or the person blocked it for this site,
  // the Voice choice is absent (never a button that fails) and the drill is
  // answered by typing.
  const { permissionState: micPermission } = useAudioDevices();
  const micSupported =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function";
  const voicePossible = micSupported && micPermission !== "denied";
  const typed = config.answerMode === "typed" || !voicePossible;
  useEffect(() => {
    if (!voicePossible && config.answerMode !== "typed")
      dispatch(updateConfig({ answerMode: "typed" }));
  }, [voicePossible, config.answerMode, dispatch]);


  // The setup stays visible with no organization chosen; only Start holds. A
  // drill writes a study session filed under one organization, so Start with
  // none shows the organization notice at the button and the drill starts on
  // its own once one is picked — nothing is written before.
  const launch = async (): Promise<void> => {
    if (!(await coppa.ensureAllowed())) return;
    await liveGrade.guard(async () => {
      // Metered ONCE at session start (never per card — a per-card
      // check would stall the timed loop). Commit only on a real
      // start; a failed/aborted start never burns quota.
      const started = await start();
      if (started) await liveGrade.commit();
    });
  };
  const heldStart = useHeldStudyStart(launch);
  return (
    <div className="matrx-touch-targets min-h-full w-full bg-textured">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8 pb-safe">
        {/* Set picker */}
        <section className="mb-5 rounded-xl border border-border bg-card p-4">
          <label htmlFor="fastfire-set-picker" className="sr-only">
            Deck
          </label>
          {sets === null ? (
            <div className="flex items-center justify-center py-8">
              <SuspenseLoader
                centered={false}
                message="Loading your decks"
              />
            </div>
          ) : loadError ? (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-4 text-xs text-muted-foreground"
            >
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {loadError}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={retrySetsLoad}
              >
                Retry
              </Button>
              <ErrorAlchemyMenu />
            </div>
          ) : sets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-background px-3 py-8 text-center text-xs text-muted-foreground">
              No decks yet. Create one in Flashcard Studio first.
            </div>
          ) : (
            <>
              <FastFireSetPicker
                id="fastfire-set-picker"
                sets={sets}
                value={config.setId}
                onChange={(setId) => dispatch(updateConfig({ setId }))}
              />
              {/* A link to a deck that is not in the list (archived, or not
                  the person's to see) says so — never a silently empty picker
                  (page-pass 2026-09-27). */}
              {config.setId && !selectedSet && (
                <MissingDeckNotice
                  setId={config.setId}
                  onRestored={retrySetsLoad}
                />
              )}
            </>
          )}
        </section>

        {/* Two columns on a wide screen: how the drill runs (left), how you
            answer and Start (right) — the setup uses the width it has. */}
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
        <div>
        {/* Pace + count */}
        <section className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Seconds per card
              </span>
              <span className="tabular-nums text-primary">
                {config.secondsPerCard}s
              </span>
            </div>
            <Slider
              min={DRILL_CONFIG_BOUNDS.secondsPerCard.min}
              max={DRILL_CONFIG_BOUNDS.secondsPerCard.max}
              step={1}
              value={[config.secondsPerCard]}
              onValueChange={(v) =>
                dispatch(
                  updateConfig({
                    secondsPerCard: v[0] ?? DEFAULT_DRILL_CONFIG.secondsPerCard,
                  }),
                )
              }
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
              <span className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                Warning beep
              </span>
              <span className="tabular-nums text-primary">
                {config.warningSeconds === 0
                  ? "Off"
                  : `${config.warningSeconds}s left`}
              </span>
            </div>
            <Slider
              min={DRILL_CONFIG_BOUNDS.warningSeconds.min}
              max={DRILL_CONFIG_BOUNDS.warningSeconds.max}
              step={1}
              value={[config.warningSeconds]}
              onValueChange={(v) =>
                dispatch(
                  updateConfig({
                    warningSeconds: v[0] ?? DEFAULT_DRILL_CONFIG.warningSeconds,
                  }),
                )
              }
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              A light beep this many seconds before time runs out. 0 = off. Only
              fires when it lands inside a card&apos;s window.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
              <span className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                Number of cards
              </span>
              <span className="tabular-nums text-primary">
                {config.cardLimit === 0 ? "All" : config.cardLimit}
              </span>
            </div>
            <Slider
              min={DRILL_CONFIG_BOUNDS.cardLimit.min}
              max={DRILL_CONFIG_BOUNDS.cardLimit.max}
              step={1}
              value={[config.cardLimit]}
              onValueChange={(v) =>
                dispatch(
                  updateConfig({
                    cardLimit: v[0] ?? DEFAULT_DRILL_CONFIG.cardLimit,
                  }),
                )
              }
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              0 = all cards in the set.
            </p>
          </div>
        </section>

        {/* Live score toggle */}
        <section className="mb-6 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            <span>Live scoreboard</span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">
              Show grades as they catch up, or only at the end.
            </p>
            <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
              <Switch
                checked={config.liveScore}
                onCheckedChange={(checked) =>
                  dispatch(updateConfig({ liveScore: checked }))
                }
              />
            </label>
          </div>
        </section>

        {/* VISION §3 — live session adaptation: the unseen queue tilts toward
            struggling topics as grades resolve, in THIS session. */}
        <section className="mb-5 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Zap className="h-4 w-4 text-muted-foreground" />
            <span>Adapt to how you&apos;re doing</span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">
              Upcoming cards reorder toward the topics you&apos;re missing —
              during the drill, not the next one.
            </p>
            <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
              <Switch
                checked={config.adaptive}
              onCheckedChange={(checked) =>
                dispatch(updateConfig({ adaptive: checked }))
              }
            />
            </label>
          </div>
        </section>

        {/* Hear the questions (optional TTS) — generated on-demand + cached. */}
        <section className="mb-5 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            <span>Hear the questions</span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">
              A fast-paced host reads each question aloud. Generated once,
              then cached for instant playback.
            </p>
            <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
              <Switch
                checked={config.spokenFronts}
              onCheckedChange={(checked) =>
                dispatch(updateConfig({ spokenFronts: checked }))
              }
            />
            </label>
          </div>

          {config.spokenFronts && selectedSet && (
            <div className="mt-3 border-t border-border pt-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {prepReadError != null
                    ? "Couldn't check which cards already have cached audio — Prepare only generates what is missing."
                    : prepDone
                    ? "Question audio is cached and durable — it plays instantly, and nothing is re-generated when you return."
                    : prepProgress && prepProgress.done > 0
                      ? `${prepProgress.done} of ${prepProgress.total} cards already have cached audio — Prepare only generates the ${prepProgress.total - prepProgress.done} still missing.`
                      : "Prepare the audio once (it's cached durably) so there's no delay mid-drill."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={() => void prepareAudio()}
                  disabled={prepping || prepDone}
                >
                  {prepping ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : prepDone ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                  {prepping
                    ? "Preparing…"
                    : prepDone
                      ? "Audio ready"
                      : prepProgress && prepProgress.done > 0
                        ? `Prepare ${prepProgress.total - prepProgress.done} more`
                        : "Prepare audio"}
                </Button>
              </div>
              {prepReadError == null && prepProgress && prepProgress.total > 0 && (
                <div className="mt-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{
                        width: `${Math.round((prepProgress.done / prepProgress.total) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {prepProgress.done} / {prepProgress.total} ready
                  </p>
                </div>
              )}
            </div>
          )}

          {config.spokenFronts && (
            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Answer time (after the question is read)
                </span>
                <span className="tabular-nums text-primary">
                  {config.voiceAnswerSeconds}s
                </span>
              </div>
              <Slider
                min={DRILL_CONFIG_BOUNDS.voiceAnswerSeconds.min}
                max={maxVoiceAnswerSeconds(config.secondsPerCard)}
                step={1}
                value={[config.voiceAnswerSeconds]}
                onValueChange={(v) =>
                  dispatch(
                    updateConfig({
                      voiceAnswerSeconds:
                        v[0] ?? DEFAULT_DRILL_CONFIG.voiceAnswerSeconds,
                    }),
                  )
                }
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                The timer starts only after the spoken question finishes — so
                you never lose time to the reading. Kept shorter than the{" "}
                {config.secondsPerCard}s above since you don&apos;t spend part
                of it reading.
              </p>
            </div>
          )}
        </section>

        </div>
        <div>
        {/* How you answer — voice or typing. */}
        <section className="mb-5 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {typed ? (
              <Keyboard className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Mic className="h-4 w-4 text-muted-foreground" />
            )}
            <span>Answer by</span>
          </div>
          {voicePossible ? (
            <div
              role="radiogroup"
              aria-label="Answer by"
              className="mt-3 grid grid-cols-2 gap-2"
            >
              {(
                [
                  { value: "voice", label: "Speaking", Icon: Mic },
                  { value: "typed", label: "Typing", Icon: Keyboard },
                ] as const
              ).map(({ value, label, Icon }) => {
                const selected = config.answerMode === value;
                return (
                  <Button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    variant={selected ? "default" : "outline"}
                    className={cn("min-h-11 gap-2")}
                    onClick={() => dispatch(updateConfig({ answerMode: value }))}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Button>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              {micSupported
                ? "Typing — the microphone is blocked for this site. Allow it in your browser's site settings to answer aloud."
                : "Typing — this browser has no microphone to answer aloud."}
            </p>
          )}
        </section>

        {/* Instant help (Q15) — pre-recorded "I'm confused" audio per card, so
            mid-drill help plays with zero wait. Prepared once, cached durably. */}
        {selectedSet && (
          <section className="mb-5 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium text-foreground">
                    Instant help
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {helpReadError != null
                      ? "Couldn't check which cards already have a pre-recorded explanation — Prepare only covers what is missing."
                      : helpPrepDone
                      ? "Every card has a pre-recorded explanation — “I'm confused” answers instantly, no wait."
                      : helpPrepProgress && helpPrepProgress.done > 0
                        ? `${helpPrepProgress.done} of ${helpPrepProgress.total} cards have a pre-recorded explanation — Prepare covers the ${helpPrepProgress.total - helpPrepProgress.done} still missing.`
                        : "Pre-record a short explanation for each card so “I'm confused” answers instantly mid-drill."}
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => void prepareHelpAudio()}
                disabled={helpPrepping || helpPrepDone}
              >
                {helpPrepping ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : helpPrepDone ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                ) : (
                  <HelpCircle className="h-4 w-4" />
                )}
                {helpPrepping
                  ? "Preparing…"
                  : helpPrepDone
                    ? "Help ready"
                    : helpPrepProgress && helpPrepProgress.done > 0
                      ? `Prepare ${helpPrepProgress.total - helpPrepProgress.done} more`
                      : "Prepare help"}
              </Button>
            </div>
            {helpReadError == null && helpPrepProgress && helpPrepProgress.total > 0 && (
              <div className="mt-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{
                      width: `${Math.round((helpPrepProgress.done / helpPrepProgress.total) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {helpPrepProgress.done} / {helpPrepProgress.total} ready
                </p>
              </div>
            )}
          </section>
        )}

        {/* Device check (Zoom/Meet style) — confirm + test mic/speaker before the
            drill. Reuses the shared MediaDevicesPanel (also openable as a window
            from the avatar menu via dispatch). Built to host video later. */}
        {!typed && (
        <section className="mb-5 rounded-xl border border-border bg-card">
          <button
            type="button"
            onClick={() => setShowDevices((v) => !v)}
            className="flex min-h-11 w-full items-center justify-between gap-2 px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Headphones className="h-4 w-4 text-muted-foreground" />
              Check your audio
            </span>
            {showDevices ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {showDevices && (
            <div className="border-t border-border">
              {/* A drill never uses the camera — no camera controls here. */}
              <MediaDevicesPanel showCamera={false} />
            </div>
          )}
        </section>
        )}

        {startError && (
          <Alert variant="destructive" className="mb-3">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{startError}</AlertDescription>
          </Alert>
        )}

        {heldStart.held && (
          <StudyOrganizationHoldNotice what="Starting Fast Fire" className="mb-3 rounded-lg border border-border bg-card" />
        )}
        <div className="mb-2 flex justify-center">
          <coppa.Gate />
          <EntitlementMeter capability="education.live_grade" />
        </div>
        <Button
          size="lg"
          className="w-full gap-2"
          disabled={!selectedSet || starting || liveGrade.isChecking}
          onClick={() => heldStart.start()}
        >
          {starting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              {typed ? "Starting…" : "Warming the mic…"}
            </>
          ) : (
            <>
              <Flame className="h-5 w-5" />
              Start Fast Fire
            </>
          )}
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {typed
            ? "Type each answer and press Enter before the timer runs out."
            : "One microphone prompt for the whole session. Answer each card aloud before the timer runs out."}
        </p>
        {/* Respectful paywall — opens only on a real cap; decides for itself when it shows. */}
        <liveGrade.Paywall />
        <enrichGuard.Paywall />

        {/* Entry-flow affordances: create a new set, or review past results. */}
        <div className="mt-5 flex flex-col items-stretch justify-center gap-1 sm:flex-row sm:items-center">
          <Button asChild variant="ghost" className="min-h-11">
            <Link href="/education/flashcards/new">
              <Plus className="h-4 w-4" />
              Create a new deck
            </Link>
          </Button>
          <Button asChild variant="ghost" className="min-h-11">
            <Link href="/education/flashcards/sessions">
              <History className="h-4 w-4" />
              View past results
            </Link>
          </Button>
        </div>
        </div>
        </div>
      </div>
    </div>
  );
}

/** The deck a link named is not in the picker: say why, and offer Restore. */
function MissingDeckNotice({
  setId,
  onRestored,
}: {
  setId: string;
  onRestored: () => void;
}) {
  const [deck, setDeck] = useState<
    { name: string; archived: boolean } | null | undefined
  >(undefined);
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void fcService.getSetIncludingArchived(setId).then((res) => {
      if (!cancelled) setDeck(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [setId]);
  if (deck === undefined) return null;
  if (deck === null) {
    return (
      <Alert variant="warning" className="mt-3">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          The deck this link names isn&apos;t available to you. Pick another
          deck above.
        </AlertDescription>
      </Alert>
    );
  }
  if (!deck.archived) return null;
  return (
    <Alert variant="warning" className="mt-3">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          &ldquo;{deck.name}&rdquo; is archived. Restore it to drill it.
        </span>
        <Button
          size="sm"
          disabled={restoring}
          onClick={async () => {
            setRestoring(true);
            try {
              await restoreFromTrash("fc_set", setId);
              toast.success(`Restored "${deck.name}"`);
              onRestored();
            } catch (e) {
              toast.error(
                e instanceof Error ? e.message : "The deck was not restored.",
              );
            } finally {
              setRestoring(false);
            }
          }}
        >
          {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Restore
        </Button>
      </AlertDescription>
    </Alert>
  );
}
