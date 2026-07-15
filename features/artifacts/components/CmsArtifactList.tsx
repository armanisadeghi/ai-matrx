"use client";

import React, { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchUserArtifactsThunk } from "@/lib/redux/thunks/artifactThunks";
import {
  deleteArtifactThunk,
  archiveArtifactThunk,
} from "@/lib/redux/thunks/artifactThunks";
import {
  selectAllArtifacts,
  selectArtifactFetchStatus,
  selectArtifactFetchError,
} from "@/lib/redux/selectors/artifactSelectors";
import { makeSelectFilteredArtifacts } from "@/lib/redux/selectors/artifactSelectors";
import type {
  ArtifactType,
  ArtifactStatus,
  CxArtifactRecord,
} from "@/features/artifacts/types";
import {
  ARTIFACT_TYPE_LABELS,
  ARTIFACT_STATUS_LABELS,
} from "@/features/artifacts/types";
import {
  Globe,
  FileText,
  BookOpen,
  Network,
  GitBranch,
  Table2,
  Clock,
  BarChart2,
  HelpCircle,
  FileCode,
  Layers,
  Presentation,
  Loader2,
  ExternalLink,
  Pencil,
  Trash2,
  ArchiveIcon,
  Search,
  X,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
// ── Icon map ──────────────────────────────────────────────────────────────────

const ARTIFACT_ICONS: Record<ArtifactType, React.FC<{ className?: string }>> = {
  html_page: Globe,
  flashcard_deck: BookOpen,
  org_chart: Network,
  diagram: GitBranch,
  data_table: Table2,
  timeline: Clock,
  comparison_table: BarChart2,
  quiz: HelpCircle,
  summary: FileText,
  outline: Layers,
  report: FileCode,
  code_snippet: FileCode,
  spreadsheet: Table2,
  presentation: Presentation,
  other: FileText,
};

const STATUS_VARIANT: Record<
  ArtifactStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  published: "default",
  draft: "secondary",
  archived: "outline",
  failed: "destructive",
};

// ── Filter types ──────────────────────────────────────────────────────────────

type FilterState = {
  type: ArtifactType | "all";
  status: ArtifactStatus | "all";
  search: string;
};

// ── Artifact type filter tabs ─────────────────────────────────────────────────

const TYPE_FILTERS: Array<{ label: string; value: ArtifactType | "all" }> = [
  { label: "All", value: "all" },
  { label: "HTML Pages", value: "html_page" },
  { label: "Flashcards", value: "flashcard_deck" },
  { label: "Reports", value: "report" },
  { label: "Summaries", value: "summary" },
  { label: "Other", value: "other" },
];

// ── ArtifactCard ──────────────────────────────────────────────────────────────

interface ArtifactCardProps {
  artifact: CxArtifactRecord;
  isNavigating: boolean;
  isAnyNavigating: boolean;
  onNavigate: (id: string) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onOpenEditor: (artifact: CxArtifactRecord) => void;
}

function ArtifactCard({
  artifact,
  isNavigating,
  isAnyNavigating,
  onNavigate,
  onDelete,
  onArchive,
  onOpenEditor,
}: ArtifactCardProps) {
  const Icon = ARTIFACT_ICONS[artifact.artifactType] ?? FileText;

  const isDisabled = isNavigating || isAnyNavigating;
  const label =
    ARTIFACT_TYPE_LABELS[artifact.artifactType] ?? artifact.artifactType;
  const statusLabel =
    ARTIFACT_STATUS_LABELS[artifact.status] ?? artifact.status;
  const statusVariant = STATUS_VARIANT[artifact.status] ?? "outline";

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-nav]")) return;
    if (e.metaKey || e.ctrlKey) {
      window.open(`/artifacts/${artifact.id}`, "_blank");
      return;
    }
    if (!isDisabled) {
      onNavigate(artifact.id);
    }
  };

  return (
    <Card
      className={`relative group cursor-pointer transition-all hover:shadow-md hover:border-primary/30 ${isDisabled ? "opacity-60" : ""}`}
      onClick={handleCardClick}
    >
      {isNavigating && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-20 flex items-center justify-center rounded-lg">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      )}

      <CardContent className="p-4 pb-2">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center mt-0.5">
            <Icon className="w-4 h-4 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="text-sm font-medium text-foreground truncate leading-tight">
                {artifact.title ?? "Untitled"}
              </h3>
              <div data-no-nav>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      disabled={isDisabled}
                    >
                      <span className="sr-only">Actions</span>
                      <span className="text-muted-foreground text-lg leading-none">
                        ⋯
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {artifact.externalUrl && (
                      <DropdownMenuItem asChild>
                        <a
                          href={artifact.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          View Live
                        </a>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="flex items-center gap-2"
                      onClick={() => onOpenEditor(artifact)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit Content
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="flex items-center gap-2 text-muted-foreground"
                      onClick={() => onArchive(artifact.id)}
                    >
                      <ArchiveIcon className="h-3.5 w-3.5" />
                      Archive
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="flex items-center gap-2 text-destructive"
                      onClick={() => onDelete(artifact.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {artifact.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                {artifact.description}
              </p>
            )}

            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                {label}
              </Badge>
              <Badge
                variant={statusVariant}
                className="text-[10px] px-1.5 py-0 h-4"
              >
                {statusLabel}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-2 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {new Date(artifact.updatedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>

        <div className="flex items-center gap-1" data-no-nav>
          {artifact.externalUrl && (
            <Link
              href={artifact.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="View live"
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            </Link>
          )}
          <Link
            href={`/artifacts/${artifact.id}`}
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              if (!isDisabled) onNavigate(artifact.id);
            }}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={isDisabled}
              title={isDisabled ? "Please wait…" : "Open detail"}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}

// ── CmsArtifactList ───────────────────────────────────────────────────────────

export function CmsArtifactList() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  const fetchStatus = useAppSelector(selectArtifactFetchStatus);
  const fetchError = useAppSelector(selectArtifactFetchError);
  const allArtifacts = useAppSelector(selectAllArtifacts);

  const [filters, setFilters] = useState<FilterState>({
    type: "all",
    status: "all",
    search: "",
  });

  // Fetch on mount
  useEffect(() => {
    if (fetchStatus === "idle") {
      dispatch(fetchUserArtifactsThunk(undefined));
    }
  }, [dispatch, fetchStatus]);

  // Client-side filter
  const filtered = allArtifacts.filter((a) => {
    if (filters.type !== "all" && a.artifactType !== filters.type) return false;
    if (filters.status !== "all" && a.status !== filters.status) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const title = (a.title ?? "").toLowerCase();
      const desc = (a.description ?? "").toLowerCase();
      if (!title.includes(q) && !desc.includes(q)) return false;
    }
    return true;
  });

  const handleNavigate = (id: string) => {
    if (navigatingId) return;
    setNavigatingId(id);
    startTransition(() => router.push(`/artifacts/${id}`));
  };

  const handleDelete = (id: string) => {
    dispatch(deleteArtifactThunk(id));
  };

  const handleArchive = (id: string) => {
    dispatch(archiveArtifactThunk(id));
  };

  const handleOpenEditor = (artifact: CxArtifactRecord) => {
    if (artifact.artifactType === "html_page" && artifact.externalId) {
      // We don't have the original markdown here — open the detail page instead
      router.push(`/artifacts/${artifact.id}`);
    }
  };

  const isLoading = fetchStatus === "loading";

  return (
    <div className="space-y-6">
      {/* Type filter tabs + refresh */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none flex-1">
          {TYPE_FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={filters.type === f.value ? "default" : "outline"}
              size="sm"
              className="flex-shrink-0 h-8 text-xs"
              onClick={() => setFilters((prev) => ({ ...prev, type: f.value }))}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          onClick={() => dispatch(fetchUserArtifactsThunk(undefined))}
          disabled={isLoading}
          title="Refresh"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          <span className="sr-only">Refresh</span>
        </Button>
      </div>

      {/* Search + status filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by title or description…"
            value={filters.search}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, search: e.target.value }))
            }
            className="pl-8 h-8 text-sm"
          />
          {filters.search && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setFilters((prev) => ({ ...prev, search: "" }))}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 flex-shrink-0"
            >
              Status:{" "}
              {filters.status === "all"
                ? "All"
                : ARTIFACT_STATUS_LABELS[filters.status as ArtifactStatus]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            {(["all", "published", "draft", "archived", "failed"] as const).map(
              (s) => (
                <DropdownMenuItem
                  key={s}
                  onClick={() => setFilters((prev) => ({ ...prev, status: s }))}
                  className={filters.status === s ? "font-medium" : ""}
                >
                  {s === "all" ? "All statuses" : ARTIFACT_STATUS_LABELS[s]}
                </DropdownMenuItem>
              ),
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Content */}
      {isLoading && allArtifacts.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Loading your content…</p>
          </div>
        </div>
      ) : fetchError ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3 text-destructive">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm font-medium">Failed to load content</p>
            <p className="text-xs text-muted-foreground">{fetchError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => dispatch(fetchUserArtifactsThunk(undefined))}
            >
              Retry
            </Button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <FileText className="h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">
              {allArtifacts.length === 0
                ? "No generated content yet"
                : "No results match your filters"}
            </p>
            <p className="text-xs text-center max-w-xs">
              {allArtifacts.length === 0
                ? "Use the HTML Preview action on any AI message to generate and publish content."
                : "Try adjusting your search or filters."}
            </p>
            {allArtifacts.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setFilters({ type: "all", status: "all", search: "" })
                }
              >
                Clear filters
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((artifact) => (
            <ArtifactCard
              key={artifact.id}
              artifact={artifact}
              isNavigating={navigatingId === artifact.id}
              isAnyNavigating={navigatingId !== null}
              onNavigate={handleNavigate}
              onDelete={handleDelete}
              onArchive={handleArchive}
              onOpenEditor={handleOpenEditor}
            />
          ))}
        </div>
      )}

      {/* Count footer */}
      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-center pb-4">
          Showing {filtered.length} of {allArtifacts.length} items
        </p>
      )}
    </div>
  );
}
