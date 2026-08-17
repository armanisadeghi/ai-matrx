"use client";

// features/education/memory/components/MemoryAidButton.tsx
//
// VISION §11 "Proactive suggestions" — the opt-in, per-card memory-aid
// affordance surfaced inside the flashcards StudyDeck. Tap it and it fetches a
// single glanceable mnemonic/analogy/association for the current card (the
// memory_hint lane), STREAMING INLINE into the exact spot the finished aid
// occupies — the aid area sits under the card and the page only grows
// downward, which is the earned inline exception to THE FLOATING LAW. The
// window panel does NOT auto-open here: this surface has its own proper place
// to render the run, so floating a second copy of it was pure noise (and,
// before `memory_hint` was a registered kind, it showed raw JSON). Instead, a
// "Chat about this" button opens the run's conversation in the canonical
// LiveRunWindow on demand.
//
// The finished aid renders through `MemoryHintBlock` — the ONE component for
// the registered `memory_hint` kind (THE CANONICAL COMPONENT LAW; the
// hand-rolled hint card this file used to carry is deleted).
//
// D151: the aid is PERSISTED as an `fc_detail` layer on the card the instant it
// arrives (by the lane, through the primitive's `onResult` seam). Advancing the
// card used to erase it; now the card carries it, and coming back shows the aid
// this learner already paid for instead of charging for it twice.
//
// Mirrors the deck's existing AskAiPanel affordance. React Compiler is on.

import { useEffect, useRef, useState } from "react";
import { Brain, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useLiveRunHandle } from "@/features/agents/hooks/useLiveRunHandle";
import { useOpenLiveRunWindow } from "@/features/overlays/openers/liveRunWindow";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import MemoryHintBlock from "@/components/mardown-display/blocks/memory-aid/MemoryHintBlock";
import { memoryHint, memoryHintFromDetail } from "../lanes/memoryHint";
import type { MemoryHintPayload } from "@/features/content-ir/kinds/memory-aid";

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
  // The run's conversation instance is owned HERE (the inline display is the
  // screen), not by a floating window. The HOST MOUNTS THIS COMPONENT WITH
  // key={cardId}: a card change remounts it, which resets all live state and
  // releases the claimed conversation via the handle's own unmount cleanup —
  // the previous card's stream can never leak into the next card's display.
  // (The stored aid is keyed off the card's own rows, so it survives — that
  // difference is the whole point: a reset effect here once destroyed the
  // paid result, D151.)
  const run = useLiveRunHandle();
  const openWindow = useOpenLiveRunWindow();
  const [loading, setLoading] = useState(false);
  const [asked, setAsked] = useState(false);
  const [hint, setHint] = useState<MemoryHintPayload | null>(null);

  // An in-flight run that resolves AFTER this card's instance unmounted must
  // not claim a conversation (the handle's cleanup already ran — a late claim
  // would leak the instance) — the mounted ref guards both async landings.
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
    // A re-tap replaces the previous run — release it so the inline display
    // starts pending instead of replaying the old stream.
    run.release();
    // The aid streams INLINE below, in the spot the finished hint occupies —
    // no window opens; the learner can open the conversation with the chat
    // button if they want to talk to the AI about it.
    const result = await dispatch(
      memoryHint({
        front,
        back,
        topic,
        cardId,
        onConversationCreated: (conversationId) => {
          if (mountedRef.current) run.claim(conversationId);
        },
      }),
    );
    // The aid is persisted on ITS card by the lane (D151), so dropping a
    // post-unmount local paint loses nothing.
    if (!mountedRef.current) return;
    setHint(result);
    setLoading(false);
  }

  function openConversation() {
    if (!run.conversationId) return;
    openWindow({
      instanceId: "flashcards-memory-hint",
      conversationId: run.conversationId,
      label: "Memory aid",
    });
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="flex-1 gap-1.5 text-xs"
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
        {run.conversationId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={openConversation}
            aria-label="Chat about this memory aid"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Chat
          </Button>
        )}
      </div>

      {loading ? (
        // The run streams in place — the registered `memory_hint` kind renders
        // as its component token-by-token through the canonical pipeline.
        <LiveRunDisplay
          conversationId={run.conversationId}
          pending={!run.conversationId}
          label="Finding you a memory aid"
          variant="card"
          className="mt-2"
        />
      ) : shown ? (
        <MemoryHintBlock serverData={shown} className="mt-2" />
      ) : asked ? (
        <div className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Couldn&apos;t come up with a memory aid for this card right now.
        </div>
      ) : null}
    </div>
  );
}
