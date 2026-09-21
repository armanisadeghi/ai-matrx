"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useOpenCanvasItem } from "@/features/canvas/hooks/useOpenCanvasItem";
import { useCanvasArtifactUrlState } from "@/features/canvas/hooks/useCanvasArtifactUrlState";
import {
  fetchUserArtifactsThunk,
  deleteArtifactThunk,
  archiveArtifactThunk,
} from "@/lib/redux/thunks/artifactThunks";
import {
  selectAllArtifacts,
  selectArtifactFetchStatus,
  selectArtifactFetchError,
} from "@/lib/redux/selectors/artifactSelectors";
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
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { MatrxDataTable, type MatrxColumnDef } from "@ai-matrx/design-system/data-table";

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

type FilterState = {
  type: ArtifactType | "all";
  status: ArtifactStatus | "all";
  search: string;
};

const TYPE_FILTERS: Array<{ label: string; value: ArtifactType | "all" }> = [
  { label: "All", value: "all" },
  { label: "HTML Pages", value: "html_page" },
  { label: "Flashcards", value: "flashcard_deck" },
  { label: "Reports", value: "report" },
  { label: "Summaries", value: "summary" },
  { label: "Other", value: "other" },
];

function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

function statusTone(status: ArtifactStatus): string {
  if (status === "failed") return "text-destructive";
  if (status === "draft" || status === "archived") {
    return "text-muted-foreground";
  }
  return "text-muted-foreground";
}

interface ArtifactRowProps {
  artifact: CxArtifactRecord;
  isNavigating: boolean;
  isAnyNavigating: boolean;
  onOpen: (artifact: CxArtifactRecord) => void;
  onNavigate: (id: string) => void;
  onDelete: (artifact: CxArtifactRecord) => void;
  onArchive: (artifact: CxArtifactRecord) => void;
  onOpenEditor: (artifact: CxArtifactRecord) => void;
}

function ArtifactRow({
  artifact,
  isNavigating,
  isAnyNavigating,
  onOpen,
  onNavigate,
  onDelete,
  onArchive,
  onOpenEditor,
}: ArtifactRowProps) {
  const Icon = ARTIFACT_ICONS[artifact.artifactType] ?? FileText;
  const isDisabled = isNavigating || isAnyNavigating;
  const title = artifact.title?.trim() || "Untitled";
  const kind =
    ARTIFACT_TYPE_LABELS[artifact.artifactType] ?? artifact.artifactType;
  const statusLabel =
    ARTIFACT_STATUS_LABELS[artifact.status] ?? artifact.status;

  const handleRowActivate = (e: React.MouseEvent | React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-nav]")) return;
    if ("metaKey" in e && (e.metaKey || e.ctrlKey)) {
      window.open(`/artifacts/${artifact.id}`, "_blank");
      return;
    }
    if (!isDisabled) onOpen(artifact);
  };

  return (
    <tr
      className={cn(
        "group border-b border-border/60 last:border-b-0",
        isDisabled
          ? "opacity-60"
          : "cursor-pointer hover:bg-accent/50",
      )}
      onClick={handleRowActivate}
      aria-label={title}
    >
      <td className="py-2 pr-3 pl-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <Icon
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start gap-2">
              <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground break-words [overflow-wrap:anywhere] line-clamp-2">
                {title}
              </span>
              {artifact.status !== "published" && (
                <span
                  className={cn(
                    "shrink-0 text-xs leading-snug",
                    statusTone(artifact.status),
                  )}
                >
                  {statusLabel}
                </span>
              )}
            </div>
            {artifact.description && (
              <p className="mt-0.5 line-clamp-1 break-words text-xs text-muted-foreground">
                {artifact.description}
              </p>
            )}
            <p className="mt-0.5 text-xs text-muted-foreground sm:hidden">
              {kind} · {formatUpdatedAt(artifact.updatedAt)}
            </p>
          </div>
          {isNavigating && (
            <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
          )}
        </div>
      </td>
      <td className="hidden px-3 py-2 text-xs text-muted-foreground md:table-cell">
        {kind}
      </td>
      <td className="hidden whitespace-nowrap px-3 py-2 text-xs text-muted-foreground sm:table-cell">
        <time dateTime={artifact.updatedAt} title={new Date(artifact.updatedAt).toLocaleString()}>
          {formatUpdatedAt(artifact.updatedAt)}
        </time>
      </td>
      <td className="w-10 px-1 py-2" data-no-nav onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-0.5">
          {artifact.externalUrl && (
            <Link
              href={artifact.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              tabIndex={-1}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100"
              title="View live"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="size-3.5" />
              <span className="sr-only">View live</span>
            </Link>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
                disabled={isDisabled}
              >
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Actions</span>
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
                    <ExternalLink className="size-3.5" />
                    View live
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="flex items-center gap-2"
                onClick={() => onNavigate(artifact.id)}
              >
                <FileText className="size-3.5" />
                Open full page
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex items-center gap-2"
                onClick={() => onOpenEditor(artifact)}
              >
                <Pencil className="size-3.5" />
                Edit content
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="flex items-center gap-2 text-muted-foreground"
                onClick={() => onArchive(artifact)}
              >
                <ArchiveIcon className="size-3.5" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex items-center gap-2 text-destructive"
                onClick={() => onDelete(artifact)}
              >
                <Trash2 className="size-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}

function ArtifactListSkeleton() {
  return (
    <div className="divide-y divide-border/60" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-2 py-2.5">
          <div className="size-4 shrink-0 animate-pulse rounded bg-muted" />
          <div className="h-3.5 flex-1 max-w-[280px] animate-pulse rounded bg-muted" />
          <div className="ml-auto hidden h-3 w-24 animate-pulse rounded bg-muted md:block" />
          <div className="hidden h-3 w-16 animate-pulse rounded bg-muted sm:block" />
        </div>
      ))}
    </div>
  );
}

export function CmsArtifactList() {
  const dispatch = useAppDispatch();
  const { openItem } = useOpenCanvasItem();
  // THE OPEN ARTIFACT IS PART OF THIS PAGE'S ADDRESS. `/artifacts?open=<id>`
  // survives a reload and follows Back/Forward, exactly as the selected
  // artifact does in Claude.ai's gallery. Without it the canvas slice — which
  // is deliberately not persisted — simply dropped whatever was open, and this
  // route has no persisted tool-call rows to re-derive it from the way chat
  // does. See `features/canvas/hooks/useCanvasArtifactUrlState.ts`.
  useCanvasArtifactUrlState();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearNavigationTimeout = () => {
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    setNavigatingId(null);
    clearNavigationTimeout();
    return clearNavigationTimeout;
  }, [pathname]);

  const fetchStatus = useAppSelector(selectArtifactFetchStatus);
  const fetchError = useAppSelector(selectArtifactFetchError);
  const allArtifacts = useAppSelector(selectAllArtifacts);

  const [filters, setFilters] = useState<FilterState>({
    type: "all",
    status: "all",
    search: "",
  });

  useEffect(() => {
    if (fetchStatus === "idle") {
      dispatch(fetchUserArtifactsThunk(undefined));
    }
  }, [dispatch, fetchStatus]);

  const filtered = allArtifacts
    .filter((a) => {
      if (filters.type !== "all" && a.artifactType !== filters.type) return false;
      if (filters.status === "all") {
        if (a.status === "archived") return false;
      } else if (a.status !== filters.status) {
        return false;
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const title = (a.title ?? "").toLowerCase();
        const desc = (a.description ?? "").toLowerCase();
        if (!title.includes(q) && !desc.includes(q)) return false;
      }
      return true;
    })
    .slice()
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  /**
   * Clicking an artifact opens it IN THE CANVAS, the same as clicking it in a
   * note or a chat message — one artifact, one behaviour, wherever it appears.
   * The dedicated page stays reachable (cmd-click, the row menu, and the
   * pane's own "Open full page"), because it is where an artifact's metadata
   * and destructive actions live.
   *
   * Rows with no `canvasItemId` (external-system artifacts such as html_page)
   * have no canvas row to point at, so they still navigate.
   */
  const handleOpen = (artifact: CxArtifactRecord) => {
    if (artifact.canvasItemId) {
      void openItem({
        artifactId: artifact.canvasItemId,
        title: artifact.title,
      });
      return;
    }
    handleNavigate(artifact.id);
  };

  const handleNavigate = (id: string) => {
    if (navigatingId) return;
    setNavigatingId(id);
    clearNavigationTimeout();
    navigationTimeoutRef.current = setTimeout(() => {
      navigationTimeoutRef.current = null;
      setNavigatingId(null);
    }, 6000);
    startTransition(() => router.push(`/artifacts/${id}`));
  };

  const handleDelete = async (artifact: CxArtifactRecord) => {
    const title = artifact.title?.trim() || "Untitled";
    const liveNote = artifact.externalUrl
      ? " Any live URL for this item will stop working."
      : "";
    const ok = await confirm({
      title: `Permanently delete ${title}?`,
      description: `This removes it from the Content Library.${liveNote} This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await dispatch(deleteArtifactThunk(artifact.id)).unwrap();
      toast.success(`${title} deleted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  };

  const handleArchive = async (artifact: CxArtifactRecord) => {
    const title = artifact.title?.trim() || "Untitled";
    try {
      await dispatch(archiveArtifactThunk(artifact.id)).unwrap();
      toast.success(`${title} archived`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Archive failed");
    }
  };

  const handleOpenEditor = (artifact: CxArtifactRecord) => {
    if (artifact.artifactType === "html_page" && artifact.externalId) {
      handleNavigate(artifact.id);
    }
  };

  const isLoading = fetchStatus === "loading";
  const columns = useMemo<MatrxColumnDef<CxArtifactRecord>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        accessorFn: (artifact) => artifact.title?.trim() || "Untitled",
        cell: (artifact) => {
          const Icon = ARTIFACT_ICONS[artifact.artifactType] ?? FileText;
          const title = artifact.title?.trim() || "Untitled";
          return <div className="flex min-w-0 items-start gap-2.5"><Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /><div className="min-w-0"><span className="block font-medium leading-snug">{title}</span>{artifact.description && <span className="block truncate text-xs text-muted-foreground">{artifact.description}</span>}</div></div>;
        },
      },
      { id: "kind", header: "Kind", accessorFn: (artifact) => ARTIFACT_TYPE_LABELS[artifact.artifactType] ?? artifact.artifactType, mobileHidden: true },
      { id: "updated", header: "Updated", accessorFn: (artifact) => artifact.updatedAt, filter: "date", mobileHidden: true, cell: (artifact) => <time dateTime={artifact.updatedAt} title={new Date(artifact.updatedAt).toLocaleString()}>{formatUpdatedAt(artifact.updatedAt)}</time> },
      { id: "status", header: "Status", accessorFn: (artifact) => artifact.status, filter: "select", mobileHidden: true, cell: (artifact) => artifact.status === "published" ? "—" : <span className={statusTone(artifact.status)}>{ARTIFACT_STATUS_LABELS[artifact.status]}</span> },
    ],
    [],
  );
  const statusButtonLabel =
    filters.status === "all"
      ? "Active"
      : ARTIFACT_STATUS_LABELS[filters.status];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto border-b border-border scrollbar-none">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={cn(
                "h-8 shrink-0 border-b-2 px-2.5 text-sm -mb-px",
                filters.type === f.value
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setFilters((prev) => ({ ...prev, type: f.value }))}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 lg:w-64 lg:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search"
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              className="h-8 pl-8 text-sm"
            />
            {filters.search && (
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setFilters((prev) => ({ ...prev, search: "" }))}
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 px-2 text-xs text-muted-foreground"
              >
                {statusButtonLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              {(
                ["all", "published", "draft", "archived", "failed"] as const
              ).map((s) => (
                <DropdownMenuItem
                  key={s}
                  onClick={() => setFilters((prev) => ({ ...prev, status: s }))}
                  className={filters.status === s ? "font-medium" : ""}
                >
                  {s === "all" ? "Active" : ARTIFACT_STATUS_LABELS[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => dispatch(fetchUserArtifactsThunk(undefined))}
            disabled={isLoading}
            title="Refresh"
          >
            {isLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            <span className="sr-only">Refresh</span>
          </Button>
        </div>
      </div>

      {isLoading && allArtifacts.length === 0 ? (
        <ArtifactListSkeleton />
      ) : fetchError ? (
        <div className="flex flex-col items-start gap-2 py-10 text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4" />
            <p className="text-sm font-medium">Could not load your content</p>
          </div>
          <p className="text-xs text-muted-foreground">{fetchError}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => dispatch(fetchUserArtifactsThunk(undefined))}
          >
            Retry
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-start gap-2 py-10 text-muted-foreground">
          <p className="text-sm font-medium text-foreground">
            {allArtifacts.length === 0
              ? "Nothing here yet"
              : "No matches"}
          </p>
          <p className="max-w-md text-xs">
            {allArtifacts.length === 0
              ? "Content you generate from a conversation lands here."
              : "Try a different search or filter."}
          </p>
          {allArtifacts.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() =>
                setFilters({ type: "all", status: "all", search: "" })
              }
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <MatrxDataTable<CxArtifactRecord>
          tableId="artifacts/content-library"
          data={filtered}
          columns={columns}
          getRowId={(artifact) => artifact.id}
          isLoading={isLoading}
          density="condensed"
          pageSize={0}
          hidePagination
          coverage={{ noun: "artifact", answeredBy: "client" }}
          copy={false}
          detail={{ enabled: false }}
          window={{ enabled: false }}
          getRowHref={(artifact) => `/artifacts/${artifact.id}`}
          onRowOpen={handleOpen}
          rowActions={(artifact) => <div className="flex items-center gap-0.5"><Button variant="ghost" size="icon" className="size-7" onClick={() => handleNavigate(artifact.id)} title="Open full page"><FileText className="size-3.5" /></Button>{artifact.externalUrl && <a href={artifact.externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex size-7 items-center justify-center text-muted-foreground" title="View live"><ExternalLink className="size-3.5" /></a>}<Button variant="ghost" size="icon" className="size-7" onClick={() => handleArchive(artifact)} title="Archive"><ArchiveIcon className="size-3.5" /></Button><Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => handleDelete(artifact)} title="Delete"><Trash2 className="size-3.5" /></Button></div>}
        />
      )}

      {filtered.length > 0 && (
        <p className="px-2 pb-2 text-xs text-muted-foreground">
          {filtered.length}
          {filtered.length !== allArtifacts.length
            ? ` of ${allArtifacts.length}`
            : ""}{" "}
          {filtered.length === 1 ? "item" : "items"}
        </p>
      )}
    </div>
  );
}
