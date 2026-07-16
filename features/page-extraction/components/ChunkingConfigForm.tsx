/**
 * features/page-extraction/components/ChunkingConfigForm.tsx
 *
 * Content Extractor right-panel host. Renders ONE of three states:
 *
 *   • LIST-ONLY  — no template selected and not editing. Show the saved
 *                  list + a "New template" button. Nothing else.
 *   • READ-ONLY  — a saved template is selected. Show its details
 *                  (agent, pages, chunk size, variable wiring) plus
 *                  Edit + Run buttons. No form noise.
 *   • EDITING    — the user clicked Edit, New, or saved a brand-new
 *                  draft. The full editor (agent + page range + chunk
 *                  size + variable wiring via `VariableMappingEditor`).
 *
 * The state is driven by:
 *   - `selectedJobId`     — currently-loaded saved template, if any.
 *   - `editingByFile[id]` — boolean (Redux) flipped by user actions.
 *
 * The editor used to be always-rendered, which buried the "just run
 * this" flow under a wall of inputs and falsely told the user variables
 * were "unmapped" (no mapping UI was wired). With the new
 * `matrx-user/extractor-chunker` surface + `VariableMappingEditor`, the
 * full surface-value catalog is available as dropdowns, the legacy
 * heuristic is opt-in via an "Auto-suggest" button, and the user only
 * sees the editor when they're actually editing.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Loader2,
  PanelRight,
  Plus,
  Save,
  Sparkles,
} from "lucide-react";
import {
  upsertJobInCache,
  useExtractionJobs,
} from "@/features/page-extraction/hooks/useExtractionJobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useToastManager } from "@/hooks/useToastManager";
import {
  selectIsAdmin,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { selectIsDebugMode } from "@/lib/redux/preferences/adminDebugSlice";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { fetchFullAgent } from "@/features/agents/redux/agent-definition/thunks";
import {
  clearDraft,
  clearRun,
  ensureDraft,
  invalidateResults,
  patchDraft,
  selectJobForFile,
  setEditing,
} from "@/features/page-extraction/redux/pageExtractionSlice";
import {
  selectDraftForFile,
  selectIsEditingForFile,
  selectSelectedJobForFile,
} from "@/features/page-extraction/redux/selectors";
import { useChunkPreview } from "@/features/page-extraction/hooks/useChunkPreview";
import { useExtractionRunLauncher } from "@/features/page-extraction/hooks/useExtractionRunLauncher";
import {
  formatPageRange,
  parsePageRangeInput,
} from "@/features/page-extraction/utils/chunk-preview";
import {
  computeRecommendedChunkSettings,
  type RecommendedChunkDebug,
} from "@/features/page-extraction/utils/recommended-chunk-settings";
import { SavedJobsList } from "@/features/page-extraction/components/SavedJobsList";
import { SchemaEditor } from "@/features/page-extraction/components/SchemaEditor";
import { VariableMappingEditor } from "@/features/page-extraction/components/VariableMappingEditor";
import { TemplateReadOnlyView } from "@/features/page-extraction/components/TemplateReadOnlyView";
import {
  DraftValidationError,
  deriveSourceVariations,
  draftDiffersFromJob,
  saveTemplateFromDraft,
  validateDraft,
} from "@/features/page-extraction/services/run-from-draft";
import { clearJobResults, getJob } from "@/features/page-extraction/api/jobs";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import type {
  PageExtractionJob,
  SourceVariationKind,
} from "@/features/page-extraction/types";
import { normalizeExtraInputs } from "@/features/page-extraction/utils/extra-inputs";
import { useOpenAgentContentWindow } from "@/features/overlays/openers/agentAdvancedEditorWindow";

export interface ChunkingConfigFormProps {
  fileId: string;
  processedDocumentId: string | null;
  documentName: string;
}

export function ChunkingConfigForm({
  fileId,
  processedDocumentId,
  documentName,
}: ChunkingConfigFormProps) {
  const dispatch = useAppDispatch();
  const toast = useToastManager("page-extraction");
  const selectedJobId = useAppSelector((s) =>
    selectSelectedJobForFile(s, fileId),
  );
  const isEditing = useAppSelector((s) => selectIsEditingForFile(s, fileId));

  // Make sure a draft exists for this file the moment we mount. Cheap
  // and idempotent; required because both the editor and the run flow
  // poke at `draft.*`.
  useEffect(() => {
    dispatch(ensureDraft({ fileId }));
  }, [dispatch, fileId]);

  // Hydrate the loaded job whenever the selection changes. This is
  // shared across the read-only view and the editor — both need the
  // job's source-of-truth snapshot.
  const [loadedJob, setLoadedJob] = useState<PageExtractionJob | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!selectedJobId) {
      setLoadedJob(null);
      return undefined;
    }
    void getJob(selectedJobId).then((job) => {
      if (cancelled || !job) return;
      setLoadedJob(job);
      // Hydrate the draft so an immediate "Edit" reflects the saved
      // snapshot. (We do NOT enter edit mode here — that's a user
      // action.)
      dispatch(
        patchDraft({
          fileId,
          patch: jobToDraftPatch(job),
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [selectedJobId, fileId, dispatch]);

  // Eagerly fetch full agent details (variable definitions) for the
  // selected job's agent — otherwise the readonly view shows "Loading
  // agent variables…" forever and the editor's mapping dropdown comes
  // up empty.
  const loadedAgentId = loadedJob?.agent_id ?? null;
  useEffect(() => {
    if (!loadedAgentId) return;
    void dispatch(fetchFullAgent(loadedAgentId));
  }, [loadedAgentId, dispatch]);

  const loadedAgent = useAppSelector((s) =>
    loadedAgentId ? selectAgentById(s, loadedAgentId) : undefined,
  );

  const draft = useAppSelector((s) => selectDraftForFile(s, fileId));
  const userId = useAppSelector(selectUserId);

  // Run handler — shared by the readonly view's Run button and any
  // future "save & run" flow.
  const {
    launch,
    dialog: rerunDialog,
    running: streamRunning,
  } = useExtractionRunLauncher();
  const handleRunSelected = useCallback(async () => {
    if (!selectedJobId || !loadedJob) return;
    let jobToRun = loadedJob;
    if (userId && draftDiffersFromJob(draft, loadedJob)) {
      const saveIssues = validateDraft(draft, loadedAgent?.variableDefinitions);
      if (saveIssues.length > 0) {
        toast.error(
          saveIssues[0] ??
            "Save the template before running — wiring is incomplete.",
        );
        return;
      }
      try {
        jobToRun = await saveTemplateFromDraft(draft, {
          fileId,
          processedDocumentId,
          ownerId: userId,
          fallbackName: documentName,
          existingJobId: selectedJobId,
          agentVariables: loadedAgent?.variableDefinitions,
        });
        upsertJobInCache(fileId, jobToRun);
        setLoadedJob(jobToRun);
        dispatch(patchDraft({ fileId, patch: jobToDraftPatch(jobToRun) }));
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not save before run",
        );
        return;
      }
    }
    await launch(fileId, jobToRun);
  }, [
    selectedJobId,
    loadedJob,
    launch,
    fileId,
    userId,
    draft,
    processedDocumentId,
    documentName,
    dispatch,
    toast,
  ]);

  // Delete every run this template produced — chunk runs + result rows —
  // while keeping the template. Canonical wipe via `clearJobResults`
  // (the same RPC the Results tab's "Clear data" uses), surfaced here so
  // it's discoverable in the Chunked Runs tab where templates are managed.
  const [deletingRunData, setDeletingRunData] = useState(false);
  const handleDeleteRunData = useCallback(async () => {
    if (!selectedJobId || !loadedJob) return;
    const ok = await confirm({
      title: "Delete run data",
      description:
        "Permanently delete every run this template produced — all chunk " +
        "runs and result rows. The template itself stays, so you can run " +
        "it again. This cannot be undone.",
      confirmLabel: "Delete run data",
      variant: "destructive",
    });
    if (!ok) return;
    setDeletingRunData(true);
    try {
      await clearJobResults(selectedJobId);
      dispatch(clearRun({ jobId: selectedJobId }));
      dispatch(invalidateResults());
      const fresh = await getJob(selectedJobId);
      if (fresh) {
        setLoadedJob(fresh);
        upsertJobInCache(fileId, fresh);
      }
      toast.success("Deleted run data");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingRunData(false);
    }
  }, [selectedJobId, loadedJob, dispatch, fileId, toast]);

  // Mode transitions ------------------------------------------------

  const enterNewTemplate = () => {
    dispatch(selectJobForFile({ fileId, jobId: null }));
    dispatch(clearDraft({ fileId }));
    dispatch(ensureDraft({ fileId }));
    setLoadedJob(null);
    dispatch(setEditing({ fileId, editing: true }));
  };

  const enterEditExisting = () => {
    dispatch(setEditing({ fileId, editing: true }));
  };

  const leaveEditing = () => {
    dispatch(setEditing({ fileId, editing: false }));
  };

  // Render ---------------------------------------------------------

  // EDITING — full form takes over the panel.
  if (isEditing) {
    return (
      <div className="flex flex-1 min-h-0 flex-col h-full">
        <TemplateEditor
          fileId={fileId}
          processedDocumentId={processedDocumentId}
          documentName={documentName}
          loadedJob={loadedJob}
          onSaved={(job) => {
            setLoadedJob(job);
            leaveEditing();
          }}
          onCancel={leaveEditing}
        />
      </div>
    );
  }

  // NOT EDITING — header + saved list + (readonly view if a job is
  // selected). When nothing is selected the list itself is the entire
  // surface.
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 text-[11px]">
      {/* Header — context + New */}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-muted/30 border border-border">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Content extractors
          </p>
          <p className="text-[11px] text-muted-foreground/80 truncate">
            Save reusable extraction templates for this document.
          </p>
        </div>
        <Button
          size="sm"
          className="h-7 px-2 text-[10px] shrink-0"
          onClick={enterNewTemplate}
          title="Compose a fresh template"
        >
          <Plus className="w-3 h-3 mr-0.5" />
          New
        </Button>
      </div>

      <SavedJobsList fileId={fileId} />

      {selectedJobId && loadedJob && (
        <TemplateReadOnlyView
          job={loadedJob}
          agentName={loadedAgent?.name ?? null}
          agentVariables={loadedAgent?.variableDefinitions}
          running={streamRunning}
          onEdit={enterEditExisting}
          onRun={handleRunSelected}
          hasRunData={!!loadedJob.latest_run_id}
          deletingRunData={deletingRunData}
          onDeleteRunData={handleDeleteRunData}
        />
      )}
      {rerunDialog}

      {!selectedJobId && (
        <p className="text-[10px] text-muted-foreground/70 leading-snug px-1">
          Click a saved template above to preview or run it, or{" "}
          <span className="font-medium">New</span> to compose one.
        </p>
      )}
    </div>
  );
}

// ─── TemplateEditor: the full form, only rendered when isEditing ────────

interface TemplateEditorProps {
  fileId: string;
  processedDocumentId: string | null;
  documentName: string;
  loadedJob: PageExtractionJob | null;
  onSaved: (job: PageExtractionJob) => void;
  onCancel: () => void;
}

function TemplateEditor({
  fileId,
  processedDocumentId,
  documentName,
  loadedJob,
  onSaved,
  onCancel,
}: TemplateEditorProps) {
  const dispatch = useAppDispatch();
  const toast = useToastManager("page-extraction");
  const userId = useAppSelector(selectUserId);
  const isAdmin = useAppSelector(selectIsAdmin);
  const isDebugMode = useAppSelector(selectIsDebugMode);
  const showRecommendedDebug = isAdmin && isDebugMode;
  const openAgentEditor = useOpenAgentContentWindow();
  const draft = useAppSelector((s) => selectDraftForFile(s, fileId));
  const selectedJobId = useAppSelector((s) =>
    selectSelectedJobForFile(s, fileId),
  );
  const {
    chunks,
    stats,
    availablePages,
    contentMeta,
    loading: pagesLoading,
  } = useChunkPreview({
    fileId,
    processedDocumentId,
    previewDefaultChunkSize: true,
  });

  const chunkCountsByVariation = useMemo(() => {
    if (chunks.length === 0) return {};
    const counts: Partial<
      Record<"clean_text" | "raw_text" | "pdf_page", number>
    > = {
      pdf_page: chunks.length,
    };
    counts.raw_text = chunks.filter(
      (c) => (c.charsByVariation.raw_text ?? 0) > 0,
    ).length;
    counts.clean_text = chunks.filter(
      (c) => (c.charsByVariation.clean_text ?? 0) > 0,
    ).length;
    return counts;
  }, [chunks]);

  // Other saved templates on this file — feed the extra-inputs manager
  // inside VariableMappingEditor (each becomes a wireable option).
  const { jobs: allJobs } = useExtractionJobs(fileId);
  const candidateJobs = useMemo(
    () => allJobs.filter((j) => j.id !== selectedJobId),
    [allJobs, selectedJobId],
  );

  const agent = useAppSelector((s) =>
    draft.agentId ? selectAgentById(s, draft.agentId) : undefined,
  );

  // Fetch full agent definition (variable_definitions live there, not
  // in the listing). Without this the mapping editor has nothing to
  // render.
  useEffect(() => {
    if (!draft.agentId) return;
    void dispatch(fetchFullAgent(draft.agentId));
  }, [draft.agentId, dispatch]);

  // New templates: seed the name from the selected agent until the user
  // types their own (blank or still the generic doc-based placeholder).
  useEffect(() => {
    if (!agent?.name || selectedJobId) return;
    const trimmed = draft.jobName.trim();
    const placeholder = `${documentName} extraction`;
    if (trimmed === "" || trimmed === placeholder) {
      dispatch(patchDraft({ fileId, patch: { jobName: agent.name } }));
    }
  }, [
    agent?.name,
    agent?.id,
    selectedJobId,
    draft.jobName,
    documentName,
    dispatch,
    fileId,
  ]);

  const handleAgentSelect = (agentId: string) => {
    dispatch(patchDraft({ fileId, patch: { agentId } }));
  };

  const handleOpenAgentEditor = () => {
    if (!draft.agentId) return;
    openAgentEditor({
      initialAgentId: draft.agentId,
      initialTab: "overview",
      tabs: null,
    });
  };

  const [saving, setSaving] = useState(false);

  const isDirty = useMemo(
    () => draftDiffersFromJob(draft, loadedJob),
    [draft, loadedJob],
  );

  const saveIssues = useMemo(
    () => validateDraft(draft, agent?.variableDefinitions),
    [draft, agent?.variableDefinitions],
  );
  const canSave = saveIssues.length === 0 && !saving;

  // Local error for the page-range input only.
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [recommendedDebug, setRecommendedDebug] =
    useState<RecommendedChunkDebug | null>(null);

  const sourceVariations = useMemo(
    () => deriveSourceVariations(draft.variableMapping),
    [draft.variableMapping],
  );

  const canApplyRecommended =
    draft.kind === "extraction" &&
    !pagesLoading &&
    availablePages.length > 0 &&
    draft.agentId != null;

  const handleApplyRecommended = () => {
    if (!canApplyRecommended) {
      toast.error("Load document pages and select an agent first.");
      return;
    }

    const result = computeRecommendedChunkSettings({
      availablePages,
      scopePages: draft.scopePages,
      rawCharacters: contentMeta.rawCharacters,
      cleanCharacters: contentMeta.cleanCharacters,
      variableMapping: draft.variableMapping,
      sourceVariations,
      logDebug: showRecommendedDebug,
    });

    if (!result) {
      toast.error("No pages available to recommend chunk settings.");
      return;
    }

    setRangeError(null);
    if (showRecommendedDebug) {
      setRecommendedDebug(result.debug);
    }
    dispatch(
      patchDraft({
        fileId,
        patch: {
          scopePages: result.scopePages,
          scopePagesInputRaw: result.scopePagesInputRaw,
          chunkSize: result.chunkSize,
          chunkOverlap: result.chunkOverlap,
        },
      }),
    );
    toast.success(
      `Recommended: ${result.scopePagesInputRaw}, chunk ${result.chunkSize}, overlap ${result.chunkOverlap}`,
    );
  };

  const handleRangeChange = (raw: string) => {
    setRangeError(null);
    dispatch(patchDraft({ fileId, patch: { scopePagesInputRaw: raw } }));
    if (!raw.trim()) {
      dispatch(patchDraft({ fileId, patch: { scopePages: [] } }));
      return;
    }
    try {
      const parsed = parsePageRangeInput(raw);
      const valid = new Set(availablePages);
      const filtered = parsed.filter((n) => valid.has(n));
      dispatch(patchDraft({ fileId, patch: { scopePages: filtered } }));
      if (parsed.length > 0 && filtered.length === 0) {
        setRangeError("None of those pages exist in this document.");
      }
    } catch (err) {
      setRangeError(err instanceof Error ? err.message : "Invalid range");
      dispatch(patchDraft({ fileId, patch: { scopePages: [] } }));
    }
  };

  const handleChunkSizeChange = (raw: string) => {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || raw.trim() === "") {
      dispatch(patchDraft({ fileId, patch: { chunkSize: null } }));
      return;
    }
    const next = Math.max(1, n);
    const overlap = Math.max(0, Math.min(next - 1, draft.chunkOverlap));
    dispatch(
      patchDraft({
        fileId,
        patch: { chunkSize: next, chunkOverlap: overlap },
      }),
    );
  };

  const handleChunkOverlapChange = (raw: string) => {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || raw.trim() === "") {
      dispatch(patchDraft({ fileId, patch: { chunkOverlap: 0 } }));
      return;
    }
    const maxOverlap = Math.max(0, (draft.chunkSize ?? 1) - 1);
    dispatch(
      patchDraft({
        fileId,
        patch: { chunkOverlap: Math.max(0, Math.min(maxOverlap, n)) },
      }),
    );
  };

  const handleSave = async () => {
    if (!userId) {
      toast.error("Not signed in.");
      return;
    }
    if (!canSave) {
      toast.error(saveIssues[0] ?? "Form not complete.");
      return;
    }
    setSaving(true);
    try {
      const job = await saveTemplateFromDraft(draft, {
        fileId,
        processedDocumentId,
        ownerId: userId,
        fallbackName: documentName,
        existingJobId: selectedJobId,
        agentVariables: agent?.variableDefinitions,
      });
      // Push the freshly-saved row into the shared jobs cache BEFORE
      // dispatching the selection. Without this, the JobPicker dropdown
      // in the main pane shows a blank placeholder (no matching
      // <SelectItem> for the new id) until Supabase Realtime catches up.
      // Realtime is enabled on this table, but the round-trip can be
      // 100ms-2s — long enough for the user to see a no-name run in
      // progress and assume it failed.
      upsertJobInCache(fileId, job);
      dispatch(selectJobForFile({ fileId, jobId: job.id }));
      toast.success(selectedJobId ? "Template updated" : "Template saved");
      onSaved(job);
    } catch (err) {
      if (err instanceof DraftValidationError) {
        toast.error(err.issues[0]);
      } else {
        toast.error(err instanceof Error ? err.message : "Could not save");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (selectedJobId && loadedJob) {
      // Editing an existing template — discard pending changes by
      // re-hydrating from the saved snapshot, then bounce to readonly.
      dispatch(patchDraft({ fileId, patch: jobToDraftPatch(loadedJob) }));
      onCancel();
    } else {
      // Composing a NEW template — drop it and bounce back to the list.
      dispatch(clearDraft({ fileId }));
      dispatch(ensureDraft({ fileId }));
      onCancel();
    }
  };

  return (
    <div className="flex flex-col min-h-0 h-full text-[11px]">
      <div className="shrink-0 px-3 pt-3 pb-2">
        {/* Header — what we're editing right now */}
        <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-muted/30 border border-border">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {selectedJobId ? "Editing template" : "New template"}
            </p>
            <p className="text-[11px] font-medium truncate">
              {loadedJob?.name ?? draft.jobName.trim() ?? "Untitled"}
              {isDirty && selectedJobId && (
                <span className="ml-1 text-amber-700 dark:text-amber-400">
                  · unsaved
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 space-y-3 pb-3">
        {/* 1. Agent first — pick the agent, then wire variables. */}
        <Field label="Agent" required>
          <div className="flex items-center gap-1">
            <AgentListDropdown
              onSelect={handleAgentSelect}
              label={agent?.name ?? "Select an Agent"}
              noBorder={false}
              className="min-w-0 flex-1"
            />
            {draft.agentId && (
              <button
                type="button"
                onClick={handleOpenAgentEditor}
                title={`Open Agent Advanced Editor · ${draft.agentId}`}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <PanelRight className="h-3.5 w-3.5" />
                <span className="sr-only">Open Agent Advanced Editor</span>
              </button>
            )}
          </div>
          {agent && (
            <VariableMappingEditor
              agentName={agent.name}
              agentVariables={agent.variableDefinitions}
              mapping={draft.variableMapping}
              chunkCountsByVariation={chunkCountsByVariation}
              extraInputs={draft.extraInputs}
              candidateJobs={candidateJobs}
              onChange={(next) =>
                dispatch(
                  patchDraft({ fileId, patch: { variableMapping: next } }),
                )
              }
              onChangeExtraInputs={(next) =>
                dispatch(patchDraft({ fileId, patch: { extraInputs: next } }))
              }
            />
          )}
        </Field>

        {/* 2. Template name — auto-filled from agent on new templates. */}
        <Field label="Template name" required>
          <Input
            value={draft.jobName}
            onChange={(e) =>
              dispatch(
                patchDraft({ fileId, patch: { jobName: e.target.value } }),
              )
            }
            placeholder={agent?.name ?? `${documentName} extraction`}
            className="h-7 text-[11px]"
          />
        </Field>

        {/* 3. Template kind */}
        <Field label="Type" hint="What this template does">
          <div className="flex gap-1">
            {(["extraction", "validation"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() =>
                  dispatch(patchDraft({ fileId, patch: { kind: k } }))
                }
                className={
                  "flex-1 h-7 rounded-md border text-[11px] capitalize transition-colors " +
                  (draft.kind === k
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border bg-card text-muted-foreground hover:bg-accent/40")
                }
              >
                {k}
              </button>
            ))}
          </div>
        </Field>

        {/* Validation-only: which extraction template's rows to process. */}
        {draft.kind === "validation" && (
          <Field
            label="Validates template"
            required
            hint="Whose rows this reads + updates"
          >
            <ValidatesTemplatePicker
              fileId={fileId}
              currentJobId={selectedJobId}
              value={draft.validatesJobId}
              onChange={(id) =>
                dispatch(patchDraft({ fileId, patch: { validatesJobId: id } }))
              }
            />
            <p className="mt-1 text-[10px] text-muted-foreground/70 leading-snug">
              The validation agent receives every result row of that template
              (as <code>validated_rows</code>) and writes its{" "}
              <span className="font-medium">validation</span>-source columns
              back onto those rows.
            </p>
          </Field>
        )}

        {draft.kind === "extraction" && (
          <>
            <DocumentContentMeta
              loading={pagesLoading}
              totalPages={contentMeta.totalPages}
              rawCharacters={contentMeta.rawCharacters}
              cleanCharacters={contentMeta.cleanCharacters}
            />

            <div className="flex flex-col gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-full justify-center gap-1.5 text-[11px]"
                disabled={!canApplyRecommended}
                onClick={handleApplyRecommended}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                Apply Recommended
              </Button>
              {showRecommendedDebug && recommendedDebug && (
                <p className="text-[9px] text-muted-foreground/80 leading-snug font-mono">
                  {recommendedDebug.rules} · {recommendedDebug.charCountSource}{" "}
                  {recommendedDebug.effectiveCharCount.toLocaleString()} chars →{" "}
                  {recommendedDebug.targetChunkCount} chunk
                  {recommendedDebug.targetChunkCount === 1 ? "" : "s"} · size{" "}
                  {recommendedDebug.chunkSize} · overlap{" "}
                  {recommendedDebug.chunkOverlap}
                </p>
              )}
            </div>

            {/* Page range */}
            <Field
              label="Pages"
              required
              hint={
                pagesLoading ? "Loading…" : `${availablePages.length} available`
              }
            >
              <Input
                value={draft.scopePagesInputRaw}
                onChange={(e) => handleRangeChange(e.target.value)}
                placeholder="1-50, 80-90"
                className="h-7 text-[11px]"
              />
              {draft.scopePages.length > 0 && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  <span className="font-mono text-foreground/80">
                    {draft.scopePages.length}
                  </span>{" "}
                  in scope
                </p>
              )}
              {rangeError && (
                <p className="mt-1 text-[10px] text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {rangeError}
                </p>
              )}
            </Field>

            {/* Chunk size + overlap */}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Chunk size" required hint="Pages per call">
                <Input
                  value={draft.chunkSize ?? ""}
                  onChange={(e) => handleChunkSizeChange(e.target.value)}
                  type="number"
                  min={1}
                  max={50}
                  placeholder="12"
                  className="h-7 text-[11px]"
                />
              </Field>
              <Field label="Overlap" hint="Repeat pages">
                <Input
                  value={draft.chunkOverlap}
                  onChange={(e) => handleChunkOverlapChange(e.target.value)}
                  type="number"
                  min={0}
                  max={Math.max(0, (draft.chunkSize ?? 1) - 1)}
                  placeholder="0"
                  className="h-7 text-[11px]"
                />
              </Field>
            </div>
            {chunks.length > 0 && (
              <p className="text-[10px] text-muted-foreground -mt-2">
                →{" "}
                <span className="font-mono text-foreground/80">
                  {chunks.length}
                </span>{" "}
                chunk{chunks.length === 1 ? "" : "s"}
                {!draft.chunkSize && (
                  <span className="text-muted-foreground/70">
                    {" "}
                    (preview · set chunk size to confirm)
                  </span>
                )}
                {stats.avgChars > 0 && (
                  <>
                    {" "}
                    · avg{" "}
                    <span className="font-mono">
                      {stats.avgChars.toLocaleString()}
                    </span>{" "}
                    chars
                  </>
                )}
              </p>
            )}
          </>
        )}

        {deriveSourceVariations(draft.variableMapping).includes("pdf_page") && (
          <Field
            label="PDF document input"
            hint="One exact-page PDF is attached per chunk."
          >
            <p className="text-[10px] text-muted-foreground leading-snug">
              The attachment contains only this chunk&apos;s configured pages,
              including overlap. Map <code>Chunk PDF document</code> to an agent
              variable with the <strong>Document</strong> input type to activate
              the native attachment. The full source PDF is never attached.
            </p>
          </Field>
        )}

        {/* 4c. Output columns — the durable table definition. Import from
              the agent, then add review/validation columns or drop fields.
              Empty = inherit the agent's schema at run time. */}
        <Field label="Output table" hint="Defines the Results columns.">
          <SchemaEditor
            outputSchema={draft.outputSchema}
            agentOutputSchema={agent?.outputSchema}
            onChange={(next) =>
              dispatch(patchDraft({ fileId, patch: { outputSchema: next } }))
            }
          />
        </Field>

        {/* 5. RAG-boost override */}
        <Field label="RAG boost" hint="Blank = agent default">
          <Input
            value={draft.ragBoost ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                dispatch(patchDraft({ fileId, patch: { ragBoost: null } }));
                return;
              }
              const parsed = Math.round(Number.parseInt(raw, 10));
              if (Number.isFinite(parsed)) {
                dispatch(patchDraft({ fileId, patch: { ragBoost: parsed } }));
              }
            }}
            type="number"
            step={5}
            min={-50}
            max={100}
            placeholder="inherit"
            className="h-7 text-[11px] font-mono"
          />
        </Field>
      </div>

      {/* Bottom — Cancel + Save/Update */}
      <div className="shrink-0 px-3 py-2 border-t border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 h-8 text-[11px]"
            onClick={handleCancel}
            disabled={saving}
            title={
              selectedJobId
                ? "Discard changes and return to the saved template view"
                : "Discard this new template"
            }
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="flex-1 h-8 text-[11px]"
            disabled={!canSave}
            onClick={() => void handleSave()}
            title={
              selectedJobId ? "Update this template" : "Save as a new template"
            }
          >
            {saving ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="w-3 h-3 mr-1" />
                {selectedJobId ? "Update" : "Save"}
              </>
            )}
          </Button>
        </div>
        {saveIssues.length > 0 && (
          <ul className="space-y-0.5 text-[10px] text-amber-700 dark:text-amber-400 mt-1.5">
            {saveIssues.map((issue) => (
              <li key={issue} className="flex items-start gap-1">
                <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                {issue}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Internal: document content summary (above page range) ────────────────

function DocumentContentMeta({
  loading,
  totalPages,
  rawCharacters,
  cleanCharacters,
}: {
  loading: boolean;
  totalPages: number;
  rawCharacters: number;
  cleanCharacters: number;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-2.5 py-2 grid grid-cols-3 gap-2">
      <MetaStat
        label="Total pages"
        value={loading ? "…" : totalPages.toLocaleString()}
      />
      <MetaStat
        label="Raw characters"
        value={loading ? "…" : rawCharacters.toLocaleString()}
      />
      <MetaStat
        label="Clean characters"
        value={loading ? "…" : cleanCharacters.toLocaleString()}
      />
    </div>
  );
}

function MetaStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className="font-mono text-[11px] font-medium text-foreground/90 tabular-nums">
        {value}
      </p>
    </div>
  );
}

// ─── Internal: form field shell ───────────────────────────────────────────

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-baseline justify-between text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        <span>
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </span>
        {hint && (
          <span className="font-normal normal-case tracking-normal text-[9px] text-muted-foreground/70">
            {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

// ─── Internal: validates-template picker ──────────────────────────────────

function ValidatesTemplatePicker({
  fileId,
  currentJobId,
  value,
  onChange,
}: {
  fileId: string;
  currentJobId: string | null;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { jobs } = useExtractionJobs(fileId);
  // Only extraction templates are valid targets — you can't validate a
  // validation template, and a template can't validate itself.
  const candidates = jobs.filter(
    (j) => j.id !== currentJobId && (j.kind ?? "extraction") === "extraction",
  );
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="h-7 text-[11px] w-full rounded-md border border-input bg-background px-2"
    >
      <option value="">Select extraction template…</option>
      {candidates.map((j) => (
        <option key={j.id} value={j.id}>
          {j.name}
        </option>
      ))}
    </select>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Convert a saved Job into the partial draft patch needed to render it.
 * Used both on initial selection (eager hydrate so Edit just works) and
 * on Cancel-while-editing-existing (discard local diffs).
 */
function jobToDraftPatch(job: PageExtractionJob) {
  return {
    agentId: job.agent_id,
    scopePages: job.scope_pages ?? [],
    scopePagesInputRaw: job.scope_pages?.length
      ? formatPageRange(job.scope_pages)
      : "",
    chunkSize: job.chunk_size,
    chunkOverlap: job.chunk_overlap,
    sourceVariations: (job.source_variations ?? [
      "clean_text",
    ]) as SourceVariationKind[],
    chunkingStrategy: (job.chunking_strategy ?? "pages") as
      "pages" | "keyword" | "manual" | "section",
    jobName: job.name,
    saveAsJob: true,
    variableMapping: job.variable_mapping ?? {},
    outputSchema: job.output_schema as unknown,
    maxConcurrent: job.max_concurrent,
    extraInputs: normalizeExtraInputs(job.extra_inputs),
    ragBoost: job.rag_boost ?? null,
    attachCombinedPdf: job.attach_combined_pdf ?? false,
    kind: job.kind ?? "extraction",
    validatesJobId: job.validates_job_id ?? null,
  };
}
