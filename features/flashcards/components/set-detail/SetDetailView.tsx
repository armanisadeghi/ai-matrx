// features/flashcards/components/set-detail/SetDetailView.tsx
//
// The detail view for a single flashcard set: header (name, topic, card count)
// + a grid of cards (front/back peek + detail-presence badges) + a "Study"
// affordance into the focused study surface. Loads via fcService.getSetWithCards
// (ordered cards + their fc_detail rows). Graceful loading / empty / not-found.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

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
  Archive,
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
import { RichCopySplit } from "@ai-matrx/chat/agent-copy/RichCopySplit";
import { PlainTextView } from "@ai-matrx/rich-content/copy/ContentActions";
import { usePlainView } from "@ai-matrx/rich-content/copy/content-view-store";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import {
  asDeckView,
  DeckCardList,
  DeckCardTable,
  DeckFlashcardGrid,
  DeckViewToggle,
  type DeckView,
} from "./DeckCardViews";
import { MergeCardsDialog } from "./MergeCardsDialog";
import { toast } from "@/lib/toast";
import { archiveRecord, restoreFromTrash } from "@/features/trash/service";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { Button } from "@/components/ui/button";
import { Skeleton, Button as SurfaceButton, } from "@ai-matrx/design-system";
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
import { fcService } from "../../data/fcService";
import { getCardImages } from "../study/cardImages";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { buildDeckPrintData } from "../../utils/deckPrintData";
import { flashcardsPrinter } from "@ai-matrx/print/flashcards";
import { notifyPrintOutcome } from "@/lib/print/print-outcome-toast";
import { PrintOptionsDialog, usePrintOptions } from "@ai-matrx/print/react";
import { FlashcardFaceImage } from "@/components/mardown-display/blocks/flashcards/FlashcardFaceImage";
import type { SetWithCards, CardWithDetails } from "../../data/types";
import {
  asCardKind,
  CARD_KIND,
  matchingPairs,
  studyFaces,
} from "../../utils/cardVariants";
import { studyService } from "@/features/education/study/service/studyService";
import type { ItemMasteryRow } from "@/features/education/study/types";
import {
  MasteryTierPill,
  DeckMasteryBar,
} from "@/features/education/study/components/MasteryDisplay";
import { FlashcardStudyWindowDevTrigger } from "../study/FlashcardStudyWindowDevTrigger";
import CardFaceContent from "@/components/mardown-display/blocks/flashcards/CardFaceContent";
import {
  buildDeckFile,
  DECK_EXPORT_FILE,
  downloadTextFile,
  safeFilename,
  type DeckExportFormat,
} from "../../utils/exportDeck";
import { DeckRowAccess } from "../sharing/DeckRowAccess";
import {
  AudioOverviewSection,
  deckAudioCoverage,
  type DeckAudioRunSignals,
} from "./AudioOverviewSection";
import { EnhanceSetDialog } from "./EnhanceSetDialog";
import { useFlashcardMandates } from "../../data/mandate-disclosure";
// BUNDLE-LEAK GUARD (F9): these two float as draggable WindowPanels, and a
// STATIC import of either would drag features/window-panels/WindowPanel.tsx —
// and its 100+ registry lazy chunks — into the flashcards route bundle
// (lazy-bundle-guard fires "[WINDOW-PANELS BUNDLE LEAK]" on route boot).
// They open one-at-a-time on explicit user action, so each gets its own
// ssr:false edge (the AgentPeekButton pattern; code-splitting rule 3 allows
// per-item splits for user-triggered windows).
const IllustrateSetWindow = dynamic(
  () => import("./IllustrateSetWindow").then((m) => m.IllustrateSetWindow),
  { ssr: false },
);
const BulkEnrichWindow = dynamic(
  () => import("./BulkEnrichWindow").then((m) => m.BulkEnrichWindow),
  { ssr: false },
);
import {
  useBulkEnrichRun,
  bulkEnrichActionLabel,
  planBulkEnrich,
  summarizeBulkEnrichCounts,
} from "./bulkEnrichRun";
import {
  selectCardDetailLayers,
} from "../../data/cardDetailLayers";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import { useAppDispatch, useAppSelector, useAppStore, useDispatchThunk } from "@/lib/redux/hooks";
import { clearWizardDraft, selectWizardDraft } from "@/lib/redux/slices/wizardDraftSlice";
import { MADE_DECK_DRAFT_ID, readMadeDeck } from "../../data/madeDeckMarker";
import { refreshStoreRead } from "@/lib/redux/slices/storeReadsSlice";
import { useStoreRead } from "@/lib/redux/store-reads/useStoreRead";
import {
  useIllustrateSetRun,
  type IllustrateCardState,
} from "./illustrateSetRun";
import { EntitlementMeter } from "@/features/entitlements/components/EntitlementMeter";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { useOpenFlashcardItemWindow } from "@/features/overlays/openers/flashcardItemWindow";
import { serializeDeck } from "@/features/education/media/audio/audioBrief";
import { ConvertContentDialog } from "@/features/education/convert/ConvertContentDialog";
import { GenerateCardsDialog } from "./GenerateCardsDialog";
import { GeneratedFromChips } from "@/features/education/convert/GeneratedFromChips";
import { MadeFromSource } from "@/features/education/convert/MadeFromSource";
import { AddMoreCardsButton } from "./AddMoreCardsButton";
import { ClassPicker } from "@/features/education/classes/components/ClassPicker";
import { OfflineDeckButton, OfflineDeckMenuItems } from "./OfflineDeckButton";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
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
import {
  useSurfaceRuntimeRegistration,
  type SurfaceWriteHandlers,
} from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { buildDeckWriteHandlers } from "../editor/deckWriteHandlers";
import { deckSurfaceCards, deckSurfaceDetails } from "./deckSurfaceValues";
import {
  createEducationFlashcardSetScope,
  type FlashcardSetSurfaceMastery,
} from "@/features/surfaces/manifests/education-flashcard-set.manifest";
import { masteryTier } from "@/features/education/study/utils/masteryFsrs";
import {
  EducationCollectionNoResults,
  EducationCollectionSearch,
  filterEducationCollection,
} from "@/features/education/components/EducationCollectionSearch";

import { Tile } from "@ai-matrx/design-system/controls";
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
    <SurfaceButton
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="h-9 w-9 text-muted-foreground hover:text-foreground"
    >
      {children}
    </SurfaceButton>
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
        "group relative flex flex-col items-center gap-2 overflow-hidden rounded-2xl border border-border bg-card p-3 text-center shadow-sm transition-all sm:flex-row sm:items-start sm:gap-3 sm:p-4 sm:text-left",
        "hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-70",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent to-transparent opacity-60 transition-opacity group-hover:opacity-100",
          t.glow,
        )}
      />
      <span
        className={cn(
          "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm transition-transform group-hover:scale-105",
          t.tile,
        )}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Icon className="h-5 w-5" />
        )}
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="flex items-center justify-center gap-2 sm:justify-start">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {badge && (
            <span className="hidden rounded-full sm:inline bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{hint}</span>
        {meter && <span className="mt-1 block">{meter}</span>}
      </span>
      <ArrowRight className="relative mt-1 hidden h-4 w-4 shrink-0 sm:block text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
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
        "group/peek relative flex flex-col rounded-xl border bg-card p-4 shadow-sm",
        interactive &&
          "cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
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
          className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-muted hover:text-primary sm:h-7 sm:w-7 sm:opacity-0 sm:group-hover/peek:opacity-100 sm:focus-visible:opacity-100"
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

export function SetDetailView({
  setId,
  initialName = null,
  embedded = false,
  onNameKnown,
}: {
  setId: string;
  /** Read on the server so the header names the deck on its first paint. */
  initialName?: string | null;
  /**
   * The deck is shown inside a host that is not its own page (a Board tile): no shell
   * header and no shell-header offset, and the card view is kept here instead of in the
   * address bar (the host owns the address). Everything else is the page.
   */
  embedded?: boolean;
  /** The deck's current name, whenever it is known or changes (a Board tile follows it). */
  onNameKnown?: (name: string) => void;
}) {
  useFlashcardMandates(["enrichCard"]);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [convertOpen, setConvertOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [studyModesOpen, setStudyModesOpen] = useState(false);
  const [deckToolsOpen, setDeckToolsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cardSearch, setCardSearch] = useState("");
  // The card view rides the URL so a reload or a shared link keeps it.
  const searchParams = useSearchParams();
  const [embeddedView, setEmbeddedView] = useState<DeckView>("overview");
  const view = embedded ? embeddedView : asDeckView(searchParams.get("view"));
  const changeView = (next: DeckView) => {
    if (embedded) {
      setEmbeddedView(next);
      return;
    }
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
  // THE DECK AND ITS MASTERY ARE READ ONCE PER TAB (`useStoreRead`, Redux `storeReads`, keyed by
  // deck): a remount, a wake from sleep (a Board tile) or a second view of the deck renders the
  // kept copy and reads nothing, and never drops to the skeleton. `reload` is the deliberate
  // re-read after something changed the cards (enrich, deepen, illustrate, merge, import).
  const dispatchRead = useDispatchThunk();
  const deckKey = `education.fc_set:${setId}`;
  const masteryKey = `education.fc_set_mastery:${setId}`;
  const readDeck = async (): Promise<SetWithCards> => {
    const res = await fcService.getSetWithCards(setId);
    if (!res.data) throw new Error(res.error ?? recordUnavailableMessage("deck", "unknown"));
    return res.data;
  };
  const readMastery = async (cards: readonly { id: string }[]): Promise<Record<string, ItemMasteryRow>> => {
    if (cards.length === 0) return {};
    // Per-card mastery for the retention viz (read-only; RLS-scoped).
    const mRes = await studyService.getMasteryBulk(cards.map((c) => ({ itemType: "fc_card", itemId: c.id })));
    if (mRes.error) throw new Error("The mastery read failed");
    const seed: Record<string, ItemMasteryRow> = {};
    for (const m of mRes.data ?? []) seed[m.item_id] = m;
    return seed;
  };
  const deckRead = useStoreRead<SetWithCards>(deckKey, readDeck);
  // The deck is the primary payload; never hold the entire page behind the secondary mastery
  // enrichment (a slow mastery read once left mobile learners on skeletons).
  const masteryRead = useStoreRead<Record<string, ItemMasteryRow>>(
    masteryKey,
    () => readMastery(deckRead.data?.cards ?? []),
    { enabled: Boolean(deckRead.data), staleAfterMs: 60_000 },
  );
  // A failed re-read of a deck that was already shown is the failure the page reports, as before.
  const error = deckRead.isError ? (deckRead.error ?? recordUnavailableMessage("deck", "unknown")) : null;
  const data: SetWithCards | null = deckRead.isError ? null : (deckRead.data ?? null);
  const loading = !deckRead.hasData && !deckRead.isError;
  const currentName = data?.set.name ?? null;
  useEffect(() => {
    if (currentName) onNameKnown?.(currentName);
  }, [currentName, onNameKnown]);
  const masteryByCard: Record<string, ItemMasteryRow | undefined> = masteryRead.data ?? {};
  // A missing mastery read is not the same as a learner with no history: the surface value stays
  // absent rather than handing an agent fabricated "new" evidence.
  const masteryStatus: "pending" | "available" | "unavailable" = masteryRead.hasData
    ? "available"
    : masteryRead.isError
      ? "unavailable"
      : "pending";
  const setData = (update: (prev: SetWithCards | null) => SetWithCards | null) =>
    deckRead.setData((prev) => update(prev ?? null) ?? (prev as SetWithCards));
  const reload = () => {
    void (async () => {
      const fresh = await dispatchRead(refreshStoreRead(deckKey, readDeck));
      if (fresh) await dispatchRead(refreshStoreRead(masteryKey, () => readMastery(fresh.cards)));
    })();
  };

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
  // Archive = soft-delete through Trash's one archive; Undo restores it. The
  // person lands back on the list, where the toast's Undo stays reachable.
  const archiveDeck = async () => {
    const name = data?.set.name ? `"${data.set.name}"` : "this deck";
    try {
      await archiveRecord("fc_set", setId, "deck");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${name} was not archived.`);
      return;
    }
    toast.success(`Archived ${name}.`, {
      action: {
        label: "Undo",
        onClick: () =>
          void restoreFromTrash("fc_set", setId).then(
            () => toast.success(`Put back ${name}.`),
            (err: unknown) =>
              toast.error(err instanceof Error ? err.message : "It could not be put back."),
          ),
      },
    });
    router.push(EDU_BASE);
  };
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
    reload();
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
  // The new-deck page recorded this deck as made-but-not-yet-opened: it is open now.
  // (Read live: after a full page load the record arrives with the rehydrate.)
  const madeHere = readMadeDeck(useAppSelector(selectWizardDraft(MADE_DECK_DRAFT_ID))?.data)?.setId === setId;
  useEffect(() => {
    if (madeHere) dispatch(clearWizardDraft(MADE_DECK_DRAFT_ID));
  }, [dispatch, madeHere]);
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
      reload();
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
    if (verdict === "rejected") reload();
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

  // The deck bar's Plain switch (ContentActions): the deck's exact markdown in place of the cards.
  const deckPlain = usePlainView(data ? `fc-deck-${data.set.id}` : null);
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
            set_details: deckSurfaceDetails(data.set),
            card_count: data.cards.length,
            cards: deckSurfaceCards(data.cards),
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

  // The deck's writes (name, topic, description, cards): the SAME handlers the Edit page registers,
  // through the same fcService calls. A view-only person gets the refusal the page's own controls give.
  const buildWriteHandlers = (): SurfaceWriteHandlers =>
    buildDeckWriteHandlers({
      setId,
      getData: () => data,
      currentSetFields: () => ({
        name: data?.set.name ?? "",
        topic: data?.set.topic ?? "",
        description: data?.set.description ?? "",
      }),
      onSetSaved: (saved) => setData((prev) => (prev ? { ...prev, set: saved } : prev)),
      onCardSaved: (saved) =>
        setData((prev) =>
          prev
            ? { ...prev, cards: prev.cards.map((c) => (c.id === saved.id ? { ...c, ...saved } : c)) }
            : prev,
        ),
      onCardsChanged: () => reload(),
      onCardDeleted: (id) => {
        setData((prev) => (prev ? { ...prev, cards: prev.cards.filter((c) => c.id !== id) } : prev));
        reload();
      },
      assertWritable: (target) => {
        if (viewOnly) {
          throw new Error(`${target}: this deck is view only for the person, who can make an editable copy first.`);
        }
      },
    });

  useSurfaceRuntimeRegistration({
    surfaceName: SURFACE_NAME,
    getScope: buildScope,
    getWriteHandlers: buildWriteHandlers,
  });

  /** The chat this deck was made in, when it was made in one. */
  const chatHref = data ? madeInChatHref(data.set.metadata) : null;

  /** A loaded deck with no cards: the page offers what makes cards. */
  const deckEmpty = !!data && data.cards.length === 0;
  // The deck's content action set (Copy, Plain, Export, Print, Transform) — in the desktop bar and
  // in the phone's tools row, where "…" holds every action one tap away.
  const deckContentActions = data ? (
      <RichCopySplit
        size="sm"
        triggerVariant="transparent"
        label={`Deck: ${data.set.name}`}
        exportTitle={data.set.name}
        viewKey={`fc-deck-${data.set.id}`}
        human={() => serializeDeck(data.set, data.cards).markdown}
        json={() => ({ set: data.set, cards: data.cards })}
        agent={() => ({
          kind: "flashcard-deck",
          location: `AI Matrx — Flashcards — ${EDU_BASE}/${setId}`,
          description:
            "A flashcard deck: every card's front and back.",
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
            ...(["csv", "anki", "md", "json"] as const).map(
              (format) => ({
                id: format,
                label: DECK_EXPORT_FILE[format].label,
                onSelect: () => exportDeck(format),
              }),
            ),
          ],
        }}
/>
  ) : null;

  return (
    <div className="h-full w-full overflow-y-auto bg-textured">
      {embedded ? null : <EducationToolHeader title={data?.set.name ?? initialName ?? "Deck"} />}
      <div
        className={
          embedded
            ? "matrx-touch-targets mx-auto max-w-6xl px-3 pb-4 pt-3"
            : "matrx-touch-targets mx-auto max-w-6xl px-3 pb-safe pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-6 sm:pb-8 sm:pt-[calc(var(--shell-header-h)+1.5rem)]"
        }
      >
        {loading ? (
          <>
            <Skeleton className="h-10 w-64 rounded-lg" />
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-lg" />
              ))}
            </div>
          </>
        ) : error || !data ? (
          <AccessGate
            token="fc_set"
            id={setId}
            fallbackHref={EDU_BASE}
            fallbackLabel="All flashcards"
          />
        ) : (
          <>
            {/* ACTION BAR (redesign 2026-10-01). One line: how to study on
                the left, the deck's tools as quiet icons on the right, and
                Add as the one primary write. The card-count line and the
                visibility / class row left the page — they live in Deck
                settings (the More menu). History is "Progress". */}
            <div className="hidden items-center justify-between gap-3 md:flex">
              <div className="flex items-center gap-2">
                {deckEmpty ? (
                  canEdit && (
                    <Button variant="primary" onClick={() => setGenerateOpen(true)}>
                      <AGENT_ICON className="mr-1.5 h-4 w-4" />
                      Generate cards
                    </Button>
                  )
                ) : (
                  <>
                    <div className="inline-flex rounded-lg shadow-sm">
                      <Button
                        icon={pendingAction === "study" ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Play className="fill-current" />
                        )}
                        variant="primary"
                        onClick={() =>
                          navigate("study", `${EDU_BASE}/${setId}/study`)
                        }
                        disabled={isPending}
                      >
                        Study
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            icon={<ChevronDown />}
                            variant="primary"
                            disabled={isPending}
                            aria-label="More ways to study"
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-72 p-1.5">
                          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                            More ways to study
                          </DropdownMenuLabel>
                          {STUDY_MODES.map((m) => (
                            <DropdownMenuItem
                              key={m.key}
                              className="gap-3 py-2"
                              onClick={() => navigate(m.key, m.href(setId))}
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary-ink">
                                <m.icon className="h-4 w-4" />
                              </span>
                              <span className="flex min-w-0 flex-col">
                                <span className="font-medium">{m.label}</span>
                                <span className="text-xs text-muted-foreground">
                                  {m.description}
                                </span>
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <FlashcardStudyWindowDevTrigger
                      setId={setId}
                      title={data.set.name}
                    />
                    <Button
                      icon={pendingAction === "sessions" ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <TrendingUp />
                      )}
                      variant="quiet"
                      data-deck-action="progress"
                      onClick={() =>
                        navigate("sessions", `${EDU_BASE}/${setId}/sessions`)
                      }
                      disabled={isPending}
                    >
                      Progress
                    </Button>
                    {chatHref && (
                      <Button asChild variant="quiet">
                        <Link href={chatHref}>
                          <MessagesSquare className="mr-1.5 h-4 w-4" />
                          See chat
                        </Link>
                      </Button>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center gap-1">
                {canEdit && (
                  <IconAction
                    label="Edit deck"
                    onClick={() =>
                      navigate("edit", `${EDU_BASE}/${setId}/edit`)
                    }
                    disabled={isPending}
                  >
                    {pendingAction === "edit" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Pencil className="h-4 w-4" />
                    )}
                  </IconAction>
                )}
                {(access.isOwner || access.level === "admin") && (
                  <ShareButton
                    resourceType="fc_set"
                    resourceId={setId}
                    resourceName={data.set.name}
                    organizationId={data.set.organization_id}
                    showStatus={false}
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 text-muted-foreground hover:text-foreground"
                  />
                )}
                {!deckEmpty && (
                  <DropdownMenu>
                    <IconAction label="Audio" asTrigger>
                      <Volume2 className="h-4 w-4" />
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
                {!deckEmpty && deckContentActions}
                <DropdownMenu>
                  <IconAction label="More" asTrigger>
                    <Ellipsis className="h-4 w-4" />
                  </IconAction>
                  <DropdownMenuContent align="end" className="w-60">
                    {canEdit && (
                      <DropdownMenuItem
                        className="gap-2"
                        onClick={() => setSettingsOpen(true)}
                      >
                        <Settings2 className="h-4 w-4 text-muted-foreground" />
                        Deck settings
                      </DropdownMenuItem>
                    )}
                    {data.set.published_to_web && (
                      <DropdownMenuItem asChild className="gap-2">
                        <a
                          href={`/p/e/fc_set/${setId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
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
                    {access.isOwner && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="gap-2 text-destructive focus:text-destructive"
                          onClick={() => void archiveDeck()}
                        >
                          <Archive className="h-4 w-4" />
                          Archive
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild className="gap-2">
                      <Link href="/print">
                        <Printer className="h-4 w-4 text-muted-foreground" />
                        More printing
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {viewOnly && (
                  <DuplicateToEditButton
                    resourceType="fc_set"
                    resourceId={setId}
                    returnPath={`${EDU_BASE}/${setId}`}
                    label="Make a copy"
                    size="default"
                    variant="default"
                  />
                )}
                {canEdit && (
                  <div className="ml-2">
                    <AddMoreCardsButton
                      label="Add"
                      variant="default"
                      setId={setId}
                      existingCards={data.cards.map((c) => ({ front: c.front, back: c.back }))}
                      deckName={data.set.name}
                      deckOrganizationId={data.set.organization_id}
                      onAdded={() => {
                        reload();
                        setLineageKey((k) => k + 1);
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {data.set.description ? (
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {data.set.description}
              </p>
            ) : null}
            {viewOnly && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" />
                View only — make a copy to edit
              </div>
            )}

            {/* Phone: a study launchpad. Study is the one big action; every
                other way to study is one sheet, every deck tool another. */}
            <div className="mt-2 space-y-2 md:hidden">
              {deckEmpty && canEdit && (
                <SurfaceButton
                  size="lg"
                  className="h-12 w-full"
                  onClick={() => setGenerateOpen(true)}
                >
                  <AGENT_ICON className="mr-2 h-5 w-5" />
                  Generate cards
                </SurfaceButton>
              )}
              {!deckEmpty && (
                <SurfaceButton
                  size="lg"
                  className="h-12 w-full text-base font-semibold"
                  onClick={() =>
                    navigate("study", `${EDU_BASE}/${setId}/study`)
                  }
                  disabled={isPending}
                >
                  <Play className="mr-2 h-5 w-5 fill-current" />
                  Study
                </SurfaceButton>
              )}
              <div className="flex items-center gap-2 [&>button]:flex-1">
                {!deckEmpty && (
                  <Button
                    icon={<GraduationCap />}
                    variant="outline"
                    onClick={() => setStudyModesOpen(true)}
                  >
                    More ways
                  </Button>
                )}
                <Button
                  icon={<Ellipsis />}
                  variant="outline"
                  
                  onClick={() => setDeckToolsOpen(true)}
                >
                  Deck tools
                </Button>
                {!deckEmpty && deckContentActions}
              </div>
              {canEdit && (
                <div className="[&>button]:h-11 [&>button]:w-full">
                <AddMoreCardsButton
                  setId={setId}
                  existingCards={data.cards.map((c) => ({ front: c.front, back: c.back }))}
                  deckName={data.set.name}
                  deckOrganizationId={data.set.organization_id}
                  onAdded={() => {
                    reload();
                    setLineageKey((k) => k + 1);
                  }}
                />
                </div>
              )}
              {viewOnly && (
                <DuplicateToEditButton
                  resourceType="fc_set"
                  resourceId={setId}
                  returnPath={`${EDU_BASE}/${setId}`}
                  label="Make an editable copy"
                  size="default"
                  variant="default"
                />
              )}
            </div>

            {/* Deck mastery — where you stand across the whole deck. */}
            {!deckEmpty && (
              <div className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
                <DeckMasteryBar
                  masteries={data.cards.map((c) => masteryByCard[c.id])}
                />
              </div>
            )}

            {/* Power-ups — the deck's AI upgrades, shown off as what they
                are rather than two more outline buttons in a row. */}
            {!deckEmpty && (
              <div
                className={cn(
                  "mt-3 grid gap-2 sm:gap-3",
                  canEdit ? "grid-cols-3" : "grid-cols-1",
                )}
              >
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
                    onClick={() =>
                      void illustrate.guard(() => runIllustrate("trial"))
                    }
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

            {/* Lineage — what this deck was made from, and what was made
                from it. */}
            <div className="mt-3 flex flex-wrap items-center gap-2 empty:hidden">
              <MadeFromSource entityType="fc_set" entityId={setId} />
            </div>
            <div className="mt-2 empty:hidden">
              <GeneratedFromChips
                entityType="fc_set"
                entityId={setId}
                refreshKey={lineageKey}
              />
            </div>

            {/* Audio overview (Phase 7 — podcast-from-deck). On a phone the
                page shows only the player and running jobs (the buttons live
                in Deck tools); desktop keeps the whole section. */}
            <div className="mt-4 empty:hidden">
              <AudioOverviewSection
                statusOnly
                runSignals={audioRun}
                setId={setId}
                set={data.set}
                cards={data.cards}
                onCardsChanged={() => reload()}
                onFileIdChange={(fileId) =>
                  setData((prev) =>
                    prev
                      ? {
                          ...prev,
                          set: { ...prev.set, audio_overview_file_id: fileId },
                        }
                      : prev,
                  )
                }
              />
            </div>

            {/* Cards */}
            <div className="mt-6">
              {data.cards.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
                  <BookOpen className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">
                    This deck has no cards yet
                  </p>
                  {canEdit && (
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                      <Button variant="primary" onClick={() => setGenerateOpen(true)}>
                        <AGENT_ICON className="mr-1.5 h-4 w-4" />
                        Generate cards
                      </Button>
                      <Button
                        icon={<Pencil />}
                        variant="outline"
                        onClick={() =>
                          navigate("edit", `${EDU_BASE}/${setId}/edit`)
                        }
                      >
                        Write cards
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* ONE selection, several actions. WP3 gap 5 introduced this
                      bar for merging; enrichment reuses the SAME `selectedIds`
                      rather than forking a second selection UI — a user with 83
                      cards who wants 10 enriched picks them here. Selection
                      stays opt-in so a normal visit is unchanged, and the bar
                      states exactly what each action will do. */}
                  {/* Desktop keeps "Select cards" on the page; the phone
                      opens selection from Deck tools. */}
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
                      Cards
                      <span className="font-normal tabular-nums text-muted-foreground">
                        {cardSearch.trim()
                          ? `${filteredCards.length} of ${data.cards.length}`
                          : data.cards.length}
                      </span>
                    </h2>
                      {canEdit && !selecting && (
                        <Button
                          icon={<MousePointerClick />}
                          variant="quiet"
                          className="-ml-1 shrink-0"
                          onClick={() => {
                            changeView("overview");
                            setSelecting(true);
                          }}
                        >
                          Select
                        </Button>
                      )}
                    <div className="ml-auto flex items-center gap-2 sm:order-last sm:ml-0">
                      <DeckViewToggle view={view} onChange={changeView} />
                    </div>
                    <EducationCollectionSearch
                      value={cardSearch}
                      onValueChange={setCardSearch}
                      label="cards in this deck"
                      className="order-last basis-full sm:order-none sm:ml-auto sm:basis-auto"
                    />
                  </div>
                  {canEdit && selecting && (
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
                      {selecting ? (
                        <>
                          <span className="text-xs text-muted-foreground">
                            {selectedIds.size === 0
                              ? "Pick cards to enrich or merge"
                              : `${selectedIds.size} selected`}
                          </span>
                          <Button
                            icon={<Lightbulb />}
                            variant="primary"
                            onClick={() => void runBulkEnrich()}
                            disabled={
                              selectedIds.size === 0 ||
                              enrichGuard.isChecking ||
                              bulkRun.phase === "running"
                            }
                            title="Add explanations, examples and memory tricks to just these cards — a card you pick is enriched even if it already has layers"
                          >
                            Enrich selected ({selectedIds.size})
                          </Button>
                          <Button
                            icon={<Merge />}
                            variant="outline"
                            onClick={() => setMergeOpen(true)}
                            disabled={!canMergeSelection}
                            title={
                              canMergeSelection
                                ? undefined
                                : "Pick two or more basic or cloze cards — other kinds can't be merged"
                            }
                          >
                            Merge{" "}
                            {selectedIds.size >= 2 ? selectedIds.size : ""}
                          </Button>
                          <Button
                            variant="quiet"
                            onClick={() => {
                              setSelecting(false);
                              setSelectedIds(new Set());
                            }}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          icon={<MousePointerClick />}
                          variant="outline"
                          onClick={() => setSelecting(true)}
                          disabled={data.cards.length === 0}
                        >
                          Select cards
                        </Button>
                      )}
                    </div>
                  )}
                  {deckPlain ? (
                    <PlainTextView text={serializeDeck(data.set, data.cards).markdown} />
                  ) : filteredCards.length === 0 ? (
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
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                  <DrawerDescription>
                    Pick the practice style for this session.
                  </DrawerDescription>
                </DrawerHeader>
                <div className="grid gap-2 overflow-y-auto px-4 pb-safe">
                  {STUDY_MODES.map((mode) => (
                    <Tile
                      key={mode.key}
                      variant="quiet"
                      icon={<mode.icon />}
                      title={mode.label}
                      line={mode.description}
                      onClick={() => navigate(mode.key, mode.href(setId))}
                    />
                  ))}
                </div>
              </DrawerContent>
            </Drawer>

            {/* Deck tools: the PHONE's home for every secondary deck action
                (only the phone row opens it; desktop shows them on the page).
                Dialog becomes a bottom sheet on a phone by itself. */}
            <Dialog open={deckToolsOpen} onOpenChange={setDeckToolsOpen}>
              <DialogContent className="matrx-touch-targets flex max-h-[85dvh] flex-col sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Deck tools</DialogTitle>
                </DialogHeader>
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pb-safe">
                  <section className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Manage
                    </h2>
                    <div className="grid grid-cols-2 gap-2">
                      {canEdit && (
                        <Button
                          icon={<Pencil />}
                          variant="outline"
                          className="justify-start md:hidden"
                          onClick={() =>
                            navigate("edit", `${EDU_BASE}/${setId}/edit`)
                          }
                        > Edit
                        </Button>
                      )}
                      <Button
                        icon={<TrendingUp />}
                        variant="outline"
                        className="justify-start"
                        onClick={() =>
                          navigate("sessions", `${EDU_BASE}/${setId}/sessions`)
                        }
                      > Progress
                      </Button>
                      {canEdit && (
                        <Button
                          icon={<Settings2 />}
                          variant="outline"
                          className="justify-start"
                          onClick={() => {
                            setDeckToolsOpen(false);
                            setSettingsOpen(true);
                          }}
                        > Deck settings
                        </Button>
                      )}
                      {(access.isOwner || access.level === "admin") && (
                        <ShareButton
                          resourceType="fc_set"
                          resourceId={setId}
                          resourceName={data.set.name}
                          organizationId={data.set.organization_id}
                          showStatus={false}
                          className="h-11 justify-start"
                        />
                      )}
                      {access.isOwner && (
                        <Button
                          icon={<Archive />}
                          variant="outline"
                          className="justify-start"
                          onClick={() => {
                            setDeckToolsOpen(false);
                            void archiveDeck();
                          }}
                        > Archive
                        </Button>
                      )}
                      {chatHref && (
                        <Button
                          asChild
                          variant="outline"
                          className="justify-start"
                        >
                          <Link href={chatHref}>
                            <MessagesSquare className="mr-2 h-4 w-4" /> See chat
                          </Link>
                        </Button>
                      )}
                      {/* An empty deck has nothing to keep offline or
                          print: those appear with its first card. */}
                      {!deckEmpty && (
                        <OfflineDeckButton
                          setId={setId}
                          className="h-11 justify-start"
                        />
                      )}
                      {!deckEmpty && (
                        <Button
                          icon={<Printer />}
                          variant="outline"
                          className="justify-start"
                          onClick={() => {
                            setDeckToolsOpen(false);
                            handlePrint();
                          }}
                        > Print
                        </Button>
                      )}
                      {/* This deck is one printable; the hub is the index of
                          the rest (cheat sheets, practice tests, certificates,
                          labels, codes, booklets, printed copies). */}
                      <Button
                        asChild
                        variant="quiet"
                        className="justify-start"
                        onClick={() => setDeckToolsOpen(false)}
                      >
                        <Link href="/print">
                          <Printer className="mr-2 h-4 w-4" /> More printing
                        </Link>
                      </Button>
                    </div>
                  </section>

                  {!deckEmpty && (
                  <section className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Export
                    </h2>
                    <div className="grid grid-cols-2 gap-2">
                      {(["csv", "anki", "md", "json"] as const).map(
                        (format) => (
                          <Button
                            icon={<Download />}
                            key={format}
                            variant="outline"
                            className="justify-start"
                            onClick={() => exportDeck(format)}
                          >
                            {DECK_EXPORT_FILE[format].label}
                          </Button>
                        ),
                      )}
                    </div>
                  </section>
                  )}

                  {data.cards.length > 0 && (
                    <section className="space-y-2">
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Audio
                      </h2>
                      <div className="grid gap-2">
                        <Button
                          icon={<Volume2 />}
                          variant="outline"
                          className="justify-start"
                          onClick={() => startAudioJob("generate")}
                        >
                          {data.set.audio_overview_file_id
                            ? "Regenerate audio overview"
                            : "Generate audio overview"}
                        </Button>
                        {(
                          [
                            ["spoken_front", "card audio", Mic],
                            ["helper", "instant help", HelpCircle],
                          ] as const
                        ).map(([lane, noun, Icon]) => {
                          const { ready, total } = deckAudioCoverage(data.cards, lane);
                          const done = ready >= total;
                          return (
                            <Button
                              icon={<Icon />}
                              key={lane}
                              variant="outline"
                              className="justify-start"
                              disabled={done}
                              onClick={() => startAudioJob(lane)}
                            >
                              {done
                                ? `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ready`
                                : ready > 0
                                  ? `Prepare ${noun} (${ready}/${total} done)`
                                  : `Prepare ${noun}`}
                            </Button>
                          );
                        })}
                      </div>
                    </section>
                  )}
                  {canEdit && data.cards.length > 0 && (
                    <section className="space-y-2">
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Cards
                      </h2>
                      <Button
                        icon={<MousePointerClick />}
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          setDeckToolsOpen(false);
                          setSelecting(true);
                        }}
                      >
                        Select cards to enrich or merge
                      </Button>
                    </section>
                  )}

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
                onChanged={() => reload()}
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
                reload();
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
                  reload();
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
