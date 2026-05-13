/**
 * features/page-extraction/components/ChunkingConfigForm.tsx
 *
 * User-driven form for assembling a chunked extraction run. NO silent
 * defaults — page range and chunk size are required user inputs.
 *
 *   ┌────────────────────────────────────────────────────────┐
 *   │ Agent              [ Pick from your agents     ▾ ]     │
 *   │ Pages              [ "1-50, 80-90"              ]     │
 *   │                    382 available · 60 in scope         │
 *   │ Chunk size         [ pages per agent call       ]     │
 *   │                    → 5 chunks                          │
 *   │ Source variations  [x] Cleaned text                    │
 *   │                    [ ] Raw text                        │
 *   │                    [ ] PDF page (coming soon)          │
 *   │ ─────────────────────────────────────────────────────  │
 *   │ [ Save as named Job ]  (optional)                      │
 *   │              [ Run extraction ]                        │
 *   └────────────────────────────────────────────────────────┘
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Loader2,
  Plus,
  Repeat,
  Save,
  X,
} from "lucide-react";
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
import {
  SOURCE_VARIATIONS,
} from "@/features/page-extraction/constants";
import {
  ensureDraft,
  patchDraft,
  toggleDraftVariation,
} from "@/features/page-extraction/redux/pageExtractionSlice";
import { selectDraftForFile } from "@/features/page-extraction/redux/selectors";
// useExtractionStream lives in SavedJobsList — Run is no longer
// triggered from this form.
import { useChunkPreview } from "@/features/page-extraction/hooks/useChunkPreview";
import { parsePageRangeInput } from "@/features/page-extraction/utils/chunk-preview";
import { deriveVariableMapping } from "@/features/page-extraction/utils/derive-variable-mapping";
import { SavedJobsList } from "@/features/page-extraction/components/SavedJobsList";
import {
  DraftValidationError,
  draftDiffersFromJob,
  saveTemplateFromDraft,
  validateDraft,
} from "@/features/page-extraction/services/run-from-draft";
import {
  clearDraft,
  selectJobForFile,
} from "@/features/page-extraction/redux/pageExtractionSlice";
import { selectSelectedJobForFile } from "@/features/page-extraction/redux/selectors";
import { getJob } from "@/features/page-extraction/api/jobs";
import type {
  PageExtractionJob,
  SourceVariationKind,
} from "@/features/page-extraction/types";
import { formatPageRange } from "@/features/page-extraction/utils/chunk-preview";

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
  const userId = useAppSelector(selectUserId);
  const draft = useAppSelector((s) => selectDraftForFile(s, fileId));
  const selectedJobId = useAppSelector((s) =>
    selectSelectedJobForFile(s, fileId),
  );
  // streamError surfaces only if SavedJobsList propagates one; the form
  // itself no longer initiates runs.
  const streamError: string | null = null;
  const { chunks, stats, availablePages, loading: pagesLoading } =
    useChunkPreview({ fileId, processedDocumentId });

  const agent = useAppSelector((s) =>
    draft.agentId ? selectAgentById(s, draft.agentId) : undefined,
  );

  // Mirror of the currently-loaded saved Job — drives the "dirty?" check
  // and the Save-vs-Update button label. Fetched on selectedJobId change.
  const [loadedJob, setLoadedJob] = useState<PageExtractionJob | null>(null);
  const [saving, setSaving] = useState(false);

  // Ensure a draft exists for this file on mount.
  useEffect(() => {
    dispatch(ensureDraft({ fileId }));
  }, [dispatch, fileId]);

  // When the selected Job changes, hydrate the draft from the Job and
  // remember the snapshot. This is what makes clicking a saved template
  // row "view" it — the form just becomes that template.
  useEffect(() => {
    let cancelled = false;
    if (!selectedJobId) {
      setLoadedJob(null);
      return;
    }
    void getJob(selectedJobId).then((job) => {
      if (cancelled || !job) return;
      setLoadedJob(job);
      dispatch(
        patchDraft({
          fileId,
          patch: {
            agentId: job.agent_id,
            scopePages: job.scope_pages ?? [],
            scopePagesInputRaw: job.scope_pages?.length
              ? formatPageRange(job.scope_pages)
              : "",
            chunkSize: job.chunk_size,
            chunkOverlap: job.chunk_overlap,
            sourceVariations: (job.source_variations ??
              ["clean_text"]) as SourceVariationKind[],
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
          },
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [selectedJobId, fileId, dispatch]);

  const isDirty = useMemo(
    () => draftDiffersFromJob(draft, loadedJob),
    [draft, loadedJob],
  );

  // When the agent changes, hydrate the FULL definition. The initial
  // agent list only carries name/id/etc. — `variableDefinitions` is
  // populated by the on-demand RPC `agx_get_execution_minimal`. Without
  // this fetch our `deriveVariableMapping` heuristic has nothing to work
  // with and Jobs get saved with `variable_mapping: {}` (the bug that
  // caused empty `[]` agent responses across every chunk).
  useEffect(() => {
    if (!draft.agentId) return;
    void dispatch(fetchAgentExecutionMinimal(draft.agentId));
  }, [draft.agentId, dispatch]);

  // Auto-derive variable_mapping once the agent's variableDefinitions are
  // loaded (or when selected variations change). Re-runs when the agent
  // changes too. If the user wants to lock in a custom mapping, save the
  // Job and re-use it — saved Jobs keep their mapping verbatim on the
  // server.
  useEffect(() => {
    if (!agent) return;
    if (!agent.variableDefinitions) return; // still loading
    const derived = deriveVariableMapping(
      agent.variableDefinitions,
      draft.sourceVariations,
    );
    dispatch(patchDraft({ fileId, patch: { variableMapping: derived } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    agent?.id,
    agent?.variableDefinitions?.length,
    draft.sourceVariations.join("|"),
    fileId,
  ]);

  // Local error for the page-range input only.
  const [rangeError, setRangeError] = useState<string | null>(null);

  const saveIssues = useMemo(() => validateDraft(draft), [draft]);
  const canSave = saveIssues.length === 0 && !saving;

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
    // Clamp overlap so it remains < chunkSize.
    const overlap = Math.max(
      0,
      Math.min(next - 1, draft.chunkOverlap),
    );
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
      // Make the new/updated Job the active one and refresh the local
      // snapshot so the "dirty" indicator clears.
      dispatch(selectJobForFile({ fileId, jobId: job.id }));
      setLoadedJob(job);
      toast.success(selectedJobId ? "Template updated" : "Template saved");
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

  const handleNewTemplate = () => {
    dispatch(selectJobForFile({ fileId, jobId: null }));
    dispatch(clearDraft({ fileId }));
    dispatch(ensureDraft({ fileId }));
    setLoadedJob(null);
    toast.success("Started a new template");
  };

  const handleCancel = () => {
    if (selectedJobId && loadedJob) {
      // Editing an existing template — reset to the persisted state.
      dispatch(
        patchDraft({
          fileId,
          patch: {
            agentId: loadedJob.agent_id,
            scopePages: loadedJob.scope_pages ?? [],
            scopePagesInputRaw: loadedJob.scope_pages?.length
              ? formatPageRange(loadedJob.scope_pages)
              : "",
            chunkSize: loadedJob.chunk_size,
            chunkOverlap: loadedJob.chunk_overlap,
            sourceVariations: (loadedJob.source_variations ??
              ["clean_text"]) as SourceVariationKind[],
            chunkingStrategy: (loadedJob.chunking_strategy ?? "pages") as
              | "pages"
              | "keyword"
              | "manual"
              | "section",
            jobName: loadedJob.name,
            saveAsJob: true,
            variableMapping: loadedJob.variable_mapping ?? {},
            outputSchema: loadedJob.output_schema as unknown,
            maxConcurrent: loadedJob.max_concurrent,
            extraInputs: loadedJob.extra_inputs ?? [],
          },
        }),
      );
      toast.success("Changes discarded");
    } else {
      // Composing a new template — drop it.
      handleNewTemplate();
    }
  };

  return (
    <div className="p-3 space-y-3 text-[11px]">
      {/* Status banner — what's loaded right now + start-fresh button */}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-muted/30 border border-border">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {selectedJobId ? "Editing" : "New template"}
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
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[10px] shrink-0"
          onClick={handleNewTemplate}
          title="Start a fresh, blank template"
        >
          <Plus className="w-3 h-3 mr-0.5" />
          New
        </Button>
      </div>

      {/* Saved templates — click a row to view, play to run, trash to delete. */}
      <SavedJobsList fileId={fileId} />

      {/* 1. Template name — first thing the user sets. */}
      <Field
        label="Template name"
        required
        hint="What to call this template in the Saved list."
      >
        <Input
          value={draft.jobName}
          onChange={(e) =>
            dispatch(
              patchDraft({ fileId, patch: { jobName: e.target.value } }),
            )
          }
          placeholder={`e.g. "${documentName} extraction"`}
          className="h-7 text-[11px]"
        />
      </Field>

      {/* 2. Agent — second. Default label is the explicit "Select an Agent". */}
      <Field label="Agent" required hint="Pick one of your agents.">
        <AgentListDropdown
          onSelect={(id) =>
            dispatch(patchDraft({ fileId, patch: { agentId: id } }))
          }
          label={agent?.name ?? "Select an Agent"}
          noBorder={false}
        />
        {agent && (
          <VariableMappingPreview
            agentName={agent.name}
            agentVariables={agent.variableDefinitions}
            mapping={draft.variableMapping}
          />
        )}
      </Field>

      {/* 3. Page range — REQUIRED, no default */}
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

      {/* 4. Chunk size + overlap — overlap defaults to 0; user can set. */}
      <div className="grid grid-cols-2 gap-2">
        <Field
          label="Chunk size"
          required
          hint="Pages per agent call."
        >
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
        <Field
          label="Overlap"
          hint="Pages shared with the prev chunk."
        >
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
              {" "}· avg{" "}
              <span className="font-mono">
                {stats.avgChars.toLocaleString()}
              </span>{" "}
              chars
            </>
          )}
        </p>
      )}

      {/* 5. Source variations */}
      <Field
        label="Source variations"
        required
        hint="What to send the agent for each chunk. Pick one or more."
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
                    {v.comingSoon && (
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                        coming soon
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    {v.description}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      </Field>

      {/* 6. Extra inputs — pull result rows from OTHER templates as
              named variables for this template's agent. */}
      <ExtraInputsEditor
        fileId={fileId}
        excludeJobId={selectedJobId}
        extraInputs={draft.extraInputs}
        onChange={(next) =>
          dispatch(patchDraft({ fileId, patch: { extraInputs: next } }))
        }
      />

      {streamError && (
        <p className="text-[10px] text-destructive leading-snug">
          {streamError}
        </p>
      )}

      {/* Bottom — Cancel | Save. RUN is intentionally NOT here; it
          lives on the play icon of saved templates so the template
          editing flow and the run flow never share buttons. */}
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
                ? "Discard changes and reload the saved template"
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
              selectedJobId
                ? "Update this template"
                : "Save as a new template"
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
        <p className="text-[10px] text-muted-foreground/70 leading-snug mt-1.5">
          To run an extraction, click the{" "}
          <Repeat className="w-2.5 h-2.5 inline-block" /> on a saved
          template above.
        </p>
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
    onChange(extraInputs.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
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
          Save another template first — you can then pipe its results
          into this one as a named variable.
        </p>
      </Field>
    );
  }

  return (
    <Field
      label="Extra inputs"
      hint="Pull result rows from other templates."
    >
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
            template, filtered to the current chunk&apos;s page range.
            Route via the agent variable wiring above.
          </p>
        )}
      </div>
    </Field>
  );
}

// ─── Internal: variable-mapping preview ───────────────────────────────────

function VariableMappingPreview({
  agentName,
  agentVariables,
  mapping,
}: {
  agentName: string;
  agentVariables: { name: string; helpText?: string | null }[] | null | undefined;
  mapping: Record<string, string>;
}) {
  if (!agentVariables || agentVariables.length === 0) {
    return (
      <p className="mt-1 text-[10px] text-muted-foreground/70 leading-snug">
        {agentName} declares no variables — the agent's prompt runs as-is.
      </p>
    );
  }
  // Build the inverse view: each agent var → which surface key fills it.
  const inverse = new Map<string, string>();
  for (const [surfaceKey, agentVar] of Object.entries(mapping)) {
    // Multiple surface keys can map to the same agent var (selection +
    // content + clean_text all route to page_content). Show the most
    // informative one — prefer the named source variation over the
    // back-compat aliases.
    const isAlias = surfaceKey === "selection" || surfaceKey === "content";
    if (!inverse.has(agentVar) || !isAlias) {
      inverse.set(agentVar, surfaceKey);
    }
  }

  const allMapped = agentVariables.every((v) => inverse.has(v.name));

  return (
    <div className="mt-1 space-y-0.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Variable wiring
      </p>
      <ul className="space-y-0.5 text-[10px]">
        {agentVariables.map((v) => {
          const sourceKey = inverse.get(v.name);
          return (
            <li
              key={v.name}
              className="flex items-baseline gap-1.5 leading-snug"
            >
              <code className="font-mono text-foreground/80">{v.name}</code>
              <span className="text-muted-foreground">←</span>
              {sourceKey ? (
                <code className="font-mono text-primary">{sourceKey}</code>
              ) : (
                <span className="text-amber-700 dark:text-amber-400 italic">
                  unmapped
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {!allMapped && (
        <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-snug">
          Some agent variables aren't wired up. The run may still work if
          the agent treats them as optional.
        </p>
      )}
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
