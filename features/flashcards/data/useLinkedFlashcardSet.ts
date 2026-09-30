// features/flashcards/data/useLinkedFlashcardSet.ts
//
// The bridge from a chat/canvas flashcards artifact to its real deck.
//
// Every flashcard_set an agent emits in chat is materialized into a canonical
// education.fc_set by FLASHCARDS_CANONICAL_ADAPTER, which links the
// canvas_items row via external_system = 'fc_set'. This hook reads that link
// so any surface showing the artifact can open the deck in Flashcards.
//
// The canvas row is written a moment BEFORE the adapter links it, so a row
// read inside that window has no link yet: re-read a few times with backoff
// before concluding the artifact is unlinked.

"use client";

import { useEffect, useRef } from "react";
import { useCanvasItem } from "@/features/canvas/hooks/useCanvasItem";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";
import { flashcardSetHref } from "../routes";

export const FC_SET_EXTERNAL_SYSTEM = "fc_set";

const LINK_RETRY_DELAYS_MS = [2_000, 5_000, 12_000];

export interface LinkedFlashcardSet {
  /** The linked education.fc_set id, or null while unlinked / loading. */
  setId: string | null;
  /** The deck page in Flashcards, or null while unlinked. */
  href: string | null;
}

export function useLinkedFlashcardSet(
  artifactId: string | null | undefined,
): LinkedFlashcardSet {
  const materializedId = isMaterializedArtifactId(artifactId)
    ? (artifactId as string)
    : null;
  const { row, loading, refetch } = useCanvasItem(materializedId, {
    // The inline block is the durable fallback; a missing row is not an error here.
    reportUnavailable: false,
  });
  const attemptsRef = useRef(0);

  const setId =
    row?.external_system === FC_SET_EXTERNAL_SYSTEM && row.external_id
      ? row.external_id
      : null;

  useEffect(() => {
    attemptsRef.current = 0;
  }, [materializedId]);

  useEffect(() => {
    if (!materializedId || loading || !row || setId) return undefined;
    if (row.external_system) return undefined; // linked elsewhere — final
    const delay = LINK_RETRY_DELAYS_MS[attemptsRef.current];
    if (delay == null) return undefined;
    const timer = setTimeout(() => {
      attemptsRef.current += 1;
      refetch();
    }, delay);
    return () => clearTimeout(timer);
  }, [materializedId, loading, row, setId, refetch]);

  return { setId, href: setId ? flashcardSetHref({ id: setId }) : null };
}
