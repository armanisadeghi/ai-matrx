// features/flashcards/fast-fire/components/FastFireSetup.tsx
//
// The setup screen (REQUIREMENTS §2.1): pick a real fc_set, seconds-per-card,
// card count, and live-score vs summary. The set picker reads real sets from
// `fcService.listSets` (hard-requirement #7) — no hardcoded deck. "Start" warms
// the mic + opens the session inside the click gesture (one mic prompt).
//
// React Compiler is on: no manual memo.

"use client";

import { useEffect, useState, type ReactNode } from "react";
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
  Keyboard,
  Plus,
  TrendingUp,
  Volume2,
  Loader2,
  CheckCircle2,
  Zap,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { InfoHint } from "@/components/official/InfoHint";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Button as SurfaceButton } from "@ai-matrx/design-system";
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
import { SegmentedControl } from "@ai-matrx/design-system/controls";

export function FastFireSetup() {
  const dispatch = useAppDispatch();
  // COPPA runs BEFORE the entitlement gate and BEFORE any AI work, once per
  // session — never per card, which would stall the timed loop. A blocked
  // learner is told here, with the one-tap way to fix it, instead of speaking
  // through a whole drill whose every grade is refused server-side.
  const coppa = useAiComplianceGate();
  const config = useAppSelector(selectFastFireConfig);
  const { start, starting, startError } = useFastFireLauncher();
  // FastFire grades every spoken answer with AI — meter the live_grade
  // capability once at session start (a per-card check would stall the timed
  // loop). The limit shows on the setup screen; a cap opens the paywall.
  const liveGrade = useEntitlementGuard("education.live_grade");

  const [sets, setSets] = useState<FcSetRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [setsAttempt, setSetsAttempt] = useState(0);
  // Device check (Zoom/Meet style): test mic/speaker before the drill. Closed
  // by default (redesign 2026-10-01) — Start warms the mic in its own gesture,
  // so the check is optional; reuses the shared MediaDevicesPanel.
  const [showDevices, setShowDevices] = useState(false);
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
  const progressHref = config.setId
    ? `/education/flashcards/${config.setId}/sessions`
    : "/education/flashcards/sessions";
  const cardCount = selectedSet ? config.cardLimit : null;

  // LAYOUT (redesign 2026-10-01, model: Duolingo's lesson start + iOS
  // Settings groups). One start card — deck, how you answer, Start — and one
  // grouped settings list beside it. Definitions live behind info icons; no
  // helper sentence sits under any control. On a phone the start card comes
  // first, so a learner can pick a deck and go without scrolling.
  return (
    <div className="matrx-touch-targets min-h-full w-full bg-textured">
      <div className="mx-auto max-w-5xl px-3 py-4 pb-safe sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start lg:gap-5">
          {/* START CARD */}
          <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 lg:sticky lg:top-4">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400">
                <Flame className="h-6 w-6" />
              </span>
              <p className="min-w-0 truncate text-base font-semibold text-foreground">
                {cardCount === null
                  ? "Pick a deck"
                  : `${cardCount === 0 ? "All" : cardCount} cards · ${config.secondsPerCard}s each`}
              </p>
            </div>

            <label htmlFor="fastfire-set-picker" className="sr-only">
              Deck
            </label>
            {sets === null ? (
              <div className="flex items-center justify-center py-6">
                <SuspenseLoader centered={false} message="Loading your decks" />
              </div>
            ) : loadError ? (
              <div
                role="alert"
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-3 text-xs text-muted-foreground"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="truncate">{loadError}</span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={retrySetsLoad}
                >
                  Retry
                </Button>
                <ErrorAlchemyMenu />
              </div>
            ) : sets.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-6 text-center">
                <p className="text-sm text-muted-foreground">No decks yet</p>
                <Button variant="primary" asChild>
                  <Link href="/education/flashcards/new">
                    <Plus className="h-4 w-4" />
                    New deck
                  </Link>
                </Button>
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
                    the person's to see) says so — never a silently empty
                    picker (page-pass 2026-09-27). */}
                {config.setId && !selectedSet && (
                  <MissingDeckNotice
                    setId={config.setId}
                    onRestored={retrySetsLoad}
                  />
                )}
              </>
            )}

            {/* How you answer — voice or typing. Voice is absent (never a
                button that fails) when the browser has no usable mic. */}
            <div className="mt-4">
              {voicePossible ? (
                <SegmentedControl aria-label="Answer by" fill value={config.answerMode} onValueChange={(value) => dispatch(updateConfig({ answerMode: value }))} data={([{ value: "voice", label: "Speak", Icon: Mic }, { value: "typed", label: "Type", Icon: Keyboard }] as const).map(({ value, label, Icon }) => ({ value, label: <span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" />{label}</span> }))} />
              ) : (
                <p className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 text-sm text-muted-foreground">
                  <Keyboard className="h-4 w-4 shrink-0" />
                  {micSupported ? "Mic blocked — you'll type" : "No mic — you'll type"}
                  <InfoHint
                    text={
                      micSupported
                        ? "Allow the microphone in your browser's site settings to answer aloud."
                        : "This browser has no microphone to answer aloud."
                    }
                    label="Why typing"
                  />
                </p>
              )}
            </div>

            {startError && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{startError}</AlertDescription>
              </Alert>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 empty:hidden">
              <coppa.Gate />
              <EntitlementMeter capability="education.live_grade" />
            </div>
            <SurfaceButton
              size="lg"
              className="mt-3 h-12 w-full gap-2 text-base font-semibold"
              disabled={!selectedSet || starting || liveGrade.isChecking}
              onClick={() => void launch()}
            >
              {starting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {typed ? "Starting…" : "Warming the mic…"}
                </>
              ) : (
                <>
                  <Flame className="h-5 w-5" />
                  Start
                </>
              )}
            </SurfaceButton>
            {/* Respectful paywall — opens only on a real cap. */}
            <liveGrade.Paywall />
            <enrichGuard.Paywall />

            <div className="mt-2 grid grid-cols-2 gap-1">
              <Button asChild variant="quiet">
                <Link href={progressHref}>
                  <TrendingUp className="h-4 w-4" />
                  Progress
                </Link>
              </Button>
              <Button asChild variant="quiet">
                <Link href="/education/flashcards/new">
                  <Plus className="h-4 w-4" />
                  New deck
                </Link>
              </Button>
            </div>
          </section>

          {/* SETTINGS */}
          <div className="flex flex-col gap-4">
            <SettingsGroup>
              <SliderRow
                icon={Clock}
                label="Seconds per card"
                value={`${config.secondsPerCard}s`}
                min={DRILL_CONFIG_BOUNDS.secondsPerCard.min}
                max={DRILL_CONFIG_BOUNDS.secondsPerCard.max}
                current={config.secondsPerCard}
                onChange={(v) =>
                  dispatch(
                    updateConfig({
                      secondsPerCard: v ?? DEFAULT_DRILL_CONFIG.secondsPerCard,
                    }),
                  )
                }
              />
              <SliderRow
                icon={Hash}
                label="Cards"
                value={config.cardLimit === 0 ? "All" : `${config.cardLimit}`}
                min={DRILL_CONFIG_BOUNDS.cardLimit.min}
                max={DRILL_CONFIG_BOUNDS.cardLimit.max}
                current={config.cardLimit}
                onChange={(v) =>
                  dispatch(
                    updateConfig({
                      cardLimit: v ?? DEFAULT_DRILL_CONFIG.cardLimit,
                    }),
                  )
                }
              />
              <SliderRow
                icon={Bell}
                label="Warning beep"
                hint="A soft beep this many seconds before time runs out."
                value={
                  config.warningSeconds === 0
                    ? "Off"
                    : `${config.warningSeconds}s left`
                }
                min={DRILL_CONFIG_BOUNDS.warningSeconds.min}
                max={DRILL_CONFIG_BOUNDS.warningSeconds.max}
                current={config.warningSeconds}
                onChange={(v) =>
                  dispatch(
                    updateConfig({
                      warningSeconds: v ?? DEFAULT_DRILL_CONFIG.warningSeconds,
                    }),
                  )
                }
              />
            </SettingsGroup>

            <SettingsGroup>
              <SwitchRow
                icon={Gauge}
                label="Live scoreboard"
                hint="Show grades as they come in, or only at the end."
                checked={config.liveScore}
                onChange={(checked) =>
                  dispatch(updateConfig({ liveScore: checked }))
                }
              />
              {/* VISION §3 — live session adaptation: the unseen queue tilts
                  toward struggling topics as grades resolve, in THIS session. */}
              <SwitchRow
                icon={Zap}
                label="Adapt to you"
                hint="Upcoming cards shift toward the topics you're missing."
                checked={config.adaptive}
                onChange={(checked) =>
                  dispatch(updateConfig({ adaptive: checked }))
                }
              />
              {/* Hear the questions (optional TTS) — generated on-demand,
                  cached durably in fc_detail. */}
              <SwitchRow
                icon={Volume2}
                label="Read questions aloud"
                hint="A host reads each question; audio is made once and cached."
                checked={config.spokenFronts}
                onChange={(checked) =>
                  dispatch(updateConfig({ spokenFronts: checked }))
                }
              />
              {config.spokenFronts && (
                <SliderRow
                  icon={Clock}
                  label="Answer time"
                  hint="The timer starts after the question is read."
                  value={`${config.voiceAnswerSeconds}s`}
                  min={DRILL_CONFIG_BOUNDS.voiceAnswerSeconds.min}
                  max={maxVoiceAnswerSeconds(config.secondsPerCard)}
                  current={config.voiceAnswerSeconds}
                  onChange={(v) =>
                    dispatch(
                      updateConfig({
                        voiceAnswerSeconds:
                          v ?? DEFAULT_DRILL_CONFIG.voiceAnswerSeconds,
                      }),
                    )
                  }
                  inset
                />
              )}
              {config.spokenFronts && selectedSet && (
                <PrepareRow
                  icon={Volume2}
                  label="Question audio"
                  progress={prepReadError != null ? null : prepProgress}
                  readFailed={prepReadError != null}
                  busy={prepping}
                  done={prepDone}
                  readyLabel="Ready"
                  onPrepare={() => void prepareAudio()}
                  inset
                />
              )}
              {/* Instant help (Q15) — pre-recorded "I'm confused" audio per
                  card, so mid-drill help plays with zero wait. */}
              {selectedSet && (
                <PrepareRow
                  icon={HelpCircle}
                  label="Instant help"
                  hint="A recorded explanation per card, so help plays with no wait."
                  progress={helpReadError != null ? null : helpPrepProgress}
                  readFailed={helpReadError != null}
                  busy={helpPrepping}
                  done={helpPrepDone}
                  readyLabel="Ready"
                  onPrepare={() => void prepareHelpAudio()}
                />
              )}
            </SettingsGroup>

            {/* Device check (Zoom/Meet style) — the shared MediaDevicesPanel
                (also openable as a window from the avatar menu). Collapsed by
                default; Start warms the mic in its own gesture either way. */}
            {!typed && (
              <section className="overflow-hidden rounded-2xl border border-border bg-card">
                <button
                  type="button"
                  aria-expanded={showDevices}
                  onClick={() => setShowDevices((v) => !v)}
                  className="flex min-h-12 w-full items-center justify-between gap-2 px-4 py-3 text-left"
                >
                  <span className="flex items-center gap-3 text-sm font-medium text-foreground">
                    <Headphones className="h-4 w-4 text-muted-foreground" />
                    Mic and speaker
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      showDevices && "rotate-180",
                    )}
                  />
                </button>
                {showDevices && (
                  <div className="border-t border-border">
                    {/* A drill never uses the camera. */}
                    <MediaDevicesPanel showCamera={false} />
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** One iOS-Settings-style group: rows divided by hairlines. */
function SettingsGroup({ children }: { children: ReactNode }) {
  return (
    <section className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {children}
    </section>
  );
}

function RowLabel({
  icon: Icon,
  label,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-3 text-sm font-medium text-foreground">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
      {hint && <InfoHint text={hint} label={`About ${label}`} />}
    </span>
  );
}

function SliderRow({
  icon,
  label,
  hint,
  value,
  min,
  max,
  current,
  onChange,
  inset = false,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  value: string;
  min: number;
  max: number;
  current: number;
  onChange: (value: number | undefined) => void;
  inset?: boolean;
}) {
  return (
    <div className={cn("px-4 py-3", inset && "bg-muted/30")}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <RowLabel icon={icon} label={label} hint={hint} />
        <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
          {value}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={1}
        value={[current]}
        aria-label={label}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  );
}

function SwitchRow({
  icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 py-1 pl-4 pr-2">
      <RowLabel icon={icon} label={label} hint={hint} />
      <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
        <Switch
          checked={checked}
          aria-label={label}
          onCheckedChange={onChange}
        />
      </label>
    </div>
  );
}

/** A prepare-once asset (question audio, instant help): readiness + one button. */
function PrepareRow({
  icon,
  label,
  hint,
  progress,
  readFailed,
  busy,
  done,
  readyLabel,
  onPrepare,
  inset = false,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  progress: { done: number; total: number } | null;
  readFailed: boolean;
  busy: boolean;
  done: boolean;
  readyLabel: string;
  onPrepare: () => void;
  inset?: boolean;
}) {
  const missing = progress ? progress.total - progress.done : null;
  const pct =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : null;
  return (
    <div className={cn("px-4 py-3", inset && "bg-muted/30")}>
      <div className="flex items-center justify-between gap-3">
        <RowLabel icon={icon} label={label} hint={hint} />
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="text-xs tabular-nums text-muted-foreground"
            title={readFailed ? "Couldn't check what's cached" : undefined}
          >
            {readFailed || !progress ? "—" : `${progress.done}/${progress.total}`}
          </span>
          {done ? (
            <span className="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-medium text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              {readyLabel}
            </span>
          ) : (
            <Button
              icon={busy ? <Loader2 className="animate-spin" /> : null}
              variant="outline"
              onClick={onPrepare}
              disabled={busy}
            >
              {busy
                ? "Preparing…"
                : missing && progress && progress.done > 0
                  ? `Prepare ${missing}`
                  : "Prepare"}
            </Button>
          )}
        </div>
      </div>
      {!readFailed && pct !== null && !done && progress && progress.done > 0 && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
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
          icon={restoring ? <Loader2 className="animate-spin" /> : null}
          variant="primary"
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
          Restore
        </Button>
      </AlertDescription>
    </Alert>
  );
}
