/**
 * features/page-extraction/components/VariableMappingEditor.tsx
 *
 * The agent-variable ↔ surface-value mapping editor for the chunked-run
 * Content Extractor surface. One row per declared agent variable, each
 * row a dropdown of every value the surface can emit.
 *
 * Dropdown order (top → bottom):
 *   1. Dynamic chunks   — Clean / Raw / PDF-page chunks with live counts.
 *                         Picking one of these implicitly tells the save
 *                         path which `source_variations` to request from
 *                         the Python backend (no checkboxes anymore).
 *   2. Extra inputs     — Named result rows pulled from other templates.
 *                         Each becomes its own option.
 *   3. Document         — filename, file id, total pages, etc.
 *   4. Scope text       — Inherited from `matrx-user/pdf-widgets` —
 *                         full_document_text, current_page_text,
 *                         page_range_text, selected_text, active_scope_text.
 *                         Useful when an agent wants whole-doc context
 *                         alongside the chunk it's currently running on.
 *   5. Runtime          — Per-chunk metadata (chunk_index, chunk_count,
 *                         page_numbers, current_page, scope_kind, job_id,
 *                         run_id, using_clean_text).
 *   6. Advanced         — Baseline aliases (`selection`, `content`,
 *                         `text_before`, `text_after`) kept behind a
 *                         "Show more" toggle so cross-surface authors
 *                         can still wire them.
 *
 * Storage shape on the Job's `variable_mapping`:
 *   `{ [surface_value_name]: agent_variable_name }`
 *
 * The Python backend looks up each surface key in the mapping at run
 * time and routes the emitted value to the named agent variable. Two
 * agent variables can't consume the same surface key — the UI enforces
 * this by disabling already-claimed values in other rows' dropdowns.
 */

"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, X, Zap } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getManifest } from "@/features/surfaces/manifests/registry";
import { CONTENT_EXTRACTOR_SURFACE_NAME } from "@/features/page-extraction/constants";
import type { SurfaceValue } from "@/features/surfaces/types";
import { deriveVariableMapping } from "@/features/page-extraction/utils/derive-variable-mapping";
import type { ExtraExtractionInput } from "@/features/page-extraction/types";
import type { PageExtractionJob } from "@/features/page-extraction/types";

export interface AgentVariableForMapping {
  name: string;
  helpText?: string | null;
}

export interface VariableMappingEditorProps {
  agentName: string;
  agentVariables: AgentVariableForMapping[] | null | undefined;
  /** The Job's `variable_mapping`: `{ surface_value_name: agent_var_name }`. */
  mapping: Record<string, string>;
  /** Live chunk count from the draft's chunk-preview. Shown next to each "X Chunks" option. */
  chunkCount: number;
  /** User-defined named inputs sourced from other templates. Appear in the dropdown as their own options. */
  extraInputs: ExtraExtractionInput[];
  /** Other saved templates on this file — used to render extra-input dropdowns and labels. */
  candidateJobs: PageExtractionJob[];
  onChange: (next: Record<string, string>) => void;
  onChangeExtraInputs: (next: ExtraExtractionInput[]) => void;
}

/** Sentinel value used by the dropdown to mean "no mapping for this variable". */
const UNMAPPED_VALUE = "__unmapped__";

/** Surface keys that represent dynamic chunk text — drive `source_variations` derivation. */
const CHUNK_KEYS = ["clean_text", "raw_text", "pdf_page"] as const;
type ChunkKey = (typeof CHUNK_KEYS)[number];

/** Advanced / legacy keys hidden behind "Show more". */
const ADVANCED_KEYS = [
  "selection",
  "content",
  "text_before",
  "text_after",
] as const;

// ─── Mapping helpers ───────────────────────────────────────────────────────

function buildInverse(mapping: Record<string, string>): Map<string, string> {
  const inverse = new Map<string, string>();
  for (const [surfaceKey, agentVar] of Object.entries(mapping)) {
    const isAlias = surfaceKey === "selection" || surfaceKey === "content";
    if (!inverse.has(agentVar) || !isAlias) {
      inverse.set(agentVar, surfaceKey);
    }
  }
  return inverse;
}

function setAgentVarMapping(
  current: Record<string, string>,
  agentVar: string,
  surfaceKey: string,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(current)) {
    if (v !== agentVar) next[k] = v;
  }
  if (surfaceKey !== UNMAPPED_VALUE) {
    next[surfaceKey] = agentVar;
  }
  return next;
}

// ─── Dropdown-row label types ──────────────────────────────────────────────

/**
 * Everything that can appear in the dropdown — manifest-declared
 * surface values OR user-defined extra inputs. We render them through
 * the same row component so layout stays consistent.
 */
type Option =
  | {
      kind: "surface";
      key: string;
      label: string;
      hint?: string;
      muted?: boolean;
    }
  | {
      kind: "extra";
      key: string;
      label: string;
      hint?: string;
      muted?: boolean;
    };

interface OptionGroup {
  id: string;
  label: string;
  options: Option[];
}

// ─── Component ─────────────────────────────────────────────────────────────

export function VariableMappingEditor({
  agentName,
  agentVariables,
  mapping,
  chunkCount,
  extraInputs,
  candidateJobs,
  onChange,
  onChangeExtraInputs,
}: VariableMappingEditorProps) {
  const manifest = getManifest(CONTENT_EXTRACTOR_SURFACE_NAME);
  const surfaceValues = useMemo(() => manifest?.values ?? [], [manifest]);
  const byName = useMemo(
    () => new Map(surfaceValues.map((v) => [v.name, v] as const)),
    [surfaceValues],
  );

  const inverse = useMemo(() => buildInverse(mapping), [mapping]);
  const claimedKeys = new Set(Object.keys(mapping));

  // Look up the source-template label for an extra input.
  const jobNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const j of candidateJobs) m.set(j.id, j.name);
    return m;
  }, [candidateJobs]);

  // Build the option groups in display order.
  const { primaryGroups, advancedGroup } = useMemo(
    () =>
      buildOptionGroups({
        byName,
        chunkCount,
        extraInputs,
        jobNameById,
      }),
    [byName, chunkCount, extraInputs, jobNameById],
  );

  // Auto-reveal the advanced section when an existing mapping points there.
  const anyAdvancedClaimed = useMemo(
    () => ADVANCED_KEYS.some((k) => claimedKeys.has(k)),
    [claimedKeys],
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const expandAdvanced = showAdvanced || anyAdvancedClaimed;

  if (!agentVariables || agentVariables.length === 0) {
    return (
      <p className="mt-1 text-[10px] text-muted-foreground/70 leading-snug">
        {agentName} has no variables — the agent runs as-is.
      </p>
    );
  }

  const handleAutoSuggest = () => {
    // Heuristic is sourceVariations-aware; pass an "all on" set so it
    // can pick any chunk shape that matches the agent's variable names
    // — the save path will narrow source_variations to the actual
    // keys claimed.
    const derived = deriveVariableMapping(agentVariables, [
      "clean_text",
      "raw_text",
      "pdf_page",
    ]);
    onChange(derived);
  };

  return (
    <div className="my-2 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Variable wiring
        </p>
        <button
          type="button"
          onClick={handleAutoSuggest}
          className="inline-flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors shrink-0"
          title="Guess mappings from variable names."
        >
          <Zap className="w-3 h-3" />
          Auto-suggest
        </button>
      </div>

      <ul className="space-y-1.5">
        {agentVariables.map((v) => {
          const currentKey = inverse.get(v.name) ?? UNMAPPED_VALUE;
          return (
            <li key={v.name} className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <code className="font-mono text-[11px] text-foreground/90 truncate min-w-0 flex-1">
                  {v.name}
                </code>
                <span className="text-muted-foreground text-[10px]">←</span>
                <OptionSelect
                  value={currentKey}
                  primaryGroups={primaryGroups}
                  advancedGroup={advancedGroup}
                  expandAdvanced={expandAdvanced}
                  onToggleAdvanced={() => setShowAdvanced((p) => !p)}
                  disabledKeys={
                    new Set([...claimedKeys].filter((k) => k !== currentKey))
                  }
                  onChange={(nextKey) =>
                    onChange(setAgentVarMapping(mapping, v.name, nextKey))
                  }
                />
              </div>
              {v.helpText && (
                <p className="text-[10px] text-muted-foreground/70 leading-snug pl-1">
                  {v.helpText}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <ExtraInputsManager
        extraInputs={extraInputs}
        candidateJobs={candidateJobs}
        onChange={onChangeExtraInputs}
      />
    </div>
  );
}

// ─── Option group builder ──────────────────────────────────────────────────

function buildOptionGroups({
  byName,
  chunkCount,
  extraInputs,
  jobNameById,
}: {
  byName: Map<string, SurfaceValue>;
  chunkCount: number;
  extraInputs: ExtraExtractionInput[];
  jobNameById: Map<string, string>;
}): { primaryGroups: OptionGroup[]; advancedGroup: OptionGroup | null } {
  const groups: OptionGroup[] = [];
  const countLabel = chunkCount > 0 ? `${chunkCount} ` : "";

  // 1. Dynamic chunks — live counts in the label so the user sees
  //    immediately how many runs each option produces.
  const chunkOpts: Option[] = [];
  for (const key of CHUNK_KEYS) {
    const v = byName.get(key);
    if (!v) continue;
    chunkOpts.push({
      kind: "surface",
      key,
      label: chunkLabel(key, countLabel),
      hint: chunkHint(key),
    });
  }
  if (chunkOpts.length > 0) {
    groups.push({
      id: "chunks",
      label: chunkCount > 0 ? `${chunkCount} dynamic chunks` : "Dynamic chunks",
      options: chunkOpts,
    });
  }

  // 2. Extra inputs — user-defined named inputs sourced from other
  //    templates. Each gets its own dropdown option.
  if (extraInputs.length > 0) {
    const opts: Option[] = extraInputs
      .filter((e) => e.name.trim() !== "")
      .map((e) => ({
        kind: "extra",
        key: e.name,
        label: e.name,
        hint:
          jobNameById.get(e.source_job_id) ?? "Select a source template below",
      }));
    if (opts.length > 0) {
      groups.push({ id: "extras", label: "Extra inputs", options: opts });
    }
  }

  // 3. Document — file-level identity / metadata.
  groups.push(
    pickGroup({
      id: "document",
      label: "Document",
      keys: ["filename", "file_id", "processed_document_id", "total_pages"],
      byName,
    }),
  );

  // 4. Scope text — inherited from pdf-widgets. Whole-doc / page-level
  //    text for agents that need chunk context.
  groups.push(
    pickGroup({
      id: "scope-text",
      label: "Scope text (whole-doc)",
      keys: [
        "full_document_text",
        "current_page_text",
        "page_range_text",
        "selected_text",
        "active_scope_text",
      ],
      byName,
    }),
  );

  // 5. Runtime — per-chunk metadata.
  groups.push(
    pickGroup({
      id: "runtime",
      label: "Runtime",
      keys: [
        "chunk_index",
        "chunk_count",
        "page_numbers",
        "current_page",
        "scope_kind",
        "using_clean_text",
        "job_id",
        "run_id",
        "context",
      ],
      byName,
    }),
  );

  // 6. Advanced — kept behind "Show more".
  const advancedGroup = pickGroup({
    id: "advanced",
    label: "Advanced",
    keys: [...ADVANCED_KEYS],
    byName,
  });

  // Defensive: anything left over goes into the runtime bucket (better
  // than silently losing it).
  const claimed = new Set<string>();
  for (const g of groups) {
    for (const o of g.options) if (o.kind === "surface") claimed.add(o.key);
  }
  for (const o of advancedGroup.options) {
    if (o.kind === "surface") claimed.add(o.key);
  }
  const orphans: Option[] = [];
  for (const [name, v] of byName) {
    if (!claimed.has(name)) {
      orphans.push({ kind: "surface", key: name, label: v.label });
    }
  }
  if (orphans.length > 0) {
    const runtime = groups.find((g) => g.id === "runtime");
    if (runtime) runtime.options.push(...orphans);
  }

  // Drop empty groups (defensive — `pickGroup` can return empty when
  // the manifest is missing keys).
  const filtered = groups.filter((g) => g.options.length > 0);

  return {
    primaryGroups: filtered,
    advancedGroup: advancedGroup.options.length > 0 ? advancedGroup : null,
  };
}

function pickGroup({
  id,
  label,
  keys,
  byName,
}: {
  id: string;
  label: string;
  keys: readonly string[];
  byName: Map<string, SurfaceValue>;
}): OptionGroup {
  const options: Option[] = [];
  for (const k of keys) {
    const v = byName.get(k);
    if (!v) continue;
    options.push({
      kind: "surface",
      key: v.name,
      label: v.label,
    });
  }
  return { id, label, options };
}

function chunkLabel(key: ChunkKey, countPrefix: string): string {
  switch (key) {
    case "clean_text":
      return `${countPrefix}clean-text chunks`;
    case "raw_text":
      return `${countPrefix}raw-text chunks`;
    case "pdf_page":
      return `${countPrefix}PDF page chunks`;
  }
}

function chunkHint(key: ChunkKey): string | undefined {
  switch (key) {
    case "clean_text":
      return "AI-cleaned per-chunk text";
    case "raw_text":
      return "Raw OCR per-chunk text";
    case "pdf_page":
      return "PDF page attachment (visual)";
  }
}

// ─── Select widget ─────────────────────────────────────────────────────────

function OptionRow({ option }: { option: Option }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 truncate min-w-0">
      <span
        className={`truncate ${option.muted ? "text-muted-foreground" : ""}`}
      >
        {option.label}
      </span>
      {option.hint && (
        <span className="text-[10px] text-muted-foreground/70 truncate">
          {option.hint}
        </span>
      )}
    </span>
  );
}

function OptionSelect({
  value,
  primaryGroups,
  advancedGroup,
  expandAdvanced,
  onToggleAdvanced,
  disabledKeys,
  onChange,
}: {
  value: string;
  primaryGroups: OptionGroup[];
  advancedGroup: OptionGroup | null;
  expandAdvanced: boolean;
  onToggleAdvanced: () => void;
  disabledKeys: Set<string>;
  onChange: (next: string) => void;
}) {
  const renderGroup = (group: OptionGroup) => (
    <SelectGroup key={group.id}>
      <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground py-0.5">
        {group.label}
      </SelectLabel>
      {group.options.map((o) => (
        <SelectItem
          key={o.key}
          value={o.key}
          disabled={disabledKeys.has(o.key)}
          className="text-[11px]"
        >
          <OptionRow option={o} />
        </SelectItem>
      ))}
    </SelectGroup>
  );

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className="h-6 text-[11px] flex-1 min-w-0 max-w-[55%]"
        aria-label="Pick a surface value"
      >
        <SelectValue placeholder="Not mapped" />
      </SelectTrigger>
      <SelectContent className="max-h-[60vh] min-w-[20rem]">
        <SelectItem value={UNMAPPED_VALUE} className="text-[11px]">
          <span className="text-muted-foreground italic">Not mapped</span>
        </SelectItem>
        <SelectSeparator className="my-1" />
        {primaryGroups.flatMap((group, idx) => [
          renderGroup(group),
          idx < primaryGroups.length - 1 ? (
            <SelectSeparator key={`${group.id}-sep`} className="my-1" />
          ) : null,
        ])}
        {advancedGroup && (
          <>
            <SelectSeparator className="my-1" />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleAdvanced();
              }}
              className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-accent/30 rounded-sm transition-colors"
              aria-expanded={expandAdvanced}
            >
              {expandAdvanced ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <span>{expandAdvanced ? "Hide" : "Show"} advanced</span>
            </button>
            {expandAdvanced && renderGroup(advancedGroup)}
          </>
        )}
      </SelectContent>
    </Select>
  );
}

// ─── Extra inputs manager ──────────────────────────────────────────────────

/**
 * Compact inline editor for the user's named extra inputs. Lives at
 * the bottom of the wiring panel so options stay near where they're
 * configured. Each row: name + source template. The named entry then
 * appears in every variable's dropdown under "Extra inputs".
 */
function ExtraInputsManager({
  extraInputs,
  candidateJobs,
  onChange,
}: {
  extraInputs: ExtraExtractionInput[];
  candidateJobs: PageExtractionJob[];
  onChange: (next: ExtraExtractionInput[]) => void;
}) {
  if (candidateJobs.length === 0 && extraInputs.length === 0) return null;

  const addRow = () =>
    onChange([...extraInputs, { name: "", source_job_id: "" }]);
  const updateRow = (idx: number, patch: Partial<ExtraExtractionInput>) =>
    onChange(
      extraInputs.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    );
  const removeRow = (idx: number) =>
    onChange(extraInputs.filter((_, i) => i !== idx));

  return (
    <div className="pt-1.5 border-t border-border/60 space-y-1">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Extra inputs ({extraInputs.length})
      </p>
      {extraInputs.map((row, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <Input
            value={row.name}
            onChange={(e) => updateRow(idx, { name: e.target.value })}
            placeholder="variable_name"
            className="h-6 text-[11px] w-1/3 font-mono"
          />
          <span className="text-[10px] text-muted-foreground">←</span>
          <select
            value={row.source_job_id}
            onChange={(e) => updateRow(idx, { source_job_id: e.target.value })}
            className="h-6 text-[11px] flex-1 min-w-0 rounded-md border border-input bg-background px-2"
          >
            <option value="">Template…</option>
            {candidateJobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-destructive"
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
        className="h-6 text-[10px] w-full"
        onClick={addRow}
        disabled={candidateJobs.length === 0}
      >
        <Plus className="w-3 h-3 mr-1" />
        Add extra input
      </Button>
    </div>
  );
}
