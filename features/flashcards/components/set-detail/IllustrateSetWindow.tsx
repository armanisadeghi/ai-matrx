"use client";

/**
 * @registry-status: inline-window
 * IllustrateSetWindow — the floating surface for the per-SET image lane.
 *
 * Two lives, one window (THE FLOATING LAW: a spinner is never the answer, and a
 * live-run block at the top of a page is banned — this floats beside the deck
 * so nothing the user is reading moves):
 *
 *   1. WHILE RUNNING — the canonical `LiveRunProgress` rows, one per card,
 *      streamed from aidream `/education/images/source-set` as each card
 *      settles (~30-60s each).
 *   2. AFTER THE RUN — the review pass: what got attached, the sourcing
 *      agent's own trust reasoning, and Keep / Reject per card. A rejection is
 *      RECORDED on the detail row before the soft-delete
 *      (`fcService.reviewCardImage`) so judge accuracy can learn from it.
 *
 * Rendered inline by `SetDetailView` (not a registered overlay): the run state
 * and every review callback live in the page. Converting it to a registered
 * window would need its callbacks wrapped in a callback-bus group first (see
 * ImageUploaderWindow).
 */

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  ImageOff,
  Loader2,
  Maximize2,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { LiveRunProgress } from "@/features/agents/components/live-run/LiveRunProgress";
import { FlashcardFaceImage } from "@/components/mardown-display/blocks/flashcards/FlashcardFaceImage";
import { cn } from "@/lib/utils";
import {
  toProgressState,
  type IllustrateCardState,
  type IllustrateRunState,
} from "./illustrateSetRun";

export interface IllustrateSetWindowProps {
  run: IllustrateRunState;
  setName: string;
  onClose: () => void;
  /** Keep the picture — records the human "yes" on the detail row. */
  onKeep: (card: IllustrateCardState) => Promise<void>;
  /** Reject it — records the "no" on the row, THEN soft-deletes the image. */
  onReject: (card: IllustrateCardState) => Promise<void>;
  /** The door: open this card so the reviewer can see it in full. */
  onOpenCard: (cardId: string) => void;
}

function ReviewRow({
  card,
  onKeep,
  onReject,
  onOpenCard,
}: {
  card: IllustrateCardState;
  onKeep: (card: IllustrateCardState) => Promise<void>;
  onReject: (card: IllustrateCardState) => Promise<void>;
  onOpenCard: (cardId: string) => void;
}) {
  const [busy, setBusy] = useState<"keep" | "reject" | null>(null);
  const result = card.result;
  const attached = Boolean(result?.attached);
  const judgment = result?.judgment;

  const act = async (
    verdict: "keep" | "reject",
    fn: (c: IllustrateCardState) => Promise<void>,
  ) => {
    setBusy(verdict);
    try {
      await fn(card);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex gap-3 border-t border-border p-3 first:border-t-0">
      <div className="shrink-0">
        {attached && result?.image_url ? (
          <FlashcardFaceImage
            image={{ url: result.image_url, alt: result.alt_text }}
            size="thumb"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-sm border border-dashed border-border text-muted-foreground/50">
            <ImageOff className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => onOpenCard(card.cardId)}
            className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground hover:text-primary hover:underline"
            title="Open this card"
          >
            {card.label}
          </button>
          <Maximize2
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
            aria-hidden
          />
        </div>

        {attached ? (
          <>
            {judgment?.reasoning && (
              <p className="mt-1 rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs leading-relaxed text-foreground/80">
                {judgment.reasoning}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {judgment?.source_trust && (
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  {judgment.source_trust}
                  {typeof judgment.trust_score === "number" &&
                    ` · ${judgment.trust_score.toFixed(2)}`}
                </span>
              )}
              {result?.candidate?.page_url && (
                <a
                  href={result.candidate.page_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {result.candidate.domain || "Source page"}
                </a>
              )}
              {result?.alt_text && (
                <span className="truncate">Alt: {result.alt_text}</span>
              )}
            </div>
          </>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            {card.status === "failed"
              ? card.error || "Sourcing failed for this card."
              : result?.refusal_reason ||
                "No image cleared the bar — the agent refused rather than attach a wrong picture."}
          </p>
        )}
      </div>

      {attached && (
        <div className="flex shrink-0 items-start gap-1">
          {card.review ? (
            <span
              className={cn(
                "mt-1 text-[11px] font-medium",
                card.review === "accepted"
                  ? "text-emerald-600"
                  : "text-muted-foreground",
              )}
            >
              {card.review === "accepted" ? "Kept" : "Removed"}
            </span>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                disabled={busy !== null}
                onClick={() => void act("keep", onKeep)}
                title="Keep this image on the card"
              >
                {busy === "keep" ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="mr-1 h-3.5 w-3.5" />
                )}
                Keep
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                disabled={busy !== null}
                onClick={() => void act("reject", onReject)}
                title="Reject this image (removed, and the agent's miss is recorded)"
                aria-label={`Reject the image on ${card.label}`}
              >
                {busy === "reject" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function IllustrateSetWindow({
  run,
  setName,
  onClose,
  onKeep,
  onReject,
  onOpenCard,
}: IllustrateSetWindowProps) {
  const live = run.phase === "starting" || run.phase === "running";
  const settled = run.cards.filter((c) => c.status !== "waiting" && c.status !== "running");
  const attachedCards = settled.filter((c) => c.result?.attached);

  const { width, height } = computeViewportSize();

  return (
    <WindowPanel
      id="flashcard-illustrate-set-window"
      title={live ? `Illustrating ${setName}` : `Review images — ${setName}`}
      onClose={onClose}
      minWidth={380}
      minHeight={320}
      width={width}
      height={height}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      {live ? (
        <div className="min-h-0 flex-1">
          <LiveRunProgress progress={toProgressState(run, setName)} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {(run.phase === "refused" || run.phase === "error") && (
            <div className="m-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{run.message}</span>
            </div>
          )}

          <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
            {attachedCards.length} of {settled.length} cards got an image
            {run.skippedExisting > 0 &&
              ` · ${run.skippedExisting} already had one`}
            {run.trimmedByLimit > 0 &&
              ` · ${run.trimmedByLimit} left for later (plan limit)`}
            . Keep what's right; rejecting records the miss so the judge improves.
          </div>

          {settled.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Nothing to review — no cards were sourced in this run.
            </p>
          ) : (
            settled.map((card) => (
              <ReviewRow
                key={card.cardId}
                card={card}
                onKeep={onKeep}
                onReject={onReject}
                onOpenCard={onOpenCard}
              />
            ))
          )}
        </div>
      )}
    </WindowPanel>
  );
}

function computeViewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 640, height: 560 };
  return {
    width: Math.min(Math.round(window.innerWidth * 0.55), 720),
    height: Math.min(Math.round(window.innerHeight * 0.75), 760),
  };
}

export default IllustrateSetWindow;
