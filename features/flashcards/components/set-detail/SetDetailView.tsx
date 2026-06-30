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
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fcService } from "../../data/fcService";
import type { SetWithCards, CardWithDetails } from "../../data/types";

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
        <p className="line-clamp-3 text-xs text-muted-foreground">{card.back}</p>
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
    "study" | "fastfire" | "edit" | "sessions" | null
  >(null);

  // Single navigation helper: marks which action is in flight (so only that
  // button shows the busy state) and routes via a transition. Guards against
  // duplicate clicks while a transition is pending. (UI standards.)
  const navigate = (
    action: "study" | "fastfire" | "edit" | "sessions",
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
                      {data.cards.length} {data.cards.length === 1 ? "card" : "cards"}
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
                        <span className="capitalize">{data.set.difficulty}</span>
                      </>
                    ) : null}
                  </div>
                  {data.set.description ? (
                    <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
                      {data.set.description}
                    </p>
                  ) : null}
                </div>
              </div>
              {/* Action row — the hub: every path you can take with this set.
                  Study / Fast Fire are live; Edit graduates the view→edit split
                  (ROUTING.md); Enhance is the agentic-expansion placeholder. */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => navigate("study", `${EDU_BASE}/${setId}/study`)}
                  disabled={isPending || data.cards.length === 0}
                  className={cn(pendingAction === "study" && "opacity-70")}
                >
                  <Play className="mr-1.5 h-4 w-4" />
                  Study
                </Button>
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
                <Button
                  variant="outline"
                  onClick={() => navigate("edit", `${EDU_BASE}/${setId}/edit`)}
                  disabled={isPending}
                  className={cn(pendingAction === "edit" && "opacity-70")}
                >
                  <Pencil className="mr-1.5 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate("sessions", `${EDU_BASE}/${setId}/sessions`)}
                  disabled={isPending}
                  className={cn(pendingAction === "sessions" && "opacity-70")}
                >
                  <History className="mr-1.5 h-4 w-4" />
                  History
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    toast.info("Enhance & expand", {
                      description:
                        "Agentic card enrichment, sub-card expansion, and audio generation are coming soon.",
                    })
                  }
                >
                  <Expand className="mr-1.5 h-4 w-4" />
                  Enhance
                </Button>
              </div>
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
