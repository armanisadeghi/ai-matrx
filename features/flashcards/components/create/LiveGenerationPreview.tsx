"use client";

/**
 * Live card-by-card preview while the generateCards agent streams.
 *
 * The agent's answer text feeds content-ir's useLiveJsonRegion with
 * expectedRootKind "flashcard_set" — the parser types the whole tree from
 * the parent prediction (no __kind needed in the payload), and every card
 * mounts the moment its `front` arrives, back showing the per-card loader
 * until it streams in. This kills the "spinner until everything is done"
 * experience without touching the extraction path that persists the set.
 */

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAnswerText,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { useLiveJsonRegion } from "@/features/content-ir/react/useLiveJsonRegion";
import { flashcardsServerDataFromEnvelope } from "@/features/content-ir/kinds/flashcard-set";
import type { FlashcardsBlockData } from "@/types/python-generated/stream-events";

const FlashcardsBlock = dynamic(
  () =>
    import("@/components/mardown-display/blocks/flashcards/FlashcardsBlock"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-24 items-center justify-center rounded-lg border border-border bg-muted/30">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

export function LiveGenerationPreview({
  requestId,
}: {
  requestId: string | null;
}) {
  const answerText = useAppSelector((state) =>
    requestId ? selectAnswerText(requestId)(state) : "",
  );
  const status = useAppSelector((state) =>
    requestId ? selectRequestStatus(requestId)(state) : null,
  );

  const { envelope } = useLiveJsonRegion(
    requestId ? `flashcards-live:${requestId}` : null,
    answerText,
    {
      expectedRootKind: "flashcard_set",
      done: status === "completed" || status === "error",
    },
  );

  const serverData = envelope
    ? (flashcardsServerDataFromEnvelope(envelope) as
        | FlashcardsBlockData
        | undefined)
    : undefined;

  if (!serverData || serverData.cards.length === 0) {
    return null; // caller keeps its own "warming up" state until cards exist
  }

  return <FlashcardsBlock serverData={serverData} />;
}
