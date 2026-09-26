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
 * Bulk: Save · Attach (the Save panel's picker) · Process now · Delete (the
 * row's soft delete; restorable from Trash). Add: upload · paste a URL ·
 * paste text · import a transcript. A row opens the document viewer.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ClipboardType,
  FileAudio,
  Globe,
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
import { Input, Textarea } from "@ai-matrx/design-system";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { useEntityTitles } from "@ai-matrx/associations/react";
import { TapTargetButton, TapTargetButtonSolid } from "@ai-matrx/tap-target";
import { Badge } from "@/components/ui/badge";
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
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  selectOrganizationId,
  selectOrganizationName,
} from "@/lib/redux/slices/appContextSlice";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { supabase } from "@/utils/supabase/client";
import { ragDb } from "@/utils/supabase/ragDb";
import { writeOne } from "@/utils/supabase/writeOne";
import { fileHandler } from "@/features/files/handler/handler";
import { useProcessingRunner } from "@/features/rag/hooks/useProcessingRunner";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { RagHubHeader } from "@/features/rag/components/shell/RagHubHeader";
import { ProcessingProgressSheet } from "@/features/rag/components/library/ProcessingProgressSheet";
import { LibraryTrashSheet } from "@/features/rag/components/library/LibraryTrashSheet";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
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
  useSources,
  type SourcesScope,
} from "@/features/sources/hooks/useSources";
import { useTranscriptEnds } from "@/features/sources/hooks/useTranscriptEnds";
import {
  DEFAULT_SAVED_FILTER,
  SOURCE_KIND_LABEL,
  SOURCE_STAGE_LABEL,
  applySavedFilter,
  attachmentTypeWords,
  captureClientLabel,
  captureWords,
  isFileCanonicalExtract,
  isSourceSaved,
  sourceKindGroup,
  sourceStage,
  stageCellState,
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

/** Canonical `ui_surface.name` this page emits (unchanged from the old library). */
const RAG_LIBRARY_SURFACE = "matrx-user/knowledge-library";

type ScopeChoice = "mine" | "org";
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

/**
 * The stage of the version people read. "Index stale" carries its remedy: one
 * click indexes the current version (the old chunks are replaced when it
 * finishes).
 */
function StageCell({
  facts,
  read,
  busy,
  onReindex,
  onRetryRead,
}: {
  facts: SourceFacts | undefined;
  read: { loading: boolean; failed: boolean; retrying: boolean };
  busy: boolean;
  onReindex: () => void;
  onRetryRead: () => void;
}) {
  const state = stageCellState(facts, read);
  if (state === "checking")
    return (
      <span className="text-xs text-muted-foreground">
        {STAGE_CELL_LABEL.checking}
      </span>
    );
  if (state === "read_failed")
    return (
      <span className="flex items-center gap-1.5 text-xs text-warning">
        <span title="This row's status could not be read from the server. Other rows are unaffected.">
          {STAGE_CELL_LABEL.read_failed}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRetryRead();
          }}
        >
          Retry
        </Button>
      </span>
    );
  if (state !== "stale")
    return (
      <span
        className={cn(
          "text-xs",
          state === "not_searchable" && "text-muted-foreground",
        )}
      >
        {SOURCE_STAGE_LABEL[state]}
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-xs text-warning">
      <span title="Searches still answer with this Source's previous text; its current version is not indexed yet.">
        Index stale
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-6 px-2 text-xs"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onReindex();
        }}
      >
        Re-index
      </Button>
    </span>
  );
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
  const activeOrgId = useAppSelector(selectOrganizationId);
  const activeOrgName = useAppSelector(selectOrganizationName);
  const [scopeChoice, setScopeChoice] = useState<ScopeChoice>("mine");
  const [savedFilter, setSavedFilter] =
    useState<SavedFilter>(DEFAULT_SAVED_FILTER);
  const [search, setSearch] = useState("");
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

  const scope: SourcesScope | null =
    scopeChoice === "mine"
      ? { kind: "mine" }
      : activeOrgId
        ? { kind: "orgs", organizationId: activeOrgId }
        : null;
  const {
    rows,
    facts,
    orgNames,
    loading,
    error,
    factsError,
    factsLoading,
    factsFailed,
    factsRetrying,
    retryFacts,
  } = useSources(scope, userId, refreshKey);
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
  const savedCount = rows.filter(isSourceSaved).length;
  const refresh = () => setRefreshKey((n) => n + 1);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const selectedRows = selectedIds
    .map((id) => byId.get(id))
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
      await ensureOrgId(activeOrgId);
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
      const organizationId = await ensureOrgId(activeOrgId);
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
    await runBulk("Moved to the trash:", targets, async (row) => {
      if (isFileCanonicalExtract(row)) {
        // A file's own extract goes with its file (and comes back with it).
        const { error: rpcError } = await ragDb(supabase).rpc(
          "fn_delete_library_document_and_source",
          { p_id: row.id },
        );
        if (rpcError)
          throw new Error(
            `"${row.name}" and its file could not be moved to the trash. You may not be allowed to delete them.`,
          );
        return null;
      }
      await writeOne(
        supabase
          .schema("docproc")
          .from("processed_documents")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", row.id)
          .is("deleted_at", null)
          .select("id"),
        { action: "delete", noun: "Source" },
      );
      return null;
    });
    setDeleting(false);
    setDeleteRows(null);
  };

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
      accessorFn: (r) => r.created_at,
      cell: (r) => (
        <span
          title={new Date(r.created_at).toLocaleString()}
          className="text-muted-foreground"
        >
          {formatRelativeTime(r.created_at)}
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
      accessorFn: (r) => {
        const st = stageCellState(facts.get(r.id), readOf(r.id));
        return st === "checking" || st === "read_failed"
          ? STAGE_CELL_LABEL[st]
          : SOURCE_STAGE_LABEL[st];
      },
      cell: (r) => (
        <StageCell
          facts={facts.get(r.id)}
          read={readOf(r.id)}
          busy={bulkBusy}
          onReindex={() => void reindex(r)}
          onRetryRead={() => retryFacts([r.id])}
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
          (factsLoading ? "…" : "an organization you belong to")
        );
      },
      filter: "select",
      width: 150,
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

  const scopeLabel = activeOrgName
    ? `Anyone in ${activeOrgName}`
    : "Anyone in my organization";

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
        {error ? (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            role="alert"
          >
            {error}
            <ErrorAlchemyMenu className="ml-auto" />
          </div>
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
        {scopeChoice === "org" && !activeOrgId ? (
          <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
            Choose an organization in the organization picker to see its
            Sources.
          </p>
        ) : null}

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
                  { value: "saved", label: `Saved (${savedCount})` },
                  { value: "all", label: `All captures (${rows.length})` },
                ],
                onChange: (v) => setSavedFilter(v === "all" ? "all" : "saved"),
              },
              {
                type: "button-group",
                id: "scope",
                label: "Captured by",
                value: scopeChoice,
                defaultValue: "mine",
                options: [
                  { value: "mine", label: "Me" },
                  { value: "org", label: scopeLabel },
                ],
                onChange: (v) => {
                  setSelectedIds([]);
                  setScopeChoice(v === "org" ? "org" : "mine");
                },
              },
            ],
            refresh: { onRefresh: refresh },
          }}
          selection={{
            selectedIds,
            onSelectedIdsChange: setSelectedIds,
            noun: "Source",
            actions: (sel) => (
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs"
                  disabled={bulkBusy}
                  onClick={() => void bulkSave(sel)}
                >
                  <Save className="h-3 w-3" /> Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs"
                  disabled={bulkBusy}
                  onClick={() => openSaveFor(sel.map(toSaveItem), [], false)}
                >
                  <Paperclip className="h-3 w-3" /> Attach
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs"
                  disabled={bulkBusy}
                  onClick={() => void bulkProcess(sel)}
                >
                  <Sparkles className="h-3 w-3" /> Process now
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs text-destructive hover:bg-destructive/10"
                  disabled={bulkBusy}
                  onClick={() => setDeleteRows(sel)}
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </Button>
                {bulkBusy ? (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                ) : null}
              </div>
            ),
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
                  <span>{formatRelativeTime(r.created_at)}</span>
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
                      <span>{SOURCE_STAGE_LABEL[sourceStage(f)]}</span>
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
          copy={false}
          emptyState={{
            title:
              savedFilter === "saved"
                ? rows.length > 0
                  ? "Nothing saved yet — your captures are under All captures."
                  : "No Sources yet."
                : "No Sources yet.",
            description:
              "Add one with Add: upload a file, paste a web address or text, or save a page from the browser extension.",
          }}
        />
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
                variant="ghost"
                size="sm"
                onClick={() => setAddMode(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={adding || !urlInput.trim()}
              >
                {adding ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : null}
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
                variant="ghost"
                size="sm"
                onClick={() => setAddMode(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={adding || !textInput.trim()}
                onClick={() => void handleAddText()}
              >
                {adding ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : null}
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

      {/* Delete */}
      <AlertDialog
        open={!!deleteRows}
        onOpenChange={(o) => !o && !deleting && setDeleteRows(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Move{" "}
              {deleteRows?.length === 1
                ? `"${deleteRows[0].name}"`
                : `${deleteRows?.length ?? 0} Sources`}{" "}
              to the trash?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Moves the selected Sources and their searchable pieces to the
              trash. Restorable from the trash.
              {deleteRows?.some(isFileCanonicalExtract)
                ? " An uploaded file's Source goes to the trash together with its file."
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteRows(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Move to trash
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
