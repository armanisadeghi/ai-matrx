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
  RefreshCw,
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
import { isOrganizationSelectionCancelled } from "@/lib/organization/organization-gate";
import { BackendApiError } from "@/lib/api/errors";
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
import {
  keepSource,
  landSource,
  sourceHref,
  type LandingNotice,
} from "@/features/sources/api/sourcesApi";
import { buildPastedTextLanding } from "@/features/sources/api/pastedText";
import { processSourceNow } from "@/features/sources/api/processNow";
import { SaveSourcePanel, type SaveSourceItem } from "@/features/sources/SaveSourcePanel";
import { useSources, type SourcesScope } from "@/features/sources/hooks/useSources";
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
  type SavedFilter,
  type SourceAttachment,
  type SourceFacts,
  type SourceListRow,
} from "@/features/sources/sourceRows";
import { cn } from "@/utils/cn";

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
  if (error instanceof BackendApiError) return error.userMessage;
  if (error instanceof Error && error.message) return error.message;
  return "The server did not say why.";
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
function toLibrarySummary(row: SourceListRow, facts: SourceFacts | undefined): LibraryDocSummary {
  const chunks = facts?.chunkCount ?? 0;
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
    dataStoreCount: facts?.attachments.filter((a) => a.target_type === "data_store").length ?? 0,
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
    attachments.map((a) => ({ token: a.target_type, id: a.target_id, label: null })),
  );
  return (
    <ul className="space-y-1">
      {attachments.map((a) => (
        <li key={`${a.target_type}:${a.target_id}`} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 text-muted-foreground">{attachmentTypeWords(a.target_type)}</span>
          <EntityRef token={a.target_type} id={a.target_id} name={titleFor({ token: a.target_type, id: a.target_id })} />
        </li>
      ))}
    </ul>
  );
}

function AttachedCell({ facts, loading }: { facts: SourceFacts | undefined; loading: boolean }) {
  if (!facts) return <span className="text-muted-foreground">{loading ? "Checking…" : "Unknown"}</span>;
  const n = facts.attachments.length;
  if (n === 0) return <span className="text-muted-foreground">Not attached</span>;
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline">
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
  const [savedFilter, setSavedFilter] = useState<SavedFilter>(DEFAULT_SAVED_FILTER);
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [urlInput, setUrlInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [textName, setTextName] = useState("");
  const [adding, setAdding] = useState(false);
  const [saveTarget, setSaveTarget] = useState<SaveTarget | null>(null);
  const [deleteRows, setDeleteRows] = useState<SourceListRow[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [focusJobId, setFocusJobId] = useState<string | null>(null);
  const runner = useProcessingRunner();
  const { scrapeUrl } = useScraperApi();

  const scope: SourcesScope | null =
    scopeChoice === "mine"
      ? { kind: "mine" }
      : activeOrgId
        ? { kind: "orgs", organizationId: activeOrgId }
        : null;
  const { rows, facts, orgNames, loading, error, factsError, factsLoading } = useSources(scope, userId, refreshKey);
  const visibleRows = applySavedFilter(rows, savedFilter);
  const savedCount = rows.filter(isSourceSaved).length;
  const refresh = () => setRefreshKey((n) => n + 1);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const selectedRows = selectedIds.map((id) => byId.get(id)).filter((r): r is SourceListRow => !!r);

  // ── Add ──────────────────────────────────────────────────────────────────

  const openSaveFor = (items: SaveSourceItem[], notices: LandingNotice[] = [], defaultSave = true) =>
    setSaveTarget({ items, notices, defaultSave });

  const handleUpload = async (file: File) => {
    setUploading(true);
    const tid = toast.loading(`Uploading ${file.name}…`);
    try {
      const normalized = await fileHandler.upload({ kind: "file", file }, { visibility: "personal" });
      toast.dismiss(tid);
      if (!normalized.fileId) {
        toast.error("The upload finished but the server did not return the file, so it could not be processed.");
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
    try {
      const result = await scrapeUrl(/^https?:\/\//i.test(url) ? url : `https://${url}`);
      if (!result) {
        toast.error("That page could not be read. Check the address and try again.");
        return;
      }
      if (!result.processedDocumentId) {
        toast.error(result.sourceNotices[0]?.message ?? "The page was read but did not become a Source, and the server did not say why.");
        return;
      }
      setAddMode(null);
      setUrlInput("");
      setSavedFilter("all");
      refresh();
      openSaveFor(
        [{ processedDocumentId: result.processedDocumentId, name: result.overview?.page_title || result.url }],
        result.sourceNotices,
      );
    } catch (err) {
      toast.error(errorSentence(err));
    } finally {
      setAdding(false);
    }
  };

  const handleAddText = async () => {
    if (!textInput.trim() || !userId) return;
    setAdding(true);
    try {
      const organizationId = await ensureOrgId(activeOrgId);
      const body = await buildPastedTextLanding({ text: textInput, name: textName, organizationId, userId });
      const landed = await landSource(body);
      setAddMode(null);
      setTextInput("");
      setTextName("");
      setSavedFilter("all");
      refresh();
      openSaveFor(
        [{ processedDocumentId: landed.processed_document_id, name: body.name, organizationId }],
        landed.notices ?? [],
      );
    } catch (err) {
      if (isOrganizationSelectionCancelled(err)) return;
      toast.error(errorSentence(err));
    } finally {
      setAdding(false);
    }
  };

  // ── Bulk ─────────────────────────────────────────────────────────────────

  const runBulk = async (label: string, targets: SourceListRow[], op: (row: SourceListRow) => Promise<string | null>) => {
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
      toast.success(`${label} ${done === 1 ? "1 Source" : `${done} Sources`}.${extra ? ` ${extra}` : ""}`);
    } else {
      toast.error(`${label} ${done} of ${targets.length}. ${refusals[0]}${refusals.length > 1 ? ` (and ${refusals.length - 1} more)` : ""}`);
    }
  };

  const bulkSave = (targets: SourceListRow[]) =>
    runBulk("Saved", targets, async (row) => {
      const landed = await keepSource(row.id, { organizationId: row.organization_id });
      return landed.notices?.[0]?.message ?? null;
    });

  const bulkProcess = (targets: SourceListRow[]) =>
    runBulk("Processing", targets, async (row) => {
      // Saving is the signal that starts processing; when the organization's
      // policy still defers it, the person's "Process now" overrides.
      const landed = await keepSource(row.id, { organizationId: row.organization_id });
      if (landed.intelligence === "queued") return "Processing has started.";
      const processed = await processSourceNow(row.id, { isFileExtract: isFileCanonicalExtract(row) });
      if (!processed.ok) throw new Error(processed.message);
      return processed.message;
    });

  const confirmDelete = async () => {
    if (!deleteRows) return;
    setDeleting(true);
    const targets = deleteRows;
    await runBulk("Moved to the trash:", targets, async (row) => {
      if (isFileCanonicalExtract(row)) {
        // A file's own extract goes with its file (and comes back with it).
        const { error: rpcError } = await ragDb(supabase).rpc("fn_delete_library_document_and_source", { p_id: row.id });
        if (rpcError) throw new Error(`"${row.name}" and its file could not be moved to the trash. You may not be allowed to delete them.`);
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
            <Link href={sourceHref(r.id)} className="block truncate font-medium text-foreground hover:underline">
              {r.name}
            </Link>
            {host ? <span className="block truncate text-[11px] text-muted-foreground">{host}</span> : null}
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
      filter: "select",
      width: 110,
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
        <span title={new Date(r.created_at).toLocaleString()} className="text-muted-foreground">
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
          <Badge variant="outline" className="border-success/40 text-success" title={r.kept_at ? undefined : "Uploaded files count as saved."}>
            Saved
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">Not saved</Badge>
        ),
      filter: "select",
      width: 100,
    },
    {
      id: "stage",
      header: "Stage",
      accessorFn: (r) => {
        const f = facts.get(r.id);
        return f ? SOURCE_STAGE_LABEL[sourceStage(r, f)] : factsLoading ? "Checking…" : "Unknown";
      },
      filter: "select",
      width: 110,
    },
    {
      id: "attached",
      header: "Attached to",
      accessorFn: (r) => facts.get(r.id)?.attachments.length ?? 0,
      cell: (r) => <AttachedCell facts={facts.get(r.id)} loading={factsLoading} />,
      filter: false,
      width: 120,
    },
    {
      id: "organization",
      header: "Organization",
      accessorFn: (r) =>
        r.visibility === "personal" ? "Personal" : (orgNames.get(r.organization_id) ?? (factsLoading ? "Checking…" : "An organization you belong to")),
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
      selectionText: typeof window !== "undefined" ? (window.getSelection()?.toString() ?? "") : "",
    });

  const buildWriteHandlers = () => ({
    library_filters: (value: unknown) => {
      const raw = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("library_filters expects an object such as {\"search_query\": \"invoice\"}.");
      }
      const input = raw as Record<string, unknown>;
      const bad = Object.keys(input).filter((k) => k !== "search_query" && k !== "status_filter");
      if (bad.length) throw new Error(`library_filters received unknown key(s): ${bad.join(", ")}. Nothing was changed.`);
      if ("status_filter" in input && input.status_filter !== "all") {
        throw new Error(
          "The Sources page no longer filters by pipeline status; only \"all\" (show every capture) is accepted. Nothing was changed.",
        );
      }
      if ("search_query" in input) {
        if (typeof input.search_query !== "string") throw new Error("library_filters.search_query expects a string.");
        setSearch(input.search_query);
      }
      if (input.status_filter === "all") setSavedFilter("all");
    },
    selected_document_id: (value: unknown) => {
      if (typeof value !== "string" || !value.trim()) {
        throw new Error("selected_document_id expects a Source id listed on this page.");
      }
      if (!byId.has(value.trim())) {
        throw new Error(`"${value}" is not a Source listed on this page, so nothing was opened.`);
      }
      router.push(sourceHref(value.trim()));
    },
  });

  // ── Render ───────────────────────────────────────────────────────────────

  const scopeLabel = activeOrgName ? activeOrgName : "My organization";

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
            <TapTargetButton icon={<Trash2 className="h-4 w-4" />} ariaLabel="Trash" onClick={() => setTrashOpen(true)} />
            <TapTargetButton icon={<RefreshCw className="h-4 w-4" />} ariaLabel="Refresh" onClick={refresh} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <TapTargetButtonSolid icon={<Plus className="h-4 w-4" />} ariaLabel="Add a Source" label={uploading ? "Uploading…" : "Add"} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => document.getElementById("sources-upload-input")?.click()}>
                  <Upload className="mr-2 h-4 w-4" /> Upload a file
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setAddMode("url")}>
                  <Link2 className="mr-2 h-4 w-4" /> Paste a web address
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setAddMode("text")}>
                  <ClipboardType className="mr-2 h-4 w-4" /> Paste text
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push("/transcripts/studio")}>
                  <FileAudio className="mr-2 h-4 w-4" /> Import a transcript
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="flex h-full min-h-0 flex-col gap-2 overflow-auto px-3 pb-4 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4">
        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
            {error}
          </div>
        ) : null}
        {factsError ? <p className="text-xs text-amber-600 dark:text-amber-400">{factsError}</p> : null}
        {scopeChoice === "org" && !activeOrgId ? (
          <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
            Choose an organization in the organization picker to see its shared Sources.
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
            titleCount: { value: visibleRows.length, label: savedFilter === "saved" ? "saved" : "captures" },
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
                label: "Whose",
                value: scopeChoice,
                defaultValue: "mine",
                options: [
                  { value: "mine", label: "Mine" },
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
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={bulkBusy} onClick={() => void bulkSave(sel)}>
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
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={bulkBusy} onClick={() => void bulkProcess(sel)}>
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
                {bulkBusy ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : null}
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
                  {sourceKindGroup(r.source_kind) === "web_page" ? <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
                  <span className="truncate font-medium">{r.name}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>{SOURCE_KIND_LABEL[sourceKindGroup(r.source_kind)]}</span>
                  <span>·</span>
                  <span>{captureWords(r)}</span>
                  <span>·</span>
                  <span>{formatRelativeTime(r.created_at)}</span>
                  <span>·</span>
                  <span className={cn(isSourceSaved(r) ? "text-success" : undefined)}>{isSourceSaved(r) ? "Saved" : "Not saved"}</span>
                  {f ? (
                    <>
                      <span>·</span>
                      <span>{SOURCE_STAGE_LABEL[sourceStage(r, f)]}</span>
                      {f.attachments.length ? (
                        <>
                          <span>·</span>
                          <span>
                            {f.attachments.length} {f.attachments.length === 1 ? "place" : "places"}
                          </span>
                        </>
                      ) : null}
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
      <Dialog open={addMode === "url"} onOpenChange={(o) => !o && setAddMode(null)}>
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
            <Input autoFocus placeholder="https://example.com/article" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} />
            <p className="text-xs text-muted-foreground">We read the page and add it to your Sources; you choose where to save it next.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAddMode(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={adding || !urlInput.trim()}>
                {adding ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Read the page
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Paste text */}
      <Dialog open={addMode === "text"} onOpenChange={(o) => !o && setAddMode(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Paste text</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Name (optional — the first line is used)" value={textName} onChange={(e) => setTextName(e.target.value)} />
            <Textarea autoFocus rows={10} placeholder="Paste the text here" value={textInput} onChange={(e) => setTextInput(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAddMode(null)}>
                Cancel
              </Button>
              <Button size="sm" disabled={adding || !textInput.trim()} onClick={() => void handleAddText()}>
                {adding ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Add to Sources
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save / Attach */}
      <Dialog open={!!saveTarget} onOpenChange={(o) => !o && setSaveTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{saveTarget?.defaultSave === false ? "Attach" : "Save"}</DialogTitle>
          </DialogHeader>
          {saveTarget ? (
            <SaveSourcePanel
              sources={saveTarget.items}
              landingNotices={saveTarget.notices}
              defaultSave={saveTarget.defaultSave}
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
      <AlertDialog open={!!deleteRows} onOpenChange={(o) => !o && !deleting && setDeleteRows(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Move {deleteRows?.length === 1 ? `"${deleteRows[0].name}"` : `${deleteRows?.length ?? 0} Sources`} to the trash?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Moves the selected Sources and their searchable pieces to the trash. Restorable from the trash.
              {deleteRows?.some(isFileCanonicalExtract)
                ? " An uploaded file's Source goes to the trash together with its file."
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="ghost" onClick={() => setDeleteRows(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()} disabled={deleting}>
              {deleting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Move to trash
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LibraryTrashSheet open={trashOpen} onOpenChange={setTrashOpen} onMutated={refresh} />
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
