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
 * `matrx-user/content-extractor` surface + `VariableMappingEditor`, the
 * full surface-value catalog is available as dropdowns, the legacy
 * heuristic is opt-in via an "Auto-suggest" button, and the user only
 * sees the editor when they're actually editing.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, Plus, Save, X } from "lucide-react";
import { useExtractionJobs } from "@/features/page-extraction/hooks/useExtractionJobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useToastManager } from "@/hooks/useToastManager";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { SOURCE_VARIATIONS } from "@/features/page-extraction/constants";
import {
  clearDraft,
  ensureDraft,
  patchDraft,
  selectJobForFile,
  setEditing,
  toggleDraftVariation,
} from "@/features/page-extraction/redux/pageExtractionSlice";
import {
  selectDraftForFile,
  selectIsEditingForFile,
  selectSelectedJobForFile,
} from "@/features/page-extraction/redux/selectors";
import { useChunkPreview } from "@/features/page-extraction/hooks/useChunkPreview";
import { useExtractionStream } from "@/features/page-extraction/hooks/useExtractionStream";
import {
  formatPageRange,
  parsePageRangeInput,
} from "@/features/page-extraction/utils/chunk-preview";
import { SavedJobsList } from "@/features/page-extraction/components/SavedJobsList";
import { VariableMappingEditor } from "@/features/page-extraction/components/VariableMappingEditor";
import { TemplateReadOnlyView } from "@/features/page-extraction/components/TemplateReadOnlyView";
import {
  DraftValidationError,
  draftDiffersFromJob,
  saveTemplateFromDraft,
  validateDraft,
} from "@/features/page-extraction/services/run-from-draft";
import { getJob } from "@/features/page-extraction/api/jobs";
import type {
  PageExtractionJob,
  SourceVariationKind,
} from "@/features/page-extraction/types";

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
      return;
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
    void dispatch(fetchAgentExecutionMinimal(loadedAgentId));
  }, [loadedAgentId, dispatch]);

  const loadedAgent = useAppSelector((s) =>
    loadedAgentId ? selectAgentById(s, loadedAgentId) : undefined,
  );

  // Run handler — shared by the readonly view's Run button and any
  // future "save & run" flow.
  const { running: streamRunning, start: startRun } = useExtractionStream();
  const handleRunSelected = useCallback(async () => {
    if (!selectedJobId) return;
    try {
      await startRun(fileId, { job_id: selectedJobId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Run failed");
    }
  }, [selectedJobId, startRun, fileId, toast]);

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
    );
  }

  // NOT EDITING — header + saved list + (readonly view if a job is
  // selected). When nothing is selected the list itself is the entire
  // surface.
  return (
    <div className="p-3 space-y-3 text-[11px]">
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
        />
      )}

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
  const draft = useAppSelector((s) => selectDraftForFile(s, fileId));
  const selectedJobId = useAppSelector((s) =>
    selectSelectedJobForFile(s, fileId),
  );
  const {
    chunks,
    stats,
    availablePages,
    loading: pagesLoading,
  } = useChunkPreview({ fileId, processedDocumentId });

  const agent = useAppSelector((s) =>
    draft.agentId ? selectAgentById(s, draft.agentId) : undefined,
  );

  // Fetch full agent definition (variable_definitions live there, not
  // in the listing). Without this the mapping editor has nothing to
  // render.
  useEffect(() => {
    if (!draft.agentId) return;
    void dispatch(fetchAgentExecutionMinimal(draft.agentId));
  }, [draft.agentId, dispatch]);

  const [saving, setSaving] = useState(false);

  const isDirty = useMemo(
    () => draftDiffersFromJob(draft, loadedJob),
    [draft, loadedJob],
  );

  const saveIssues = useMemo(() => validateDraft(draft), [draft]);
  const canSave = saveIssues.length === 0 && !saving;

  // Local error for the page-range input only.
  const [rangeError, setRangeError] = useState<string | null>(null);

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
      });
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
    <div className="p-3 space-y-3 text-[11px]">
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

      {/* 1. Template name */}
      <Field
        label="Template name"
        required
        hint="What to call this template in the Saved list."
      >
        <Input
          value={draft.jobName}
          onChange={(e) =>
            dispatch(patchDraft({ fileId, patch: { jobName: e.target.value } }))
          }
          placeholder={`e.g. "${documentName} extraction"`}
          className="h-7 text-[11px]"
        />
      </Field>

      {/* 2. Agent — picker + variable-mapping editor */}
      <Field label="Agent" required hint="Pick one of your agents.">
        <AgentListDropdown
          onSelect={(id) =>
            dispatch(patchDraft({ fileId, patch: { agentId: id } }))
          }
          label={agent?.name ?? "Select an Agent"}
          noBorder={false}
        />
        {agent && (
          <VariableMappingEditor
            agentName={agent.name}
            agentVariables={agent.variableDefinitions}
            mapping={draft.variableMapping}
            selectedVariations={draft.sourceVariations}
            onChange={(next) =>
              dispatch(patchDraft({ fileId, patch: { variableMapping: next } }))
            }
          />
        )}
      </Field>

      {/* 3. Page range */}
      <Field
        label="Pages"
        required
        hint={
          pagesLoading
            ? "Loading page list…"
            : `${availablePages.length} pages in this document`
        }
      >
        <Input
          value={draft.scopePagesInputRaw}
          onChange={(e) => handleRangeChange(e.target.value)}
          placeholder='e.g. "1-50, 80-90"'
          className="h-7 text-[11px]"
        />
        {draft.scopePages.length > 0 && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            <span className="font-mono text-foreground/80">
              {draft.scopePages.length}
            </span>{" "}
            page{draft.scopePages.length === 1 ? "" : "s"} in scope
          </p>
        )}
        {rangeError && (
          <p className="mt-1 text-[10px] text-destructive flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {rangeError}
          </p>
        )}
      </Field>

      {/* 4. Chunk size + overlap */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Chunk size" required hint="Pages per agent call.">
          <Input
            value={draft.chunkSize ?? ""}
            onChange={(e) => handleChunkSizeChange(e.target.value)}
            type="number"
            min={1}
            max={50}
            placeholder="e.g. 12"
            className="h-7 text-[11px]"
          />
        </Field>
        <Field label="Overlap" hint="Repeat pages.">
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
      {draft.chunkSize != null && draft.scopePages.length > 0 && (
        <p className="text-[10px] text-muted-foreground -mt-2">
          →{" "}
          <span className="font-mono text-foreground/80">{chunks.length}</span>{" "}
          chunk{chunks.length === 1 ? "" : "s"}
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

      {/* 5. Source variations — what the backend computes per chunk, which
              gates the matching surface values (`clean_text`, `raw_text`,
              `pdf_page`) above. */}
      <Field
        label="Per-chunk text to fetch"
        required
        hint="Tick what the variable wiring above needs."
      >
        <div className="space-y-1.5">
          {SOURCE_VARIATIONS.map((v) => {
            const checked = draft.sourceVariations.includes(v.kind);
            const disabled = v.comingSoon === true;
            return (
              <label
                key={v.kind}
                className={`flex items-start gap-2 ${
                  disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                }`}
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={() => {
                    if (disabled) return;
                    dispatch(
                      toggleDraftVariation({
                        fileId,
                        kind: v.kind as SourceVariationKind,
                      }),
                    );
                  }}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-baseline gap-1">
                    <span className="font-medium text-foreground">
                      {v.label}
                    </span>
                    <code className="text-[10px] text-muted-foreground/80 font-mono">
                      {v.kind}
                    </code>
                    {v.comingSoon && (
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                        coming soon
                      </span>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </Field>

      {/* 6. Extra inputs */}
      <ExtraInputsEditor
        fileId={fileId}
        excludeJobId={selectedJobId}
        extraInputs={draft.extraInputs}
        onChange={(next) =>
          dispatch(patchDraft({ fileId, patch: { extraInputs: next } }))
        }
      />

      {/* 7. RAG-boost override */}
      <Field
        label="RAG boost override"
        hint="Leave blank to inherit the agent's default. Number = override for this job."
      >
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

      {/* Sticky bottom — Cancel + Save/Update */}
      <div className="sticky bottom-0 -mx-3 -mb-3 px-3 py-2 border-t border-border bg-background/95 backdrop-blur-sm">
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

// ─── Internal: extra-inputs editor ────────────────────────────────────────

function ExtraInputsEditor({
  fileId,
  excludeJobId,
  extraInputs,
  onChange,
}: {
  fileId: string;
  excludeJobId: string | null | undefined;
  extraInputs: { name: string; source_job_id: string }[];
  onChange: (next: { name: string; source_job_id: string }[]) => void;
}) {
  const { jobs } = useExtractionJobs(fileId);
  const candidateJobs = jobs.filter((j) => j.id !== excludeJobId);

  const addRow = () => {
    onChange([...extraInputs, { name: "", source_job_id: "" }]);
  };
  const updateRow = (
    idx: number,
    patch: Partial<{ name: string; source_job_id: string }>,
  ) => {
    onChange(
      extraInputs.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    );
  };
  const removeRow = (idx: number) => {
    onChange(extraInputs.filter((_, i) => i !== idx));
  };

  if (candidateJobs.length === 0 && extraInputs.length === 0) {
    return (
      <Field
        label="Extra inputs"
        hint="Use another template's results as variables."
      >
        <p className="text-[10px] text-muted-foreground/70 leading-snug">
          Save another template first — you can then pipe its results into this
          one as a named variable.
        </p>
      </Field>
    );
  }

  return (
    <Field label="Extra inputs" hint="Pull result rows from other templates.">
      <div className="space-y-1.5">
        {extraInputs.map((row, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <Input
              value={row.name}
              onChange={(e) => updateRow(idx, { name: e.target.value })}
              placeholder="variable_name"
              className="h-7 text-[11px] w-1/3 font-mono"
            />
            <span className="text-[10px] text-muted-foreground">←</span>
            <select
              value={row.source_job_id}
              onChange={(e) =>
                updateRow(idx, { source_job_id: e.target.value })
              }
              className="h-7 text-[11px] flex-1 min-w-0 rounded-md border border-input bg-background px-2"
            >
              <option value="">Select template…</option>
              {candidateJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => removeRow(idx)}
              title="Remove this input"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[10px] w-full"
          onClick={addRow}
          disabled={candidateJobs.length === 0}
        >
          <Plus className="w-3 h-3 mr-1" />
          Add input from another template
        </Button>
        {extraInputs.length > 0 && (
          <p className="text-[10px] text-muted-foreground/70 leading-snug">
            Each variable is a JSON array of result rows from the source
            template, filtered to the current chunk&apos;s page range. Route via
            the agent variable wiring above.
          </p>
        )}
      </div>
    </Field>
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
      | "pages"
      | "keyword"
      | "manual"
      | "section",
    jobName: job.name,
    saveAsJob: true,
    variableMapping: job.variable_mapping ?? {},
    outputSchema: job.output_schema as unknown,
    maxConcurrent: job.max_concurrent,
    extraInputs: job.extra_inputs ?? [],
    ragBoost: job.rag_boost ?? null,
  };
}
