"use client";

/**
 * The shared-deck lens — what an Anyone link to a flashcard set shows. The
 * SAME public study page as the indexable `/p/e/fc_set/<id>` viewer
 * (`PublicFlashcardDeck`): study in place, no account, progress on the device.
 *
 * Where the cards come from: the link's own `children` projection when the
 * database carries one for decks (`{ kind: "fc_set_cards", cards }`), else the
 * anon public read (`get_public_flashcard_set`), which answers for a deck that
 * is also published to the web. A private deck shared only by link has
 * neither today — the lens says so in place and keeps "Save a copy" (in the
 * share header) working, rather than rendering an empty deck.
 */

import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { createClient } from "@/utils/supabase/client";
import { PublicFlashcardDeck } from "@/features/flashcards/components/public/PublicFlashcardDeck";
import type {
  PublicFlashcard,
  PublicFlashcardSetPayload,
} from "@/features/flashcards/data/publicDeck";
import type { ShareLensProps } from "./registry";

function str(row: Record<string, unknown> | undefined, key: string): string {
  const v = row?.[key];
  return typeof v === "string" ? v : "";
}

function cardsFromChildren(
  children: Record<string, unknown> | null | undefined,
): PublicFlashcard[] | null {
  if (!children || children.kind !== "fc_set_cards") return null;
  return Array.isArray(children.cards) ? (children.cards as PublicFlashcard[]) : null;
}

type Load =
  | { state: "loading" }
  | { state: "ready"; cards: PublicFlashcard[] }
  | { state: "unavailable" };

export function FlashcardSetShareLens({ result }: ShareLensProps) {
  const setId = result.resourceId ?? "";
  const linked = cardsFromChildren(result.children);
  const hasLinked = linked !== null;
  const [load, setLoad] = useState<Load>(
    linked
      ? { state: "ready", cards: linked }
      : setId
        ? { state: "loading" }
        : { state: "unavailable" },
  );

  useEffect(() => {
    if (hasLinked || !setId) return undefined;
    let cancelled = false;
    void (async () => {
      const { data, error } = await createClient().rpc("get_public_flashcard_set", {
        p_set_id: setId,
      });
      if (cancelled) return;
      const payload = data as PublicFlashcardSetPayload | null;
      if (error) console.error("[FlashcardSetShareLens] get_public_flashcard_set:", error);
      setLoad(
        payload?.success && Array.isArray(payload.cards)
          ? { state: "ready", cards: payload.cards }
          : { state: "unavailable" },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [setId, hasLinked]);

  const title = str(result.resource, "name") || str(result.resource, "title") || "Flashcard set";
  const description = str(result.resource, "description") || null;

  if (load.state === "loading") {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <MatrxMiniLoader />
      </div>
    );
  }

  if (load.state === "unavailable") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-2 rounded-xl border border-border bg-card px-6 py-12 text-center">
        <Layers className="h-6 w-6 text-muted-foreground" />
        <p className="text-lg font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">
          Save a copy to study these cards.
        </p>
      </div>
    );
  }

  return (
    <PublicFlashcardDeck
      setId={setId}
      title={title}
      description={description}
      label={result.displayLabel ?? "Flashcard set"}
      cards={load.cards}
    />
  );
}
