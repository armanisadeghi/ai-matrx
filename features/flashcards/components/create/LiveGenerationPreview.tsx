"use client";

/**
 * Live card-by-card preview while the generateCards agent streams —
 * PRESENTATIONAL. The canonical envelope comes from the parent's hoisted
 * useLiveJsonRegion (CreateFromTopic), so ONE parse session drives both this
 * display and the persisted set (generatedSetFromEnvelope).
 *
 * Every card mounts the moment its `front` arrives, back showing the
 * per-card loader until it streams in — no "spinner until everything is
 * done" experience.
 */

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { flashcardsServerDataFromEnvelope } from "@/features/content-ir/kinds/flashcard-set";
import type { CanonicalBlockIR } from "@/features/content-ir/core/ir-types";
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
  envelope,
}: {
  envelope: CanonicalBlockIR | null;
}) {
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
