"use client";

// SAMPLE — /education/flashcards/[setId] on the settled 28px system.
//
// An HONEST fork of features/flashcards/components/set-detail/SetDetailView.tsx
// (owner, 2026-10-03: "a really great individual feature page … improve it
// with our new primitives"). Every data path, write, agent run, window, dialog,
// surface registration and phone sheet is the real one, imported from the
// feature — only presentation changed:
//
// - Header: the sitewide crumb pattern (back + Education › Flashcards › deck,
//   with sibling menus) instead of a title-only header.
// - One control: every button 28px capsule, 13px label, 16px glyph (the real
//   bar mixed 40px split buttons, 36px icon buttons and a 44px phone row).
//   Real components that draw their own Button (Add, Share, Make a copy, the
//   study-window trigger) are adopted into the control with `.uk-adopt`.
// - Deck tools are quiet 28px icon controls with tooltips, left of "Add".
// - Power-ups: compact feature cards (8px radius, 32px tile, 13/12px text)
//   in place of 2xl-rounded gradient tiles with hover lift.
// - Mastery + power-ups sit in ONE band; space goes BETWEEN blocks (24px).
// - Cards toolbar: count, Select, the view as a capsule segmented control and
//   search as the 28px field — one row.
// - Card tiles: 8px radius, bordered, no shadow/lift; hover tints.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { recordUnavailableMessage } from "@/lib/records/recordUnavailable";
import { useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { replaceAddressWithoutNavigating } from "@/lib/url-state/addressWithoutNavigating";
import {
  Play,
  Layers,
  BookOpen,
  Lightbulb,
  Volume2,
  Image as ImageIcon,
  Zap,
  Pencil,
  Expand,
  TrendingUp,
  Settings2,
  ArrowRight,
  Download,
  ChevronDown,
  GraduationCap,
  ListChecks,
  Grid3x3,
  PenLine,
  Scissors,
  Boxes,
  Mic,
  Headphones,
  Merge,
  MousePointerClick,
  HelpCircle,
  Printer,
  Images,
  Loader2,
  Ellipsis,
  MessagesSquare,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import {
  asDeckView,
  DeckCardList,
  DeckCardTable,
  DeckFlashcardGrid,
  DECK_VIEWS,
  type DeckView,
} from "@/features/flashcards/components/set-detail/DeckCardViews";
import { MergeCardsDialog } from "@/features/flashcards/components/set-detail/MergeCardsDialog";
import { toast } from "@/lib/toast";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@ai-matrx/design-system";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { useAccess } from "@/utils/permissions/access";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { canEditAccess } from "@/utils/permissions/access-core";
import { DuplicateToEditButton } from "@/features/sharing/components/DuplicateToEditButton";
import { fcService } from "@/features/flashcards/data/fcService";
import { getCardImages } from "@/features/flashcards/components/study/cardImages";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { buildDeckPrintData } from "@/features/flashcards/utils/deckPrintData";
import { flashcardsPrinterLazy as flashcardsPrinter } from "@ai-matrx/print/flashcards-lazy";
import { notifyPrintOutcome } from "@/lib/print/print-outcome-toast";
import { PrintOptionsDialog, usePrintOptions } from "@ai-matrx/print/react";
import { FlashcardFaceImage } from "@/components/mardown-display/blocks/flashcards/FlashcardFaceImage";
import type { SetWithCards, CardWithDetails } from "@/features/flashcards/data/types";
import {
  asCardKind,
  CARD_KIND,
  matchingPairs,
  studyFaces,
} from "@/features/flashcards/utils/cardVariants";
import { studyService } from "@/features/education/study/service/studyService";
import type { ItemMasteryRow } from "@/features/education/study/types";
import {
  MasteryTierPill,
  DeckMasteryBar,
} from "@/features/education/study/components/MasteryDisplay";
import { FlashcardStudyWindowDevTrigger } from "@/features/flashcards/components/study/FlashcardStudyWindowDevTrigger";
import CardFaceContent from "@/components/mardown-display/blocks/flashcards/CardFaceContent";
import {
  buildDeckFile,
  DECK_EXPORT_FILE,
  downloadTextFile,
  safeFilename,
  type DeckExportFormat,
} from "@/features/flashcards/utils/exportDeck";
import { DeckRowAccess } from "@/features/flashcards/components/sharing/DeckRowAccess";
import {
  AudioOverviewSection,
  deckAudioCoverage,
  type DeckAudioRunSignals,
} from "@/features/flashcards/components/set-detail/AudioOverviewSection";
import { EnhanceSetDialog } from "@/features/flashcards/components/set-detail/EnhanceSetDialog";
import { useFlashcardMandates } from "@/features/flashcards/data/mandate-disclosure";
// BUNDLE-LEAK GUARD (F9): these two float as draggable WindowPanels, and a
// STATIC import of either would drag features/window-panels/WindowPanel.tsx —
// and its 100+ registry lazy chunks — into the flashcards route bundle
// (lazy-bundle-guard fires "[WINDOW-PANELS BUNDLE LEAK]" on route boot).
// They open one-at-a-time on explicit user action, so each gets its own
// ssr:false edge (the AgentPeekButton pattern; code-splitting rule 3 allows
// per-item splits for user-triggered windows).
const IllustrateSetWindow = dynamic(
  () => import("@/features/flashcards/components/set-detail/IllustrateSetWindow").then((m) => m.IllustrateSetWindow),
  { ssr: false },
);
const BulkEnrichWindow = dynamic(
  () => import("@/features/flashcards/components/set-detail/BulkEnrichWindow").then((m) => m.BulkEnrichWindow),
  { ssr: false },
);
import {
  useBulkEnrichRun,
  bulkEnrichActionLabel,
  planBulkEnrich,
  summarizeBulkEnrichCounts,
} from "@/features/flashcards/components/set-detail/bulkEnrichRun";
import {
  selectCardDetailLayers,
} from "@/features/flashcards/data/cardDetailLayers";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import {
  useIllustrateSetRun,
  type IllustrateCardState,
} from "@/features/flashcards/components/set-detail/illustrateSetRun";
import { EntitlementMeter } from "@/features/entitlements/components/EntitlementMeter";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { useOpenFlashcardItemWindow } from "@/features/overlays/openers/flashcardItemWindow";
import { serializeDeck } from "@/features/education/media/audio/audioBrief";
import { ConvertContentDialog } from "@/features/education/convert/ConvertContentDialog";
import { GenerateCardsDialog } from "@/features/flashcards/components/set-detail/GenerateCardsDialog";
import { GeneratedFromChips } from "@/features/education/convert/GeneratedFromChips";
import { MadeFromSource } from "@/features/education/convert/MadeFromSource";
import { AddMoreCardsButton } from "@/features/flashcards/components/set-detail/AddMoreCardsButton";
import { ClassPicker } from "@/features/education/classes/components/ClassPicker";
import { OfflineDeckButton, OfflineDeckMenuItems } from "@/features/flashcards/components/set-detail/OfflineDeckButton";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSurfaceRuntimeRegistration } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import {
  createEducationFlashcardSetScope,
  type FlashcardSetSurfaceCard,
  type FlashcardSetSurfaceMastery,
} from "@/features/surfaces/manifests/education-flashcard-set.manifest";
import { masteryTier } from "@/features/education/study/utils/masteryFsrs";
import {
  EducationCollectionNoResults,
  filterEducationCollection,
} from "@/features/education/components/EducationCollectionSearch";
import { Search, X } from "lucide-react";
import { CrumbTrailHeader, type CrumbOption } from "@/features/shell/components/header/templates/CrumbTrailHeader";
import { EDUCATION_NAV_ITEMS } from "@/features/education/components/EducationHeader";
import { Button as ControlButton, ControlRow, ControlScope, SearchField, SegmentedControl, SplitButton } from "@ai-matrx/design-system/controls";


const SAMPLE_PATH = "/demos/ui-unification/samples/education-flashcards";

/* Sample-only CSS on top of the package controls (@ai-matrx/design-system/controls).
   - `.uk-adopt`: a REAL component that draws its own Button (Add, Share,
     Make a copy, the study-window trigger, the phone "Add") paints as the one
     control without editing it. Unlayered CSS beats its Tailwind utilities;
     the rollout does this in the package Button instead. */
const FC_SAMPLE_CSS = `
.uk-adopt > button, .uk-adopt > a { box-sizing: border-box; height: var(--matrx-tap-wide-size) !important; min-height: 0 !important; margin-inline: calc(var(--matrx-control-gap) / 2);
  padding-inline: var(--matrx-control-inset-text); border-radius: 9999px; font-size: var(--matrx-control-label); font-weight: 500; gap: 0.375rem; line-height: 1; cursor: pointer; }
.uk-adopt > button *, .uk-adopt > a * { font-size: inherit; }
.uk-adopt > button svg, .uk-adopt > a svg { width: var(--matrx-tap-icon-size) !important; height: var(--matrx-tap-icon-size) !important; margin: 0 !important; }
.uk-adopt-icon > button { box-sizing: border-box; width: var(--matrx-tap-wide-size) !important; height: var(--matrx-tap-wide-size) !important; min-height: 0 !important;
  margin-inline: calc(var(--matrx-control-gap) / 2); padding: 0 !important; border-radius: 9999px; cursor: pointer; }
.uk-adopt-icon > button svg { width: var(--matrx-tap-icon-size) !important; height: var(--matrx-tap-icon-size) !important; }
.uk-full > button, .uk-full > a { width: calc(100% - var(--matrx-control-gap)); }
.uk-adopt.uk-grow > button { justify-content: flex-start; }
.uk-grow > button { flex: 1 1 calc(50% - var(--matrx-control-gap)); }
`;

const EDU_BASE = "/education/flashcards";

/** Every way to study a deck besides classic Study — the Study button's menu
 *  on desktop, the "More ways" sheet on a phone. Fast Fire lives here too. */
const STUDY_MODES = [
  {
    key: "fastfire",
    label: "Fast Fire",
    description: "Rapid recall against the clock",
    icon: Zap,
    href: (setId: string) => `/education/fastfire?set=${setId}`,
  },
  {
    key: "learn",
    label: "Learn",
    description: "Adaptive reshuffle toward weak cards",
    icon: GraduationCap,
    href: (setId: string) => `${EDU_BASE}/${setId}/learn`,
  },
  {
    key: "test",
    label: "Test",
    description: "Multiple-choice quiz",
    icon: ListChecks,
    href: (setId: string) => `${EDU_BASE}/${setId}/test`,
  },
  {
    key: "match",
    label: "Match",
    description: "Timed pairing game",
    icon: Grid3x3,
    href: (setId: string) => `${EDU_BASE}/${setId}/match`,
  },
  {
    key: "write",
    label: "Write",
    description: "Type the answer from memory",
    icon: PenLine,
    href: (setId: string) => `${EDU_BASE}/${setId}/write`,
  },
  {
    key: "practice-oral",
    label: "Oral practice",
    description: "Answer out loud, graded by voice",
    icon: Mic,
    href: (setId: string) => `/education/practice-oral?deck=${setId}`,
  },
  {
    key: "audio-review",
    label: "Audio review",
    description: "Hands-free listen-and-answer loop",
    icon: Headphones,
    href: (setId: string) => `/education/audio-study/review?deck=${setId}`,
  },
] as const;

/** A quiet icon-only deck tool with its name in a tooltip. `asTrigger`
 *  makes it the trigger of the DropdownMenu it sits in. */
function IconAction({
  label,
  children,
  onClick,
  disabled,
  asTrigger = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  asTrigger?: boolean;
}) {
  const button = (
    <ControlButton variant="quiet" icon={children} aria-label={label} onClick={onClick} disabled={disabled} />
  );
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {asTrigger ? (
            <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
          ) : (
            button
          )}
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const POWER_UP_TONE = {
  enrich: {
    tile: "bg-chart-4 text-white",
    glow: "from-chart-4/15",
  },
  illustrate: {
    tile: "bg-chart-2 text-white",
    glow: "from-chart-2/15",
  },
  convert: {
    tile: "bg-chart-6 text-white",
    glow: "from-chart-6/15",
  },
} as const;

/** One of the deck's AI upgrades, drawn as a tile worth clicking. */
function PowerUpTile({
  tone,
  icon: Icon,
  title,
  hint,
  badge,
  busy = false,
  disabled = false,
  onClick,
  meter,
}: {
  tone: keyof typeof POWER_UP_TONE;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  badge?: string;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
  meter?: React.ReactNode;
}) {
  const t = POWER_UP_TONE[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-card p-2.5 text-left transition-colors max-sm:flex-col max-sm:gap-1.5 max-sm:text-center",
        "hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-70",
      )}
    >
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", t.tile)}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-[0.8125rem] font-semibold leading-5 text-foreground max-sm:mx-auto sm:truncate">{title}</span>
          {badge && (
            <span className="hidden h-[1.125rem] shrink-0 items-center rounded-md border border-border px-1.5 text-[0.6875rem] font-medium tabular-nums text-muted-foreground sm:inline-flex">
              {badge}
            </span>
          )}
        </span>
        <span className="hidden truncate text-xs leading-4 text-muted-foreground sm:block">{hint}</span>
        {meter && <span className="mt-1 block">{meter}</span>}
      </span>
      <ArrowRight className="hidden size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
    </button>
  );
}

/** The deck's audio jobs, as menu items (the Audio icon's menu). */
function DeckAudioMenuItems({
  cards,
  hasOverview,
  onStart,
}: {
  cards: CardWithDetails[];
  hasOverview: boolean;
  onStart: (job: keyof DeckAudioRunSignals) => void;
}) {
  return (
    <>
      <DropdownMenuItem className="gap-2" onClick={() => onStart("generate")}>
        <Volume2 className="h-4 w-4 text-muted-foreground" />
        {hasOverview ? "Regenerate audio overview" : "Generate audio overview"}
      </DropdownMenuItem>
      {(
        [
          ["spoken_front", "card audio", Mic],
          ["helper", "instant help", HelpCircle],
        ] as const
      ).map(([lane, noun, Icon]) => {
        const { ready, total } = deckAudioCoverage(cards, lane);
        const done = ready >= total;
        return (
          <DropdownMenuItem
            key={lane}
            className="gap-2"
            disabled={done}
            onClick={() => onStart(lane)}
          >
            <Icon className="h-4 w-4 text-muted-foreground" />
            {done
              ? `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ready`
              : ready > 0
                ? `Prepare ${noun} (${ready}/${total} done)`
                : `Prepare ${noun}`}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

const SURFACE_NAME = "matrx-user/education-flashcard-set";

/** A compact, non-flipping front/back peek for one card with detail badges. */
function CardPeek({
  card,
  index,
  mastery,
  selectable = false,
  selected = false,
  onToggleSelected,
  onOpen,
  onEnhance,
}: {
  card: CardWithDetails;
  index: number;
  mastery: ItemMasteryRow | undefined;
  /** Merge-selection mode: the whole tile becomes a toggle. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
  /** Opens the canonical flashcard window when the tile is not in selection mode. */
  onOpen?: () => void;
  /**
   * Per-card "make this deeper", initiated FROM THIS TILE. The set-level action
   * is Enrich all (one button, whole deck); a modal LIST of every card you
   * scroll and pick from was the nonsense flow this replaces.
   */
  onEnhance?: () => void;
}) {
  // ONE reader for "is this card enriched" — the same selector the study
  // surface renders from, so a badge can never disagree with the card.
  const layerCount = selectCardDetailLayers(card.details).length;
  const hasAudio = card.details.some((d) => !!d.audio_file_id);
  const images = getCardImages(card);
  const kind = asCardKind(card.card_kind);
  const pairs = kind === CARD_KIND.matching ? matchingPairs(card) : [];
  // One faces bridge for every flip kind (basic/cloze/formula) — the peek shows
  // exactly what study will show.
  const faces = kind === CARD_KIND.matching ? null : studyFaces(card);
  const interactive = selectable || !!onOpen;
  const studied = (mastery?.attempt_count ?? 0) > 0;
  const hasBadges =
    kind === CARD_KIND.cloze ||
    kind === CARD_KIND.matching ||
    layerCount > 0 ||
    hasAudio ||
    !!(images.front || images.back);
  const showHeader = selectable || studied || hasBadges;
  const activate = () => {
    if (selectable) onToggleSelected?.();
    else onOpen?.();
  };

  return (
    <div
      className={cn(
        "group/peek relative flex flex-col rounded-lg border bg-card p-3",
        interactive &&
          "cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/30",
        selected
          ? "border-primary ring-1 ring-primary"
          : selectable
            ? "border-border hover:border-primary/50"
            : "border-border",
      )}
      onClick={interactive ? activate : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                activate();
              }
            }
          : undefined
      }
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={selectable ? selected : undefined}
      aria-label={
        selectable
          ? `Select card ${index + 1} to merge`
          : `Open card ${index + 1}`
      }
    >
      {/* No card number and no "New" pill (2026-10-01): the tile shows
          mastery only once the card has been studied, and only the badges
          that say something. */}
      {onEnhance && !selectable && (
        <button
          type="button"
          title="Make THIS card deeper"
          aria-label={`Make card ${index + 1} deeper`}
          className="absolute right-1.5 top-1.5 z-10 inline-flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-opacity hover:bg-muted hover:text-primary sm:opacity-0 sm:group-hover/peek:opacity-100 sm:focus-visible:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onEnhance();
          }}
        >
          <Lightbulb className="h-3.5 w-3.5" />
        </button>
      )}
      {showHeader && (
      <div className="mb-1.5 flex min-h-5 items-center justify-between gap-2 pr-7">
        {(selectable || studied) && (
          <span className="flex items-center gap-1.5">
            {selectable && (
              <Checkbox
                checked={selected}
                aria-label={`Select card ${index + 1} to merge`}
                className="h-4 w-4"
              />
            )}
            {studied && <MasteryTierPill mastery={mastery} />}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {kind === CARD_KIND.cloze && (
            <span className="inline-flex items-center gap-0.5 rounded border border-primary/40 bg-primary/10 px-1 py-0 text-xs font-medium text-primary-ink">
              <Scissors className="h-3 w-3" />
              Cloze
            </span>
          )}
          {kind === CARD_KIND.matching && (
            <span className="inline-flex items-center gap-0.5 rounded border border-primary/40 bg-primary/10 px-1 py-0 text-xs font-medium text-primary-ink">
              <Grid3x3 className="h-3 w-3" />
              Match · {pairs.length}
            </span>
          )}
          {layerCount > 0 && (
            <span
              title={`${layerCount} detail layer${layerCount === 1 ? "" : "s"} — read them under "More on this card" while studying`}
              className="inline-flex items-center gap-0.5 rounded border border-primary/40 bg-primary/10 px-1 py-0 text-xs font-medium text-primary-ink"
            >
              <Layers className="h-3 w-3" />
              {layerCount}
            </span>
          )}
          {hasAudio && (
            <span
              title="Has audio detail"
              className="inline-flex items-center rounded border border-border px-1 py-0 text-xs text-muted-foreground"
            >
              <Volume2 className="h-3 w-3" />
            </span>
          )}
          {(images.front || images.back) && (
            <span
              title="Has image"
              className="inline-flex items-center rounded border border-border px-1 py-0 text-xs text-muted-foreground"
            >
              <ImageIcon className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>
      )}
      {kind === CARD_KIND.matching ? (
        <div className="space-y-0.5 pr-6">
          {card.front.trim() && (
            <div className="text-sm font-medium text-foreground">
              <CardFaceContent
                content={card.front}
                variant="inline"
                className="line-clamp-2"
              />
            </div>
          )}
          {pairs.slice(0, 3).map((p, i) => (
            <p key={i} className="line-clamp-1 text-xs text-muted-foreground">
              {p.left} <span className="text-border">↔</span> {p.right}
            </p>
          ))}
          {pairs.length > 3 && (
            <p className="text-xs text-muted-foreground/70">
              +{pairs.length - 3} more
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2 pr-6 text-sm font-medium text-foreground">
            {images.front && (
              <FlashcardFaceImage image={images.front} size="thumb" />
            )}
            <div className="min-w-0 flex-1">
              <CardFaceContent
                content={faces ? faces.front : card.front}
                variant="inline"
                className="line-clamp-3"
              />
            </div>
          </div>
          <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
            <CardFaceContent
              content={faces ? faces.back : card.back}
              variant="inline"
              className="line-clamp-3"
            />
          </div>
        </>
      )}
    </div>
  );
}

export function FlashcardSetSample({
  setId,
  initialName = null,
}: {
  setId: string;
  /** Read on the server so the header names the deck on its first paint. */
  initialName?: string | null;
}) {
  useFlashcardMandates(["enrichCard"]);
  const router = useRouter();
  const [data, setData] = useState<SetWithCards | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [convertOpen, setConvertOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [studyModesOpen, setStudyModesOpen] = useState(false);
  const [deckToolsOpen, setDeckToolsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cardSearch, setCardSearch] = useState("");
  // The card view rides the URL so a reload or a shared link keeps it.
  const searchParams = useSearchParams();
  const view = asDeckView(searchParams.get("view"));
  const changeView = (next: DeckView) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("view");
    else params.set("view", next);
    const qs = params.toString();
    replaceAddressWithoutNavigating(qs ? `?${qs}` : window.location.pathname);
  };
  // WP3 gap 5 — card merge selection.
  const [selecting, setSelecting] = useState(false);
  // Phone-only layout choices (Deck tools sheet, audio status-only) key off
  // this; desktop always shows the whole deck toolset on the page.
  const isPhone = useIsMobile();
  // The Deck tools menu starts the audio jobs; the section on the page runs
  // them and shows their progress (page-pass 2026-09-27).
  const [audioRun, setAudioRun] = useState<DeckAudioRunSignals>({
    generate: 0,
    spoken_front: 0,
    helper: 0,
  });
  const startAudioJob = (job: keyof DeckAudioRunSignals) => {
    setDeckToolsOpen(false);
    setAudioRun((prev) => ({ ...prev, [job]: prev[job] + 1 }));
  };
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [lineageKey, setLineageKey] = useState(0);
  const [masteryByCard, setMasteryByCard] = useState<
    Record<string, ItemMasteryRow | undefined>
  >({});
  const [masteryStatus, setMasteryStatus] = useState<
    "pending" | "available" | "unavailable"
  >("pending");
  // Bump to refetch (after enrich/deepen adds details/sub-cards). The fetch
  // lives in the effect so no setState fires synchronously in the effect body.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setMasteryStatus("pending");
      const res = await fcService.getSetWithCards(setId);
      if (cancelled) return;
      if (!res.data) {
        setError(res.error ?? recordUnavailableMessage("deck", "unknown"));
        setData(null);
        setLoading(false);
      } else {
        setData(res.data);
        setError(null);
        // The deck is the primary payload; never hold the entire page behind
        // the secondary mastery enrichment. A slow mastery read previously
        // left mobile learners staring at skeletons indefinitely even though
        // every card was already available.
        setLoading(false);
        // Per-card mastery for the retention viz (read-only; RLS-scoped).
        if (res.data.cards.length > 0) {
          const mRes = await studyService.getMasteryBulk(
            res.data.cards.map((c) => ({ itemType: "fc_card", itemId: c.id })),
          );
          if (!cancelled && !mRes.error) {
            const seed: Record<string, ItemMasteryRow | undefined> = {};
            for (const m of mRes.data ?? []) seed[m.item_id] = m;
            setMasteryByCard(seed);
            setMasteryStatus("available");
          } else if (!cancelled) {
            // A missing mastery read is not the same as a learner with no
            // history. Keep the optional surface value absent rather than
            // handing an agent fabricated "new" evidence.
            setMasteryByCard({});
            setMasteryStatus("unavailable");
          }
        } else {
          setMasteryByCard({});
          setMasteryStatus("available");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setId, reloadKey]);

  const [pendingAction, setPendingAction] = useState<
    | "study"
    | "learn"
    | "test"
    | "match"
    | "write"
    | "fastfire"
    | "edit"
    | "sessions"
    | "practice-oral"
    | "audio-review"
    | "print-hub"
    | null
  >(null);

  // View-vs-edit gate (P7). Owner/editor get the full authoring surface; a
  // view-only sharee (shared read-only, or a public deck they don't own) gets a
  // "Make a copy" offer instead of Edit / row controls that would fail.
  const access = useAccess("fc_set", setId);
  const canEdit = access.isOwner || canEditAccess(access.level);
  const viewOnly = !access.loading && !canEdit;

  // ── Illustrate this set (per-SET image lane) ──────────────────────────────
  // One agent run per card over aidream /education/images/source-set: search
  // the open web, judge the source, attach only what clears the bar. Metered
  // BEFORE the spend (guard), streamed into a floating window (THE FLOATING
  // LAW — never a spinner, never a block that shifts the deck), then reviewed
  // card by card. Server-side `source_card_image` records each attach in
  // billing.usage_ledger itself, so this surface REFRESHES the meter instead of
  // calling commit() — a client commit here would double-count the batch.
  const illustrate = useEntitlementGuard("education.card_image_source");
  const {
    run: illustrateRun,
    start: startIllustrate,
    stop: stopIllustrate,
    setReview,
    reset: resetIllustrate,
  } = useIllustrateSetRun();
  const [illustrateOpen, setIllustrateOpen] = useState(false);
  const openCardWindow = useOpenFlashcardItemWindow();

  // Every card is a paid web search + judge, so nothing runs sight unseen: the
  // first click confirms and sources ONE trial card; the window then shows its
  // picture and offers the rest, which confirms the count again. Stop is live
  // the whole time.
  // Cards this session's runs already settled (attached, rejected, or found
  // nothing) are never offered again — a rejected picture is not re-bought.
  const judgedInRun = new Set(
    illustrateRun.cards
      .filter((c) => c.status === "completed" || c.status === "failed")
      .map((c) => c.cardId),
  );
  const rejectedInRun = illustrateRun.cards
    .filter((c) => c.review === "rejected")
    .map((c) => c.cardId);
  const cardsWithoutImage = data
    ? data.cards.filter(
        (c) => !getCardImages(c).front && !judgedInRun.has(c.id),
      ).length
    : 0;

  const runIllustrate = async (mode: "trial" | "rest") => {
    const count = mode === "trial" ? 1 : cardsWithoutImage;
    if (count === 0) {
      toast.info("Every card already has an image.");
      return;
    }
    const ok = await confirm(
      mode === "trial"
        ? {
            title: "Try one card first?",
            description: `An agent searches the web for one card's image so you can check it. ${cardsWithoutImage} cards have no image.`,
            confirmLabel: "Illustrate 1 card",
          }
        : {
            title: `Illustrate ${count} cards?`,
            description: `Runs ${count} paid image searches, about 30–60 seconds each. You can stop at any time.`,
            confirmLabel: `Illustrate ${count} cards`,
          },
    );
    if (!ok) return;
    setIllustrateOpen(true);
    const outcome = await startIllustrate(
      setId,
      "front",
      mode === "trial"
        ? { limit: 1, excludeCardIds: rejectedInRun }
        : { excludeCardIds: rejectedInRun },
    );
    // Whatever landed is already in the DB — refetch so badges and thumbnails
    // on the deck below match what the review pass is showing.
    setReloadKey((k) => k + 1);
    void illustrate.refresh();
    if (outcome.failed) return;
    if (outcome.refused) {
      toast.info("Your plan's image limit was reached for now.");
      return;
    }
    if (mode === "trial") return; // the window shows the picture and the next step
    toast.success(
      outcome.attached === 0
        ? "No image cleared the bar on this run — see why, card by card."
        : `${outcome.attached} card${outcome.attached === 1 ? "" : "s"} illustrated — review them.`,
    );
  };

  // ── Enrich every card (the batch) ─────────────────────────────────────────
  // Arman: "maybe you have a set of cards and you wanna enrich all of them.
  // You click one button, they all get enriched." One button, a live N-of-M
  // count, cancellable, per-card fault isolated, truthful summary. Cards that
  // already carry layers are skipped and SAID so — never re-billed.
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const enrichGuard = useEntitlementGuard("education.card_enrichment");
  const coppa = useAiComplianceGate();
  const {
    run: bulkRun,
    start: startBulkEnrich,
    cancel: cancelBulkEnrich,
    reset: resetBulkEnrich,
  } = useBulkEnrichRun(dispatch, store.getState);
  const [bulkOpen, setBulkOpen] = useState(false);
  /** Per-card "make this deeper", opened FROM a tile (never a modal list). */
  const [enhanceCard, setEnhanceCard] = useState<CardWithDetails | null>(null);

  // F3 lives here now that every card kind is selectable: merge is offered
  // only when the SELECTION is entirely text-mergeable (basic / cloze). A
  // matching or formula card carries its structure in dynamic_content, which a
  // front/back merge destroys silently.
  const canMergeSelection =
    selectedIds.size >= 2 &&
    (data?.cards ?? [])
      .filter((c) => selectedIds.has(c.id))
      .every(
        (c) =>
          asCardKind(c.card_kind) === CARD_KIND.basic ||
          asCardKind(c.card_kind) === CARD_KIND.cloze,
      );

  // ONE plan drives the button's words and the run's work, so the label can
  // never promise cards the run won't touch. `planBulkEnrich` is the only place
  // that decides: an explicit selection IS the plan (a picked card runs even if
  // it already has layers); with no selection, every card that lacks layers.
  const enrichPlan = planBulkEnrich(data?.cards ?? [], selectedIds);

  const runBulkEnrich = async (): Promise<void> => {
    if (!data) return;
    const cards = data.cards;
    const selected = selectedIds.size > 0 ? selectedIds : null;
    if (enrichPlan.todo.length === 0) {
      toast.info(
        "Every card in this deck already has detail layers. Select the cards you want more on and run it again.",
      );
      return;
    }
    if (!(await coppa.ensureAllowed())) return;
    // Guard the BATCH before any spend; each successful card commits its own
    // metered unit inside the runner.
    await enrichGuard.guard(async () => {
      setBulkOpen(true);
      const outcome = await startBulkEnrich({
        cards,
        selectedIds: selected,
        depth: "applied",
        onCardEnriched: async () => {
          await enrichGuard.commit();
        },
      });
      // Whatever landed is already in the DB — refetch so the deck's badges
      // match what the run is reporting.
      setReloadKey((k) => k + 1);
      if (outcome.counts.enriched > 0 || outcome.counts.failed > 0) {
        toast.success(summarizeBulkEnrichCounts(outcome.counts));
      }
    });
  };

  const reviewImage = async (
    card: IllustrateCardState,
    verdict: "accepted" | "rejected",
  ) => {
    const face = (card.result?.face === "back" ? "back" : "front") as
      "front" | "back";
    const res = await fcService.reviewCardImage(card.cardId, face, verdict, {
      surface: "set_illustrate_review",
    });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setReview(card.cardId, verdict);
    if (verdict === "rejected") setReloadKey((k) => k + 1);
  };

  // Print — the SAME canonical printer (10 variants, same settings UX) the
  // markdown-block lane uses; only the data shape differs, and ONE mapper owns
  // that (`buildDeckPrintData`: studyFaces for cloze/formula, getCardImages for
  // durable face-image URLs). Never a second print UI.
  const printData = data
    ? buildDeckPrintData(data.set, data.cards)
    : { title: "Flashcards", cards: [], skippedImageCount: 0 };
  const {
    open: printOpen,
    setOpen: setPrintOpen,
    triggerPrint,
  } = usePrintOptions(flashcardsPrinter, printData);

  const handlePrint = () => {
    // Say it out loud rather than printing a deck with silent holes: a print
    // window is unauthenticated, so a stored-file image with no durable URL
    // can't be fetched there.
    if (printData.skippedImageCount > 0) {
      toast.info(
        `${printData.skippedImageCount} face image${
          printData.skippedImageCount === 1 ? "" : "s"
        } can't be printed (stored file, no public URL) — text prints normally.`,
      );
    }
    void triggerPrint();
  };

  // VISION §15 (WP3 gap 6) — own your data. Every byte comes from the ONE
  // canonical writer (`deckFormats.buildDeckExport`), which the importer
  // round-trips; this handler only names the file and hands it over.
  const exportDeck = (format: DeckExportFormat) => {
    if (!data) return;
    const spec = DECK_EXPORT_FILE[format];
    downloadTextFile(
      `${safeFilename(data.set.name, "flashcard_set")}.${spec.ext}`,
      spec.mime,
      buildDeckFile(data.set, data.cards, format),
    );
    toast.success(
      format === "anki"
        ? "Exported for Anki (File → Import in Anki)"
        : `Exported set as ${spec.label}`,
    );
  };

  // Single navigation helper: marks which action is in flight (so only that
  // button shows the busy state) and routes via a transition. Guards against
  // duplicate clicks while a transition is pending. (UI standards.)
  const navigate = (
    action:
      | "study"
      | "learn"
      | "test"
      | "match"
      | "write"
      | "fastfire"
      | "edit"
      | "sessions"
      | "practice-oral"
      | "audio-review",
    path: string,
  ) => {
    if (isPending) return;
    setPendingAction(action);
    startTransition(() => {
      router.push(path);
    });
  };

  const openCard = (card: CardWithDetails) => {
    const faces = studyFaces(card);
    const images = getCardImages(card);
    openCardWindow({
      front: faces ? faces.front : card.front,
      back: faces ? faces.back : card.back,
      title: data?.set.name ?? "Flashcard",
      frontImage: images.front ?? null,
      backImage: images.back ?? null,
    });
  };

  const filteredCards = data
    ? filterEducationCollection(data.cards.map((card, index) => ({ card, index })), cardSearch, ({ card }) => [
        card.front,
        card.back,
        card.card_kind,
        ...card.details.map((detail) => detail.text),
        ...matchingPairs(card).flatMap((pair) => [pair.left, pair.right]),
      ])
    : [];

  // The header Agents menu is outside this route tree, so the detail page
  // registers its own live runtime. The library's provider is absent here;
  // without this exact surface the route resolver offered library agents with
  // an empty bag even though the deck was visibly loaded.
  const buildScope = () => {
    const loaded = !!data && !error;
    return createEducationFlashcardSetScope({
      set_loaded: loaded,
      set_id: setId,
      ...(error ? { load_error: error } : {}),
      ...(loaded
        ? {
            set_details: {
              name: data.set.name,
              topic: data.set.topic,
              lesson: data.set.lesson,
              description: data.set.description,
              difficulty: data.set.difficulty,
              visibility: data.set.visibility,
            },
            card_count: data.cards.length,
            cards: data.cards.map(
              (card, index): FlashcardSetSurfaceCard => ({
                id: card.id,
                position: card.position ?? index,
                card_kind: asCardKind(card.card_kind),
                front: card.front,
                back: card.back,
                pairs:
                  asCardKind(card.card_kind) === CARD_KIND.matching
                    ? matchingPairs(card)
                    : null,
                detail_layers: card.details.map((detail) => ({
                  kind: detail.kind,
                  text: detail.text,
                  generation_status: detail.generation_status,
                })),
              }),
            ),
            ...(masteryStatus === "available"
              ? {
                  card_mastery: data.cards.flatMap(
                    (card): FlashcardSetSurfaceMastery[] => {
                      const mastery = masteryByCard[card.id];
                      if (!mastery || (mastery.attempt_count ?? 0) === 0) return [];
                      const { tier, pct } = masteryTier(mastery);
                      return [{
                        card_id: card.id,
                        tier,
                        recall_pct: pct,
                        attempts: mastery.attempt_count ?? 0,
                        lapses: mastery.lapses ?? 0,
                      }];
                    },
                  ),
                }
              : {}),
          }
        : {}),
    });
  };

  useSurfaceRuntimeRegistration({
    surfaceName: SURFACE_NAME,
    getScope: buildScope,
  });

  // Sibling decks for the crumb's menu (read-only; never blocks the page).
  const [siblings, setSiblings] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    const ctl = new AbortController();
    void fcService.listSets({ signal: ctl.signal }).then((res) => {
      if (res.data) setSiblings(res.data.slice(0, 50).map((row) => ({ id: row.id, name: row.name })));
    });
    return () => ctl.abort();
  }, []);
  const deckOptions: CrumbOption[] = siblings.map((row) => ({
    label: row.name,
    href: `${SAMPLE_PATH}?id=${row.id}`,
    active: row.id === setId,
  }));

  /** The chat this deck was made in, when it was made in one. */
  const chatHref = data ? madeInChatHref(data.set.metadata) : null;

  /** A loaded deck with no cards: the page offers what makes cards. */
  const deckEmpty = !!data && data.cards.length === 0;

  const studyBusy = pendingAction === "study";

  return (
    <>
    <CrumbTrailHeader
      backHref="/demos/ui-unification"
      trail={[
        { label: "Education", href: "/education/overview" },
        {
          label: "Flashcards",
          href: EDU_BASE,
          optionsLabel: "Education",
          options: EDUCATION_NAV_ITEMS.map((item) => ({ label: item.name, href: item.href })),
        },
        {
          label: data?.set.name ?? initialName ?? "Deck",
          pending: loading && !initialName,
          optionsLabel: "Decks",
          options: deckOptions,
        },
      ]}
    />
    <ControlScope className="h-full">
    <style dangerouslySetInnerHTML={{ __html: FC_SAMPLE_CSS }} />
    <div className="h-full w-full overflow-y-auto bg-textured">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-3 pb-safe pt-2 sm:px-4 sm:pb-8">
        {loading ? (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5" aria-busy="true" aria-label="Loading deck">
                <Skeleton className="h-7 w-28 rounded-full" />
                <Skeleton className="h-7 w-24 rounded-full" />
                <span className="flex-1" />
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="size-7 rounded-full" />
                ))}
                <Skeleton className="h-7 w-16 rounded-full" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-[4.25rem] w-full rounded-lg" />
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-[3.25rem] rounded-lg" />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          </>
        ) : error || !data ? (
          <>
            <AccessGate
              token="fc_set"
              id={setId}
              fallbackHref={EDU_BASE}
              fallbackLabel="All flashcards"
            />
          </>
        ) : (
          <>
            {/* IDENTITY + ACTIONS — provenance, the one action bar, the deck's
                own description and lineage. Every control is the 28px one. */}
            <section className="flex flex-col gap-2" aria-label="Deck">

              {/* Desktop action bar: how to study (left), deck tools as quiet
                  icons, then Add — the one primary write (right). */}
              <div className="-mx-[3px] hidden items-center justify-between gap-2 md:flex">
                <ControlRow nowrap>
                  {deckEmpty ? (
                    canEdit && (
                      <ControlButton variant="primary" onClick={() => setGenerateOpen(true)}>
                        <AGENT_ICON aria-hidden />
                        Generate cards
                      </ControlButton>
                    )
                  ) : (
                    <>
                      <SplitButton>
                      <ControlButton variant="primary"
                        onClick={() => navigate("study", `${EDU_BASE}/${setId}/study`)}
                        disabled={isPending}
                      >
                        {studyBusy ? <Loader2 className="animate-spin" aria-hidden /> : <Play className="fill-current" aria-hidden />}
                        Study
                      </ControlButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <ControlButton variant="primary" disabled={isPending} aria-label="More ways to study" icon={<ChevronDown aria-hidden />} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64 p-1">
                          <DropdownMenuLabel className="text-[0.6875rem] font-medium text-muted-foreground">
                            More ways to study
                          </DropdownMenuLabel>
                          {STUDY_MODES.map((m) => (
                            <DropdownMenuItem
                              key={m.key}
                              className="cursor-pointer gap-2.5 py-1.5"
                              onClick={() => navigate(m.key, m.href(setId))}
                            >
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary-ink">
                                <m.icon className="size-4" />
                              </span>
                              <span className="flex min-w-0 flex-col">
                                <span className="text-[0.8125rem] font-medium">{m.label}</span>
                                <span className="truncate text-[0.6875rem] text-muted-foreground">{m.description}</span>
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      </SplitButton>
                      <span className="uk-adopt contents">
                        <FlashcardStudyWindowDevTrigger setId={setId} title={data.set.name} />
                      </span>
                      <ControlButton variant="quiet"
                        data-deck-action="progress"
                        onClick={() => navigate("sessions", `${EDU_BASE}/${setId}/sessions`)}
                        disabled={isPending}
                      >
                        {pendingAction === "sessions" ? <Loader2 className="animate-spin" aria-hidden /> : <TrendingUp aria-hidden />}
                        Progress
                      </ControlButton>
                      {chatHref && (
                        <ControlButton asChild variant="quiet"><Link href={chatHref}>
                          <MessagesSquare aria-hidden />
                          See chat
                        </Link></ControlButton>
                      )}
                    </>
                  )}
                </ControlRow>

                <ControlRow nowrap>
                  {canEdit && (
                    <IconAction
                      label="Edit deck"
                      onClick={() => navigate("edit", `${EDU_BASE}/${setId}/edit`)}
                      disabled={isPending}
                    >
                      {pendingAction === "edit" ? <Loader2 className="animate-spin" /> : <Pencil />}
                    </IconAction>
                  )}
                  {(access.isOwner || access.level === "admin") && (
                    <span className="uk-adopt-icon contents">
                      <ShareButton
                        resourceType="fc_set"
                        resourceId={setId}
                        resourceName={data.set.name}
                        organizationId={data.set.organization_id}
                        showStatus={false}
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground hover:text-foreground"
                      />
                    </span>
                  )}
                  {!deckEmpty && (
                    <DropdownMenu>
                      <IconAction label="Audio" asTrigger>
                        <Volume2 />
                      </IconAction>
                      <DropdownMenuContent align="end" className="w-64">
                        <DeckAudioMenuItems
                          cards={data.cards}
                          hasOverview={!!data.set.audio_overview_file_id}
                          onStart={startAudioJob}
                        />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {!deckEmpty && (
                    <CopyButtons
                      size="sm"
                      triggerVariant="transparent"
                      label={`Deck: ${data.set.name}`}
                      human={() => serializeDeck(data.set, data.cards).markdown}
                      json={() => ({ set: data.set, cards: data.cards })}
                      agent={() => ({
                        kind: "flashcard-deck",
                        location: `AI Matrx — Flashcards — ${EDU_BASE}/${setId}`,
                        description: "A flashcard deck: every card's front and back.",
                        data: {
                          name: data.set.name,
                          topic: data.set.topic,
                          difficulty: data.set.difficulty,
                          cards: data.cards.map((c, i) => {
                            const faces = studyFaces(c);
                            return {
                              n: i + 1,
                              kind: asCardKind(c.card_kind),
                              front: faces ? faces.front : c.front,
                              back: faces ? faces.back : c.back,
                            };
                          }),
                        },
                        summary: serializeDeck(data.set, data.cards).markdown,
                        attributes: { cards: data.cards.length },
                      })}
                      export={{
                        items: [
                          { id: "print", label: "Print", onSelect: handlePrint },
                          ...(["csv", "anki", "md", "json"] as const).map((format) => ({
                            id: format,
                            label: DECK_EXPORT_FILE[format].label,
                            onSelect: () => exportDeck(format),
                          })),
                        ],
                      }}
                    />
                  )}
                  <DropdownMenu>
                    <IconAction label="More" asTrigger>
                      <Ellipsis />
                    </IconAction>
                    <DropdownMenuContent align="end" className="w-60">
                      {canEdit && (
                        <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => setSettingsOpen(true)}>
                          <Settings2 className="h-4 w-4 text-muted-foreground" />
                          Deck settings
                        </DropdownMenuItem>
                      )}
                      {data.set.published_to_web && (
                        <DropdownMenuItem asChild className="cursor-pointer gap-2">
                          <a href={`/p/e/fc_set/${setId}`} target="_blank" rel="noopener noreferrer">
                            <Expand className="h-4 w-4 text-muted-foreground" />
                            View public page
                          </a>
                        </DropdownMenuItem>
                      )}
                      {!deckEmpty && (
                        <>
                          <DropdownMenuSeparator />
                          <OfflineDeckMenuItems setId={setId} />
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild className="cursor-pointer gap-2">
                        <Link href="/print">
                          <Printer className="h-4 w-4 text-muted-foreground" />
                          More printing
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {viewOnly && (
                    <span className="uk-adopt contents">
                      <DuplicateToEditButton
                        resourceType="fc_set"
                        resourceId={setId}
                        returnPath={`${EDU_BASE}/${setId}`}
                        label="Make a copy"
                        size="default"
                        variant="default"
                      />
                    </span>
                  )}
                  {canEdit && (
                    <span className="uk-adopt contents">
                      <AddMoreCardsButton
                        label="Add"
                        variant="default"
                        setId={setId}
                        existingCards={data.cards.map((c) => ({ front: c.front, back: c.back }))}
                        deckName={data.set.name}
                        deckOrganizationId={data.set.organization_id}
                        onAdded={() => {
                          setReloadKey((k) => k + 1);
                          setLineageKey((k) => k + 1);
                        }}
                      />
                    </span>
                  )}
                </ControlRow>
              </div>

              {/* Phone: one row of three — Study, More ways, Deck tools —
                  then the deck's one write. Same 28px control; the hit area
                  grows to 44px invisibly. */}
              <div className="flex flex-col gap-1 md:hidden">
                <ControlRow nowrap className="-mx-[3px] [&>*]:flex-1">
                  {deckEmpty
                    ? canEdit && (
                        <ControlButton variant="primary" onClick={() => setGenerateOpen(true)}>
                          <AGENT_ICON aria-hidden />
                          Generate cards
                        </ControlButton>
                      )
                    : (
                        <>
                          <ControlButton variant="primary"
                            onClick={() => navigate("study", `${EDU_BASE}/${setId}/study`)}
                            disabled={isPending}
                          >
                            {studyBusy ? <Loader2 className="animate-spin" aria-hidden /> : <Play className="fill-current" aria-hidden />}
                            Study
                          </ControlButton>
                          <ControlButton variant="outline" onClick={() => setStudyModesOpen(true)}>
                            <GraduationCap aria-hidden />
                            More ways
                          </ControlButton>
                        </>
                      )}
                  <ControlButton variant="outline" onClick={() => setDeckToolsOpen(true)}>
                    <Ellipsis aria-hidden />
                    Deck tools
                  </ControlButton>
                </ControlRow>
                {canEdit && (
                  <div className="uk-adopt uk-full -mx-[3px] flex">
                    <AddMoreCardsButton
                      setId={setId}
                      existingCards={data.cards.map((c) => ({ front: c.front, back: c.back }))}
                      deckName={data.set.name}
                      deckOrganizationId={data.set.organization_id}
                      onAdded={() => {
                        setReloadKey((k) => k + 1);
                        setLineageKey((k) => k + 1);
                      }}
                    />
                  </div>
                )}
                {viewOnly && (
                  <div className="uk-adopt uk-full -mx-[3px] flex">
                    <DuplicateToEditButton
                      resourceType="fc_set"
                      resourceId={setId}
                      returnPath={`${EDU_BASE}/${setId}`}
                      label="Make an editable copy"
                      size="default"
                      variant="default"
                    />
                  </div>
                )}
              </div>

              {data.set.description ? (
                <p className="line-clamp-2 max-w-3xl text-xs leading-5 text-muted-foreground">{data.set.description}</p>
              ) : null}
              {(
                <div className="flex flex-wrap items-center gap-1.5 empty:hidden">
                  {viewOnly && (
                    <span className="inline-flex h-[1.125rem] items-center gap-1 rounded-md border border-border px-1.5 text-[0.6875rem] font-medium text-muted-foreground">
                      <BookOpen className="size-3" aria-hidden />
                      View only — make a copy to edit
                    </span>
                  )}
                  <MadeFromSource entityType="fc_set" entityId={setId} />
                </div>
              )}
              <div className="empty:hidden">
                <GeneratedFromChips entityType="fc_set" entityId={setId} refreshKey={lineageKey} />
              </div>
            </section>

            {/* STANDING + UPGRADES — where you stand across the deck, the
                deck's AI power-ups, and its audio, as one band. */}
            <section className="flex flex-col gap-2 empty:hidden" aria-label="Deck mastery and tools">
              {!deckEmpty && (
                <div
                  className={cn(
                    "grid gap-2",
                    canEdit ? "grid-cols-3 lg:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,1fr))]" : "grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]",
                  )}
                >
                  <div className="col-span-full flex flex-col justify-center rounded-lg border border-border bg-card px-3 py-2 lg:col-span-1">
                    <DeckMasteryBar masteries={data.cards.map((c) => masteryByCard[c.id])} />
                  </div>
                  {canEdit && (
                    <PowerUpTile
                      tone="enrich"
                      icon={Lightbulb}
                      title="Enrich"
                      hint="Explanations, examples and memory tricks"
                      badge={
                        enrichPlan.todo.length > 0
                          ? `${enrichPlan.todo.length} ${enrichPlan.todo.length === 1 ? "card" : "cards"}`
                          : "All done"
                      }
                      busy={bulkRun.phase === "running"}
                      disabled={enrichGuard.isChecking || bulkRun.phase === "running"}
                      onClick={() => void runBulkEnrich()}
                      meter={<EntitlementMeter capability="education.card_enrichment" />}
                    />
                  )}
                  {canEdit && (
                    <PowerUpTile
                      tone="illustrate"
                      icon={Images}
                      title="Illustrate"
                      hint="An expert image on the front of every card"
                      busy={
                        illustrateRun.phase === "starting" ||
                        illustrateRun.phase === "running" ||
                        illustrateRun.phase === "stopping"
                      }
                      disabled={
                        illustrate.isChecking ||
                        illustrateRun.phase === "starting" ||
                        illustrateRun.phase === "running" ||
                        illustrateRun.phase === "stopping"
                      }
                      onClick={() => void illustrate.guard(() => runIllustrate("trial"))}
                      meter={<EntitlementMeter capability="education.card_image_source" />}
                    />
                  )}
                  <PowerUpTile
                    tone="convert"
                    icon={Boxes}
                    title="Convert"
                    hint="Turn this deck into a quiz, notes and more"
                    onClick={() => setConvertOpen(true)}
                  />
                </div>
              )}
              {/* Audio overview: the real section (on a phone, status only —
                  the buttons live in Deck tools). */}
              <div className="empty:hidden">
                <AudioOverviewSection
                  statusOnly
                  runSignals={audioRun}
                  setId={setId}
                  set={data.set}
                  cards={data.cards}
                  onCardsChanged={() => setReloadKey((k) => k + 1)}
                  onFileIdChange={(fileId) =>
                    setData((prev) =>
                      prev ? { ...prev, set: { ...prev.set, audio_overview_file_id: fileId } } : prev,
                    )
                  }
                />
              </div>
            </section>

            {/* Cards */}
            <div>
              {data.cards.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-3 py-10 text-center">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary-ink">
                    <BookOpen className="size-5" aria-hidden />
                  </div>
                  <div className="text-[0.8125rem] font-semibold">This deck has no cards yet</div>
                  {canEdit && (
                    <ControlRow className="mt-1 justify-center">
                      <ControlButton variant="primary" onClick={() => setGenerateOpen(true)}>
                        <AGENT_ICON aria-hidden />
                        Generate cards
                      </ControlButton>
                      <ControlButton variant="outline"
                        onClick={() => navigate("edit", `${EDU_BASE}/${setId}/edit`)}
                      >
                        <Pencil aria-hidden />
                        Write cards
                      </ControlButton>
                    </ControlRow>
                  )}
                </div>
              ) : (
                <>
                  {/* ONE row: the count, Select, the view (capsule segmented
                      control) and search (the 28px field). Selection is the
                      same opt-in `selectedIds` the real page uses for enrich
                      AND merge. */}
                  <div className="-mx-[3px] mb-2 flex flex-wrap items-center gap-y-1">
                    <h2 className="mx-[3px] flex items-baseline gap-1.5 text-[0.8125rem] font-semibold">
                      Cards
                      <span className="text-[0.6875rem] font-normal tabular-nums text-muted-foreground">
                        {cardSearch.trim() ? `${filteredCards.length} of ${data.cards.length}` : data.cards.length}
                      </span>
                    </h2>
                    <ControlRow nowrap className="flex-1">
                      {canEdit && !selecting && (
                        <ControlButton variant="quiet"
                          onClick={() => {
                            changeView("overview");
                            setSelecting(true);
                          }}
                        >
                          <MousePointerClick aria-hidden />
                          Select
                        </ControlButton>
                      )}
                      <span className="flex-1" />
                      <div className="contents max-sm:hidden">
                      <SearchField
                        style={{ width: "14rem" }}
                        value={cardSearch}
                        onChange={(e) => setCardSearch(e.target.value)}
                        placeholder="Search cards"
                        aria-label="Search cards in this deck"
                        end={
                          cardSearch ? (
                            <button type="button" aria-label="Clear search" onClick={() => setCardSearch("")}>
                              <X aria-hidden />
                            </button>
                          ) : null
                        }
                      />
                      </div>
                      <SegmentedControl
                        aria-label="Card view"
                        value={view}
                        onValueChange={changeView}
                        data={DECK_VIEWS.map((v) => ({ value: v.id, ariaLabel: v.label, title: v.label, label: <v.icon className="size-4" aria-hidden /> }))}
                      />
                    </ControlRow>
                    {/* Phone: search gets its own full row. */}
                    <div className="hidden max-sm:contents">
                    <SearchField style={{ flexBasis: "calc(100% - var(--matrx-control-gap))" }} type="search"
                        value={cardSearch}
                        onChange={(e) => setCardSearch(e.target.value)}
                        placeholder="Search cards"
                        aria-label="Search cards in this deck" />
                    </div>
                  </div>
                  {canEdit && selecting && (
                    <div className="mb-2 flex flex-wrap items-center gap-x-2 rounded-lg border border-primary/30 bg-primary/5 py-1 pl-3 pr-[9px]">
                      <span className="text-xs text-muted-foreground">
                        {selectedIds.size === 0 ? "Pick cards to enrich or merge" : `${selectedIds.size} selected`}
                      </span>
                      <ControlRow className="ml-auto">
                        <ControlButton variant="primary"
                          onClick={() => void runBulkEnrich()}
                          disabled={selectedIds.size === 0 || enrichGuard.isChecking || bulkRun.phase === "running"}
                          title="Enrich just these cards — even ones that already have layers"
                        >
                          <Lightbulb aria-hidden />
                          Enrich selected ({selectedIds.size})
                        </ControlButton>
                        <ControlButton variant="outline"
                          onClick={() => setMergeOpen(true)}
                          disabled={!canMergeSelection}
                          title={canMergeSelection ? undefined : "Pick two or more basic or cloze cards"}
                        >
                          <Merge aria-hidden />
                          Merge {selectedIds.size >= 2 ? selectedIds.size : ""}
                        </ControlButton>
                        <ControlButton variant="quiet"
                          onClick={() => {
                            setSelecting(false);
                            setSelectedIds(new Set());
                          }}
                        >
                          Cancel
                        </ControlButton>
                      </ControlRow>
                    </div>
                  )}
                  {filteredCards.length === 0 ? (
                    <EducationCollectionNoResults
                      query={cardSearch}
                      label="cards in this deck"
                      onClear={() => setCardSearch("")}
                    />
                  ) : view === "fronts" || view === "backs" ? (
                    <DeckFlashcardGrid
                      items={filteredCards}
                      face={view === "backs" ? "back" : "front"}
                    />
                  ) : view === "list" ? (
                    <DeckCardList items={filteredCards} onOpen={openCard} />
                  ) : view === "table" ? (
                    <DeckCardTable
                      items={filteredCards}
                      deckName={data.set.name}
                      masteryByCard={masteryByCard}
                      onOpen={openCard}
                    />
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {filteredCards.map(({ card, index }) => (
                        <CardPeek
                          key={card.id}
                          card={card}
                          index={index}
                          mastery={masteryByCard[card.id]}
                          // Every kind is selectable, because every kind can be
                          // ENRICHED. F3's text-mergeable restriction still holds
                          // — it just moved to the Merge button, which judges the
                          // selection (`canMergeSelection`): a matching/formula
                          // card's structure lives in dynamic_content, which a
                          // front/back merge would silently destroy.
                          selectable={selecting}
                          selected={selectedIds.has(card.id)}
                          onToggleSelected={() =>
                            setSelectedIds((prev) => {
                              const nextIds = new Set(prev);
                              if (nextIds.has(card.id)) nextIds.delete(card.id);
                              else nextIds.add(card.id);
                              return nextIds;
                            })
                          }
                          onOpen={() => openCard(card)}
                          onEnhance={
                            canEdit ? () => setEnhanceCard(card) : undefined
                          }
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* "Make this deeper" — per-card enrich (detail layers) + deepen
                (atomic sub-cards) via the live enrichCard/expandCard agents. */}
            {/* Per-set image run — live progress, then the review pass.
                Floats beside the deck so the page never shifts. */}
            {illustrateOpen && (
              <IllustrateSetWindow
                run={illustrateRun}
                setName={data.set.name}
                onClose={() => {
                  // Closing mid-run stops it — a hidden run would keep buying
                  // images nobody is watching.
                  stopIllustrate();
                  setIllustrateOpen(false);
                  resetIllustrate();
                }}
                onStop={stopIllustrate}
                remainingCount={cardsWithoutImage}
                onContinue={() =>
                  void illustrate.guard(() => runIllustrate("rest"))
                }
                onKeep={(card) => reviewImage(card, "accepted")}
                onReject={(card) => reviewImage(card, "rejected")}
                onOpenCard={(cardId) => {
                  const card = data.cards.find((c) => c.id === cardId);
                  if (!card) return;
                  const faces = studyFaces(card);
                  const images = getCardImages(card);
                  openCardWindow({
                    front: faces ? faces.front : card.front,
                    back: faces ? faces.back : card.back,
                    title: data.set.name,
                    frontImage: images.front ?? null,
                    backImage: images.back ?? null,
                  });
                }}
              />
            )}
            <illustrate.Paywall />

            {/* The batch's live surface: "N of M cards enriched", cancellable,
                then the truthful summary. Floats so the deck never shifts. */}
            {bulkOpen && (
              <BulkEnrichWindow
                run={bulkRun}
                setName={data.set.name}
                onClose={() => {
                  setBulkOpen(false);
                  resetBulkEnrich();
                }}
                onCancel={cancelBulkEnrich}
              />
            )}
            <coppa.Gate />
            <enrichGuard.Paywall />

            <Drawer open={studyModesOpen} onOpenChange={setStudyModesOpen}>
              <DrawerContent className="max-h-[85dvh]">
                <DrawerHeader>
                  <DrawerTitle>More ways to study</DrawerTitle>
                </DrawerHeader>
                <div className="grid gap-0.5 overflow-y-auto px-3 pb-safe">
                  {STUDY_MODES.map((mode) => (
                    <button
                      type="button"
                      key={mode.key}
                      className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                      onClick={() => navigate(mode.key, mode.href(setId))}
                    >
                      <mode.icon className="size-4 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block text-[0.8125rem] font-medium">{mode.label}</span>
                        <span className="block truncate text-[0.6875rem] text-muted-foreground">
                          {mode.description}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </DrawerContent>
            </Drawer>

            {/* Deck tools: the PHONE's home for every secondary deck action
                (only the phone row opens it; desktop shows them on the page).
                Dialog becomes a bottom sheet on a phone by itself. */}
            <Dialog open={deckToolsOpen} onOpenChange={setDeckToolsOpen}>
              <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Deck tools</DialogTitle>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe">
                <ControlScope className="h-full">
                <style dangerouslySetInnerHTML={{ __html: FC_SAMPLE_CSS }} />
                <div className="space-y-4">
                  <section className="space-y-2">
                    <h2 className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
                      Manage
                    </h2>
                    <ControlRow className="-mx-[3px] [&>*]:basis-[calc(50%-var(--matrx-control-gap))] [&>*]:grow">
                      {canEdit && (
                        <ControlButton variant="outline" className="justify-start md:hidden"
                          onClick={() =>
                            navigate("edit", `${EDU_BASE}/${setId}/edit`)
                          }
                        >
                          <Pencil aria-hidden /> Edit
                        </ControlButton>
                      )}
                      <ControlButton variant="outline" className="justify-start"
                        onClick={() =>
                          navigate("sessions", `${EDU_BASE}/${setId}/sessions`)
                        }
                      >
                        <TrendingUp aria-hidden /> Progress
                      </ControlButton>
                      {canEdit && (
                        <ControlButton variant="outline" className="justify-start"
                          onClick={() => {
                            setDeckToolsOpen(false);
                            setSettingsOpen(true);
                          }}
                        >
                          <Settings2 aria-hidden /> Deck settings
                        </ControlButton>
                      )}
                      {(access.isOwner || access.level === "admin") && (
                        <span className="uk-adopt uk-grow contents"><ShareButton
                          resourceType="fc_set"
                          resourceId={setId}
                          resourceName={data.set.name}
                          organizationId={data.set.organization_id}
                          showStatus={false}
                          className="justify-start"
                        /></span>
                      )}
                      {chatHref && (
                        <ControlButton asChild variant="outline"><Link href={chatHref} className="justify-start">
                            <MessagesSquare aria-hidden /> See chat
                          </Link></ControlButton>
                      )}
                      {/* An empty deck has nothing to keep offline or
                          print: those appear with its first card. */}
                      {!deckEmpty && (
                        <span className="uk-adopt uk-grow contents"><OfflineDeckButton
                          setId={setId}
                          className="justify-start"
                        /></span>
                      )}
                      {!deckEmpty && (
                        <ControlButton variant="outline" className="justify-start"
                          onClick={() => {
                            setDeckToolsOpen(false);
                            handlePrint();
                          }}
                        >
                          <Printer aria-hidden /> Print
                        </ControlButton>
                      )}
                      {/* This deck is one printable; the hub is the index of
                          the rest (cheat sheets, practice tests, certificates,
                          labels, codes, booklets, printed copies). */}
                      <ControlButton asChild variant="quiet"><Link href="/print" onClick={() => setDeckToolsOpen(false)} className="justify-start">
                          <Printer aria-hidden /> More printing
                        </Link></ControlButton>
                    </ControlRow>
                  </section>

                  {!deckEmpty && (
                  <section className="space-y-2">
                    <h2 className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
                      Export
                    </h2>
                    <ControlRow className="-mx-[3px] [&>*]:basis-[calc(50%-var(--matrx-control-gap))] [&>*]:grow">
                      {(["csv", "anki", "md", "json"] as const).map(
                        (format) => (
                          <ControlButton variant="outline" className="justify-start" key={format}
                            onClick={() => exportDeck(format)}
                          >
                            <Download aria-hidden />
                            {DECK_EXPORT_FILE[format].label}
                          </ControlButton>
                        ),
                      )}
                    </ControlRow>
                  </section>
                  )}

                  {data.cards.length > 0 && (
                    <section className="space-y-2">
                      <h2 className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
                        Audio
                      </h2>
                      <ControlRow className="-mx-[3px] [&>*]:basis-full">
                        <ControlButton variant="outline" className="justify-start"
                          onClick={() => startAudioJob("generate")}
                        >
                          <Volume2 aria-hidden />
                          {data.set.audio_overview_file_id
                            ? "Regenerate audio overview"
                            : "Generate audio overview"}
                        </ControlButton>
                        {(
                          [
                            ["spoken_front", "card audio", Mic],
                            ["helper", "instant help", HelpCircle],
                          ] as const
                        ).map(([lane, noun, Icon]) => {
                          const { ready, total } = deckAudioCoverage(data.cards, lane);
                          const done = ready >= total;
                          return (
                            <ControlButton variant="outline" className="justify-start" key={lane}
                              disabled={done}
                              onClick={() => startAudioJob(lane)}
                            >
                              <Icon aria-hidden />
                              {done
                                ? `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ready`
                                : ready > 0
                                  ? `Prepare ${noun} (${ready}/${total} done)`
                                  : `Prepare ${noun}`}
                            </ControlButton>
                          );
                        })}
                      </ControlRow>
                    </section>
                  )}
                  {canEdit && data.cards.length > 0 && (
                    <section className="space-y-2">
                      <h2 className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
                        Cards
                      </h2>
                      <ControlRow className="-mx-[3px] [&>*]:basis-full">
                      <ControlButton variant="outline" className="justify-start"
                        onClick={() => {
                          setDeckToolsOpen(false);
                          setSelecting(true);
                        }}
                      >
                        <MousePointerClick aria-hidden />
                        Select cards to enrich or merge
                      </ControlButton>
                      </ControlRow>
                    </section>
                  )}

                </div>
                </ControlScope>
                </div>
              </DialogContent>
            </Dialog>

            {/* Deck settings — who sees the deck and its class. These were a
                permanent row above the actions; they are set once, so they
                live one click away instead. */}
            {canEdit && (
              <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Deck settings</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        Who can see it
                      </p>
                      <DeckRowAccess
                        setId={setId}
                        value={data.set}
                        onChange={(v) =>
                          setData((prev) =>
                            prev ? { ...prev, set: { ...prev.set, ...v } } : prev,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        Class
                      </p>
                      <ClassPicker
                        entityType="fc_set"
                        entityId={setId}
                        organizationId={data.set.organization_id}
                      />
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {/* Per-card "make this deeper", opened from a specific card tile —
                never a modal list of the whole deck to scroll and pick from.
                The set-level action is "Enrich all cards" above. */}
            {enhanceCard && (
              <EnhanceSetDialog
                open={enhanceCard !== null}
                onOpenChange={(next) => {
                  if (!next) setEnhanceCard(null);
                }}
                setId={setId}
                cards={[enhanceCard]}
                onChanged={() => setReloadKey((k) => k + 1)}
              />
            )}

            {/* Canonical block printer — same dialog, variants, and settings
                as the markdown-block flashcards lane. */}
            <PrintOptionsDialog
              printer={flashcardsPrinter}
              data={printData}
              open={printOpen}
              onOpenChange={setPrintOpen}
              onPrinted={notifyPrintOutcome}
            />

            {/* WP3 gap 5 — merge selected cards into one (editable preview). */}
            <MergeCardsDialog
              open={mergeOpen}
              onOpenChange={setMergeOpen}
              cards={data.cards.filter((c) => selectedIds.has(c.id))}
              onMerged={() => {
                setSelecting(false);
                setSelectedIds(new Set());
                setReloadKey((k) => k + 1);
              }}
            />

            {canEdit && deckEmpty && (
              <GenerateCardsDialog
                open={generateOpen}
                onOpenChange={setGenerateOpen}
                setId={setId}
                defaultTopic={data.set.topic?.trim() || data.set.name}
                difficulty={data.set.difficulty}
                onAdded={() => {
                  setReloadKey((k) => k + 1);
                  setLineageKey((k) => k + 1);
                }}
              />
            )}
            {/* Convert this deck into other study artifacts (shared primitive). */}
            <ConvertContentDialog
              open={convertOpen}
              onOpenChange={setConvertOpen}
              origin={{
                kind: "deck",
                entityType: "fc_set",
                entityId: setId,
                title: data.set.name,
              }}
              text={serializeDeck(data.set, data.cards).markdown}
              orgId={data.set.organization_id ?? undefined}
              excludeKinds={["deck"]}
              onConverted={() => setLineageKey((k) => k + 1)}
            />
          </>
        )}
      </div>
    </div>
    </ControlScope>
    </>
  );
}

/**
 * The way back to the chat a deck was born in. Chat-emitted flashcard sets are
 * saved here by the canvas flashcards adapter (`generation: chat_render_block`)
 * and stamped with their conversation; the chat block links forward with
 * "Open in Flashcards", the deck's "See chat" button links back.
 */
function madeInChatHref(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const meta = metadata as Record<string, unknown>;
  const conversationId = meta.conversation_id;
  if (meta.generation !== "chat_render_block") return null;
  if (typeof conversationId !== "string" || !conversationId) return null;
  return `/chat/${conversationId}`;
}
