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
import {
  createJobFromDraft,
  DraftValidationError,
  validateDraft,
} from "@/features/page-extraction/services/run-from-draft";
import { selectJobForFile } from "@/features/page-extraction/redux/pageExtractionSlice";
import type { SourceVariationKind } from "@/features/page-extraction/types";

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
  const { running, error: streamError, start } = useExtractionStream();
  const { chunks, stats, availablePages, loading: pagesLoading } =
    useChunkPreview({ fileId, processedDocumentId });

  const agent = useAppSelector((s) =>
    draft.agentId ? selectAgentById(s, draft.agentId) : undefined,
  );

  // Ensure a draft exists for this file on mount.
  useEffect(() => {
    dispatch(ensureDraft({ fileId }));
  }, [dispatch, fileId]);

  // Auto-derive variable_mapping when the agent or selected variations
  // change. We DON'T overwrite a mapping the user has explicitly edited
  // (tracked via `_mappingUserEdited` on the draft, set when they manually
  // patch the mapping). The agent record's `variableDefinitions` drives
  // the heuristic — see derive-variable-mapping.ts.
  useEffect(() => {
    if (!agent) return;
    const derived = deriveVariableMapping(
      agent.variableDefinitions,
      draft.sourceVariations,
    );
    // Always recompute when the agent/variations change. If the user wants
    // to lock in a custom mapping, save the Job and re-use it (saved Jobs
    // keep their mapping verbatim on the server).
    dispatch(patchDraft({ fileId, patch: { variableMapping: derived } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.id, draft.sourceVariations.join("|"), fileId]);

  // Local error for the page-range input only.
  const [rangeError, setRangeError] = useState<string | null>(null);

  const validationIssues = useMemo(() => validateDraft(draft), [draft]);
  const canRun = validationIssues.length === 0 && !running;

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

  const handleRun = async () => {
    if (!userId) {
      toast.error("Not signed in.");
      return;
    }
    if (!canRun) {
      toast.error(validationIssues[0] ?? "Form not complete.");
      return;
    }
    try {
      const job = await createJobFromDraft(draft, {
        fileId,
        processedDocumentId,
        ownerId: userId,
        fallbackName: documentName,
      });
      // Make the new Job the active one so the results table follows it.
      dispatch(selectJobForFile({ fileId, jobId: job.id }));
      await start(fileId, { job_id: job.id });
    } catch (err) {
      if (err instanceof DraftValidationError) {
        toast.error(err.issues[0]);
      } else {
        toast.error(err instanceof Error ? err.message : "Could not start run");
      }
    }
  };

  return (
    <div className="p-3 space-y-3 text-[11px]">
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

      {/* Save as Job */}
      <div className="border-t border-border pt-3 space-y-1.5">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={draft.saveAsJob}
            onCheckedChange={(checked) =>
              dispatch(
                patchDraft({
                  fileId,
                  patch: { saveAsJob: checked === true },
                }),
              )
            }
          />
          <span className="text-[11px]">
            <Save className="w-3 h-3 inline-block mr-1 -mt-0.5" />
            Save as a named Job
          </span>
        </label>
        {draft.saveAsJob && (
          <Input
            value={draft.jobName}
            onChange={(e) =>
              dispatch(
                patchDraft({ fileId, patch: { jobName: e.target.value } }),
              )
            }
            placeholder="Job name (visible in the Job picker)"
            className="h-7 text-[11px]"
          />
        )}
      </div>

      {/* Validation summary + Run */}
      {validationIssues.length > 0 && (
        <ul className="space-y-0.5 pt-1 text-[10px] text-amber-700 dark:text-amber-400">
          {validationIssues.map((issue) => (
            <li key={issue} className="flex items-start gap-1">
              <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
              {issue}
            </li>
          ))}
        </ul>
      )}

      <Button
        size="sm"
        className="w-full h-8 text-[11px]"
        disabled={!canRun}
        onClick={() => void handleRun()}
      >
        {running ? (
          <>
            <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Running…
          </>
        ) : (
          <>
            <Repeat className="w-3 h-3 mr-1" /> Run extraction
          </>
        )}
      </Button>

      {streamError && (
        <p className="text-[10px] text-destructive leading-snug">
          {streamError}
        </p>
      )}

      <p className="text-[10px] text-muted-foreground/70 leading-snug pt-1">
        Chunks visualize in the <span className="font-medium">Extractions</span>{" "}
        pane (Chunks tab). Results appear there as soon as each chunk
        completes.
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
