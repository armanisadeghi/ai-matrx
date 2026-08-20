// features/flashcards/data/offlineDeck.ts
//
// THE DOWNLOAD — the missing half of offline study (IC-8 §4).
//
// `features/education/study/offline/outbox.ts` has always owned the durable
// deck cache (`putOfflineDeck` / `getOfflineDeck` / `removeOfflineDeck`), and
// `OfflineStudyPanel` has always told the learner to "choose Download". Until
// this file existed there was no Download: all three deck functions had zero
// callers, the downloaded list could never be non-empty, and the offline read
// path was never called. The panel was instructing users to press a button
// nobody had built.
//
// This module is that button's engine, and it lives HERE rather than in
// `features/education` for one reason: capturing a deck snapshot needs
// `fcService` + `studyService`, and flashcards already depends on education
// study. Putting it under education would invert that edge.
//
// WHAT A SNAPSHOT CONTAINS, and why each part:
//   • the set row + ordered cards with their detail rows — everything
//     `<StudyDeck/>` renders, so a downloaded deck opens with no request;
//   • the learner's `item_mastery` rows for those cards — so the mastery pills
//     and the FSRS-derived ordering are honest offline instead of blank;
//   • the due-at-cache-time queue (card ids due when the download happened) —
//     a snapshot, deliberately not recomputed offline.
//
// WHAT A SNAPSHOT DOES NOT CONTAIN: any derived FSRS state to be written back.
// Same rule as the attempt outbox — we cache what is TRUE, and every answer
// still replays through the ledger. A snapshot is a read cache, never a
// write-back source.

import { fcService } from "./fcService";
import { studyService } from "@/features/education/study/service/studyService";
import {
  getOfflineDeck,
  putOfflineDeck,
  removeOfflineDeck,
  isOutboxAvailable,
  type OfflineDeck,
} from "@/features/education/study/offline/outbox";
import { isNetworkFailure } from "@/features/education/study/offline/recordAttemptOffline";
import type { FcSetRow, CardWithDetails } from "./types";
import type { ItemMasteryRow } from "@/features/education/study/types";

/** The study item type every flashcard mastery row is keyed by. */
const FC_CARD_ITEM_TYPE = "fc_card";

/** The typed shape stored in `OfflineDeck.payload` (typed `unknown` there so
 *  the outbox stays item-type agnostic — quizzes will cache a different one). */
export interface OfflineDeckPayload {
  set: FcSetRow;
  cards: CardWithDetails[];
}

export interface OfflineDeckSnapshot {
  set: FcSetRow;
  cards: CardWithDetails[];
  /** Mastery by card id, as of the download. */
  masteryByCard: Record<string, ItemMasteryRow | undefined>;
  /** Card ids that were due when the deck was downloaded. */
  dueCardIds: string[];
  cachedAt: number;
}

export interface OfflineDeckStatus {
  /** False when this browser cannot persist anything (private mode, quota). */
  available: boolean;
  downloaded: boolean;
  cachedAt: number | null;
  cardCount: number | null;
}

function isPayload(value: unknown): value is OfflineDeckPayload {
  if (typeof value !== "object" || value === null) return false;
  const p = value as { set?: unknown; cards?: unknown };
  return (
    typeof p.set === "object" && p.set !== null && Array.isArray(p.cards)
  );
}

/**
 * Capture this deck for offline study. Returns a structured outcome rather
 * than throwing: the caller is a button, and "your download did not save"
 * must be sayable out loud (never a silent no-op — the same loud-recovery rule
 * the outbox itself follows).
 */
export async function downloadDeckOffline(
  userId: string,
  setId: string,
): Promise<{ ok: boolean; cardCount: number; error: string | null }> {
  if (!userId) {
    return { ok: false, cardCount: 0, error: "Sign in to download decks." };
  }
  if (!isOutboxAvailable()) {
    return {
      ok: false,
      cardCount: 0,
      error:
        "This browser can't store decks offline (private browsing or no storage space).",
    };
  }

  const setRes = await fcService.getSetWithCards(setId);
  if (!setRes.data) {
    return {
      ok: false,
      cardCount: 0,
      error: setRes.error ?? "Couldn't load this deck to download it.",
    };
  }
  const { set, cards } = setRes.data;

  // Mastery + due are BEST EFFORT: a deck whose cards downloaded but whose
  // mastery snapshot failed is still fully studiable, and refusing the whole
  // download over a missing progress overlay would be the wrong trade.
  const cardIds = new Set(cards.map((c) => c.id));
  const masteryRes =
    cards.length > 0
      ? await studyService.getMasteryBulk(
          cards.map((c) => ({ itemType: FC_CARD_ITEM_TYPE, itemId: c.id })),
        )
      : { data: [] as ItemMasteryRow[], error: null };
  if (masteryRes.error) {
    console.warn("[offlineDeck] mastery snapshot skipped:", masteryRes.error);
  }

  const dueRes = await studyService.listDue(FC_CARD_ITEM_TYPE, 500);
  if (dueRes.error) {
    console.warn("[offlineDeck] due snapshot skipped:", dueRes.error);
  }
  const dueCardIds = (dueRes.data ?? [])
    .filter((m) => cardIds.has(m.item_id))
    .map((m) => m.item_id);

  const deck: OfflineDeck = {
    setId,
    userId,
    payload: { set, cards } satisfies OfflineDeckPayload,
    mastery: masteryRes.data ?? [],
    dueQueue: dueCardIds,
    cachedAt: Date.now(),
    title: set.name,
    cardCount: cards.length,
  };

  const stored = await putOfflineDeck(deck);
  if (!stored) {
    return {
      ok: false,
      cardCount: cards.length,
      error: "Couldn't save this deck for offline study — storage is full.",
    };
  }
  return { ok: true, cardCount: cards.length, error: null };
}

/**
 * Read a downloaded deck back. THE READ PATH — this is what lets a deck open
 * with no connection instead of showing "couldn't load this set".
 */
export async function readOfflineDeck(
  userId: string,
  setId: string,
): Promise<OfflineDeckSnapshot | null> {
  if (!userId) return null;
  const deck = await getOfflineDeck(userId, setId);
  if (!deck || !isPayload(deck.payload)) return null;

  const masteryByCard: Record<string, ItemMasteryRow | undefined> = {};
  if (Array.isArray(deck.mastery)) {
    for (const row of deck.mastery as ItemMasteryRow[]) {
      if (row && typeof row.item_id === "string") masteryByCard[row.item_id] = row;
    }
  }

  return {
    set: deck.payload.set,
    cards: deck.payload.cards,
    masteryByCard,
    dueCardIds: Array.isArray(deck.dueQueue) ? (deck.dueQueue as string[]) : [],
    cachedAt: deck.cachedAt,
  };
}

/** Is this deck downloaded on this device, for this learner? */
export async function getOfflineDeckStatus(
  userId: string,
  setId: string,
): Promise<OfflineDeckStatus> {
  const available = isOutboxAvailable();
  if (!available || !userId) {
    return { available, downloaded: false, cachedAt: null, cardCount: null };
  }
  const deck = await getOfflineDeck(userId, setId);
  return {
    available,
    downloaded: deck != null,
    cachedAt: deck?.cachedAt ?? null,
    cardCount: deck?.cardCount ?? null,
  };
}

/** Remove a downloaded deck. Re-exported so a surface has ONE import for the
 *  whole download lifecycle rather than reaching into the outbox directly. */
export async function removeDeckOffline(
  userId: string,
  setId: string,
): Promise<void> {
  if (!userId) return;
  await removeOfflineDeck(userId, setId);
}
