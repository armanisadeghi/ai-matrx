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
  ArrowLeft,
  Play,
  Layers,
  AlertCircle,
  BookOpen,
  Lightbulb,
  Quote,
  Volume2,
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
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAccess, canEditAccess } from "@/utils/permissions";
import { DuplicateToEditButton } from "@/features/sharing/components/DuplicateToEditButton";
import { fcService } from "../../data/fcService";
import type { SetWithCards, CardWithDetails } from "../../data/types";
import { FlashcardStudyWindowDevTrigger } from "../study/FlashcardStudyWindowDevTrigger";
import { downloadSetCsv } from "../../utils/importExportCsv";
import { SetVisibilityControl } from "../sharing/SetVisibilityControl";
import { AudioOverviewSection } from "./AudioOverviewSection";

/** Phase 1B — the extra study modes on the spine, alongside classic Study. */
const OTHER_STUDY_MODES = [
  { key: "learn", label: "Learn", description: "Adaptive reshuffle toward weak cards", icon: GraduationCap, path: "learn" },
  { key: "test", label: "Test", description: "Multiple-choice quiz", icon: ListChecks, path: "test" },
  { key: "match", label: "Match", description: "Timed pairing game", icon: Grid3x3, path: "match" },
  { key: "write", label: "Write", description: "Type the answer from memory", icon: PenLine, path: "write" },
] as const;

const EDU_BASE = "/education/flashcards";

/** A compact, non-flipping front/back peek for one card with detail badges. */
function CardPeek({ card, index }: { card: CardWithDetails; index: number }) {
  const hasHelper = card.details.some((d) => d.kind === "helper");
  const hasExample = card.details.some((d) => d.kind === "example");
  const hasAudio = card.details.some((d) => !!d.audio_file_id);

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Card {index + 1}
        </span>
        <div className="flex items-center gap-1">
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
        </div>
      </div>
      <p className="mt-1.5 line-clamp-3 text-sm font-medium text-foreground">
        {card.front}
      </p>
      <div className="mt-2 border-t border-border pt-2">
        <p className="line-clamp-3 text-xs text-muted-foreground">
          {card.back}
        </p>
      </div>
    </div>
  );
}

export function SetDetailView({ setId }: { setId: string }) {
  const router = useRouter();
  const [data, setData] = useState<SetWithCards | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await fcService.getSetWithCards(setId);
      if (cancelled) return;
      if (!res.data) {
        setError(res.error ?? "Flashcard set not found");
        setData(null);
      } else {
        setData(res.data);
        setError(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [setId]);

  const [pendingAction, setPendingAction] = useState<
    "study" | "learn" | "test" | "match" | "write" | "fastfire" | "edit" | "sessions" | null
  >(null);

  // View-vs-edit gate (P7). Owner/editor get the full authoring surface; a
  // view-only sharee (shared read-only, or a public deck they don't own) gets a
  // "Make a copy" offer instead of Edit / visibility controls that would fail.
  const access = useAccess("fc_set", setId);
  const canEdit = access.isOwner || canEditAccess(access.level);
  const viewOnly = !access.loading && !canEdit;

  const exportCsv = () => {
    if (!data) return;
    downloadSetCsv(data.set, data.cards);
    toast.success("Exported set as CSV");
  };

  // Single navigation helper: marks which action is in flight (so only that
  // button shows the busy state) and routes via a transition. Guards against
  // duplicate clicks while a transition is pending. (UI standards.)
  const navigate = (
    action: "study" | "learn" | "test" | "match" | "write" | "fastfire" | "edit" | "sessions",
    path: string,
  ) => {
    if (isPending) return;
    setPendingAction(action);
    startTransition(() => {
      router.push(path);
    });
  };

  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
        {/* Back */}
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 h-8 px-2 text-xs text-muted-foreground"
          onClick={() => router.back()}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>

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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Layers className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold tracking-tight text-foreground">
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
                    <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
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
                  {viewOnly && (
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
                      <BookOpen className="h-3.5 w-3.5" />
                      Shared with you — view only. Make a copy to edit or track your own progress.
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
              <div className="flex flex-wrap items-center gap-2">
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
                    onClick={() => navigate("edit", `${EDU_BASE}/${setId}/edit`)}
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
                <Button
                  variant="outline"
                  onClick={exportCsv}
                  disabled={data.cards.length === 0}
                >
                  <Download className="mr-1.5 h-4 w-4" />
                  Export
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    toast.info("Enhance & expand", {
                      description:
                        "Agentic card enrichment and sub-card expansion are coming soon.",
                    })
                  }
                >
                  <Expand className="mr-1.5 h-4 w-4" />
                  Enhance
                </Button>
              </div>
            </div>

            {/* Audio overview (Phase 7 — podcast-from-deck) */}
            <div className="mt-4">
              <AudioOverviewSection
                setId={setId}
                set={data.set}
                cards={data.cards}
                onFileIdChange={(fileId) =>
                  setData((prev) =>
                    prev
                      ? { ...prev, set: { ...prev.set, audio_overview_file_id: fileId } }
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
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.cards.map((card, i) => (
                    <CardPeek key={card.id} card={card} index={i} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
