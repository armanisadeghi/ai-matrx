// features/flashcards/components/set-detail/SetDetailView.tsx
//
// The detail view for a single flashcard set: header (name, topic, card count)
// + a grid of cards (front/back peek + detail-presence badges) + a "Study"
// affordance into the focused study surface. Loads via fcService.getSetWithCards
// (ordered cards + their fc_detail rows). Graceful loading / empty / not-found.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  Layers,
  AlertCircle,
  BookOpen,
  Lightbulb,
  Quote,
  Volume2,
  Image as ImageIcon,
  Zap,
  Pencil,
  Expand,
  History,
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
  Printer,
  Images,
  Loader2,
  Ellipsis,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { MergeCardsDialog } from "./MergeCardsDialog";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAccess } from "@/utils/permissions/access";
import { canEditAccess } from "@/utils/permissions/access-core";
import { DuplicateToEditButton } from "@/features/sharing/components/DuplicateToEditButton";
import { fcService } from "../../data/fcService";
import { getCardImages } from "../study/cardImages";
import { buildDeckPrintData } from "../../utils/deckPrintData";
import { flashcardsPrinter } from "@/components/mardown-display/blocks/flashcards/flashcards-printer";
import {
  PrintOptionsDialog,
  usePrintOptions,
} from "@/lib/block-print/PrintOptionsDialog";
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
import { SetVisibilityControl } from "../sharing/SetVisibilityControl";
import { AudioOverviewSection } from "./AudioOverviewSection";
import { EnhanceSetDialog } from "./EnhanceSetDialog";
import { IllustrateSetWindow } from "./IllustrateSetWindow";
import {
  useIllustrateSetRun,
  type IllustrateCardState,
} from "./illustrateSetRun";
import { EntitlementMeter } from "@/features/entitlements/components/EntitlementMeter";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { useOpenFlashcardItemWindow } from "@/features/overlays/openers/flashcardItemWindow";
import { serializeDeck } from "@/features/education/media/audio/audioBrief";
import { ConvertContentDialog } from "@/features/education/convert/ConvertContentDialog";
import { GeneratedFromChips } from "@/features/education/convert/GeneratedFromChips";
import { MadeFromSource } from "@/features/education/convert/MadeFromSource";
import { AddMoreCardsButton } from "./AddMoreCardsButton";
import { ClassPicker } from "@/features/education/classes/components/ClassPicker";
import { OfflineDeckButton } from "./OfflineDeckButton";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

/** Phase 1B — the extra study modes on the spine, alongside classic Study. */
const OTHER_STUDY_MODES = [
  {
    key: "learn",
    label: "Learn",
    description: "Adaptive reshuffle toward weak cards",
    icon: GraduationCap,
    path: "learn",
  },
  {
    key: "test",
    label: "Test",
    description: "Multiple-choice quiz",
    icon: ListChecks,
    path: "test",
  },
  {
    key: "match",
    label: "Match",
    description: "Timed pairing game",
    icon: Grid3x3,
    path: "match",
  },
  {
    key: "write",
    label: "Write",
    description: "Type the answer from memory",
    icon: PenLine,
    path: "write",
  },
] as const;

/** Voice/audio study modes that live on their own education routes (built
 *  surfaces that were previously unreachable from a deck — THE DOOR LAW). */
const VOICE_STUDY_MODES = [
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

const EDU_BASE = "/education/flashcards";

/** A compact, non-flipping front/back peek for one card with detail badges. */
function CardPeek({
  card,
  index,
  mastery,
  selectable = false,
  selected = false,
  onToggleSelected,
  onOpen,
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
}) {
  const hasHelper = card.details.some((d) => d.kind === "helper");
  const hasExample = card.details.some((d) => d.kind === "example");
  const hasAudio = card.details.some((d) => !!d.audio_file_id);
  const images = getCardImages(card);
  const kind = asCardKind(card.card_kind);
  const pairs = kind === CARD_KIND.matching ? matchingPairs(card) : [];
  // One faces bridge for every flip kind (basic/cloze/formula) — the peek shows
  // exactly what study will show.
  const faces = kind === CARD_KIND.matching ? null : studyFaces(card);
  const interactive = selectable || !!onOpen;
  const activate = () => {
    if (selectable) onToggleSelected?.();
    else onOpen?.();
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border bg-card p-3",
        interactive &&
          "cursor-pointer transition-colors hover:border-primary/50",
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
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          {selectable && (
            <Checkbox
              checked={selected}
              aria-label={`Select card ${index + 1} to merge`}
              className="h-3.5 w-3.5"
            />
          )}
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Card {index + 1}
          </span>
          <MasteryTierPill mastery={mastery} />
        </span>
        <div className="flex items-center gap-1">
          {kind === CARD_KIND.cloze && (
            <span className="inline-flex items-center gap-0.5 rounded border border-primary/40 bg-primary/10 px-1 py-0 text-[10px] font-medium text-primary">
              <Scissors className="h-2.5 w-2.5" />
              Cloze
            </span>
          )}
          {kind === CARD_KIND.matching && (
            <span className="inline-flex items-center gap-0.5 rounded border border-primary/40 bg-primary/10 px-1 py-0 text-[10px] font-medium text-primary">
              <Grid3x3 className="h-2.5 w-2.5" />
              Match · {pairs.length}
            </span>
          )}
          {hasHelper && (
            <span
              title="Has helper detail"
              className="inline-flex items-center gap-0.5 rounded border border-border px-1 py-0 text-[10px] text-muted-foreground"
            >
              <Lightbulb className="h-2.5 w-2.5" />
              Helper
            </span>
          )}
          {hasExample && (
            <span
              title="Has example detail"
              className="inline-flex items-center gap-0.5 rounded border border-border px-1 py-0 text-[10px] text-muted-foreground"
            >
              <Quote className="h-2.5 w-2.5" />
              Example
            </span>
          )}
          {hasAudio && (
            <span
              title="Has audio detail"
              className="inline-flex items-center rounded border border-border px-1 py-0 text-[10px] text-muted-foreground"
            >
              <Volume2 className="h-2.5 w-2.5" />
            </span>
          )}
          {(images.front || images.back) && (
            <span
              title="Has image"
              className="inline-flex items-center rounded border border-border px-1 py-0 text-[10px] text-muted-foreground"
            >
              <ImageIcon className="h-2.5 w-2.5" />
            </span>
          )}
        </div>
      </div>
      {kind === CARD_KIND.matching ? (
        <div className="mt-1.5 space-y-0.5">
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
            <p className="text-[10px] text-muted-foreground/70">
              +{pairs.length - 3} more
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="mt-1.5 flex items-start gap-2 text-sm font-medium text-foreground">
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

export function SetDetailView({ setId }: { setId: string }) {
  const router = useRouter();
  const [data, setData] = useState<SetWithCards | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [studyModesOpen, setStudyModesOpen] = useState(false);
  const [deckToolsOpen, setDeckToolsOpen] = useState(false);
  // WP3 gap 5 — card merge selection.
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [lineageKey, setLineageKey] = useState(0);
  const [masteryByCard, setMasteryByCard] = useState<
    Record<string, ItemMasteryRow | undefined>
  >({});
  // Bump to refetch (after enrich/deepen adds details/sub-cards). The fetch
  // lives in the effect so no setState fires synchronously in the effect body.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await fcService.getSetWithCards(setId);
      if (cancelled) return;
      if (!res.data) {
        setError(res.error ?? "Flashcard set not found");
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
          if (!cancelled) {
            const seed: Record<string, ItemMasteryRow | undefined> = {};
            for (const m of mRes.data ?? []) seed[m.item_id] = m;
            setMasteryByCard(seed);
          }
        } else {
          setMasteryByCard({});
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
    | null
  >(null);

  // View-vs-edit gate (P7). Owner/editor get the full authoring surface; a
  // view-only sharee (shared read-only, or a public deck they don't own) gets a
  // "Make a copy" offer instead of Edit / visibility controls that would fail.
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
    setReview,
    reset: resetIllustrate,
  } = useIllustrateSetRun();
  const [illustrateOpen, setIllustrateOpen] = useState(false);
  const openCardWindow = useOpenFlashcardItemWindow();

  const runIllustrate = async () => {
    setIllustrateOpen(true);
    const outcome = await startIllustrate(setId, "front");
    // Whatever landed is already in the DB — refetch so badges and thumbnails
    // on the deck below match what the review pass is showing.
    setReloadKey((k) => k + 1);
    void illustrate.refresh();
    if (outcome.failed) return;
    if (outcome.refused) {
      toast.info("Your plan's image limit was reached for now.");
      return;
    }
    toast.success(
      outcome.attached === 0
        ? "No image cleared the bar on this run — see why, card by card."
        : `${outcome.attached} card${outcome.attached === 1 ? "" : "s"} illustrated — review them.`,
    );
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

  return (
    <div className="h-full w-full overflow-y-auto bg-textured">
      <EducationToolHeader title={data?.set.name ?? "Flashcard set"} />
      <div className="mx-auto max-w-6xl px-3 pb-safe pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-6 sm:pb-8 sm:pt-[calc(var(--shell-header-h)+1.5rem)]">
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
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-16 text-center">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Couldn&apos;t load this set
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              {error ?? "This flashcard set could not be found."}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => router.push(EDU_BASE)}
            >
              All flashcards
            </Button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-start md:justify-between md:gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Layers className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-[clamp(1.25rem,5.5vw,1.75rem)] font-semibold leading-tight tracking-tight text-foreground">
                    {data.set.name}
                  </h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5" />
                      {data.cards.length}{" "}
                      {data.cards.length === 1 ? "card" : "cards"}
                    </span>
                    {data.set.topic ? (
                      <>
                        <span className="text-border">|</span>
                        <span>{data.set.topic}</span>
                      </>
                    ) : null}
                    {data.set.difficulty ? (
                      <>
                        <span className="text-border">|</span>
                        <span className="capitalize">
                          {data.set.difficulty}
                        </span>
                      </>
                    ) : null}
                  </div>
                  {data.set.description ? (
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                      {data.set.description}
                    </p>
                  ) : null}
                  {canEdit && (
                    <div className="mt-2">
                      <SetVisibilityControl
                        setId={setId}
                        visibility={data.set.visibility}
                        onChange={(v) =>
                          setData((prev) =>
                            prev
                              ? { ...prev, set: { ...prev.set, visibility: v } }
                              : prev,
                          )
                        }
                      />
                    </div>
                  )}
                  {canEdit && (
                    <div className="mt-2">
                      <ClassPicker entityType="fc_set" entityId={setId} />
                    </div>
                  )}
                  {viewOnly && (
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
                      <BookOpen className="h-3.5 w-3.5" />
                      Shared with you — view only. Make a copy to edit or track
                      your own progress.
                    </div>
                  )}
                  {data.set.visibility === "public" && (
                    <div className="mt-2">
                      <a
                        href={`/p/e/fc_set/${setId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                      >
                        <Expand className="h-3.5 w-3.5" />
                        View public page
                      </a>
                    </div>
                  )}
                </div>
              </div>
              {/* Action row — the hub: every path you can take with this set.
                  Study / Fast Fire are live; Edit graduates the view→edit split
                  (ROUTING.md); Enhance is the agentic-expansion placeholder. */}
              <div className="hidden flex-wrap items-center gap-2 md:flex">
                <Button
                  onClick={() =>
                    navigate("study", `${EDU_BASE}/${setId}/study`)
                  }
                  disabled={isPending || data.cards.length === 0}
                  className={cn(
                    "rounded-r-none",
                    pendingAction === "study" && "opacity-70",
                  )}
                >
                  <Play className="mr-1.5 h-4 w-4" />
                  Study
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      disabled={isPending || data.cards.length === 0}
                      className="-ml-2 rounded-l-none px-2"
                      aria-label="Other study modes"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {OTHER_STUDY_MODES.map((m) => (
                      <DropdownMenuItem
                        key={m.key}
                        onClick={() =>
                          navigate(m.key, `${EDU_BASE}/${setId}/${m.path}`)
                        }
                      >
                        <m.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                        <div className="flex flex-col">
                          <span>{m.label}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {m.description}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                    {VOICE_STUDY_MODES.map((m) => (
                      <DropdownMenuItem
                        key={m.key}
                        onClick={() => navigate(m.key, m.href(setId))}
                      >
                        <m.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                        <div className="flex flex-col">
                          <span>{m.label}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {m.description}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <FlashcardStudyWindowDevTrigger
                  setId={setId}
                  title={data.set.name}
                  disabled={data.cards.length === 0}
                />
                <Button
                  variant="secondary"
                  onClick={() =>
                    navigate("fastfire", `/education/fastfire?set=${setId}`)
                  }
                  disabled={isPending || data.cards.length === 0}
                  className={cn(pendingAction === "fastfire" && "opacity-70")}
                >
                  <Zap className="mr-1.5 h-4 w-4" />
                  Fast Fire
                </Button>
                {canEdit && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      navigate("edit", `${EDU_BASE}/${setId}/edit`)
                    }
                    disabled={isPending}
                    className={cn(pendingAction === "edit" && "opacity-70")}
                  >
                    <Pencil className="mr-1.5 h-4 w-4" />
                    Edit
                  </Button>
                )}
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
                <Button
                  variant="outline"
                  onClick={() =>
                    navigate("sessions", `${EDU_BASE}/${setId}/sessions`)
                  }
                  disabled={isPending}
                  className={cn(pendingAction === "sessions" && "opacity-70")}
                >
                  <History className="mr-1.5 h-4 w-4" />
                  History
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={data.cards.length === 0}
                    >
                      <Download className="mr-1.5 h-4 w-4" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => exportDeck("csv")}>
                      CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportDeck("anki")}>
                      Anki (text import)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportDeck("md")}>
                      Markdown
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportDeck("json")}>
                      JSON
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  onClick={handlePrint}
                  disabled={data.cards.length === 0}
                >
                  <Printer className="mr-1.5 h-4 w-4" />
                  Print
                </Button>
                {/* Download for offline — the control `OfflineStudyPanel`
                    names in its copy. Distinct from Export beside it: Export
                    hands you a FILE for another app, Download keeps THIS deck
                    studiable in THIS app with no connection. */}
                <OfflineDeckButton
                  setId={setId}
                  disabled={data.cards.length === 0}
                />
                {canEdit && (
                  <Button
                    variant="outline"
                    onClick={() => setEnhanceOpen(true)}
                    disabled={data.cards.length === 0}
                  >
                    <Expand className="mr-1.5 h-4 w-4" />
                    Enhance
                  </Button>
                )}
                {canEdit && (
                  <div className="flex flex-col items-start gap-0.5">
                    <Button
                      variant="outline"
                      disabled={
                        data.cards.length === 0 ||
                        illustrate.isChecking ||
                        illustrateRun.phase === "starting" ||
                        illustrateRun.phase === "running"
                      }
                      onClick={() => void illustrate.guard(runIllustrate)}
                      title="An agent finds an expert image on the open web for each card's front, judges the source, and attaches only what clears the bar"
                    >
                      {illustrateRun.phase === "starting" ||
                      illustrateRun.phase === "running" ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Images className="mr-1.5 h-4 w-4" />
                      )}
                      Illustrate this set
                    </Button>
                    {/* Limits BEFORE the cap — never ambush a batch mid-run. */}
                    <EntitlementMeter capability="education.card_image_source" />
                  </div>
                )}
                <Button
                  variant="outline"
                  onClick={() => setConvertOpen(true)}
                  disabled={data.cards.length === 0}
                >
                  <Boxes className="mr-1.5 h-4 w-4" />
                  Convert
                </Button>
              </div>
            </div>

            {/* Mobile is a study launchpad, not a desktop action matrix squeezed
                into one column. The two fastest paths stay visible; every
                secondary capability remains reachable in a stable bottom sheet. */}
            <div className="mt-4 space-y-2 md:hidden">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="lg"
                  className="h-12"
                  onClick={() =>
                    navigate("study", `${EDU_BASE}/${setId}/study`)
                  }
                  disabled={isPending || data.cards.length === 0}
                >
                  <Play className="mr-2 h-5 w-5" />
                  Study
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-12"
                  onClick={() =>
                    navigate("fastfire", `/education/fastfire?set=${setId}`)
                  }
                  disabled={isPending || data.cards.length === 0}
                >
                  <Zap className="mr-2 h-5 w-5" />
                  Fast Fire
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={() => setStudyModesOpen(true)}
                  disabled={data.cards.length === 0}
                >
                  <GraduationCap className="mr-2 h-4 w-4" />
                  Study modes
                </Button>
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={() => setDeckToolsOpen(true)}
                >
                  <Ellipsis className="mr-2 h-4 w-4" />
                  Deck tools
                </Button>
              </div>
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

            {/* Forward lineage — the material this deck was made from, and the
                rest of the kit that came out of the same upload. Beside it, the
                way to get MORE out of that same material: a generated deck used
                to be a dead end at whatever size the generator chose. */}
            <div className="mt-3 space-y-2">
              <MadeFromSource entityType="fc_set" entityId={setId} />
              <AddMoreCardsButton
                setId={setId}
                existingFronts={data.cards.map((c) => c.front)}
                onAdded={() => {
                  setReloadKey((k) => k + 1);
                  setLineageKey((k) => k + 1);
                }}
              />
            </div>

            {/* Reverse lineage — study artifacts made from this deck. */}
            <div className="mt-3">
              <GeneratedFromChips
                entityType="fc_set"
                entityId={setId}
                refreshKey={lineageKey}
              />
            </div>

            {/* Deck mastery — Brainscape's retention hook: where you stand
                across the whole deck, in the shared mastery vocabulary. */}
            {data.cards.length > 0 && (
              <div className="mt-4 rounded-xl border border-border bg-card p-3 sm:p-4">
                <DeckMasteryBar
                  masteries={data.cards.map((c) => masteryByCard[c.id])}
                />
              </div>
            )}

            {/* Audio overview (Phase 7 — podcast-from-deck) */}
            <div className="mt-4">
              <AudioOverviewSection
                setId={setId}
                set={data.set}
                cards={data.cards}
                onCardsChanged={() => setReloadKey((k) => k + 1)}
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
                    This set has no cards yet
                  </p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    Generate cards for this set in chat to start studying.
                  </p>
                </div>
              ) : (
                <>
                  {/* WP3 gap 5 — merge near-duplicate cards (Arman asked for
                      it by name). Selection is opt-in so a normal visit is
                      unchanged; the bar states exactly what will happen. */}
                  {canEdit && (
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      {selecting ? (
                        <>
                          <span className="text-xs text-muted-foreground">
                            {selectedIds.size === 0
                              ? "Pick the cards to merge"
                              : `${selectedIds.size} selected`}
                          </span>
                          <Button
                            size="sm"
                            onClick={() => setMergeOpen(true)}
                            disabled={selectedIds.size < 2}
                          >
                            <Merge className="mr-1.5 h-3.5 w-3.5" />
                            Merge{" "}
                            {selectedIds.size >= 2 ? selectedIds.size : ""}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
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
                          size="sm"
                          variant="outline"
                          onClick={() => setSelecting(true)}
                          disabled={data.cards.length < 2}
                        >
                          <Merge className="mr-1.5 h-3.5 w-3.5" />
                          Merge cards
                        </Button>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {data.cards.map((card, i) => (
                      <CardPeek
                        key={card.id}
                        card={card}
                        index={i}
                        mastery={masteryByCard[card.id]}
                        // F3 — only TEXT-mergeable kinds: a matching/formula
                        // card's structure lives in dynamic_content, which a
                        // front/back merge would silently destroy.
                        selectable={
                          selecting &&
                          (asCardKind(card.card_kind) === CARD_KIND.basic ||
                            asCardKind(card.card_kind) === CARD_KIND.cloze)
                        }
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
                      />
                    ))}
                  </div>
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
                  setIllustrateOpen(false);
                  resetIllustrate();
                }}
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

            <Drawer open={studyModesOpen} onOpenChange={setStudyModesOpen}>
              <DrawerContent className="max-h-[85dvh]">
                <DrawerHeader>
                  <DrawerTitle>Choose how to study</DrawerTitle>
                  <DrawerDescription>
                    Pick the practice style that fits this session.
                  </DrawerDescription>
                </DrawerHeader>
                <div className="grid gap-2 overflow-y-auto px-4 pb-safe">
                  {OTHER_STUDY_MODES.map((mode) => (
                    <Button
                      key={mode.key}
                      variant="ghost"
                      className="h-auto min-h-14 justify-start px-3 py-2 text-left"
                      onClick={() =>
                        navigate(mode.key, `${EDU_BASE}/${setId}/${mode.path}`)
                      }
                    >
                      <mode.icon className="mr-3 h-5 w-5 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block font-medium">{mode.label}</span>
                        <span className="block whitespace-normal text-xs font-normal text-muted-foreground">
                          {mode.description}
                        </span>
                      </span>
                    </Button>
                  ))}
                  {VOICE_STUDY_MODES.map((mode) => (
                    <Button
                      key={mode.key}
                      variant="ghost"
                      className="h-auto min-h-14 justify-start px-3 py-2 text-left"
                      onClick={() => navigate(mode.key, mode.href(setId))}
                    >
                      <mode.icon className="mr-3 h-5 w-5 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block font-medium">{mode.label}</span>
                        <span className="block whitespace-normal text-xs font-normal text-muted-foreground">
                          {mode.description}
                        </span>
                      </span>
                    </Button>
                  ))}
                </div>
              </DrawerContent>
            </Drawer>

            <Drawer open={deckToolsOpen} onOpenChange={setDeckToolsOpen}>
              <DrawerContent className="h-[92dvh]">
                <DrawerHeader>
                  <DrawerTitle>Deck tools</DrawerTitle>
                  <DrawerDescription>
                    Organize, improve, save, and share this deck.
                  </DrawerDescription>
                </DrawerHeader>
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-safe">
                  <section className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Manage
                    </h2>
                    <div className="grid grid-cols-2 gap-2">
                      {canEdit && (
                        <Button
                          variant="outline"
                          className="h-11 justify-start"
                          onClick={() =>
                            navigate("edit", `${EDU_BASE}/${setId}/edit`)
                          }
                        >
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        className="h-11 justify-start"
                        onClick={() =>
                          navigate("sessions", `${EDU_BASE}/${setId}/sessions`)
                        }
                      >
                        <History className="mr-2 h-4 w-4" /> History
                      </Button>
                      <OfflineDeckButton
                        setId={setId}
                        disabled={data.cards.length === 0}
                        className="h-11 justify-start"
                      />
                      <Button
                        variant="outline"
                        className="h-11 justify-start"
                        onClick={() => {
                          setDeckToolsOpen(false);
                          handlePrint();
                        }}
                        disabled={data.cards.length === 0}
                      >
                        <Printer className="mr-2 h-4 w-4" /> Print
                      </Button>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Export
                    </h2>
                    <div className="grid grid-cols-2 gap-2">
                      {(["csv", "anki", "md", "json"] as const).map(
                        (format) => (
                          <Button
                            key={format}
                            variant="outline"
                            className="h-11 justify-start"
                            onClick={() => exportDeck(format)}
                            disabled={data.cards.length === 0}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            {DECK_EXPORT_FILE[format].label}
                          </Button>
                        ),
                      )}
                    </div>
                  </section>

                  <section className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Improve and reuse
                    </h2>
                    <div className="grid gap-2">
                      {canEdit && (
                        <Button
                          variant="outline"
                          className="h-11 justify-start"
                          onClick={() => {
                            setDeckToolsOpen(false);
                            setEnhanceOpen(true);
                          }}
                          disabled={data.cards.length === 0}
                        >
                          <Expand className="mr-2 h-4 w-4" /> Enhance cards
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          variant="outline"
                          className="h-11 justify-start"
                          disabled={
                            data.cards.length === 0 ||
                            illustrate.isChecking ||
                            illustrateRun.phase === "starting" ||
                            illustrateRun.phase === "running"
                          }
                          onClick={() => {
                            setDeckToolsOpen(false);
                            void illustrate.guard(runIllustrate);
                          }}
                        >
                          <Images className="mr-2 h-4 w-4" /> Illustrate this
                          set
                        </Button>
                      )}
                      {canEdit && (
                        <EntitlementMeter capability="education.card_image_source" />
                      )}
                      <Button
                        variant="outline"
                        className="h-11 justify-start"
                        onClick={() => {
                          setDeckToolsOpen(false);
                          setConvertOpen(true);
                        }}
                        disabled={data.cards.length === 0}
                      >
                        <Boxes className="mr-2 h-4 w-4" /> Convert to another
                        study aid
                      </Button>
                    </div>
                  </section>
                </div>
              </DrawerContent>
            </Drawer>

            <EnhanceSetDialog
              open={enhanceOpen}
              onOpenChange={setEnhanceOpen}
              setId={setId}
              cards={data.cards}
              onChanged={() => setReloadKey((k) => k + 1)}
            />

            {/* Canonical block printer — same dialog, variants, and settings
                as the markdown-block flashcards lane. */}
            <PrintOptionsDialog
              printer={flashcardsPrinter}
              data={printData}
              open={printOpen}
              onOpenChange={setPrintOpen}
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
