"use client";

/**
 * THE FLASHCARD'S ACTIONS — ONE definition of "what you can do to a
 * flashcard", shared by every surface that shows one.
 *
 * Census (2026-08-30, context-menu rollout): a single card (front/back/index)
 * renders on FlashcardItemWindow, FlashcardStudyWindow, FlashcardsBlockWindow
 * (grid) and FlashcardSubcardsWindow (nested grid) — all four in this module's
 * first wiring pass — plus CanvasFlashcardsView, StudyDeck and the markdown
 * block's `flashcards-set-parts` body (future adopters: same `front`/`back`
 * shape, no menu today).
 *
 * A CARD HAS NO STANDALONE DB ROW — `education.fc_card` addresses cards by
 * index inside a `fc_set`, so the row's own entity (when a `setId` is known)
 * is the SET (`fc_set`, already a registered token — see
 * `features/flashcards/components/home/FlashcardsHome.tsx`), never an invented
 * per-card token.
 *
 * 🚨 NO NEW WRITE PATH LIVES HERE. Copy actions are read-only; "Open full
 * view" / "Study this set" / "Flip card" delegate to callbacks (openers /
 * host state) the surface already owns.
 */

import { BookOpen, Copy, FlipHorizontal, Maximize2 } from "lucide-react";

import type {
  ContextMenuEntityRef,
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import {
  withAvailability,
  type AvailabilityMap,
} from "@/features/context-menu-v3/utils/availability";
import { toast } from "@/lib/toast";

/** The one thing every flashcard surface can say about a right-clicked card. */
export interface FlashcardMenuRow {
  front: string;
  back: string | null;
  index: number;
  /** The owning `fc_set`, when this card belongs to a persisted set. */
  setId?: string | null;
  setTitle?: string | null;
}

/** THE CARD'S OWNING SET — Attach To / Share targets the SET, not the card. */
export function flashcardEntityRef(
  row: FlashcardMenuRow | null,
): ContextMenuEntityRef | null {
  if (!row?.setId) return null;
  return { type: "fc_set", id: row.setId, title: row.setTitle ?? "Flashcard set" };
}

export interface FlashcardMenuActions {
  /** Growth: expand this one card into its own window (grid/list hosts). */
  onOpenItem?: (row: FlashcardMenuRow) => void;
  /** Flip the card in place — study/item surfaces that own flip state. */
  onFlip?: (row: FlashcardMenuRow) => void;
  /** Launch the classic-flip study session for the card's owning set. */
  onStudySet?: (row: FlashcardMenuRow) => void;
}

/**
 * Grid delegation helper — `FlashcardsSetBody` (the shared card-grid renderer,
 * not owned by any one window) gives each card no `data-*` row id, only DOM
 * position. Given the grid's container ref and the right-clicked element,
 * this walks the container's direct children (one per card, in render order)
 * to find which one the click landed in, so a window can delegate ONE menu
 * over the whole grid instead of wrapping every card.
 */
export function resolveFlashcardGridIndex(
  container: HTMLElement | null,
  target: HTMLElement | null,
): number | null {
  if (!container || !target) return null;
  const gridRoot = container.firstElementChild;
  if (!gridRoot) return null;
  const children = Array.from(gridRoot.children);
  const idx = children.findIndex((child) => child.contains(target));
  return idx >= 0 ? idx : null;
}

export function useFlashcardMenuSection(opts: {
  /** The card the menu was opened on, resolved at select time. */
  getRow: () => FlashcardMenuRow | null;
  actions?: FlashcardMenuActions;
  /**
   * THE CONSISTENCY STEP — what THIS surface cannot do, and why. Keyed by
   * item id (`flashcard-copy-front`, `flashcard-copy-back`, `flashcard-flip`,
   * `flashcard-open`, `flashcard-study-set`).
   */
  unavailable?: AvailabilityMap;
}): ContextMenuExtraSection {
  const { getRow, actions = {} } = opts;
  const row = getRow();

  const withRow = (fn?: (row: FlashcardMenuRow) => void) => () => {
    const r = getRow();
    if (r && fn) fn(r);
  };

  const copyText = (text: string | null, label: string) => async () => {
    const r = getRow();
    const value = text ?? (r ? (label === "Front" ? r.front : r.back) : null);
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Couldn't copy ${label.toLowerCase()}`);
    }
  };

  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "flashcard-copy-front",
      label: "Copy front",
      icon: Copy,
      onSelect: copyText(row?.front ?? null, "Front"),
      disabled: !row?.front,
    },
    {
      kind: "item",
      id: "flashcard-copy-back",
      label: "Copy back",
      icon: Copy,
      onSelect: copyText(row?.back ?? null, "Back"),
      disabled: !row?.back,
    },
    {
      kind: "item",
      id: "flashcard-flip",
      label: "Flip card",
      icon: FlipHorizontal,
      onSelect: withRow(actions.onFlip),
      disabled: !row || !actions.onFlip,
    },
    {
      kind: "item",
      id: "flashcard-open",
      label: "Open full view",
      icon: Maximize2,
      onSelect: withRow(actions.onOpenItem),
      disabled: !row || !actions.onOpenItem,
    },
    {
      kind: "item",
      id: "flashcard-study-set",
      label: "Study this set",
      icon: BookOpen,
      onSelect: withRow(actions.onStudySet),
      disabled: !row?.setId || !actions.onStudySet,
    },
  ];

  return withAvailability(
    { id: "flashcard", label: "This card", anchor: "after-clipboard", items },
    opts.unavailable,
  );
}
