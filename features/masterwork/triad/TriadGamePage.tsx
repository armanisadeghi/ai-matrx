"use client";

// features/masterwork/triad/TriadGamePage.tsx
//
// THE TRIAD GAME — the play surface of the `triad_game` Approach.
//
// Three short items, one forced choice, one line about why. The line is the
// rule candidate; the three items are the evidence. It is built phone-first
// because that is where it is played: between two other tasks, one thumb, in
// about fifteen seconds a card.
//
// WHAT THIS SCREEN REFUSES TO DO
//
// * It never shows a card it cannot honour. A deck shorter than the round asked
//   for says so in words; a card the server could not write is not padded.
// * It never pretends a save happened. Each answered card carries its OWN
//   status — saving, what it added, or the failure with a Try again that
//   re-submits that exact card. A card that failed stays on the board.
// * It never asks the same question twice in one sitting. Every prompt played
//   goes back to the server with the next deal, and the server drops repeats
//   and SAYS how many it dropped.
// * It never traps. Skip is always there, because a card an Expert cannot
//   answer is a card she must be able to leave without inventing a reason —
//   and an invented reason is a bad rule with her name on it.

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Loader2,
  RefreshCw,
  Shuffle,
  SkipForward,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/redux/hooks";
import { MasterworkDictationOrigin } from "@/features/masterwork/MasterworkDictationOrigin";
import { AgentCredit } from "@/features/masterwork/components/AgentCredit";
import { dealTriads, ingestTriadAnswer, TRIAD_GENERATOR_MANDATE } from "./service";
import { MODE_COPY, type Triad, type TriadDeck, type TriadMode } from "./types";

/** Per-card save state. `idle` is a card not answered yet. */
type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; added: number; unverified: number; alreadyPlayed: boolean }
  | { kind: "failed"; message: string };

/** How far a thumb must travel before a drag counts as "skip this one". */
const SWIPE_THRESHOLD_PX = 64;

export function TriadGamePage({
  rulebookId,
  rulebookName,
  /** Called after a card lands rules, so the Rulebook behind this can refresh. */
  onRulesLanded,
}: {
  rulebookId: string;
  rulebookName: string;
  onRulesLanded?: () => void;
}) {
  const store = useAppStore();

  const [deck, setDeck] = useState<TriadDeck | null>(null);
  const [dealing, setDealing] = useState(false);
  const [dealError, setDealError] = useState<string | null>(null);
  const [mode, setMode] = useState<TriadMode | null>(null);
  const [index, setIndex] = useState(0);
  const [pick, setPick] = useState<Triad["items"][number]["key"] | null>(null);
  const [reason, setReason] = useState("");
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [rulesThisSitting, setRulesThisSitting] = useState(0);
  const [cardsAnswered, setCardsAnswered] = useState(0);
  const [skipped, setSkipped] = useState(0);
  /** Every prompt shown this sitting — what stops the game repeating itself. */
  const seenPrompts = useRef<string[]>([]);
  const dragStart = useRef<number | null>(null);
  const [dragX, setDragX] = useState(0);

  const card: Triad | null = deck?.triads[index] ?? null;
  const copy = MODE_COPY[card?.mode ?? deck?.mode ?? "best_one"];
  const remaining = deck ? deck.triads.length - index : 0;

  const deal = useCallback(
    async (nextMode?: TriadMode) => {
      setDealing(true);
      setDealError(null);
      try {
        const next = await dealTriads(store, {
          rulebookId,
          ...(nextMode ? { mode: nextMode } : {}),
          seenPrompts: seenPrompts.current,
        });
        seenPrompts.current = [
          ...seenPrompts.current,
          ...next.triads.map((t) => t.prompt),
        ];
        setDeck(next);
        setMode(next.mode);
        setIndex(0);
        setPick(null);
        setReason("");
      } catch (err) {
        setDealError(
          err instanceof Error
            ? err.message
            : "We couldn't deal the cards. Nothing was lost — try again.",
        );
      } finally {
        setDealing(false);
      }
    },
    [rulebookId, store],
  );

  const advance = useCallback(() => {
    setIndex((n) => n + 1);
    setPick(null);
    setReason("");
    setDragX(0);
  }, []);

  const submit = useCallback(
    async (target: Triad, choice: Triad["items"][number]["key"], why: string) => {
      setSaveStates((prev) => ({ ...prev, [target.id]: { kind: "saving" } }));
      try {
        const summary = await ingestTriadAnswer(store, {
          rulebookId,
          triad: target,
          pick: choice,
          reason: why,
        });
        setSaveStates((prev) => ({
          ...prev,
          [target.id]: {
            kind: "saved",
            added: summary.added,
            unverified: summary.quotesUnverified,
            alreadyPlayed: summary.alreadyPlayed,
          },
        }));
        if (summary.added > 0) {
          setRulesThisSitting((n) => n + summary.added);
          onRulesLanded?.();
        }
      } catch (err) {
        setSaveStates((prev) => ({
          ...prev,
          [target.id]: {
            kind: "failed",
            message:
              err instanceof Error
                ? err.message
                : "That one didn't save. Try it again.",
          },
        }));
      }
    },
    [onRulesLanded, rulebookId, store],
  );

  const answerAndAdvance = useCallback(() => {
    if (!card || !pick || !reason.trim()) return;
    // Fire, then move on: the Expert should be reading the next card while the
    // last one distils. The card's own status row is what reports it.
    void submit(card, pick, reason.trim());
    setCardsAnswered((n) => n + 1);
    advance();
  }, [advance, card, pick, reason, submit]);

  const skip = useCallback(() => {
    if (!card) return;
    setSkipped((n) => n + 1);
    advance();
  }, [advance, card]);

  // ── the swipe ────────────────────────────────────────────────────────────
  // A horizontal drag on the card is SKIP, and only skip. Choosing is a tap on
  // the item itself: a swipe that decided between three stacked options would
  // be guessing which one the thumb meant, and a rule written from a guess is
  // exactly the thing this lane exists to avoid.
  const onTouchStart = (event: React.TouchEvent) => {
    dragStart.current = event.touches[0]?.clientX ?? null;
  };
  const onTouchMove = (event: React.TouchEvent) => {
    if (dragStart.current === null) return;
    const delta = (event.touches[0]?.clientX ?? 0) - dragStart.current;
    setDragX(Math.max(-140, Math.min(140, delta)));
  };
  const onTouchEnd = () => {
    if (dragStart.current !== null && Math.abs(dragX) > SWIPE_THRESHOLD_PX) skip();
    dragStart.current = null;
    setDragX(0);
  };

  const sessionLine = useMemo(() => {
    const parts: string[] = [];
    if (cardsAnswered)
      parts.push(`${cardsAnswered} answered`);
    if (skipped) parts.push(`${skipped} skipped`);
    if (rulesThisSitting)
      parts.push(`${rulesThisSitting} rule${rulesThisSitting === 1 ? "" : "s"} drafted`);
    return parts.join(" · ");
  }, [cardsAnswered, rulesThisSitting, skipped]);

  // ── the start screen ─────────────────────────────────────────────────────
  if (!deck) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 overflow-y-auto px-4 pb-safe pt-6 sm:px-6">
        <div className="space-y-3 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <Shuffle className="h-7 w-7" />
          </span>
          <h2 className="text-2xl font-semibold text-foreground">
            Three at a time
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground">
            We deal you three real options from your own craft. You pick one and
            say why in a line — out loud is fine. That line becomes a draft rule.
            About fifteen seconds each.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-center text-sm font-medium text-foreground">
            What should we ask you?
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {(Object.keys(MODE_COPY) as TriadMode[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                aria-pressed={mode === option}
                className={cn(
                  "min-h-11 flex-1 rounded-xl border-2 p-3 text-left transition-colors",
                  mode === option
                    ? "border-violet-500/60 bg-violet-500/5"
                    : "border-border bg-card hover:border-violet-500/40",
                )}
              >
                <span className="block text-base font-medium text-foreground">
                  {MODE_COPY[option].label}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {MODE_COPY[option].question}
                </span>
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Leave it alone and we use whatever your organization set.
          </p>
        </div>

        {dealError ? (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {dealError}
          </p>
        ) : null}

        <Button
          size="lg"
          className="min-h-12 w-full text-base"
          disabled={dealing}
          onClick={() => void deal(mode ?? undefined)}
        >
          {dealing ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Writing your cards…
            </>
          ) : (
            <>
              Deal me in
              <ArrowRight className="ml-2 h-5 w-5" />
            </>
          )}
        </Button>
        <div className="flex justify-center">
          <AgentCredit mandate={TRIAD_GENERATOR_MANDATE} />
        </div>
      </div>
    );
  }

  // ── the end of a round ───────────────────────────────────────────────────
  if (!card) {
    const failures = Object.values(saveStates).filter((s) => s.kind === "failed");
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 overflow-y-auto px-4 pb-safe pt-6 sm:px-6">
        <div className="space-y-2 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Check className="h-7 w-7" />
          </span>
          <h2 className="text-2xl font-semibold text-foreground">
            That's the round
          </h2>
          <p className="text-base text-muted-foreground">
            {sessionLine || "Nothing answered this round."}
          </p>
        </div>
        {failures.length > 0 ? (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {failures.length} card{failures.length === 1 ? "" : "s"} didn't save.
            Deal again and play {failures.length === 1 ? "it" : "them"} once
            more — nothing of yours was written for{" "}
            {failures.length === 1 ? "it" : "them"}.
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            size="lg"
            className="min-h-12 flex-1 text-base"
            disabled={dealing}
            onClick={() => void deal(deck.mode)}
          >
            {dealing ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Writing your cards…
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-5 w-5" />
                Deal another round
              </>
            )}
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="min-h-12 flex-1 text-base"
          >
            <Link href={`/masterwork/${rulebookId}`}>
              See what landed{rulesThisSitting ? ` (${rulesThisSitting})` : ""}
            </Link>
          </Button>
        </div>
        {dealError ? (
          <p className="text-center text-sm text-amber-700 dark:text-amber-400">
            {dealError}
          </p>
        ) : null}
      </div>
    );
  }

  // ── a card ───────────────────────────────────────────────────────────────
  const lastState = saveStates[deck.triads[index - 1]?.id ?? ""];

  return (
    <MasterworkDictationOrigin
      surface="masterwork.triad_game"
      rulebookId={rulebookId}
      rulebookName={rulebookName}
    >
      {/* 🚨 ONE SCROLL REGION, AND THE FOOTER IS NOT IN IT (found live on a
          phone, 2026-09-15). The lane frame is `overflow-hidden`, so a column
          that simply grew put the third item and the whole "why?" box below the
          fold with NO way to reach them — a forced choice you cannot answer.
          The card body scrolls; the progress line and the footer do not. */}
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-4 pt-4 sm:px-6">
        {/* Where you are, and what the last card did. Both are facts, so both
            are on screen — a progress bar that hides the save state is the
            screen telling half the truth. */}
        <div className="flex shrink-0 items-center justify-between gap-3">
          <span className="text-sm font-medium text-muted-foreground">
            Card {index + 1} of {deck.triads.length}
          </span>
          <LastCardStatus state={lastState} />
        </div>
        <div
          className="mt-2 h-1 w-full shrink-0 overflow-hidden rounded-full bg-muted"
          role="presentation"
        >
          <div
            className="h-full rounded-full bg-violet-500 transition-all duration-300"
            style={{ width: `${(index / deck.triads.length) * 100}%` }}
          />
        </div>

        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={dragX ? { transform: `translateX(${dragX}px)` } : undefined}
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain py-4",
            dragX === 0 && "transition-transform duration-200",
          )}
        >
          <p className="text-lg font-medium leading-relaxed text-foreground">
            {card.prompt}
          </p>
          <p className="text-sm font-medium text-violet-600 dark:text-violet-400">
            {copy.question}
          </p>

          <div className="flex flex-col gap-3">
            {card.items.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setPick(item.key)}
                aria-pressed={pick === item.key}
                // A stable handle for the three items. The shell's own nav uses
                // aria-pressed too, so "the pressable thing on this screen" is
                // not an identity — anything driving this surface (a harness, a
                // future agent write target) needs one that is.
                data-triad-item={item.key}
                className={cn(
                  "min-h-11 rounded-2xl border-2 p-4 text-left transition-all",
                  pick === item.key
                    ? "border-violet-500/70 bg-violet-500/5 ring-1 ring-violet-500/30"
                    : "border-border bg-card hover:border-violet-500/40",
                )}
              >
                <span className="block text-base leading-relaxed text-foreground">
                  {item.text}
                </span>
                {item.note ? (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {item.note}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {pick ? (
            <div className="space-y-2">
              <label
                htmlFor="triad-reason"
                className="block text-base font-medium text-foreground"
              >
                Why that one?
              </label>
              <p className="text-sm text-muted-foreground">
                One line is plenty. This sentence is the rule — the cards are
                just what made you say it.
              </p>
              <ProTextarea
                id="triad-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                onTranscriptionComplete={(text) =>
                  setReason((prev) => (prev ? `${prev} ${text}` : text))
                }
                enableVoice={deck.voiceDefaultOn}
                placeholder="Because…"
                className="text-base"
                minHeight={96}
                surfaceName="matrx-user/masterwork-rulebook"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{copy.hint}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-background/95 pb-safe pt-3 backdrop-blur sm:flex-row-reverse">
          <Button
            size="lg"
            className="min-h-12 flex-1 text-base"
            disabled={!pick || !reason.trim()}
            onClick={answerAndAdvance}
          >
            {remaining > 1 ? "Save and next" : "Save and finish"}
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="min-h-12 text-base text-muted-foreground sm:flex-none"
            onClick={skip}
          >
            <SkipForward className="mr-2 h-5 w-5" />
            Skip this one
          </Button>
        </div>
      </div>
    </MasterworkDictationOrigin>
  );
}

/** The previous card's fate, in one short honest phrase. */
function LastCardStatus({ state }: { state: SaveState | undefined }) {
  if (!state || state.kind === "idle") return null;
  if (state.kind === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Saving the last one…
      </span>
    );
  }
  if (state.kind === "failed") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
        <TriangleAlert className="h-4 w-4" />
        Last one didn't save
      </span>
    );
  }
  if (state.alreadyPlayed) {
    return (
      <span className="text-sm text-muted-foreground">
        Already had that one
      </span>
    );
  }
  if (state.added === 0) {
    return (
      <span className="text-sm text-muted-foreground">
        Nothing new from that one
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
      <Check className="h-4 w-4" />
      {state.added} rule{state.added === 1 ? "" : "s"} drafted
      {state.unverified ? " (1 quote flagged)" : ""}
    </span>
  );
}
