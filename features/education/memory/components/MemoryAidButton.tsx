"use client";

// features/education/memory/components/MemoryAidButton.tsx
//
// VISION §11 "Proactive suggestions" — the opt-in, per-card memory-aid
// affordance surfaced inside the flashcards StudyDeck. Tap it and it fetches a
// single glanceable mnemonic/analogy/association for the current card (the
// memory_hint lane), STREAMED into the floating LiveRunWindow while it is
// written (THE FLOATING LAW — never a spinner while AI works; the card the
// learner is studying never moves). Deliberately opt-in and non-disruptive: nothing fires until
// tapped and it never blocks grading.
//
// D151: the aid is PERSISTED as an `fc_detail` layer on the card the instant it
// arrives (by the lane, through the primitive's `onResult` seam). Advancing the
// card used to erase it; now the card carries it, and coming back shows the aid
// this learner already paid for instead of charging for it twice.
//
// Mirrors the deck's existing AskAiPanel affordance. React Compiler is on.

import { useEffect, useState } from "react";
import { Brain, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useFloatingRunWindow } from "@/features/agents/hooks/useFloatingAgentRun";
import { memoryHint, memoryHintFromDetail } from "../lanes/memoryHint";
import type { HintTechnique, MemoryHintPayload } from "../types";

const TECHNIQUE_LABEL: Record<HintTechnique, string> = {
  acronym: "Acronym",
  acrostic: "Acrostic",
  rhyme: "Rhyme",
  sentence: "Sentence",
  keyword: "Keyword",
  chunking: "Chunking",
  analogy: "Analogy",
  association: "Association",
};

export function MemoryAidButton({
  cardId,
  front,
  back,
  topic,
  existingDetails,
  className,
}: {
  /** The card the aid belongs to — the row it is persisted on (D151). */
  cardId: string;
  front: string;
  back: string;
  topic?: string | null;
  /**
   * The card's already-loaded `fc_detail` rows. Any aid this lane produced on a
   * previous visit is in here, so the learner comes back to the card and finds
   * it — instead of paying for the same mnemonic again.
   */
  existingDetails?: { kind: string; text: string; metadata: unknown }[];
  className?: string;
}) {
  const dispatch = useAppDispatch();
  // One window for this card slot, reused by every "another memory aid" tap.
  const liveWindow = useFloatingRunWindow({
    instanceId: "flashcards-memory-hint",
  });
  const [loading, setLoading] = useState(false);
  const [asked, setAsked] = useState(false);
  const [hint, setHint] = useState<MemoryHintPayload | null>(null);

  // Reset the LIVE run state when the card changes. The stored aid below is
  // keyed off the card's own rows, so it needs no reset — that difference is
  // the whole point: this effect used to be what destroyed the paid result.
  useEffect(() => {
    setHint(null);
    setAsked(false);
    setLoading(false);
  }, [cardId]);

  // The newest aid persisted on this card, if any.
  const stored = (() => {
    const rows = existingDetails ?? [];
    for (let i = rows.length - 1; i >= 0; i--) {
      const parsed = memoryHintFromDetail(rows[i]);
      if (parsed) return parsed;
    }
    return null;
  })();
  const shown = hint ?? stored;

  async function fetchHint() {
    setLoading(true);
    setAsked(true);
    setHint(null);
    // Float FIRST, before the launch — the aid is written in front of the
    // learner instead of behind a spinner.
    const live = liveWindow.start("Finding you a memory aid");
    const result = await dispatch(
      memoryHint({
        front,
        back,
        topic,
        cardId,
        onConversationCreated: live.bind,
      }),
    );
    setHint(result);
    setLoading(false);
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full gap-1.5 text-xs"
        onClick={() => void fetchHint()}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Brain className="h-3.5 w-3.5" />
        )}
        {shown || asked ? "Another memory aid" : "Give me a memory aid"}
      </Button>

      {shown && (
        <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {TECHNIQUE_LABEL[shown.technique]}
            </span>
          </div>
          <p className="font-medium text-foreground">{shown.aid}</p>
          {shown.explanation && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {shown.explanation}
            </p>
          )}
        </div>
      )}

      {asked && !loading && !shown && (
        <div className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Couldn&apos;t come up with a memory aid for this card right now.
        </div>
      )}
    </div>
  );
}
