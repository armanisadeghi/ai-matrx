"use client";

import { useState, useTransition, useMemo, useRef, useEffect } from "react";
import { idMatchesQuery } from "@/utils/search-scoring";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Loader2,
  Trash2,
  Search,
  X,
  CircleDot,
  FolderKanban,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast-service";
import { useHierarchyFilter } from "@/components/hierarchy-filter/useHierarchyFilter";
import { HierarchyPills } from "@/features/agent-context/components/hierarchy-selection/HierarchyPills";
import { EMPTY_SELECTION } from "@/features/agent-context/components/hierarchy-selection/types";
import {
  useAllTopics,
  useTopicsForProject,
  useTopicsForProjects,
} from "../../hooks/useResearchState";
import { StatusBadge } from "../shared/StatusBadge";
import type { ResearchTopic } from "../../types";
import { supabase } from "@/utils/supabase/client";

// ─── Data ────────────────────────────────────────────────────────────────────

function useFilteredTopics(filter: ReturnType<typeof useHierarchyFilter>) {
  const { selectedOrgId, selectedProjectId, filteredProjects } = filter;
  const orgScopedProjectIds = selectedOrgId
    ? filteredProjects.map((p) => p.id)
    : [];

  // All three hooks run unconditionally so hook order is stable; we just
  // gate them with `enabled` and pick the right result below.
  const singleProject = useTopicsForProject(selectedProjectId ?? undefined);
  const orgScoped = useTopicsForProjects(
    selectedProjectId ? [] : orgScopedProjectIds,
  );
  const all = useAllTopics(!selectedProjectId && !selectedOrgId);

  if (selectedProjectId) return singleProject;
  if (selectedOrgId) return orgScoped;
  return all;
}

function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const day = 86_400_000;
  const days = Math.floor(diff / day);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// ─── Card ────────────────────────────────────────────────────────────────────

interface TopicCardProps {
  topic: ResearchTopic;
  projectName?: string | null;
  showProject: boolean;
  isNavigating: boolean;
  isAnyNavigating: boolean;
  onNavigate: (id: string, e?: React.MouseEvent) => void;
  onDelete: (topic: ResearchTopic) => void;
}

function TopicCard({
  topic,
  projectName,
  showProject,
  isNavigating,
  isAnyNavigating,
  onNavigate,
  onDelete,
}: TopicCardProps) {
  return (
    <Link
      href={`/research/topics/${topic.id}`}
      onClick={(e) => onNavigate(topic.id, e)}
      className={cn(
        "group relative flex h-full min-h-[148px] flex-col rounded-2xl border border-border/60 bg-card/60 p-5 transition-all duration-200",
        "hover:border-primary/40 hover:bg-card hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        isNavigating && "opacity-70",
        isAnyNavigating && !isNavigating && "pointer-events-none opacity-40",
      )}
    >
      {isNavigating && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/70 backdrop-blur-sm">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}

      <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
        <StatusBadge status={topic.status} />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(topic);
          }}
          aria-label="Delete topic"
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/70 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="pr-24">
        <h3 className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-foreground line-clamp-2 transition-colors group-hover:text-primary">
          {topic.name}
        </h3>
        {topic.description && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground line-clamp-2">
            {topic.description}
          </p>
        )}
      </div>

      <div className="mt-auto flex items-center gap-2 pt-4 text-[11px] text-muted-foreground">
        {showProject && projectName ? (
          <span className="inline-flex max-w-[60%] items-center gap-1 truncate rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-400">
            <FolderKanban className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{projectName}</span>
          </span>
        ) : null}
        <span className="ml-auto whitespace-nowrap tabular-nums">
          {formatRelativeDate(topic.created_at)}
        </span>
      </div>
    </Link>
  );
}

// ─── New Topic Card ───────────────────────────────────────────────────────────

interface NewTopicCardProps {
  isNavigating: boolean;
  isAnyNavigating: boolean;
  onNavigate: () => void;
}

function NewTopicCard({
  isNavigating,
  isAnyNavigating,
  onNavigate,
}: NewTopicCardProps) {
  return (
    <Link
      href="/research/topics/new"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        if (!isAnyNavigating) onNavigate();
      }}
      className={cn(
        "group relative flex h-full min-h-[148px] flex-col rounded-2xl border border-primary/30 bg-primary/5 p-5 transition-all duration-200",
        "hover:border-primary/60 hover:bg-primary/10 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        isNavigating && "opacity-70",
        isAnyNavigating && !isNavigating && "pointer-events-none opacity-40",
      )}
    >
      {isNavigating && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/70 backdrop-blur-sm">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}

      <div className="flex h-full flex-col">
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 transition-colors group-hover:bg-primary/25">
          <Plus className="h-4 w-4 text-primary" />
        </div>
        <h3 className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-primary">
          New Research Topic
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-primary/60">
          Start a new line of inquiry
        </p>
        <div className="mt-auto flex items-center gap-1 text-[11px] text-primary/50 transition-colors group-hover:text-primary/80">
          <span>Begin</span>
          <ArrowRight className="h-3 w-3" />
        </div>
      </div>
    </Link>
  );
}

// ─── States ──────────────────────────────────────────────────────────────────

function TopicCardSkeleton() {
  return (
    <div className="flex min-h-[148px] flex-col gap-3 rounded-2xl border border-border/40 bg-card/30 p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="h-4 w-2/3 animate-pulse rounded-md bg-muted/70" />
        <div className="h-4 w-14 animate-pulse rounded-full bg-muted/50" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 w-full animate-pulse rounded-md bg-muted/40" />
        <div className="h-3 w-4/5 animate-pulse rounded-md bg-muted/40" />
      </div>
      <div className="mt-auto flex items-center justify-between gap-2">
        <div className="h-3 w-24 animate-pulse rounded-full bg-muted/30" />
        <div className="h-3 w-12 animate-pulse rounded-md bg-muted/30" />
      </div>
    </div>
  );
}

function TopicsSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <TopicCardSkeleton key={i} />
      ))}
    </div>
  );
}

interface FirstRunHeroProps {
  isPending: boolean;
  onCreate: (name?: string) => void;
}

function FirstRunHero({ isPending, onCreate }: FirstRunHeroProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center justify-center px-2 py-16 text-center sm:py-24">
      <div
        className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15"
        aria-hidden
      >
        <CircleDot className="h-7 w-7 text-primary" />
      </div>
      <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
        Begin your first inquiry
      </h2>
      <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">
        A research topic is a small project built around a question worth
        answering. It gathers sources, organizes analysis, and synthesizes what
        matters.
      </p>

      <form
        className="mt-7 flex w-full max-w-md items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(draft.trim() || undefined);
        }}
      >
        <div className="relative flex-1">
          <CircleDot
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/50"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What do you want to research?"
            className="h-11 w-full rounded-full border border-border bg-card pl-10 pr-4 text-[14px] text-foreground placeholder:text-muted-foreground/80 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/15"
            style={{ fontSize: "16px" }}
          />
        </div>
        <Button
          type="submit"
          disabled={isPending}
          className="h-11 shrink-0 gap-1.5 rounded-full px-5"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <span className="text-sm font-medium">Start</span>
              <ArrowRight className="h-4 w-4 opacity-80" />
            </>
          )}
        </Button>
      </form>
      <p className="mt-3 text-[11px] text-muted-foreground/70">
        Press Enter to begin. You can refine details on the next step.
      </p>
    </div>
  );
}

interface NoMatchesProps {
  query: string;
  hasFilter: boolean;
  isPending: boolean;
  onClearSearch: () => void;
  onCreate: (name?: string) => void;
}

function NoMatches({
  query,
  hasFilter,
  isPending,
  onClearSearch,
  onCreate,
}: NoMatchesProps) {
  const heading = query
    ? `No topics match "${query}"`
    : hasFilter
      ? "No topics in this view"
      : "No topics yet";
  const subline = query
    ? "Try a different search, or start a new topic with this name."
    : hasFilter
      ? "Try a different filter, or create a topic in this scope."
      : "Create one to get started.";

  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center px-2 py-20 text-center">
      <div
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/40 ring-1 ring-border"
        aria-hidden
      >
        <Search className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="text-[16px] font-semibold text-foreground">{heading}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        {subline}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {query ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearSearch}
            className="h-9 rounded-full px-4"
          >
            Clear search
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={() => onCreate(query.trim() || undefined)}
          disabled={isPending}
          className="h-9 gap-1.5 rounded-full px-4"
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          {query ? `Create "${query}"` : "New topic"}
        </Button>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function TopicList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const filter = useHierarchyFilter();

  const searchQuery = searchParams.get("q") ?? "";
  const setSearchQuery = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("q", value);
    else params.delete("q");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResearchTopic | null>(null);
  const [deleting, setDeleting] = useState(false);

  const {
    data: topics,
    isLoading: topicsLoading,
    refresh,
  } = useFilteredTopics(filter);

  const filteredTopics = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return topics ?? [];
    return (topics ?? []).filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        idMatchesQuery(t, q),
    );
  }, [topics, searchQuery]);

  // Always map every known project so topics from outside the current
  // hierarchy filter still render their project label.
  const projectNameMap = useMemo(
    () => new Map((filter.data?.projects ?? []).map((p) => [p.id, p.name])),
    [filter.data?.projects],
  );

  const handleNavigateToTopic = (topicId: string, e?: React.MouseEvent) => {
    if (e && (e.metaKey || e.ctrlKey)) return;
    e?.preventDefault();
    if (navigatingId) return;
    setNavigatingId(topicId);
    startTransition(() => {
      router.push(`/research/topics/${topicId}`);
    });
  };

  const handleNewTopic = (prefilledName?: string) => {
    if (navigatingId) return;
    setNavigatingId("__new__");
    const path = prefilledName
      ? `/research/topics/new?topic=${encodeURIComponent(prefilledName)}`
      : "/research/topics/new";
    startTransition(() => {
      router.push(path);
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("rs_topic")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success("Topic deleted.");
      refresh();
    } catch {
      toast.error("Failed to delete topic.");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const topicsLoaded = !filter.isLoading && !topicsLoading;
  const totalCount = (topics ?? []).length;
  const filteredCount = filteredTopics.length;
  const hasTopics = filteredCount > 0;
  const showProject = !filter.selectedProjectId;
  const hasFilter = !!filter.selectedOrgId || !!filter.selectedProjectId;
  const showFirstRun =
    topicsLoaded && totalCount === 0 && !searchQuery && !hasFilter;
  const isCreatingNew = navigatingId === "__new__";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-textured">
      {/* Spacer that lets the glass header float above content */}
      <div
        className="shrink-0"
        style={{ height: "var(--shell-header-h, 2.75rem)" }}
      />

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-border/40 bg-background/70 backdrop-blur-md">
        <div className="mx-auto w-full max-w-[1800px] px-4 py-3 sm:px-6 lg:px-8 xl:px-12">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
            <div className="min-w-0">
              <HierarchyPills
                levels={["organization", "scope", "project", "task"]}
                value={{
                  ...EMPTY_SELECTION,
                  organizationId: filter.selectedOrgId,
                  projectId: filter.selectedProjectId,
                }}
                onChange={(sel) => {
                  if (sel.organizationId !== filter.selectedOrgId)
                    filter.selectOrg(sel.organizationId);
                  if (sel.projectId !== filter.selectedProjectId)
                    filter.selectProject(sel.projectId);
                  if (!sel.organizationId && !sel.projectId) filter.resetAll();
                }}
              />
            </div>

            <div className="flex items-center gap-2 lg:flex-shrink-0">
              <label className="group relative flex h-9 flex-1 items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 transition-colors hover:bg-card focus-within:border-primary/40 focus-within:bg-card focus-within:ring-2 focus-within:ring-primary/15 lg:w-72 lg:flex-none">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search topics"
                  aria-label="Search topics"
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  style={{ fontSize: "16px" }}
                />
                {searchQuery ? (
                  <>
                    {topicsLoaded ? (
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {filteredCount}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      aria-label="Clear search"
                      className="shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                ) : null}
              </label>

              <Button
                type="button"
                onClick={() => handleNewTopic()}
                disabled={isCreatingNew || isPending}
                className="h-9 shrink-0 gap-1.5 rounded-full px-3.5 sm:px-4"
              >
                {isCreatingNew ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                <span className="hidden text-sm font-medium sm:inline">
                  New Topic
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 xl:px-12">
          {!topicsLoaded ? (
            <TopicsSkeletonGrid />
          ) : showFirstRun ? (
            <div className="flex justify-center py-12 sm:py-20">
              <div className="w-full max-w-xs">
                <NewTopicCard
                  isNavigating={isCreatingNew}
                  isAnyNavigating={navigatingId !== null}
                  onNavigate={() => handleNewTopic()}
                />
              </div>
            </div>
          ) : hasTopics ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <NewTopicCard
                isNavigating={isCreatingNew}
                isAnyNavigating={navigatingId !== null}
                onNavigate={() => handleNewTopic()}
              />
              {filteredTopics.map((topic) => (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  projectName={projectNameMap.get(topic.project_id)}
                  showProject={showProject}
                  isNavigating={navigatingId === topic.id}
                  isAnyNavigating={navigatingId !== null}
                  onNavigate={handleNavigateToTopic}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          ) : (
            <NoMatches
              query={searchQuery}
              hasFilter={hasFilter}
              isPending={isCreatingNew}
              onClearSearch={() => setSearchQuery("")}
              onCreate={handleNewTopic}
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
        title="Delete topic"
        description={
          <>
            Permanently delete <b>{deleteTarget?.name}</b> and all its sources,
            analyses, and documents. This cannot be undone.
          </>
        }
        confirmLabel="Delete topic"
        variant="destructive"
        busy={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
