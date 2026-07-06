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

import { useEffect, useMemo, useState } from "react";
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
import {
  isAgentVarLiteralWiring,
  isLiteralExtraInput,
  isTemplateExtraInput,
  literalValueForAgentVar,
  literalWiringKey,
  partitionExtraInputs,
} from "@/features/page-extraction/utils/extra-inputs";
import type {
  ExtraExtractionInput,
  PageExtractionJob,
  PageExtractionRun,
} from "@/features/page-extraction/types";
import { listRunsForJob } from "@/features/page-extraction/api/runs";

export interface AgentVariableForMapping {
  name: string;
  helpText?: string | null;
}

export interface VariableMappingEditorProps {
  agentName: string;
  agentVariables: AgentVariableForMapping[] | null | undefined;
  /** The Job's `variable_mapping`: `{ surface_value_name: agent_var_name }`. */
  mapping: Record<string, string>;
  /** Live chunk counts per variation — shown next to each "X Chunks" option. */
  chunkCountsByVariation: ChunkCountsByVariation;
  /** User-defined named inputs sourced from other templates. Appear in the dropdown as their own options. */
  extraInputs: ExtraExtractionInput[];
  /** Other saved templates on this file — used to render extra-input dropdowns and labels. */
  candidateJobs: PageExtractionJob[];
  onChange: (next: Record<string, string>) => void;
  onChangeExtraInputs: (next: ExtraExtractionInput[]) => void;
}

/** Sentinel value used by the dropdown to mean "no mapping for this variable". */
const UNMAPPED_VALUE = "__unmapped__";

/** Sentinel to switch a wiring row into literal-value mode. */
const LITERAL_MODE_VALUE = "__literal_mode__";

/** Surface keys that represent dynamic chunk text — drive `source_variations` derivation. */
const CHUNK_KEYS = ["clean_text", "raw_text", "pdf_page"] as const;
export type ChunkKey = (typeof CHUNK_KEYS)[number];

export type ChunkCountsByVariation = Partial<Record<ChunkKey, number>>;

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

function setAgentVarLiteral(
  current: Record<string, string>,
  extraInputs: ExtraExtractionInput[],
  agentVar: string,
  literalValue: string,
): { mapping: Record<string, string>; extraInputs: ExtraExtractionInput[] } {
  const legacyKey = literalWiringKey(agentVar);
  const without = extraInputs.filter(
    (e) => e.name !== agentVar && e.name !== legacyKey,
  );
  const mapping = setAgentVarMapping(current, agentVar, agentVar);
  const nextExtras: ExtraExtractionInput[] = [
    ...without,
    { name: agentVar, value: literalValue },
  ];
  return { mapping, extraInputs: nextExtras };
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

function setAgentVarSurfaceMapping(
  current: Record<string, string>,
  extraInputs: ExtraExtractionInput[],
  agentVar: string,
  surfaceKey: string,
): { mapping: Record<string, string>; extraInputs: ExtraExtractionInput[] } {
  const legacyKey = literalWiringKey(agentVar);
  return {
    mapping: setAgentVarMapping(current, agentVar, surfaceKey),
    extraInputs: extraInputs.filter(
      (e) => e.name !== agentVar && e.name !== legacyKey,
    ),
  };
}

function clearAgentVarLiteral(
  current: Record<string, string>,
  extraInputs: ExtraExtractionInput[],
  agentVar: string,
): { mapping: Record<string, string>; extraInputs: ExtraExtractionInput[] } {
  const legacyKey = literalWiringKey(agentVar);
  return {
    mapping: setAgentVarMapping(current, agentVar, UNMAPPED_VALUE),
    extraInputs: extraInputs.filter(
      (e) => e.name !== agentVar && e.name !== legacyKey,
    ),
  };
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
  chunkCountsByVariation,
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
        chunkCountsByVariation,
        extraInputs,
        jobNameById,
        mapping,
      }),
    [byName, chunkCountsByVariation, extraInputs, jobNameById, mapping],
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
          const isLiteralMode = isAgentVarLiteralWiring(
            v.name,
            mapping,
            extraInputs,
          );
          const literalValue = isLiteralMode
            ? literalValueForAgentVar(v.name, extraInputs)
            : "";
          return (
            <li key={v.name} className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <code className="font-mono text-[11px] text-foreground/90 truncate min-w-0 flex-1">
                  {v.name}
                </code>
                <span className="text-muted-foreground text-[10px]">←</span>
                {isLiteralMode ? (
                  <Input
                    value={literalValue}
                    onChange={(e) => {
                      const next = setAgentVarLiteral(
                        mapping,
                        extraInputs,
                        v.name,
                        e.target.value,
                      );
                      onChange(next.mapping);
                      onChangeExtraInputs(next.extraInputs);
                    }}
                    placeholder="Enter value…"
                    className="h-6 text-[11px] flex-1 min-w-0 max-w-[55%] font-mono"
                    aria-label={`Literal value for ${v.name}`}
                  />
                ) : (
                  <OptionSelect
                    value={currentKey}
                    primaryGroups={primaryGroups}
                    advancedGroup={advancedGroup}
                    expandAdvanced={expandAdvanced}
                    onToggleAdvanced={() => setShowAdvanced((p) => !p)}
                    disabledKeys={
                      new Set([...claimedKeys].filter((k) => k !== currentKey))
                    }
                    onChange={(nextKey) => {
                      if (nextKey === LITERAL_MODE_VALUE) {
                        const cleared = clearAgentVarLiteral(
                          mapping,
                          extraInputs,
                          v.name,
                        );
                        const next = setAgentVarLiteral(
                          cleared.mapping,
                          cleared.extraInputs,
                          v.name,
                          "",
                        );
                        onChange(next.mapping);
                        onChangeExtraInputs(next.extraInputs);
                        return;
                      }
                      const next = setAgentVarSurfaceMapping(
                        mapping,
                        extraInputs,
                        v.name,
                        nextKey,
                      );
                      onChange(next.mapping);
                      onChangeExtraInputs(next.extraInputs);
                    }}
                  />
                )}
                {isLiteralMode ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-[10px] shrink-0"
                    onClick={() => {
                      const next = clearAgentVarLiteral(
                        mapping,
                        extraInputs,
                        v.name,
                      );
                      onChange(next.mapping);
                      onChangeExtraInputs(next.extraInputs);
                    }}
                    title="Switch back to surface value picker"
                  >
                    Surface
                  </Button>
                ) : null}
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
        mapping={mapping}
        candidateJobs={candidateJobs}
        onChange={onChangeExtraInputs}
      />
    </div>
  );
}

// ─── Option group builder ──────────────────────────────────────────────────

function buildOptionGroups({
  byName,
  chunkCountsByVariation,
  extraInputs,
  jobNameById,
  mapping,
}: {
  byName: Map<string, SurfaceValue>;
  chunkCountsByVariation: ChunkCountsByVariation;
  extraInputs: ExtraExtractionInput[];
  jobNameById: Map<string, string>;
  mapping: Record<string, string>;
}): { primaryGroups: OptionGroup[]; advancedGroup: OptionGroup | null } {
  const groups: OptionGroup[] = [];
  const maxChunkCount = Math.max(
    0,
    ...CHUNK_KEYS.map((k) => chunkCountsByVariation[k] ?? 0),
  );

  // 1. Dynamic chunks — live counts in the label so the user sees
  //    immediately how many runs each option produces.
  const chunkOpts: Option[] = [];
  for (const key of CHUNK_KEYS) {
    const v = byName.get(key);
    if (!v) continue;
    chunkOpts.push({
      kind: "surface",
      key,
      label: chunkLabel(key, chunkCountsByVariation[key]),
      hint: chunkHint(key),
    });
  }
  if (chunkOpts.length > 0) {
    groups.push({
      id: "chunks",
      label:
        maxChunkCount > 0
          ? `${maxChunkCount} dynamic chunks`
          : "Dynamic chunks",
      options: chunkOpts,
    });
  }

  // 2. Extra inputs — user-defined named inputs sourced from other
  //    templates or fixed literals. Each gets its own dropdown option.
  //    Inline literal-wiring keys (__literal__:*) are managed on the
  //    wiring row itself and excluded here.
  const { manual: manualExtras } = partitionExtraInputs(extraInputs, mapping);
  if (manualExtras.length > 0) {
    const opts: Option[] = manualExtras
      .filter((e) => e.name.trim() !== "")
      .map((e) => {
        if (isLiteralExtraInput(e)) {
          return {
            kind: "extra" as const,
            key: e.name,
            label: e.name,
            hint: `Literal: ${String(e.value)}`,
          };
        }
        const runHint =
          e.source_run_id != null && e.source_run_id !== ""
            ? "Pinned run"
            : "All runs";
        return {
          kind: "extra" as const,
          key: e.name,
          label: e.name,
          hint: `${jobNameById.get(e.source_job_id) ?? "Template"} · ${runHint}`,
        };
      });
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

function chunkLabel(key: ChunkKey, count: number | undefined): string {
  const countPrefix = count != null && count > 0 ? `${count} ` : "";
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
      <SelectContent
        className="max-h-[min(60dvh,20rem)] min-w-[20rem] z-[10001]"
        position="popper"
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={12}
      >
        <SelectItem value={UNMAPPED_VALUE} className="text-[11px]">
          <span className="text-muted-foreground italic">Not mapped</span>
        </SelectItem>
        <SelectItem value={LITERAL_MODE_VALUE} className="text-[11px]">
          <span className="text-foreground">Literal value…</span>
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
 * configured. Each row: name + either a template/run source or a literal
 * text/number value. Named entries appear in every variable's dropdown
 * under "Extra inputs".
 */
function ExtraInputsManager({
  extraInputs,
  mapping,
  candidateJobs,
  onChange,
}: {
  extraInputs: ExtraExtractionInput[];
  mapping: Record<string, string>;
  candidateJobs: PageExtractionJob[];
  onChange: (next: ExtraExtractionInput[]) => void;
}) {
  const { inlineLiterals, manual: manualExtras } = partitionExtraInputs(
    extraInputs,
    mapping,
  );

  const mergeLists = (manual: ExtraExtractionInput[]) => [
    ...inlineLiterals,
    ...manual,
  ];

  const addTemplateRow = () =>
    onChange([
      ...mergeLists(manualExtras),
      { name: "", source_job_id: "", source_run_id: null },
    ]);
  const addLiteralRow = () =>
    onChange([...mergeLists(manualExtras), { name: "", value: "" }]);

  const updateRow = (idx: number, patch: Partial<ExtraExtractionInput>) => {
    const nextManual = manualExtras.map((row, i) =>
      i === idx ? ({ ...row, ...patch } as ExtraExtractionInput) : row,
    );
    onChange(mergeLists(nextManual));
  };

  const removeRow = (idx: number) => {
    onChange(mergeLists(manualExtras.filter((_, i) => i !== idx)));
  };

  const setRowKind = (idx: number, kind: "template" | "literal") => {
    const row = manualExtras[idx];
    if (!row) return;
    const name = row.name;
    const nextRow: ExtraExtractionInput =
      kind === "literal"
        ? { name, value: "" }
        : { name, source_job_id: "", source_run_id: null };
    onChange(mergeLists(manualExtras.map((r, i) => (i === idx ? nextRow : r))));
  };

  return (
    <div className="pt-1.5 border-t border-border/60 space-y-1">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Extra inputs ({manualExtras.length})
      </p>
      {manualExtras.map((row, idx) => (
        <ExtraInputRow
          key={idx}
          row={row}
          candidateJobs={candidateJobs}
          onPatch={(patch) => updateRow(idx, patch)}
          onRemove={() => removeRow(idx)}
          onSetKind={(kind) => setRowKind(idx, kind)}
        />
      ))}
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[10px] flex-1"
          onClick={addTemplateRow}
          disabled={candidateJobs.length === 0}
        >
          <Plus className="w-3 h-3 mr-1" />
          From template
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[10px] flex-1"
          onClick={addLiteralRow}
        >
          <Plus className="w-3 h-3 mr-1" />
          Literal value
        </Button>
      </div>
    </div>
  );
}

function ExtraInputRow({
  row,
  candidateJobs,
  onPatch,
  onRemove,
  onSetKind,
}: {
  row: ExtraExtractionInput;
  candidateJobs: PageExtractionJob[];
  onPatch: (patch: Partial<ExtraExtractionInput>) => void;
  onRemove: () => void;
  onSetKind: (kind: "template" | "literal") => void;
}) {
  const isLiteral = isLiteralExtraInput(row);
  const [runs, setRuns] = useState<PageExtractionRun[]>([]);
  const sourceJobId = isTemplateExtraInput(row) ? row.source_job_id : "";

  useEffect(() => {
    if (!sourceJobId) {
      setRuns([]);
      return;
    }
    let cancelled = false;
    void listRunsForJob(sourceJobId).then((loaded) => {
      if (!cancelled) setRuns(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [sourceJobId]);

  const runLabel = (run: PageExtractionRun, index: number) => {
    const when = run.started_at ?? run.created_at;
    const date = when ? new Date(when).toLocaleString() : `Run ${index + 1}`;
    return `${date} · ${run.status}`;
  };

  return (
    <div className="space-y-1 rounded-md border border-border/50 bg-muted/20 px-1.5 py-1">
      <div className="flex items-center gap-1.5">
        <Input
          value={row.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          placeholder="variable_name"
          className="h-6 text-[11px] w-1/3 font-mono"
        />
        <select
          value={isLiteral ? "literal" : "template"}
          onChange={(e) =>
            onSetKind(e.target.value === "literal" ? "literal" : "template")
          }
          className="h-6 text-[10px] w-16 shrink-0 rounded-md border border-input bg-background px-1"
          aria-label="Input kind"
        >
          <option value="template">Template</option>
          <option value="literal">Value</option>
        </select>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 shrink-0 ml-auto text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          title="Remove this input"
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
      {isLiteral ? (
        <Input
          value={String(row.value ?? "")}
          onChange={(e) => onPatch({ value: e.target.value })}
          placeholder="Text or number"
          className="h-6 text-[11px] w-full font-mono"
        />
      ) : (
        <div className="flex flex-col gap-1">
          <select
            value={row.source_job_id ?? ""}
            onChange={(e) =>
              onPatch({
                source_job_id: e.target.value,
                source_run_id: null,
              })
            }
            className="h-6 text-[11px] w-full rounded-md border border-input bg-background px-2"
          >
            <option value="">Template…</option>
            {candidateJobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
          {sourceJobId ? (
            <select
              value={row.source_run_id ?? ""}
              onChange={(e) =>
                onPatch({
                  source_run_id: e.target.value || null,
                })
              }
              className="h-6 text-[11px] w-full rounded-md border border-input bg-background px-2"
            >
              <option value="">All runs (default)</option>
              {runs.map((run, i) => (
                <option key={run.id} value={run.id}>
                  {runLabel(run, i)}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      )}
    </div>
  );
}
