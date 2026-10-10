"use client";

/**
 * @registry-status: inline-window
 * IllustrateSetWindow — the floating surface for the per-SET image lane.
 *
 * Two lives, one window (THE FLOATING LAW: a spinner is never the answer, and a
 * live-run block at the top of a page is banned — this floats beside the deck
 * so nothing the user is reading moves):
 *
 *   1. WHILE RUNNING — every settled card shows its picture the moment it
 *      lands (review can start right away), the rest wait below, and Stop
 *      ends the spend now (it aborts the stream; aidream's source-set cancels on
 *      disconnect). Closing the window mid-run stops it too.
 *   2. AFTER THE RUN — the same review rows: the picture, the sourcing
 *      agent's own trust reasoning, and Keep / Reject per card, plus
 *      "Illustrate N more" when cards are left (a run starts as ONE trial
 *      card, confirmed, so nobody buys a whole deck sight unseen). A rejection is
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
  Circle,
  Square,
  ExternalLink,
  ImageOff,
  Loader2,
  Maximize2,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { FlashcardFaceImage } from "@/components/mardown-display/blocks/flashcards/FlashcardFaceImage";
import { cn } from "@/lib/utils";
import {
  type IllustrateCardState,
  type IllustrateRunState,
} from "./illustrateSetRun";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface IllustrateSetWindowProps {
  run: IllustrateRunState;
  setName: string;
  onClose: () => void;
  /** Stop the run at the next card — the server sources nothing after it. */
  onStop: () => void;
  /** Cards in the deck still without a picture — offered as the next run. */
  remainingCount: number;
  /** Run the rest of the deck (the page confirms the cost first). */
  onContinue: () => void;
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
      <button
        type="button"
        onClick={() => onOpenCard(card.cardId)}
        className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30"
        title="Open this card"
      >
        {attached && result?.image_url ? (
          <FlashcardFaceImage
            image={{ url: result.image_url, alt: result.alt_text }}
            className="h-full"
          />
        ) : (
          <ImageOff className="h-5 w-5 text-muted-foreground/50" />
        )}
      </button>
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
              <p
                className="mt-1 line-clamp-3 rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs leading-relaxed text-foreground/80"
                title={judgment.reasoning}
              >
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
                icon={busy === "keep" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Check />
                )}
                variant="quiet"
                disabled={busy !== null}
                onClick={() => void act("keep", onKeep)}
                title="Keep this image on the card"
              >
                Keep
              </Button>
              <Button
                icon={busy === "reject" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Trash2 />
                )}
                variant="quiet"
                disabled={busy !== null}
                onClick={async () => {
                  // A tooltip is not a gate: rejecting takes the picture off
                  // the card, so the click says what disappears.
                  const ok = await confirm({
                    title: "Reject this image?",
                    description: `The image is removed from “${card.label}” and the miss is recorded so the agent learns.`,
                    confirmLabel: "Reject image",
                    variant: "destructive",
                  });
                  if (!ok) return;
                  void act("reject", onReject);
                }}
                title="Reject this image (removed, and the agent's miss is recorded)"
                aria-label={`Reject the image on ${card.label}`}
              />
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
  onStop,
  remainingCount,
  onContinue,
  onKeep,
  onReject,
  onOpenCard,
}: IllustrateSetWindowProps) {
  const live =
    run.phase === "starting" ||
    run.phase === "running" ||
    run.phase === "stopping";
  const settled = run.cards.filter(
    (c) => c.status === "completed" || c.status === "failed",
  );
  const pending = run.cards.filter(
    (c) => c.status === "waiting" || c.status === "running",
  );
  const attachedCards = settled.filter((c) => c.result?.attached);
  const total = run.cards.length;

  const { width, height } = computeViewportSize();

  let status: string;
  if (run.phase === "starting") status = "Starting…";
  else if (run.phase === "stopping") status = "Stopping…";
  else if (live) status = `${settled.length} of ${total} cards`;
  else if (run.phase === "stopped")
    status = `Stopped · ${attachedCards.length} of ${settled.length} got an image`;
  else status = `${attachedCards.length} of ${settled.length} got an image`;

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
      <div className="shrink-0 border-b border-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{status}</span>
          {live ? (
            <Button
              icon={run.phase === "stopping" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Square />
              )}
              variant="outline"
              disabled={run.phase === "stopping"}
              onClick={onStop}
              title="Stop now — no more cards are searched"
            >
              Stop
            </Button>
          ) : (
            remainingCount > 0 &&
            run.phase !== "refused" && (
              <Button
                variant="primary"
                onClick={onContinue}
              >
                Illustrate {remainingCount} more
              </Button>
            )
          )}
        </div>
        {total > 0 && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${(settled.length / total) * 100}%` }}
            />
          </div>
        )}
        {(run.skippedExisting > 0 || run.trimmedByLimit > 0) && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {run.skippedExisting > 0 && `${run.skippedExisting} already had one`}
            {run.skippedExisting > 0 && run.trimmedByLimit > 0 && " · "}
            {run.trimmedByLimit > 0 &&
              `${run.trimmedByLimit} left for later (plan limit)`}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {run.message && (
          <div className="m-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {run.message} <ErrorAlchemyMenu input={{ message: run.message }} />
            </span>
          </div>
        )}

        {settled.map((card) => (
          <ReviewRow
            key={card.cardId}
            card={card}
            onKeep={onKeep}
            onReject={onReject}
            onOpenCard={onOpenCard}
          />
        ))}

        {pending.map((card) => (
          <div
            key={card.cardId}
            className="flex items-center gap-2 border-t border-border px-3 py-2 text-sm"
          >
            {card.status === "running" && live ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            )}
            <span className="min-w-0 flex-1 truncate text-foreground/80">
              {card.label}
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {!live
                ? "Not run"
                : card.status === "running"
                  ? "Finding an image"
                  : "Waiting"}
            </span>
          </div>
        ))}

        {!live && settled.length === 0 && pending.length === 0 && !run.message && (
          <p className="p-4 text-sm text-muted-foreground">
            No cards were sourced in this run.
          </p>
        )}
      </div>
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
