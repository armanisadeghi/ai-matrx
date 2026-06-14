/**
 * features/page-extraction/components/TemplateReadOnlyView.tsx
 *
 * Clean, read-only display of a Content Extractor template's settings.
 * Shown when the user has selected a saved template but hasn't clicked
 * Edit — gives them a one-glance summary plus Edit and Run buttons so
 * "just run this" is a single click.
 *
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │ Workers Comp Extractor                          [Edit] [Run] │
 *   │ chunk 12 · 1 src · 382 pages                                 │
 *   │ ───────────────────────────────────────────────────────────  │
 *   │ Agent          WC Extractor                                  │
 *   │ Pages          1-382                                         │
 *   │ Chunk size     12 (overlap 0)                                │
 *   │ Sources        Cleaned text                                  │
 *   │ Variables      page_content ← clean_text                     │
 *   │                document_name ← filename                      │
 *   │                pages ← page_numbers                          │
 *   │ Extra inputs   (none)                                        │
 *   └───────────────────────────────────────────────────────────────┘
 */

"use client";

import { Edit3, Loader2, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SOURCE_VARIATION_BY_KIND } from "@/features/page-extraction/constants";
import { formatPageRange } from "@/features/page-extraction/utils/chunk-preview";
import type {
  PageExtractionJob,
  SourceVariationKind,
} from "@/features/page-extraction/types";

export interface TemplateReadOnlyViewProps {
  job: PageExtractionJob;
  agentName: string | null;
  /** Agent variables hydrated from `agx_get_execution_minimal`. */
  agentVariables:
    | { name: string; helpText?: string | null }[]
    | null
    | undefined;
  running: boolean;
  onEdit: () => void;
  onRun: () => void | Promise<void>;
  /**
   * Whether this template has produced run data (chunks + results) that
   * can be deleted. When false the Delete-run-data control is hidden.
   */
  hasRunData?: boolean;
  /** True while a delete-run-data request is in flight. */
  deletingRunData?: boolean;
  /**
   * Delete every run this template produced — chunk runs + result rows —
   * while keeping the template itself. Optional; omit to hide the control.
   */
  onDeleteRunData?: () => void | Promise<void>;
}

export function TemplateReadOnlyView({
  job,
  agentName,
  agentVariables,
  running,
  onEdit,
  onRun,
  hasRunData = false,
  deletingRunData = false,
  onDeleteRunData,
}: TemplateReadOnlyViewProps) {
  // Show wiring keyed by agent variable, with the surface key that fills
  // it. Prefer the non-alias source key when multiple legacy keys point
  // at the same variable (matches the editor's inverse view).
  const inverseMapping = new Map<string, string>();
  for (const [surfaceKey, agentVar] of Object.entries(
    job.variable_mapping ?? {},
  )) {
    const isAlias = surfaceKey === "selection" || surfaceKey === "content";
    if (!inverseMapping.has(agentVar) || !isAlias) {
      inverseMapping.set(agentVar, surfaceKey);
    }
  }

  const variations = (job.source_variations ?? []) as SourceVariationKind[];
  const variationLabels = variations
    .map((kind) => SOURCE_VARIATION_BY_KIND.get(kind)?.label ?? kind)
    .join(", ");

  return (
    <div className="rounded-md border border-border bg-card text-[11px]">
      {/* Header — name + actions */}
      <div className="flex items-start gap-2 px-3 py-2 border-b border-border">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Selected template
          </p>
          <p className="font-medium truncate">{job.name}</p>
          <p className="text-[10px] text-muted-foreground tabular-nums">
            chunk {job.chunk_size} · {variations.length || 1} src ·{" "}
            {job.scope_pages?.length
              ? `${job.scope_pages.length} pages`
              : "all pages"}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[10px] shrink-0"
          onClick={onEdit}
          title="Edit this template's settings"
        >
          <Edit3 className="w-3 h-3 mr-1" />
          Edit
        </Button>
        <Button
          size="sm"
          className="h-7 px-2 text-[10px] shrink-0"
          onClick={() => void onRun()}
          disabled={running}
          title="Run a new extraction with this template"
        >
          {running ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Play className="w-3 h-3 mr-1" />
          )}
          Run
        </Button>
      </div>

      {/* Body — settings summary */}
      <dl className="px-3 py-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        <Row label="Agent">
          <span className="text-foreground/90">
            {agentName ?? (
              <em className="text-muted-foreground">Unknown agent</em>
            )}
          </span>
        </Row>
        <Row label="Pages">
          <span className="font-mono text-foreground/90">
            {job.scope_pages?.length
              ? formatPageRange(job.scope_pages)
              : "All pages"}
          </span>
        </Row>
        <Row label="Chunk size">
          <span className="font-mono text-foreground/90">
            {job.chunk_size}
            {job.chunk_overlap > 0 && (
              <span className="text-muted-foreground">
                {" "}
                (overlap {job.chunk_overlap})
              </span>
            )}
          </span>
        </Row>
        <Row label="Sources">
          <span className="text-foreground/90">
            {variationLabels || (
              <em className="text-muted-foreground">None selected</em>
            )}
          </span>
        </Row>
        <Row label="Variables">
          {agentVariables && agentVariables.length > 0 ? (
            <ul className="space-y-0.5">
              {agentVariables.map((v) => {
                const surfaceKey = inverseMapping.get(v.name);
                return (
                  <li
                    key={v.name}
                    className="flex items-baseline gap-1.5 leading-snug"
                  >
                    <code className="font-mono text-foreground/80">
                      {v.name}
                    </code>
                    <span className="text-muted-foreground">←</span>
                    {surfaceKey ? (
                      <code className="font-mono text-primary">
                        {surfaceKey}
                      </code>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400 italic text-[10px]">
                        not mapped
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <em className="text-muted-foreground">
              {agentName
                ? "Loading agent variables…"
                : "Agent variables unavailable"}
            </em>
          )}
        </Row>
        {job.extra_inputs && job.extra_inputs.length > 0 && (
          <Row label="Extra inputs">
            <ul className="space-y-0.5">
              {job.extra_inputs.map((ei, i) => (
                <li
                  key={`${ei.name}-${i}`}
                  className="font-mono text-[10px] text-foreground/80"
                >
                  {ei.name || (
                    <em className="text-muted-foreground">unnamed</em>
                  )}
                </li>
              ))}
            </ul>
          </Row>
        )}
        {job.rag_boost != null && (
          <Row label="RAG boost">
            <span className="font-mono text-foreground/90">
              {job.rag_boost}
            </span>
          </Row>
        )}
      </dl>

      {/* Footer — danger zone. Only shown once this template has run data
          to delete. Distinct from "delete template" (removes the template
          itself) and from clearing the Results table — this wipes the
          chunk runs AND result rows for every run, keeping the template. */}
      {hasRunData && onDeleteRunData && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border">
          <span className="text-[10px] text-muted-foreground leading-snug">
            Delete this template&apos;s run data (chunks + results). The
            template stays so you can run it again.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[10px] shrink-0 text-destructive hover:text-destructive border-destructive/40 hover:border-destructive/70"
            onClick={() => void onDeleteRunData()}
            disabled={deletingRunData}
            title="Delete all run data (chunk runs + result rows) for this template"
          >
            {deletingRunData ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3 mr-1" />
            )}
            Delete run data
          </Button>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-[10px] text-muted-foreground uppercase tracking-wider pt-0.5">
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}
