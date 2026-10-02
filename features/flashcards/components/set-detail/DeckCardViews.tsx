// features/flashcards/components/set-detail/DeckCardViews.tsx
//
// The deck page's ways of looking at its cards, beside the card search:
//   Overview — the compact tiles (CardPeek, in SetDetailView; selection lives there)
//   Fronts   — the real flashcards, front up; tap one to flip it
//   Backs    — the same flashcards, back up
//   List     — question | answer rows, quickest to scan
//   Table    — the canonical MatrxDataTable (sort, filter, copy, export)
//
// The view rides the URL (`?view=`) so a reload or a shared link keeps it.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useState } from "react";
import {
  LayoutGrid,
  GalleryVerticalEnd,
  FlipHorizontal2,
  List,
  Table2,
} from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type {
  MatrxColumnDef,
  MatrxDataTableCopyConfig,
} from "@ai-matrx/design-system/data-table/types";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import FlashcardItem from "@/components/mardown-display/blocks/flashcards/FlashcardItem";
import CardFaceContent from "@/components/mardown-display/blocks/flashcards/CardFaceContent";
import { FlashcardFaceImage } from "@/components/mardown-display/blocks/flashcards/FlashcardFaceImage";
import type { ItemMasteryRow } from "@/features/education/study/types";
import { MasteryTierPill } from "@/features/education/study/components/MasteryDisplay";
import { masteryTier } from "@/features/education/study/utils/masteryFsrs";
import { selectCardDetailLayers } from "../../data/cardDetailLayers";
import type { CardWithDetails } from "../../data/types";
import {
  asCardKind,
  CARD_KIND,
  matchingPairs,
  studyFaces,
} from "../../utils/cardVariants";
import { getCardImages } from "../study/cardImages";

export const DECK_VIEWS = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "fronts", label: "Flashcards — fronts", icon: GalleryVerticalEnd },
  { id: "backs", label: "Flashcards — backs", icon: FlipHorizontal2 },
  { id: "list", label: "Question and answer list", icon: List },
  { id: "table", label: "Table", icon: Table2 },
] as const;

export type DeckView = (typeof DECK_VIEWS)[number]["id"];

export function asDeckView(value: string | null | undefined): DeckView {
  return DECK_VIEWS.some((v) => v.id === value)
    ? (value as DeckView)
    : "overview";
}

/** A card plus its position in the deck (search keeps the original index). */
export interface DeckCardEntry {
  card: CardWithDetails;
  index: number;
}

/** The two faces a learner sees for any card kind. */
export function deckCardFaces(card: CardWithDetails): {
  front: string;
  back: string;
} {
  if (asCardKind(card.card_kind) === CARD_KIND.matching) {
    return {
      front: card.front,
      back: matchingPairs(card)
        .map((p) => `${p.left} ↔ ${p.right}`)
        .join("\n\n"),
    };
  }
  return studyFaces(card);
}

/** The segmented view switch — the list pages' view toggle, same shape. */
export function DeckViewToggle({
  view,
  onChange,
}: {
  view: DeckView;
  onChange: (view: DeckView) => void;
}) {
  const current = DECK_VIEWS.find((v) => v.id === view) ?? DECK_VIEWS[0];
  return (
    <>
    {/* Phone: one button, the views in its menu (the list pages' View menu). */}
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Card view: ${current.label}`}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground sm:hidden"
        >
          <current.icon className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuRadioGroup
          value={view}
          onValueChange={(next) => onChange(asDeckView(next))}
        >
          {DECK_VIEWS.map((v) => (
            <DropdownMenuRadioItem key={v.id} value={v.id} className="gap-2">
              <v.icon className="h-4 w-4 text-muted-foreground" />
              {v.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    <TooltipProvider>
      <div
        role="radiogroup"
        aria-label="Card view"
        className="hidden shrink-0 items-center gap-0.5 rounded-lg border border-border bg-card p-1 sm:flex"
      >
        {DECK_VIEWS.map((v) => {
          const active = v.id === view;
          return (
            <Tooltip key={v.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={v.label}
                  onClick={() => onChange(v.id)}
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors lg:h-7 lg:w-7",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <v.icon className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{v.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
    </>
  );
}

/** The real flashcards, front or back up. Tapping one flips just that card. */
export function DeckFlashcardGrid({
  items,
  face,
}: {
  items: DeckCardEntry[];
  face: "front" | "back";
}) {
  // Cards the person flipped away from the view's face.
  const [turned, setTurned] = useState<Set<string>>(new Set());
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ card, index }) => {
        const faces = deckCardFaces(card);
        const images = getCardImages(card);
        const flipped = (face === "back") !== turned.has(card.id);
        return (
          <FlashcardItem
            key={`${face}-${card.id}`}
            front={faces.front}
            back={faces.back}
            index={index}
            frontImage={images.front ?? null}
            backImage={images.back ?? null}
            showDevWindowTrigger={false}
            flipped={flipped}
            onFlipToggle={() =>
              setTurned((prev) => {
                const next = new Set(prev);
                if (next.has(card.id)) next.delete(card.id);
                else next.add(card.id);
                return next;
              })
            }
          />
        );
      })}
    </div>
  );
}

/** Question | answer rows — the quickest way to scan a whole deck. */
export function DeckCardList({
  items,
  onOpen,
}: {
  items: DeckCardEntry[];
  onOpen: (card: CardWithDetails) => void;
}) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {items.map(({ card, index }) => {
        const faces = deckCardFaces(card);
        const images = getCardImages(card);
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onOpen(card)}
            aria-label={`Open card ${index + 1}`}
            className="grid w-full grid-cols-1 gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/50 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-6"
          >
            <div className="flex min-w-0 items-start gap-2 text-sm font-medium text-foreground">
              {images.front && (
                <FlashcardFaceImage image={images.front} size="thumb" />
              )}
              <CardFaceContent
                content={faces.front}
                variant="inline"
                className="line-clamp-3 min-w-0"
              />
            </div>
            <div className="min-w-0 text-sm text-muted-foreground">
              <CardFaceContent
                content={faces.back}
                variant="inline"
                className="line-clamp-3"
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** A multi-line face folded onto one line: list markers dropped, breaks → " · ". */
function singleLine(text: string): string {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean)
    .join(" · ");
}

const KIND_LABEL: Record<string, string> = {
  [CARD_KIND.basic]: "Basic",
  [CARD_KIND.cloze]: "Cloze",
  [CARD_KIND.matching]: "Matching",
};

/** The canonical table over the deck's cards. */
export function DeckCardTable({
  items,
  deckName,
  masteryByCard,
  onOpen,
}: {
  items: DeckCardEntry[];
  deckName: string;
  masteryByCard: Record<string, ItemMasteryRow | undefined>;
  onOpen: (card: CardWithDetails) => void;
}) {
  const columns: MatrxColumnDef<DeckCardEntry>[] = [
    {
      id: "position",
      header: "#",
      accessorFn: (row) => row.index + 1,
      filter: false,
      width: 56,
    },
    {
      id: "front",
      header: "Front",
      width: 320,
      accessorFn: (row) => deckCardFaces(row.card).front,
      cell: (row) => (
        <button
          type="button"
          onClick={() => onOpen(row.card)}
          className="text-left font-medium text-foreground hover:text-primary"
        >
          <CardFaceContent
            content={deckCardFaces(row.card).front}
            variant="inline"
            className="line-clamp-2"
          />
        </button>
      ),
    },
    {
      // Off by default (Arman, 2026-10-01): a table is for scanning fronts.
      // Turned on from Columns, the back is ONE line — bullets and line
      // breaks folded into " · " so every row stays the same height.
      id: "back",
      header: "Back",
      hidden: true,
      accessorFn: (row) => singleLine(deckCardFaces(row.card).back),
      cell: (row) => (
        <CardFaceContent
          content={singleLine(deckCardFaces(row.card).back)}
          variant="inline"
          className="line-clamp-1 text-muted-foreground"
        />
      ),
    },
    {
      id: "kind",
      header: "Kind",
      accessorFn: (row) =>
        KIND_LABEL[asCardKind(row.card.card_kind)] ?? row.card.card_kind,
      width: 110,
    },
    {
      id: "mastery",
      header: "Mastery",
      accessorFn: (row) => masteryTier(masteryByCard[row.card.id]).label,
      sortValue: (row) => masteryTier(masteryByCard[row.card.id]).pct ?? -1,
      cell: (row) => <MasteryTierPill mastery={masteryByCard[row.card.id]} />,
      width: 130,
    },
    {
      id: "layers",
      header: "Details",
      accessorFn: (row) => selectCardDetailLayers(row.card.details).length,
      width: 96,
    },
    {
      id: "image",
      header: "Image",
      accessorFn: (row) => {
        const images = getCardImages(row.card);
        return images.front || images.back ? "Yes" : "No";
      },
      width: 90,
    },
  ];

  const copy: MatrxDataTableCopyConfig<DeckCardEntry> = {
    label: "Flashcard",
    listLabel: `Cards in ${deckName} (this view)`,
    location: `AI Matrx — Flashcards — ${deckName}`,
    rowKind: "flashcard",
    listKind: "flashcards",
    rowDescription: "One flashcard: its front and back as the learner sees them.",
    listDescription: "The deck's cards currently shown after table filters.",
    humanRow: (row) => {
      const faces = deckCardFaces(row.card);
      return `Front: ${faces.front}\nBack: ${faces.back}`;
    },
    agentRow: (row) => ({ position: row.index + 1, ...deckCardFaces(row.card) }),
    rowAttributes: (row) => ({ id: row.card.id, position: row.index + 1 }),
  };

  return (
    <MatrxDataTable<DeckCardEntry>
      tableId="flashcards-deck-cards"
      data={items}
      columns={columns}
      getRowId={(row) => row.card.id}
      viewTabs={false}
      // The deck's own search sits above; the table keeps its Columns
      // control so the hidden Back column can be turned on.
      toolbar={{ search: false, columns: true, singleRow: true }}
      copy={copy}
      detail={{ enabled: false }}
      window={{ enabled: false }}
      emptyState={{ title: "No cards" }}
    />
  );
}
