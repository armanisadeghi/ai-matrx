"use client";

// features/flashcards/components/set-detail/AudioOverviewSection.tsx
//
// Phase 7 (Flashcards Competitive Parity Push) — "Generate audio overview"
// action on SetDetailView. Reuses the generic podcast generator
// (usePodcastRun → POST /podcast/generate) rather than the full multi-step
// Studio UI — the source is already known (this set), so there's nothing for
// a picker to pick. Persists ONLY a durable file_id to
// `fc_set.audio_overview_file_id` (never the raw/signed audioUrl — media
// durability doctrine) and plays back via the shared `SessionAudio`.
//
// React Compiler is on: no manual memo.

import { useEffect, useRef, useState } from "react";
import {
  Volume2,
  Loader2,
  RefreshCw,
  AlertCircle,
  Mic,
  HelpCircle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/redux/hooks";
import { usePodcastRun } from "@/features/podcasts/generator/usePodcastRun";
import { fileIdFromUserFilesUrl } from "@/lib/media/durability";
import { SessionAudio } from "@/features/education/study/components/SessionAudio";
import { ensureSpokenFrontsForSet } from "@/features/flashcards/fast-fire/spoken-front/generateSpokenFront.thunk";
import { ensureHelperAudioForSet } from "@/features/flashcards/fast-fire/helper-audio/generateHelperAudio.thunk";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { fcService } from "../../data/fcService";
import { buildDeckOverviewRequest } from "../../data/podcastOverview";
import type { FcSetRow, CardWithDetails } from "../../data/types";
import { useFlashcardMandates } from "../../data/mandate-disclosure";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/**
 * WP3 gap 12 + Q15 lane 1 — deck-level per-card audio prep, ONE component for
 * both cached batch lanes (spoken fronts, instant-help audio). The thunks are
 * cached + resumable, so the deck preps a whole set once instead of one tap at
 * a time mid-study.
 */
const DETAIL_PREP_LANES = {
  spoken_front: {
    ensure: ensureSpokenFrontsForSet,
    icon: Mic,
    noun: "card audio",
    doneLabel: "Card audio ready",
    doneTitle: "Every card already has audio",
    idleTitle:
      "Generate spoken audio for every card front (cached — instant playback while studying)",
    successToast: "Every card can be heard now",
  },
  helper: {
    ensure: ensureHelperAudioForSet,
    icon: HelpCircle,
    noun: "instant help",
    doneLabel: "Instant help ready",
    doneTitle: "Every card already has a pre-recorded explanation",
    idleTitle:
      "Pre-record a short explanation per card so “I'm confused” answers instantly while studying",
    successToast: "“I'm confused” now answers instantly on every card",
  },
} as const;

/** How many cards already carry this lane's audio — for a label elsewhere. */
export function deckAudioCoverage(
  cards: CardWithDetails[],
  lane: keyof typeof DETAIL_PREP_LANES,
): { ready: number; total: number } {
  return {
    ready: cards.filter((c) =>
      c.details.some((d) => d.kind === lane && !!d.audio_file_id),
    ).length,
    total: cards.length,
  };
}

/** Bumped by the Deck tools menu to start one of this section's jobs. */
export interface DeckAudioRunSignals {
  generate: number;
  spoken_front: number;
  helper: number;
}

function CardAudioPrep({
  setId,
  cards,
  lane,
  onCardsChanged,
  runSignal = 0,
  hideIdle = false,
}: {
  setId: string;
  cards: CardWithDetails[];
  lane: keyof typeof DETAIL_PREP_LANES;
  onCardsChanged?: () => void;
  /** Each increase starts the prep (the Deck tools menu owns the button). */
  runSignal?: number;
  /** Status only: draw nothing until a prep is running. */
  hideIdle?: boolean;
}) {
  const dispatch = useAppDispatch();
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const cfg = DETAIL_PREP_LANES[lane];
  // The instant-help batch runs ONE enrich call per missing card — the exact
  // spend `education.card_enrichment` (enforced 2026-08-22) meters. Guard
  // before the batch, commit the real generated count after. The spoken-front
  // lane is TTS-only and has no registered capability yet (tracked in the
  // education STATE doc) — the hook is called unconditionally (rules of
  // hooks); only the helper lane consults it.
  const enrichGuard = useEntitlementGuard("education.card_enrichment");

  const withAudio = cards.filter((c) =>
    c.details.some((d) => d.kind === lane && !!d.audio_file_id),
  ).length;
  const allDone = cards.length > 0 && withAudio === cards.length;

  const runPrep = async (): Promise<void> => {
    const before = withAudio;
    setProgress({ done: 0, total: cards.length });
    try {
      const result = await dispatch(
        cfg.ensure(setId, (done, total) => setProgress({ done, total })),
      );
      const ready = Object.keys(result).length;
      const generated = Math.max(ready - before, 0);
      if (lane === "helper" && generated > 0) {
        await enrichGuard.commit({ quantity: generated });
      }
      if (ready < cards.length) {
        toast.error(
          `${cfg.noun} ready for ${ready} of ${cards.length} cards — the rest failed; try again.`,
        );
      } else {
        toast.success(cfg.successToast);
      }
      onCardsChanged?.();
    } finally {
      setProgress(null);
    }
  };

  const prepare = async (): Promise<void> => {
    if (lane === "helper") await enrichGuard.guard(runPrep);
    else await runPrep();
  };

  const handledSignal = useRef(runSignal);
  useEffect(() => {
    if (runSignal === handledSignal.current) return;
    handledSignal.current = runSignal;
    if (!progress && !allDone) void prepare();
    // prepare/progress are read at signal time on purpose: only the signal
    // starts a job.
  }, [runSignal]);

  if (cards.length === 0) return null;

  if (progress) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        <span className="min-w-0 flex-1 truncate">
          Preparing {cfg.noun}… {progress.done}/{progress.total}
        </span>
      </div>
    );
  }

  if (hideIdle) return lane === "helper" ? <enrichGuard.Paywall /> : null;

  const Icon = cfg.icon;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => void prepare()}
        disabled={allDone || enrichGuard.isChecking}
        title={allDone ? cfg.doneTitle : cfg.idleTitle}
      >
        <Icon className="h-4 w-4" />
        {allDone
          ? cfg.doneLabel
          : withAudio > 0
            ? `Prepare ${cfg.noun} (${withAudio}/${cards.length} done)`
            : `Prepare ${cfg.noun}`}
      </Button>
      {lane === "helper" && <enrichGuard.Paywall />}
    </>
  );
}

export function AudioOverviewSection({
  setId,
  set,
  cards,
  onFileIdChange,
  onCardsChanged,
  statusOnly = false,
  runSignals,
}: {
  setId: string;
  set: FcSetRow;
  cards: CardWithDetails[];
  onFileIdChange: (fileId: string | null) => void;
  /** Refetch after batch card-audio prep so the coverage count is honest. */
  onCardsChanged?: () => void;
  /**
   * Status only (page-pass 2026-09-27): the page shows the player and any
   * running job; the buttons live in the Deck tools menu, which starts them
   * through `runSignals`. This component stays mounted on the page, so a job
   * keeps its progress after the menu closes.
   */
  statusOnly?: boolean;
  runSignals?: DeckAudioRunSignals;
}) {
  useFlashcardMandates(["spokenFrontTts", "enrichCard", "helperTts"]);
  const { state, start, cancel, reset } = usePodcastRun();
  const [persisting, setPersisting] = useState(false);
  // Guards against double-persisting the same completed run — `state.status`
  // stays "done" across re-renders, so a plain effect dep would re-fire the
  // save on every unrelated parent re-render.
  const persistedRef = useRef(false);

  const generating = state.status === "running";

  useEffect(() => {
    if (state.status !== "done" || persistedRef.current) return;
    persistedRef.current = true;
    const fileId =
      state.audioFileId ?? fileIdFromUserFilesUrl(state.audioUrl ?? "");
    if (!fileId) {
      toast.error(
        "Audio generated, but couldn't resolve a durable file reference — try regenerating.",
      );
      return;
    }
    void (async () => {
      setPersisting(true);
      const res = await fcService.updateSetAudioOverview(setId, fileId);
      setPersisting(false);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      onFileIdChange(fileId);
      toast.success("Audio overview ready");
    })();
  }, [state.status, state.audioFileId, state.audioUrl, setId, onFileIdChange]);

  const handleGenerate = () => {
    if (cards.length === 0) {
      toast.error("Add some cards to this set first");
      return;
    }
    persistedRef.current = false;
    const { request, truncated } = buildDeckOverviewRequest(set, cards);
    if (truncated) {
      toast.info(
        "This deck is large — the audio overview covers the first 60 cards.",
      );
    }
    void start(request);
  };

  const handledGenerate = useRef(runSignals?.generate ?? 0);
  useEffect(() => {
    const signal = runSignals?.generate ?? 0;
    if (signal === handledGenerate.current) return;
    handledGenerate.current = signal;
    if (!generating) {
      reset();
      handleGenerate();
    }
    // handleGenerate/reset are read at signal time on purpose: only the
    // signal starts a job.
  }, [runSignals?.generate]);

  if (statusOnly) {
    const preps = (
      <>
        <CardAudioPrep
          setId={setId}
          cards={cards}
          lane="spoken_front"
          onCardsChanged={onCardsChanged}
          runSignal={runSignals?.spoken_front}
          hideIdle
        />
        <CardAudioPrep
          setId={setId}
          cards={cards}
          lane="helper"
          onCardsChanged={onCardsChanged}
          runSignal={runSignals?.helper}
          hideIdle
        />
      </>
    );
    if (!generating && state.status !== "error" && !set.audio_overview_file_id)
      return <div className="empty:hidden space-y-2">{preps}</div>;
  }

  if (generating) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        <span className="min-w-0 flex-1 truncate">
          {state.currentLabel || "Generating audio overview…"}
        </span>
        <span className="tabular-nums">{state.progress}%</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={cancel}
        >
          Cancel
        </Button>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {state.error ?? "Couldn't generate the audio overview"}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1 px-2 text-xs"
          onClick={() => {
            reset();
            handleGenerate();
          }}
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </Button>
        <ErrorAlchemyMenu error={state.error} />
      </div>
    );
  }

  if (set.audio_overview_file_id) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <SessionAudio
          fileId={set.audio_overview_file_id}
          className="h-8 min-w-48 flex-1"
        />
        {!statusOnly && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
            disabled={persisting}
            onClick={handleGenerate}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate
          </Button>
        )}
        <CardAudioPrep
          setId={setId}
          cards={cards}
          lane="spoken_front"
          onCardsChanged={onCardsChanged}
          runSignal={runSignals?.spoken_front}
          hideIdle={statusOnly}
        />
        <CardAudioPrep
          setId={setId}
          cards={cards}
          lane="helper"
          onCardsChanged={onCardsChanged}
          runSignal={runSignals?.helper}
          hideIdle={statusOnly}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={handleGenerate}
      >
        <Volume2 className="h-4 w-4" />
        Generate audio overview
      </Button>
      <CardAudioPrep
        setId={setId}
        cards={cards}
        lane="spoken_front"
        onCardsChanged={onCardsChanged}
      />
      <CardAudioPrep
        setId={setId}
        cards={cards}
        lane="helper"
        onCardsChanged={onCardsChanged}
      />
    </div>
  );
}
