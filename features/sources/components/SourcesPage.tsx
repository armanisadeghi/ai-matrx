"use client";

/**
 * features/sources/components/SourcesPage.tsx — `/knowledge/library`, the
 * Sources page (SOURCE-CONVERGENCE §8.1).
 *
 * Every Source the person can read — a `docproc.processed_documents` row: an
 * uploaded file, a captured web page, a transcript, pasted text — in ONE
 * canonical table (`MatrxDataTable`, the pattern the suggestions page adopted
 * 2026-09-22). Direct Supabase reads under RLS with a declared scope (Mine /
 * the selected organization), never a server list endpoint.
 *
 * Champion: Readwise Reader's inbox — one list, dense, triaged fast. The page
 * opens on Saved; "All captures" (everything the platform captured for you,
 * saved or not) is one obvious toggle away. Captures sit here until someone
 * saves or files them — nothing is ever auto-deleted.
 *
 * Bulk: Save · Attach (the Save panel's picker) · Process now · Archive (the
 * platform's one archive; restorable from Trash and from this page's Archived
 * filter, where the bulk bar and each row's menu offer Restore). Every row also
 * has its own menu (Open · Archive / Restore). Add: upload · paste a URL ·
 * paste text · import a transcript. A row opens the document viewer.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  ClipboardType,
  ExternalLink,
  MoreHorizontal,
  FileAudio,
  Globe,
  Layers,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import {
  ArchiveFilter,
  Textarea,
  toArchiveFilter,
  type ArchiveFilterValue,
} from "@ai-matrx/design-system";
import { Input } from "@ai-matrx/design-system/controls";
import { ItemMenu } from "@ai-matrx/design-system/item";
import type { ItemMenuConfig } from "@ai-matrx/chat/ui/item-types";
import { archiveConfirmSentence } from "@/features/trash/archiveCopy";
import { restoreSource, trashSource } from "@/features/sources/sourceActions";
import { formatRelativeTime, formatCount } from "@ai-matrx/kit/format";
import { useEntityTitles } from "@ai-matrx/associations/react";
import { TapTargetButton, TapTargetButtonSolid } from "@ai-matrx/design-system/tap-target";
import { Badge } from "@/components/ui/badge";
import { SourceStageCell } from "@/features/sources/components/SourceStageCell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
// Delete blocks the page on purpose (policy ai-reachable-everywhere).
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { toast } from "@/lib/toast";
import { replaceAddressWithoutNavigating } from "@/lib/url-state/addressWithoutNavigating";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  selectOrganizationId,
} from "@/lib/redux/slices/appContextSlice";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { EntityOrgFilter } from "@/lib/entity-list/components/EntityOrgFilter";
import { EntityScopeTabs } from "@/lib/entity-list/components/EntityScopeTabs";
import type { EntityScopeCounts } from "@/lib/entity-list/types";
import { DEFAULT_LIST_SCOPE, makeScope, type ListScope } from "@/lib/list-scope/types";
import { fetchMyTeamReach, teamReachOrFilter } from "@/lib/list-scope/teamReach";
import { supabase } from "@/utils/supabase/client";
import { fileHandler } from "@/features/files/handler/handler";
import { useProcessingRunner } from "@/features/rag/hooks/useProcessingRunner";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { RagHubHeader } from "@/features/rag/components/shell/RagHubHeader";
import { ProcessingProgressSheet } from "@/features/rag/components/library/ProcessingProgressSheet";
import { LibraryTrashSheet } from "@/features/rag/components/library/LibraryTrashSheet";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { buildRagLibraryContextData } from "@/features/rag/agent-context/buildRagLibraryContextData";
import type { LibraryDocSummary } from "@/features/rag/types/library";
import { useScraperApi } from "@/features/scraper/hooks/useScraperApi";
import { ScrapeFailureNotice } from "@/features/scraper/parts/ScrapeFailureNotice";
import {
  keepSource,
  sourceRefusalSentence,
  landSource,
  sourceHref,
  type LandingNotice,
} from "@/features/sources/api/sourcesApi";
import { buildPastedTextLanding } from "@/features/sources/api/pastedText";
import { addFailureSentence } from "@/features/sources/addFailure";
import { processSourceNow } from "@/features/sources/api/processNow";
import {
  SaveSourcePanel,
  type SaveSourceItem,
} from "@/features/sources/SaveSourcePanel";
import {
  readSourceLaneCounts,
  useSources,
  type SourcesScope,
} from "@/features/sources/hooks/useSources";
import { useTranscriptEnds } from "@/features/sources/hooks/useTranscriptEnds";
import {
  DEFAULT_SAVED_FILTER,
  SOURCE_KIND_LABEL,
  applySavedFilter,
  attachmentTypeWords,
  captureClientLabel,
  captureWords,
  isFileCanonicalExtract,
  isSourceArchived,
  isSourceSaved,
  sourceKindGroup,
  sourceListedAt,
  sourceStage,
  type SourcesLane,
  stageCellState,
  stageCellLabel,
  STAGE_CELL_LABEL,
  transcriptLengthWords,
  transcriptSegmentCount,
  type SavedFilter,
  type SourceAttachment,
  type SourceFacts,
  type SourceListRow,
} from "@/features/sources/sourceRows";
import { cn } from "@/utils/cn";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { StaleDataNotice } from "@ai-matrx/design-system";
import { ReadFailure } from "@ai-matrx/design-system";

/** Canonical `ui_surface.name` this page emits (unchanged from the old library). */
const RAG_LIBRARY_SURFACE = "matrx-user/knowledge-library";

/**
 * The lanes this page answers, in the shell's vocabulary and order. A Source is read straight
 * from the table, so Shared / Public / System (which need their own readers) are not offered; a
 * lane that is absent never shows a number it could not measure.
 */
const SOURCES_LANES: readonly SourcesLane[] = ["all", "mine", "team", "orgs"];
const isSourcesLane = (v: string | null | undefined): v is SourcesLane =>
  !!v && (SOURCES_LANES as readonly string[]).includes(v);
type AddMode = null | "url" | "text";

interface SaveTarget {
  items: SaveSourceItem[];
  notices: LandingNotice[];
  defaultSave: boolean;
}

function errorSentence(error: unknown): string {
  return sourceRefusalSentence(error);
}

function toSaveItem(row: SourceListRow): SaveSourceItem {
  return {
    processedDocumentId: row.id,
    name: row.name,
    organizationId: row.organization_id,
    isFileExtract: isFileCanonicalExtract(row),
  };
}

function hostOf(identity: string | null): string | null {
  if (!identity) return null;
  try {
    return new URL(identity).host;
  } catch {
    return null;
  }
}

/** The old library surface's row shape, so the page keeps emitting its declared scope. */
function toLibrarySummary(
  row: SourceListRow,
  facts: SourceFacts | undefined,
): LibraryDocSummary {
  // The version people read — an edit's own chunks, never the capture's.
  const chunks = facts?.currentChunkCount ?? 0;
  return {
    id: row.id,
    name: row.name,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    mimeType: row.mime_type,
    totalPages: row.total_pages,
    pagesPersisted: row.total_pages ?? 0,
    chunks,
    embeddingsOai: 0,
    embeddingsVoyage: 0,
    dataStoreCount:
      facts?.attachments.filter((a) => a.target_type === "data_store").length ??
      0,
    hasStructuredJson: false,
    derivationKind: row.derivation_kind,
    parentProcessedId: row.parent_processed_id,
    status: chunks > 0 ? "ready" : "extracted",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function AttachedList({ attachments }: { attachments: SourceAttachment[] }) {
  const { titleFor } = useEntityTitles(
    attachments.map((a) => ({
      token: a.target_type,
      id: a.target_id,
      label: null,
    })),
  );
  return (
    <ul className="space-y-1">
      {attachments.map((a) => (
        <li
          key={`${a.target_type}:${a.target_id}`}
          className="flex items-center gap-2 text-xs"
        >
          <span className="w-24 shrink-0 text-muted-foreground">
            {attachmentTypeWords(a.target_type)}
          </span>
          <EntityRef
            token={a.target_type}
            id={a.target_id}
            name={titleFor({ token: a.target_type, id: a.target_id })}
          />
        </li>
      ))}
    </ul>
  );
}

function AttachedCell({
  facts,
  checking,
}: {
  facts: SourceFacts | undefined;
  checking: boolean;
}) {
  if (!facts)
    return (
      <span className="text-muted-foreground">
        {checking ? STAGE_CELL_LABEL.checking : STAGE_CELL_LABEL.read_failed}
      </span>
    );
  const n = facts.attachments.length;
  if (n === 0)
    return <span className="text-muted-foreground">Not attached</span>;
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <Paperclip className="h-3 w-3" />
          {n} {n === 1 ? "place" : "places"}
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <AttachedList attachments={facts.attachments} />
      </HoverCardContent>
    </HoverCard>
  );
}

export function SourcesPage() {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  // The ACTIVE org is only where new Sources are saved — it never narrows this list.
  const activeOrgId = useAppSelector(selectOrganizationId);
  // The lane: `?scope=` names one of SOURCES_LANES; absent opens on All (the platform default).
  // `?show=all` / `?show=saved` opens the page on that view (the Knowledge
  // home's count cards link here with it).
  const searchParams = useSearchParams();
  const [savedFilter, setSavedFilter] = useState<SavedFilter>(() => {
    const show = searchParams?.get("show");
    return show === "all" || show === "saved" ? show : DEFAULT_SAVED_FILTER;
  });
  const [search, setSearch] = useState("");
  // The server searches (the list is paged); typing waits a beat before asking.
  const [serverSearch, setServerSearch] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setServerSearch(search), 300);
    return () => window.clearTimeout(id);
  }, [search]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [urlInput, setUrlInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [textName, setTextName] = useState("");
  const [adding, setAdding] = useState(false);
  /** The last refusal from an Add dialog, shown IN the dialog (a toast can be missed). */
  const [addError, setAddError] = useState<string | null>(null);
  const [saveTarget, setSaveTarget] = useState<SaveTarget | null>(null);
  const [deleteRows, setDeleteRows] = useState<SourceListRow[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  // THE ARCHIVED-ITEMS LAW: `?archived=`, default Active only.
  const [archived, setArchived] = useState<ArchiveFilterValue>(() =>
    toArchiveFilter(searchParams?.get("archived"), "active"),
  );
  const changeArchived = (next: ArchiveFilterValue) => {
    setSelectedIds([]);
    setArchived(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "active") params.delete("archived");
    else params.set("archived", next);
    const qs = params.toString();
    replaceAddressWithoutNavigating(`${window.location.pathname}${qs ? `?${qs}` : ""}`);
  };
  const [bulkBusy, setBulkBusy] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [focusJobId, setFocusJobId] = useState<string | null>(null);
  const runner = useProcessingRunner();
  const {
    scrapeUrl,
    failure: scrapeFailure,
    reset: resetScrape,
  } = useScraperApi();

  // The page's organization filter: `?org_filter=`, default All organizations,
  // never seeded from the active org and never remembered.
  const [orgFilter, setOrgFilter] = useState<string | null>(
    () => searchParams?.get("org_filter") || null,
  );
  const changeOrgFilter = (id: string | null) => {
    setSelectedIds([]);
    setOrgFilter(id);
    const next = new URLSearchParams(window.location.search);
    if (id) next.set("org_filter", id);
    else next.delete("org_filter");
    const qs = next.toString();
    replaceAddressWithoutNavigating(`${window.location.pathname}${qs ? `?${qs}` : ""}`);
  };
  const [lane, setLane] = useState<SourcesLane>(() => {
    const word = searchParams?.get("scope");
    return isSourcesLane(word) ? word : (DEFAULT_LIST_SCOPE.kind as SourcesLane);
  });
  const changeLane = (next: ListScope) => {
    if (!isSourcesLane(next.kind)) return;
    setSelectedIds([]);
    setLane(next.kind);
    const params = new URLSearchParams(window.location.search);
    if (next.kind === DEFAULT_LIST_SCOPE.kind) params.delete("scope");
    else params.set("scope", next.kind);
    const qs = params.toString();
    replaceAddressWithoutNavigating(`${window.location.pathname}${qs ? `?${qs}` : ""}`);
  };
  // MY TEAM: the people I share a live team with, read once (`my_teammates`).
  const [teamReach, setTeamReach] = useState<
    | { phase: "loading" }
    | { phase: "ready"; filter: string | null }
    | { phase: "failed"; message: string }
  >({ phase: "loading" });
  const [teamReachKey, setTeamReachKey] = useState(0);
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    setTeamReach({ phase: "loading" });
    fetchMyTeamReach(null).then(
      (reach) => {
        if (!cancelled)
          setTeamReach({ phase: "ready", filter: teamReachOrFilter(reach, userId) });
      },
      (e: unknown) => {
        if (!cancelled)
          setTeamReach({
            phase: "failed",
            message: e instanceof Error ? e.message : "Your teams could not be read.",
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId, teamReachKey]);
  const teamFilter = teamReach.phase === "ready" ? teamReach.filter : null;
  // The team lane cannot be asked until the reach is known; every other lane never waits for it.
  const scope: SourcesScope | null =
    lane === "team" && teamReach.phase !== "ready"
      ? null
      : { kind: lane, organizationId: orgFilter, teamFilter };
  const {
    rows,
    facts,
    orgNames,
    orgNamesFailed,
    orgNameFailedIds,
    loading,
    error,
    factsError,
    factsLoading,
    factsFailed,
    factsRetrying,
    retryFacts,
    total,
    savedTotal,
    allTotal,
    hasMore,
    loadingMore,
    loadMore,
  } = useSources(scope, userId, refreshKey, {
    saved: savedFilter === "saved",
    search: serverSearch,
    archived,
  });
  // The lane tabs' numbers: one head count per lane under the org filter and the view.
  const [laneCounts, setLaneCounts] = useState<{
    byKind: EntityScopeCounts["byKind"];
    settled: boolean;
  }>({ byKind: {}, settled: false });
  const laneCountsKey = `${orgFilter ?? "all"}|${savedFilter}|${archived}|${userId}|${refreshKey}|${teamReach.phase}|${teamFilter ?? ""}`;
  useEffect(() => {
    if (!userId || teamReach.phase === "loading") return undefined;
    let cancelled = false;
    setLaneCounts((c) => ({ ...c, settled: false }));
    const lanes = teamReach.phase === "failed" ? SOURCES_LANES.filter((l) => l !== "team") : SOURCES_LANES;
    void readSourceLaneCounts(
      lanes,
      { organizationId: orgFilter, saved: savedFilter === "saved", teamFilter, archived },
      userId,
    ).then((counts) => {
      if (cancelled) return;
      const byKind: EntityScopeCounts["byKind"] = {};
      let failed = false;
      for (const [kind, n] of Object.entries(counts)) {
        if (typeof n === "number") byKind[kind as SourcesLane] = n;
        else failed = true;
      }
      setLaneCounts({ byKind, settled: !failed && teamReach.phase === "ready" });
    });
    return () => {
      cancelled = true;
    };
    // laneCountsKey carries every input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laneCountsKey]);
  const laneTabCounts = useMemo<EntityScopeCounts>(
    () => ({ byKind: laneCounts.byKind, narrow: {} }),
    [laneCounts.byKind],
  );
  const readOf = (id: string) => ({
    loading: factsLoading,
    failed: factsFailed.has(id),
    retrying: factsRetrying.has(id),
  });
  const visibleRows = applySavedFilter(rows, savedFilter);
  // A transcript's length and segment count, from facts the Source holds.
  const transcriptEnds = useTranscriptEnds(visibleRows);
  const transcriptFacts = (r: SourceListRow) =>
    transcriptLengthWords(
      transcriptSegmentCount(r),
      transcriptEnds.get(r.id) ?? null,
    );
  const countWords = (n: number | null) => formatCount(n, { unknown: "…" });
  const refresh = () => setRefreshKey((n) => n + 1);
  const byId = new Map(rows.map((r) => [r.id, r]));
  // THE SELECTION IS WHAT THE ACTIONS ACT ON (V6-B, 2026-10-01). The list is searched and paged
  // by the server, so a row selected under one search is no longer loaded under the next — the
  // bar said "2 Sources selected" while Archive acted on 1. Each selected row is kept as it was
  // when it was ticked (it was on screen then), and every action takes the whole selection.
  const [keptSelection, setKeptSelection] = useState<Map<string, SourceListRow>>(new Map());
  const changeSelection = (ids: string[]) => {
    setSelectedIds(ids);
    setKeptSelection((prev) => {
      const next = new Map<string, SourceListRow>();
      ids.forEach((id) => {
        const r = byId.get(id) ?? prev.get(id);
        if (r) next.set(id, r);
      });
      return next;
    });
  };
  const selectedRows = selectedIds
    .map((id) => byId.get(id) ?? keptSelection.get(id))
    .filter((r): r is SourceListRow => !!r);

  // ── Add ──────────────────────────────────────────────────────────────────

  const openSaveFor = (
    items: SaveSourceItem[],
    notices: LandingNotice[] = [],
    defaultSave = true,
  ) => setSaveTarget({ items, notices, defaultSave });

  const handleUpload = async (file: File) => {
    setUploading(true);
    const tid = toast.loading(`Uploading ${file.name}…`);
    try {
      const normalized = await fileHandler.upload(
        { kind: "file", file },
        // A Source is organization data (Arman 2026-09-26).
        { visibility: "internal" },
      );
      toast.dismiss(tid);
      if (!normalized.fileId) {
        toast.error(
          "The upload finished but the server did not return the file, so it could not be processed.",
        );
        return;
      }
      toast.success("Uploaded — processing it now.");
      refresh();
      const jobId = await runner.runForCldFile(
        normalized.fileId,
        file.name,
        `Upload + full pipeline (extract → clean → ${RAG_VOCAB.segmentStage} → embed)`,
      );
      setFocusJobId(jobId);
      setSheetOpen(true);
    } catch (err) {
      toast.dismiss(tid);
      toast.error(errorSentence(err));
    } finally {
      setUploading(false);
    }
  };

  const handleAddUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setAdding(true);
    setAddError(null);
    try {
      // Name the organization first: the scraper refuses without one, and the
      // person should be asked to choose — not told the page was unreadable.
      // org-refusal-presented-by: features/sources/addFailure.ts
      await ensureOrgId(null);
      const result = await scrapeUrl(
        /^https?:\/\//i.test(url) ? url : `https://${url}`,
      );
      // A failed read leaves the hook's `failure` set; the dialog renders it
      // (what happened and what to do) — nothing more to say here.
      if (!result) return;
      if (!result.processedDocumentId) {
        setAddError(
          result.sourceNotices[0]?.message ??
            "The page was read but did not become a Source, and the server did not say why. Try again.",
        );
        return;
      }
      setAddMode(null);
      setUrlInput("");
      resetScrape();
      setSavedFilter("all");
      refresh();
      openSaveFor(
        [
          {
            processedDocumentId: result.processedDocumentId,
            name: result.overview?.page_title || result.url,
          },
        ],
        result.sourceNotices,
      );
    } catch (err) {
      setAddError(addFailureSentence(err));
    } finally {
      setAdding(false);
    }
  };

  const handleAddText = async () => {
    if (!textInput.trim()) return;
    if (!userId) {
      setAddError(
        "Your sign-in is still loading, so nothing was added. Try again in a moment.",
      );
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const organizationId = await ensureOrgId(null);
      const body = await buildPastedTextLanding({
        text: textInput,
        name: textName,
        organizationId,
        userId,
      });
      const landed = await landSource(body);
      setAddMode(null);
      setTextInput("");
      setTextName("");
      setSavedFilter("all");
      refresh();
      openSaveFor(
        [
          {
            processedDocumentId: landed.processed_document_id,
            name: body.name,
            organizationId,
          },
        ],
        landed.notices ?? [],
      );
    } catch (err) {
      setAddError(addFailureSentence(err));
    } finally {
      setAdding(false);
    }
  };

  // ── Bulk ─────────────────────────────────────────────────────────────────

  const runBulk = async (
    label: string,
    targets: SourceListRow[],
    op: (row: SourceListRow) => Promise<string | null>,
  ) => {
    if (!targets.length) return;
    setBulkBusy(true);
    const refusals: string[] = [];
    const notes: string[] = [];
    for (const row of targets) {
      try {
        const note = await op(row);
        if (note) notes.push(note);
      } catch (err) {
        refusals.push(errorSentence(err));
      }
    }
    setBulkBusy(false);
    setSelectedIds([]);
    refresh();
    const done = targets.length - refusals.length;
    if (!refusals.length) {
      const extra = [...new Set(notes)][0];
      toast.success(
        `${label} ${done === 1 ? "1 Source" : `${done} Sources`}.${extra ? ` ${extra}` : ""}`,
      );
    } else {
      toast.error(
        `${label} ${done} of ${targets.length}. ${refusals[0]}${refusals.length > 1 ? ` (and ${refusals.length - 1} more)` : ""}`,
      );
    }
  };

  const bulkSave = (targets: SourceListRow[]) =>
    runBulk("Saved", targets, async (row) => {
      const landed = await keepSource(row.id, {
        organizationId: row.organization_id,
      });
      return landed.notices?.[0]?.message ?? null;
    });

  // Saving is the signal that starts processing (the server queues the
  // Source's CURRENT version — a person's edit when there is one); when the
  // organization's policy still defers it, the person's "Process now"
  // overrides — on the current version too, never the pre-edit capture.
  const processOne = async (row: SourceListRow) => {
    const landed = await keepSource(row.id, {
      organizationId: row.organization_id,
    });
    if (landed.intelligence === "queued") return "Processing has started.";
    const current = facts.get(row.id)?.currentDocumentId ?? row.id;
    const processed = await processSourceNow(current, {
      isFileExtract: current === row.id && isFileCanonicalExtract(row),
    });
    if (!processed.ok) throw new Error(processed.message);
    return processed.message;
  };

  const bulkProcess = (targets: SourceListRow[]) =>
    runBulk("Processing", targets, processOne);

  /** "Index stale — re-index": index the version people read now. */
  const reindex = (row: SourceListRow) =>
    runBulk("Re-indexing", [row], processOne);

  const confirmDelete = async () => {
    if (!deleteRows) return;
    setDeleting(true);
    const targets = deleteRows;
    // THE ONE ARCHIVE (`trashSource`): a file's own extract goes with its file.
    await runBulk("Archived", targets, trashSource);
    setDeleting(false);
    setDeleteRows(null);
  };

  /** Put archived Sources back through the one restore door. */
  const restoreRows = (targets: SourceListRow[]) =>
    runBulk("Restored", targets, restoreSource);

  /** Each row's own menu — the same actions as the bulk bar, one row at a time. */
  const rowMenu = (r: SourceListRow) => (): ItemMenuConfig => ({
    header: { title: r.name },
    sections: [
      {
        id: "open",
        items: [{ id: "open", label: "Open", icon: ExternalLink, kind: "link", href: sourceHref(r.id) }],
      },
      {
        id: "manage",
        items: [
          isSourceArchived(r)
            ? {
                id: "restore",
                label: "Restore",
                icon: ArchiveRestore,
                onSelect: () => void restoreRows([r]),
              }
            : {
                id: "archive",
                label: "Archive",
                icon: Archive,
                tone: "destructive",
                onSelect: () => setDeleteRows([r]),
              },
        ],
      },
    ],
  });

  // ── Columns ──────────────────────────────────────────────────────────────

  const columns: MatrxColumnDef<SourceListRow>[] = [
    {
      id: "name",
      header: "Name",
      accessorFn: (r) => r.name,
      cell: (r) => {
        const host = hostOf(r.canonical_identity);
        return (
          <div className="min-w-0">
            <Link
              href={sourceHref(r.id)}
              className="block truncate font-medium text-foreground hover:underline"
            >
              {r.name}
            </Link>
            {host ? (
              <span className="block truncate text-[11px] text-muted-foreground">
                {host}
              </span>
            ) : null}
          </div>
        );
      },
      filter: "text",
      width: 300,
    },
    {
      id: "kind",
      header: "Kind",
      accessorFn: (r) => SOURCE_KIND_LABEL[sourceKindGroup(r.source_kind)],
      cell: (r) => {
        const length = transcriptFacts(r);
        return (
          <div className="min-w-0">
            <span className="block truncate">
              {SOURCE_KIND_LABEL[sourceKindGroup(r.source_kind)]}
            </span>
            {length ? (
              <span className="block truncate text-[11px] text-muted-foreground">
                {length}
              </span>
            ) : null}
          </div>
        );
      },
      filter: "select",
      width: 130,
    },
    {
      id: "captured",
      header: "Captured by",
      accessorFn: (r) => captureWords(r),
      filterValue: (r) => captureClientLabel(r),
      filter: "select",
      width: 200,
    },
    {
      id: "created_at",
      header: "When",
      accessorFn: (r) => sourceListedAt(r),
      cell: (r) => (
        <span
          title={new Date(sourceListedAt(r)).toLocaleString()}
          className="text-muted-foreground"
        >
          {formatRelativeTime(sourceListedAt(r))}
        </span>
      ),
      filter: "date",
      width: 110,
    },
    {
      id: "saved",
      header: "Saved",
      accessorFn: (r) => (isSourceSaved(r) ? "Saved" : "Not saved"),
      cell: (r) =>
        isSourceSaved(r) ? (
          <Badge
            variant="outline"
            className="border-success/40 text-success"
            title={r.kept_at ? undefined : "Uploaded files count as saved."}
          >
            Saved
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Not saved
          </Badge>
        ),
      filter: "select",
      width: 100,
    },
    {
      id: "stage",
      header: "Stage",
      accessorFn: (r) =>
        stageCellLabel(stageCellState(facts.get(r.id), readOf(r.id), isSourceArchived(r))),
      cell: (r) => (
        <SourceStageCell
          facts={facts.get(r.id)}
          read={readOf(r.id)}
          busy={bulkBusy}
          onReindex={() => void reindex(r)}
          onRetryRead={() => retryFacts([r.id])}
          archived={isSourceArchived(r)}
        />
      ),
      filter: "select",
      width: 170,
    },
    {
      id: "attached",
      header: "Attached to",
      accessorFn: (r) => facts.get(r.id)?.attachments.length ?? 0,
      cell: (r) => (
        <AttachedCell
          facts={facts.get(r.id)}
          checking={
            stageCellState(facts.get(r.id), readOf(r.id)) === "checking"
          }
        />
      ),
      filter: false,
      width: 120,
    },
    {
      id: "organization",
      header: "Organization",
      accessorFn: (r) => {
        return (
          orgNames.get(r.organization_id) ??
          (factsLoading
            ? "…"
            : orgNameFailedIds.has(r.organization_id)
              ? "Couldn't load the organization's name"
              : "an organization you belong to")
        );
      },
      filter: "select",
      width: 150,
    },
    {
      id: "actions",
      header: "",
      accessorFn: () => "",
      sortable: false,
      filter: false,
      width: 44,
      cell: (r) => (
        // The menu is portaled, but React still bubbles its clicks through this cell to the
        // row — a menu choice must never also open the row.
        <span
          className="inline-flex"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <ItemMenu config={rowMenu(r)}>
            <button
              type="button"
              aria-label={`Actions for ${r.name}`}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </ItemMenu>
        </span>
      ),
    },
  ];

  // ── Agent surface (unchanged contract) ──────────────────────────────────

  const getScope = () =>
    buildRagLibraryContextData({
      view: "library",
      summary: null,
      documents: visibleRows.map((r) => toLibrarySummary(r, facts.get(r.id))),
      totalMatches: visibleRows.length,
      searchQuery: search,
      statusFilter: "all",
      listLoading: loading,
      listError: error,
      selectedDocumentId: null,
      jobs: runner.jobs,
      selectionText:
        typeof window !== "undefined"
          ? (window.getSelection()?.toString() ?? "")
          : "",
    });

  const buildWriteHandlers = () => ({
    library_filters: (value: unknown) => {
      const raw =
        typeof value === "string" ? (JSON.parse(value) as unknown) : value;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error(
          'library_filters expects an object such as {"search_query": "invoice"}.',
        );
      }
      const input = raw as Record<string, unknown>;
      const bad = Object.keys(input).filter(
        (k) => k !== "search_query" && k !== "status_filter",
      );
      if (bad.length)
        throw new Error(
          `library_filters received unknown key(s): ${bad.join(", ")}. Nothing was changed.`,
        );
      if ("status_filter" in input && input.status_filter !== "all") {
        throw new Error(
          'The Sources page no longer filters by pipeline status; only "all" (show every capture) is accepted. Nothing was changed.',
        );
      }
      if ("search_query" in input) {
        if (typeof input.search_query !== "string")
          throw new Error("library_filters.search_query expects a string.");
        setSearch(input.search_query);
      }
      if (input.status_filter === "all") setSavedFilter("all");
    },
    selected_document_id: (value: unknown) => {
      if (typeof value !== "string" || !value.trim()) {
        throw new Error(
          "selected_document_id expects a Source id listed on this page.",
        );
      }
      if (!byId.has(value.trim())) {
        throw new Error(
          `"${value}" is not a Source listed on this page, so nothing was opened.`,
        );
      }
      router.push(sourceHref(value.trim()));
    },
  });

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <SurfaceRuntimeProvider
      surfaceName={RAG_LIBRARY_SURFACE}
      getScope={getScope}
      getWriteHandlers={buildWriteHandlers}
      isEditable={false}
    >
      <RagHubHeader
        right={
          <>
            {/* KNOWLEDGE-HUB §6: this page keeps working until H6 retires it
                behind its parity checklist; the hub already lists every Source. */}
            <TapTargetButton
              icon={<Layers className="h-4 w-4" />}
              ariaLabel="Open in the Knowledge hub"
              label="Open in the Knowledge hub"
              href="/knowledge/hub?view=kind:processed_document&types=processed_document"
            />
            <input
              id="sources-upload-input"
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f);
                e.target.value = "";
              }}
            />
            <TapTargetButton
              icon={<Trash2 className="h-4 w-4" />}
              ariaLabel="Trash"
              onClick={() => setTrashOpen(true)}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <TapTargetButtonSolid
                  icon={<Plus className="h-4 w-4" />}
                  ariaLabel="Add a Source"
                  label={uploading ? "Uploading…" : "Add"}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() =>
                    document.getElementById("sources-upload-input")?.click()
                  }
                >
                  <Upload className="mr-2 h-4 w-4" /> Upload a file
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setAddMode("url")}>
                  <Link2 className="mr-2 h-4 w-4" /> Paste a web address
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setAddMode("text")}>
                  <ClipboardType className="mr-2 h-4 w-4" /> Paste text
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => router.push("/transcripts/studio")}
                >
                  <FileAudio className="mr-2 h-4 w-4" /> Import a transcript
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="flex h-full min-h-0 flex-col gap-2 overflow-auto px-3 pb-4 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4">
        {error && rows.length > 0 ? (
          // A refresh failed with rows on screen: keep them, say they may be stale.
          <StaleDataNotice
            hasData
            what="your Sources"
            detail={error}
            onRetry={refresh}
            retrying={loading}
          />
        ) : null}
        {factsError ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {factsError}{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              disabled={factsRetrying.size > 0}
              onClick={() => retryFacts([...factsFailed])}
            >
              {factsRetrying.size > 0 ? "Retrying…" : "Retry all"}
            </button>
            <ErrorAlchemyMenu error={factsError} />
          </p>
        ) : null}
        {orgNamesFailed ? (
          <StaleDataNotice
            hasData
            what="the organization names for some Sources"
            detail="Those rows are marked with the failed organization-name read."
            onRetry={refresh}
          />
        ) : null}
        {/* THE SHELL'S LANE ROW: All | Mine | My team | My Orgs, and the organization filter at
            its right end. A failed count shows no number (never 0). */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <EntityScopeTabs
            scope={makeScope(lane)}
            scopes={[...SOURCES_LANES]}
            exact
            counts={laneTabCounts}
            countsLoading={!laneCounts.settled}
            onChange={changeLane}
          />
          <div className="flex flex-wrap items-center gap-2">
            <ArchiveFilter
              value={archived}
              onValueChange={changeArchived}
              size="sm"
            />
            <EntityOrgFilter
              orgId={orgFilter}
              onChange={changeOrgFilter}
              counts={laneTabCounts}
            />
          </div>
        </div>

        {lane === "team" && teamReach.phase === "failed" ? (
          <ReadFailure
            error={teamReach.message}
            what="your team"
            onRetry={() => setTeamReachKey((n) => n + 1)}
          />
        ) : error && rows.length === 0 ? (
          // The list read failed: say so — the table's "No Sources yet." would be a lie.
          <ReadFailure error={error} what="your Sources" onRetry={refresh} />
        ) : (
        <MatrxDataTable<SourceListRow>
          tableId="knowledge-sources"
          data={visibleRows}
          columns={columns}
          getRowId={(r) => r.id}
          density="condensed"
          viewTabs={false}
          isLoading={loading && rows.length === 0}
          isFetching={loading && rows.length > 0}
          defaultSort={{ id: "created_at", direction: "desc" }}
          searchText={(r) => `${r.name} ${r.canonical_identity ?? ""}`}
          facets={{ enabled: true, totalRows: visibleRows.length }}
          // The pager pages the rows LOADED so far (100 Sources at a time). Every read — list,
          // lane tabs, Saved / All captures — counts one row per Source on the server
          // (`applyOneRowPerSource`), so the total is the same unit as the rows and the tabs.
          paginationLabelFormat={(start, end, shown) =>
            hasMore && total !== null
              ? `${start.toLocaleString()}–${end.toLocaleString()} of ${shown.toLocaleString()} loaded · ${total.toLocaleString()} Sources`
              : `${start.toLocaleString()}–${end.toLocaleString()} of ${shown.toLocaleString()}`
          }
          toolbar={{
            searchPlaceholder: "Search Sources",
            searchValue: search,
            onSearchChange: setSearch,
            facets: [
              {
                type: "button-group",
                id: "saved",
                label: "Show",
                value: savedFilter,
                defaultValue: DEFAULT_SAVED_FILTER,
                options: [
                  { value: "saved", label: `Saved (${countWords(savedTotal)})` },
                  { value: "all", label: `All captures (${countWords(allTotal)})` },
                ],
                onChange: (v) => setSavedFilter(v === "all" ? "all" : "saved"),
              },
            ],
            refresh: { onRefresh: refresh },
          }}
          selection={{
            selectedIds,
            onSelectedIdsChange: changeSelection,
            noun: "Source",
            actions: () => {
              const sel = selectedRows;
              return (
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  icon={<Save />}
                  type="submit"
                  variant="quiet"
                  disabled={bulkBusy}
                  onClick={() => void bulkSave(sel)}
                > Save
                </Button>
                <Button
                  icon={<Paperclip />}
                  type="submit"
                  variant="quiet"
                  disabled={bulkBusy}
                  onClick={() => openSaveFor(sel.map(toSaveItem), [], false)}
                > Attach
                </Button>
                <Button
                  icon={<Sparkles />}
                  type="submit"
                  variant="quiet"
                  disabled={bulkBusy}
                  onClick={() => void bulkProcess(sel)}
                > Process now
                </Button>
                {sel.some(isSourceArchived) ? (
                  <Button
                    icon={<ArchiveRestore />}
                    type="submit"
                    variant="quiet"
                    disabled={bulkBusy}
                    onClick={() => void restoreRows(sel.filter(isSourceArchived))}
                  > Restore
                  </Button>
                ) : null}
                {sel.some((r) => !isSourceArchived(r)) ? (
                  <Button
                    icon={<Archive />}
                    type="submit"
                    variant="quiet"
                    disabled={bulkBusy}
                    onClick={() => setDeleteRows(sel.filter((r) => !isSourceArchived(r)))}
                  > Archive
                  </Button>
                ) : null}
                {bulkBusy ? (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                ) : null}
              </div>
              );
            },
          }}
          getRowHref={(r) => sourceHref(r.id)}
          onRowOpen={(r) => router.push(sourceHref(r.id))}
          detail={{ enabled: false }}
          mobileCards={(r) => {
            const f = facts.get(r.id);
            return (
              <Link href={sourceHref(r.id)} className="block space-y-1 py-1">
                <div className="flex items-center gap-2">
                  {sourceKindGroup(r.source_kind) === "web_page" ? (
                    <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : null}
                  <span className="truncate font-medium">{r.name}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>
                    {SOURCE_KIND_LABEL[sourceKindGroup(r.source_kind)]}
                    {transcriptFacts(r) ? ` · ${transcriptFacts(r)}` : ""}
                  </span>
                  <span>·</span>
                  <span>{captureWords(r)}</span>
                  <span>·</span>
                  <span>{formatRelativeTime(sourceListedAt(r))}</span>
                  <span>·</span>
                  <span
                    className={cn(
                      isSourceSaved(r) ? "text-success" : undefined,
                    )}
                  >
                    {isSourceSaved(r) ? "Saved" : "Not saved"}
                    <ErrorAlchemyMenu />
                  </span>
                  {f ? (
                    <>
                      <span>·</span>
                      <span>{stageCellLabel(isSourceArchived(r) ? "archived" : sourceStage(f))}</span>
                      {f.attachments.length ? (
                        <>
                          <span>·</span>
                          <span>
                            {f.attachments.length}{" "}
                            {f.attachments.length === 1 ? "place" : "places"}
                          </span>
                        </>
                      ) : null}
                    </>
                  ) : factsFailed.has(r.id) ? (
                    <>
                      <span>·</span>
                      <span className="text-warning">
                        {STAGE_CELL_LABEL.read_failed}
                        <ErrorAlchemyMenu />
                      </span>
                    </>
                  ) : null}
                </div>
              </Link>
            );
          }}
          mobileCardsBreakpoint="sm"
          emptyState={{
            title: serverSearch.trim()
              ? `No Sources match "${serverSearch.trim()}".`
              : savedFilter === "saved" && (allTotal ?? 0) > 0
                ? "Nothing saved yet — your captures are under All captures."
                : "No Sources yet.",
            description:
              "Add one with Add: upload a file, paste a web address or text, or save a page from the browser extension.",
          }}
        />
        )}
        {/* ONE paging model: the table's "of N" counts the Sources loaded so far, so the footer
            never quotes a second total beside it — it only says there is more and offers the
            next page. */}
        {rows.length > 0 && total !== null && hasMore ? (
          <div className="flex items-center justify-center gap-3 py-2 text-xs text-muted-foreground">
            <span title="Sources are listed newest first, a page at a time. A page read again is one Source.">
              Showing the newest {formatCount(visibleRows.length)} Sources — more available
            </span>
            <Button
              icon={loadingMore ? (
                <Loader2 className="animate-spin" />
              ) : null}
              type="submit"
              variant="outline"
              disabled={loadingMore}
              onClick={loadMore}
            >
              Load more
            </Button>
          </div>
        ) : null}
      </div>

      {/* Paste a web address */}
      <Dialog
        open={addMode === "url"}
        onOpenChange={(o) => !o && setAddMode(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Paste a web address</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void handleAddUrl();
            }}
          >
            <Input
              autoFocus
              placeholder="https://example.com/article"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              We read the page and add it to your Sources; you choose where to
              save it next.
            </p>
            {scrapeFailure && !adding ? (
              <ScrapeFailureNotice failure={scrapeFailure} />
            ) : null}
            {addError && !adding ? (
              <p role="alert" className="text-sm text-destructive">
                {addError}
                <ErrorAlchemyMenu className="ml-auto" />
              </p>
            ) : null}
            <p
              className="text-right text-xs text-muted-foreground"
              aria-live="polite"
            >
              {!urlInput.trim()
                ? "Paste a web address to read the page."
                : null}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="quiet"
                onClick={() => setAddMode(null)}
              >
                Cancel
              </Button>
              <Button
                icon={adding ? (
                  <Loader2 className="animate-spin" />
                ) : null}
                variant="primary"
                type="submit"
                disabled={adding || !urlInput.trim()}
              >
                Read the page
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Paste text */}
      <Dialog
        open={addMode === "text"}
        onOpenChange={(o) => !o && setAddMode(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Paste text</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Name (optional — the first line is used)"
              value={textName}
              onChange={(e) => setTextName(e.target.value)}
            />
            <Textarea
              autoFocus
              rows={10}
              placeholder="Paste the text here"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
            />
            {addError && !adding ? (
              <p role="alert" className="text-sm text-destructive">
                {addError}
                <ErrorAlchemyMenu className="ml-auto" />
              </p>
            ) : null}
            <p
              className="text-right text-xs text-muted-foreground"
              aria-live="polite"
            >
              {!textInput.trim() ? "Paste or type some text to add it." : null}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="submit"
                variant="quiet"
                onClick={() => setAddMode(null)}
              >
                Cancel
              </Button>
              <Button
                icon={adding ? (
                  <Loader2 className="animate-spin" />
                ) : null}
                type="submit"
                variant="primary"
                disabled={adding || !textInput.trim()}
                onClick={() => void handleAddText()}
              >
                Add to Sources
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save / Attach */}
      <Dialog
        open={!!saveTarget}
        onOpenChange={(o) => !o && setSaveTarget(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {saveTarget?.defaultSave === false ? "Attach" : "Save"}{" "}
              {saveTarget && saveTarget.items.length === 1
                ? (saveTarget.items[0].name ?? "this Source")
                : `${saveTarget?.items.length ?? 0} Sources`}
            </DialogTitle>
          </DialogHeader>
          {saveTarget ? (
            <SaveSourcePanel
              sources={saveTarget.items}
              landingNotices={saveTarget.notices}
              defaultSave={saveTarget.defaultSave}
              embedded
              onSettled={refresh}
              onCancel={() => setSaveTarget(null)}
              onSaved={() => {
                setSaveTarget(null);
                setSelectedIds([]);
                refresh();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Archive (the one archive; Restore from this page's Archived only filter, or Trash) */}
      <AlertDialog
        open={!!deleteRows}
        onOpenChange={(o) => !o && !deleting && setDeleteRows(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Archive{" "}
              {deleteRows?.length === 1
                ? `"${deleteRows[0].name}"`
                : `${deleteRows?.length ?? 0} Sources`}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archiveConfirmSentence(
                deleteRows?.length === 1 ? `"${deleteRows[0].name}"` : "these Sources",
                { count: deleteRows?.length ?? 1, restoreFrom: "archive_filter" },
              )}
              {deleteRows?.some(isFileCanonicalExtract)
                ? " An uploaded file's Source is archived together with its file."
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="submit"
              variant="quiet"
              onClick={() => setDeleteRows(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              icon={deleting ? (
                <Loader2 className="animate-spin" />
              ) : null}
              type="submit"
              variant="danger"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              Archive
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LibraryTrashSheet
        open={trashOpen}
        onOpenChange={setTrashOpen}
        onMutated={refresh}
      />
      <ProcessingProgressSheet
        open={sheetOpen}
        onOpenChange={(o) => {
          setSheetOpen(o);
          if (!o) refresh();
        }}
        jobs={runner.jobs}
        focusJobId={focusJobId}
        onCancel={runner.cancel}
        onDismiss={runner.dismiss}
        onCancelAll={runner.cancelAll}
        onDismissAll={runner.dismissAll}
      />
    </SurfaceRuntimeProvider>
  );
}
