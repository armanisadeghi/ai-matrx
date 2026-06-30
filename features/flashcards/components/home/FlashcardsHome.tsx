// features/flashcards/components/home/FlashcardsHome.tsx
//
// The list-first home for the Flashcards tool (the /education/flashcards
// "savior" list view, NOT a forced detail page). Loads every set the current
// user owns or can see (RLS-filtered, recent-first) via fcService.listSets()
// and renders them as cards. Click a card → set detail; "Study" → the study
// surface. Creation/AI flows are out of scope for now (the "New set" button is
// intentionally disabled with a "coming soon" tooltip).
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Layers,
  Plus,
  Play,
  BookOpen,
  Clock,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fcService } from "../../data/fcService";
import type { FcSetRow } from "../../data/types";

const EDU_BASE = "/education/flashcards";

/** Visibility → display chip. */
const VISIBILITY_LABEL: Record<FcSetRow["visibility"], string> = {
  private: "Private",
  internal: "Org",
  link: "Link",
  public: "Public",
};

function VisibilityChip({ visibility }: { visibility: FcSetRow["visibility"] }) {
  const label = VISIBILITY_LABEL[visibility] ?? "Private";
  return (
    <span className="shrink-0 inline-flex items-center rounded-full border border-border bg-muted px-1.5 py-0 text-[10px] font-medium uppercase tracking-wider leading-4 text-muted-foreground">
      {label}
    </span>
  );
}

/** "3 days ago"-style relative time, falling back to a date. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function SetCard({
  set,
  onOpen,
  onStudy,
  busy,
}: {
  set: FcSetRow;
  onOpen: (id: string) => void;
  onStudy: (id: string) => void;
  busy: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(set.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(set.id);
        }
      }}
      className={cn(
        "group relative flex flex-col rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 cursor-pointer",
        busy && "pointer-events-none opacity-60",
      )}
      aria-label={`Open flashcard set ${set.name}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Layers className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {set.name}
            </h3>
            <VisibilityChip visibility={set.visibility} />
          </div>
          {set.topic ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {set.topic}
              {set.lesson ? ` · ${set.lesson}` : ""}
            </p>
          ) : set.description ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {set.description}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {set.difficulty ? (
            <span className="inline-flex items-center rounded border border-border px-1.5 py-0 capitalize leading-4">
              {set.difficulty}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {relativeTime(set.updated_at)}
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-2.5 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onStudy(set.id);
          }}
        >
          <Play className="mr-1 h-3.5 w-3.5" />
          Study
        </Button>
      </div>
    </div>
  );
}

export function FlashcardsHome() {
  const router = useRouter();
  const [sets, setSets] = useState<FcSetRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fcService.listSets();
      if (cancelled) return;
      if (res.error) {
        setError(res.error);
        setSets([]);
        return;
      }
      setSets(res.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const open = (id: string) => {
    setNavigatingId(id);
    startTransition(() => {
      router.push(`${EDU_BASE}/${id}`);
    });
  };

  const study = (id: string) => {
    setNavigatingId(id);
    startTransition(() => {
      router.push(`${EDU_BASE}/${id}/study`);
    });
  };

  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Flashcards
              </h1>
              <p className="text-sm text-muted-foreground">
                Browse your sets and study them. Generate new sets from chat.
              </p>
            </div>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Wrapper span so the tooltip still fires over the disabled button. */}
                <span tabIndex={0}>
                  <Button disabled className="pointer-events-none">
                    <Plus className="mr-1.5 h-4 w-4" />
                    New set
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Coming soon — generate sets in chat for now</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Body */}
        <div className="mt-6">
          {sets === null ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-14 text-center">
              <AlertCircle className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                Couldn&apos;t load your flashcard sets
              </p>
              <p className="max-w-md text-xs text-muted-foreground">{error}</p>
            </div>
          ) : sets.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <BookOpen className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">
                No flashcard sets yet
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Generate a set in chat — ask an agent to make flashcards on any
                topic — and it will show up here, ready to study.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sets.map((set) => (
                <SetCard
                  key={set.id}
                  set={set}
                  onOpen={open}
                  onStudy={study}
                  busy={isPending && navigatingId === set.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
