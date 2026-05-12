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
  Repeat,
  Save,
} from "lucide-react";
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
import { useExtractionStream } from "@/features/page-extraction/hooks/useExtractionStream";
import { useChunkPreview } from "@/features/page-extraction/hooks/useChunkPreview";
import { parsePageRangeInput } from "@/features/page-extraction/utils/chunk-preview";
import { deriveVariableMapping } from "@/features/page-extraction/utils/derive-variable-mapping";
import { SavedJobsList } from "@/features/page-extraction/components/SavedJobsList";
import {
  DraftValidationError,
  draftDiffersFromJob,
  saveTemplateFromDraft,
  validateDraft,
  validateForRun,
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
import { Plus } from "lucide-react";

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
  const { running, error: streamError, start } = useExtractionStream();
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
  const runIssues = useMemo(() => validateForRun(draft), [draft]);
  const canSave = saveIssues.length === 0 && !saving;
  // Running requires: a saved Job to exist (or just-saved one), no dirty
  // state, all run-level fields filled in.
  const canRun =
    runIssues.length === 0 &&
    !running &&
    !!selectedJobId &&
    !isDirty;

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
    dispatch(patchDraft({ fileId, patch: { chunkSize: Math.max(1, n) } }));
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

  const handleRun = async () => {
    if (!selectedJobId) {
      toast.error("Save the template first.");
      return;
    }
    if (runIssues.length > 0) {
      toast.error(runIssues[0]);
      return;
    }
    if (isDirty) {
      toast.error("Save your changes before running.");
      return;
    }
    try {
      await start(fileId, { job_id: selectedJobId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start run");
    }
  };

  const handleNewTemplate = () => {
    dispatch(selectJobForFile({ fileId, jobId: null }));
    dispatch(clearDraft({ fileId }));
    dispatch(ensureDraft({ fileId }));
    setLoadedJob(null);
    toast.success("Started a new template");
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
            {loadedJob?.name ??
              draft.jobName.trim() ??
              "Untitled"}
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

      {/* Agent */}
      <Field label="Agent" required hint="Pick one of your agents.">
        <AgentListDropdown
          onSelect={(id) =>
            dispatch(patchDraft({ fileId, patch: { agentId: id } }))
          }
          label={agent?.name ?? "Pick agent…"}
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

      {/* Page range — REQUIRED, no default */}
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

      {/* Chunk size — REQUIRED, no default */}
      <Field
        label="Chunk size"
        required
        hint="Pages per agent call. No default — pick deliberately."
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
        {draft.chunkSize != null && draft.scopePages.length > 0 && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            →{" "}
            <span className="font-mono text-foreground/80">
              {chunks.length}
            </span>{" "}
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
      </Field>

      {/* Source variations */}
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

      {/* Template name — always visible, required for Save */}
      <Field
        label="Template name"
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

      {/* Save / Run buttons — two distinct actions. */}
      <div className="border-t border-border pt-3 space-y-2">
        {isDirty && selectedJobId && (
          <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-snug flex items-center gap-1">
            <AlertCircle className="w-3 h-3 shrink-0" />
            Unsaved changes — Save before you can Run.
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={isDirty || !selectedJobId ? "default" : "outline"}
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
                {selectedJobId ? "Update" : "Save template"}
              </>
            )}
          </Button>
          <Button
            size="sm"
            className="flex-1 h-8 text-[11px]"
            variant={isDirty || !selectedJobId ? "outline" : "default"}
            disabled={!canRun}
            onClick={() => void handleRun()}
            title={
              !selectedJobId
                ? "Save the template first"
                : isDirty
                  ? "Save changes before running"
                  : "Run a new extraction"
            }
          >
            {running ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Running…
              </>
            ) : (
              <>
                <Repeat className="w-3 h-3 mr-1" /> Run
              </>
            )}
          </Button>
        </div>
        {(saveIssues.length > 0 || (selectedJobId && runIssues.length > 0)) && (
          <ul className="space-y-0.5 text-[10px] text-amber-700 dark:text-amber-400">
            {[...saveIssues, ...(selectedJobId ? runIssues.filter((r) => !saveIssues.includes(r)) : [])].map(
              (issue) => (
                <li key={issue} className="flex items-start gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                  {issue}
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      {streamError && (
        <p className="text-[10px] text-destructive leading-snug">
          {streamError}
        </p>
      )}

      <p className="text-[10px] text-muted-foreground/70 leading-snug pt-1">
        Live chunk progress + final results land in the{" "}
        <span className="font-medium">Extractions</span> pane.
      </p>
    </div>
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
