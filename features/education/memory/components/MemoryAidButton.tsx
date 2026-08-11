"use client";

// features/education/memory/components/MemoryAidButton.tsx
//
// VISION §11 "Proactive suggestions" — the opt-in, per-card memory-aid
// affordance surfaced inside the flashcards StudyDeck. Tap it and it fetches a
// single glanceable mnemonic/analogy/association for the current card (the
// memory_hint lane), STREAMED into the floating LiveRunWindow while it is
// written (THE FLOATING LAW — never a spinner while AI works; the card the
// learner is studying never moves). Deliberately opt-in and non-disruptive: nothing fires until
// tapped, it never blocks grading, and it resets when the card changes.
//
// Mirrors the deck's existing AskAiPanel affordance. React Compiler is on.

import { useEffect, useState } from "react";
import { Brain, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useFloatingRunWindow } from "@/features/agents/hooks/useFloatingAgentRun";
import { memoryHint } from "../lanes/memoryHint";
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
  front,
  back,
  topic,
  className,
}: {
  front: string;
  back: string;
  topic?: string | null;
  /** A stable key for the current card — resets the hint when the card changes. */
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

  // Reset when the card content changes (a new card is shown).
  useEffect(() => {
    setHint(null);
    setAsked(false);
    setLoading(false);
  }, [front, back]);

  async function fetchHint() {
    setLoading(true);
    setAsked(true);
    setHint(null);
    // Float FIRST, before the launch — the aid is written in front of the
    // learner instead of behind a spinner.
    const live = liveWindow.start("Finding you a memory aid");
    const result = await dispatch(
      memoryHint({ front, back, topic, onConversationCreated: live.bind }),
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
        {hint || asked ? "Another memory aid" : "Give me a memory aid"}
      </Button>

      {hint && (
        <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {TECHNIQUE_LABEL[hint.technique]}
            </span>
          </div>
          <p className="font-medium text-foreground">{hint.aid}</p>
          {hint.explanation && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {hint.explanation}
            </p>
          )}
        </div>
      )}

      {asked && !loading && !hint && (
        <div className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Couldn&apos;t come up with a memory aid for this card right now.
        </div>
      )}
    </div>
  );
}
