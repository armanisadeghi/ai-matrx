// features/education/assessment/components/AssessmentHome.tsx
//
// The list-first home for the Quiz Builder AND Practice Tests tools (the
// /education/quizzes + /education/practice-tests "savior" list views — never a
// forced detail page). One component, `kind`-parameterized via KIND_CONFIG.
// Loads the user's assessments (RLS-filtered, recent-first) and renders a dense,
// searchable list. Click a row → detail (Open/Take); "New" → generate config.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Play,
  Search,
  Clock,
  AlertCircle,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { assessmentService } from "../data/assessmentService";
import type { AssessmentKind, AssessmentRow } from "../data/types";
import { KIND_CONFIG, type KindConfig } from "./kindConfig";

type VisibilityFilter = "all" | "mine" | "shared" | "public";
const VISIBILITY_FILTERS: { id: VisibilityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "shared", label: "Shared" },
  { id: "public", label: "Public" },
];

function matchesVisibility(
  filter: VisibilityFilter,
  v: AssessmentRow["visibility"],
): boolean {
  switch (filter) {
    case "mine":
      return v === "private" || v === "internal";
    case "shared":
      return v === "link";
    case "public":
      return v === "public";
    default:
      return true;
  }
}

const VISIBILITY_LABEL: Record<AssessmentRow["visibility"], string> = {
  private: "Private",
  internal: "Org",
  link: "Link",
  public: "Public",
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function matchesQuery(a: AssessmentRow, q: string): boolean {
  if (!q) return true;
  return [a.title, a.topic, a.description, a.exam_type]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

function AssessmentRowItem({
  assessment,
  config,
  onOpen,
  onTake,
  busy,
}: {
  assessment: AssessmentRow;
  config: KindConfig;
  onOpen: (id: string) => void;
  onTake: (id: string) => void;
  busy: boolean;
}) {
  const Icon = config.icon;
  const count =
    typeof assessment.metadata === "object" &&
    assessment.metadata &&
    "question_count" in assessment.metadata
      ? Number((assessment.metadata as { question_count?: number }).question_count)
      : null;
  const metaBits = [
    assessment.topic,
    assessment.exam_type,
    assessment.depth,
    count ? `${count} questions` : null,
  ].filter(Boolean);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(assessment.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(assessment.id);
        }
      }}
      className={cn(
        "group flex min-h-[44px] items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 cursor-pointer",
        busy && "pointer-events-none opacity-60",
      )}
      aria-label={`Open ${config.noun} ${assessment.title}`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">
            {assessment.title}
          </h3>
          <span className="shrink-0 inline-flex items-center rounded-full border border-border bg-muted px-1.5 py-0 text-[10px] font-medium uppercase tracking-wider leading-4 text-muted-foreground">
            {VISIBILITY_LABEL[assessment.visibility] ?? "Private"}
          </span>
          {assessment.status !== "ready" && (
            <span className="shrink-0 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0 text-[10px] font-medium uppercase tracking-wider leading-4 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              {assessment.status}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
          {metaBits.length > 0 ? (
            <span className="truncate capitalize">{metaBits.join(" · ")}</span>
          ) : assessment.description ? (
            <span className="truncate">{assessment.description}</span>
          ) : null}
          <span className="inline-flex shrink-0 items-center gap-1">
            <Clock className="h-3 w-3" />
            {relativeTime(assessment.updated_at)}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          title={`Take ${config.noun}`}
          aria-label={`Take ${assessment.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onTake(assessment.id);
          }}
        >
          <Play className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function AssessmentHome({ kind }: { kind: AssessmentKind }) {
  const config: KindConfig = KIND_CONFIG[kind];
  const router = useRouter();
  const [rows, setRows] = useState<AssessmentRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const [isPending, startTransition] = useTransition();
  const [navId, setNavId] = useState<string | null>(null);
  const base = `/education/${config.base}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await assessmentService.listAssessments({ kind: config.kind });
      if (cancelled) return;
      if (res.error) {
        setError(res.error);
        setRows([]);
      } else {
        setError(null);
        setRows(res.data ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [config.kind]);

  const go = (path: string, id: string) => {
    if (isPending) return;
    setNavId(id);
    startTransition(() => router.push(path));
  };
  const open = (id: string) => go(`${base}/${id}`, id);
  const take = (id: string) => go(`${base}/${id}?start=1`, `take-${id}`);
  const create = () => go(`${base}/new`, "__new__");

  const q = query.trim().toLowerCase();
  const visible = (rows ?? []).filter(
    (r) => matchesVisibility(visibility, r.visibility) && matchesQuery(r, q),
  );
  const Icon = config.icon;

  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-5 sm:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {config.pluralLabel}
            </h1>
          </div>
          <Button onClick={create} disabled={isPending && navId === "__new__"}>
            <Plus className="mr-1.5 h-4 w-4" />
            New {config.label.toLowerCase()}
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${config.pluralLabel.toLowerCase()} by title, topic, or exam`}
              className="pl-9"
              aria-label={`Search ${config.pluralLabel}`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {VISIBILITY_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setVisibility(f.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  visibility === f.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          {loading || rows === null ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-14 text-center">
              <AlertCircle className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                Couldn&apos;t load your {config.pluralLabel.toLowerCase()}
              </p>
              <p className="max-w-md text-xs text-muted-foreground">{error}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <BookOpen className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">
                No {config.pluralLabel.toLowerCase()} yet
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Generate one from a topic, a flashcard deck, or an uploaded
                document. It will show up here, ready to take.
              </p>
              <Button onClick={create} className="mt-2">
                <Plus className="mr-1.5 h-4 w-4" />
                New {config.label.toLowerCase()}
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
              <Search className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                Nothing matches your filters
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((a) => (
                <AssessmentRowItem
                  key={a.id}
                  assessment={a}
                  config={config}
                  onOpen={open}
                  onTake={take}
                  busy={isPending && (navId === a.id || navId === `take-${a.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
