/**
 * features/page-extraction/components/VariableMappingEditor.tsx
 *
 * The agent-variable ↔ surface-value mapping editor for Content Extractor
 * templates. Replaces the old heuristic-derived `VariableMappingPreview`
 * that just told the user "selection" or "unmapped" with no way to fix it.
 *
 * One row per declared agent variable. Each row shows the variable name +
 * help text and a dropdown of every `SurfaceValue` declared by the
 * `matrx-user/content-extractor` manifest. The user picks the surface
 * value that should populate each agent variable. Optionally fills in
 * extra inputs (per-template variables sourced from other templates) as
 * separate rows below.
 *
 * Storage shape lives on the Job's `variable_mapping`:
 *   `{ [surface_value_name]: agent_variable_name }`
 *
 * That direction is dictated by the Python backend — when it builds the
 * per-chunk variable bag it looks up each surface key in the mapping and
 * routes the emitted value to the named agent variable. Because the
 * keys are surface names, two agent variables CANNOT consume the same
 * surface value (each surface key resolves to exactly one agent var).
 * The UI enforces this by disabling already-claimed surface values in
 * other rows' dropdowns.
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ page_content   ← [ Cleaned text          ▾ ]                │
 *   │   "Main per-page body."                                     │
 *   │ document_name  ← [ Document filename     ▾ ]                │
 *   │   "Display name."                                           │
 *   │ pages          ← [ Page range            ▾ ]                │
 *   │ raw_input      ← [ Not mapped            ▾ ]                │
 *   │ ─────────────────────────────────────────────────────────── │
 *   │ Auto-suggest mappings   ←  recompute heuristic              │
 *   └─────────────────────────────────────────────────────────────┘
 */

"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
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
import { getManifest } from "@/features/tool-registry/surfaces/manifests/registry";
import { CONTENT_EXTRACTOR_SURFACE_NAME } from "@/features/page-extraction/constants";
import type { SurfaceValue } from "@/features/tool-registry/surfaces/types";
import type { SourceVariationKind } from "@/features/page-extraction/types";
import { deriveVariableMapping } from "@/features/page-extraction/utils/derive-variable-mapping";

export interface AgentVariableForMapping {
  name: string;
  helpText?: string | null;
}

export interface VariableMappingEditorProps {
  agentName: string;
  agentVariables: AgentVariableForMapping[] | null | undefined;
  /** The Job's `variable_mapping` shape: `{ surface_value_name: agent_var_name }`. */
  mapping: Record<string, string>;
  /** Currently selected source_variations on the draft (cleaned/raw/pdf). */
  selectedVariations: SourceVariationKind[];
  onChange: (next: Record<string, string>) => void;
}

/** Sentinel value used by the dropdown to mean "no mapping for this variable". */
const UNMAPPED_VALUE = "__unmapped__";

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Build the inverse view of the Job mapping:
 *   `mapping`     →  { selection: "page_content", clean_text: "page_content" }
 *   `inverse`     →  { page_content: "selection" | "clean_text" }
 *
 * Where multiple surface keys point at the same agent variable (legacy
 * alias chains), we prefer the non-alias key. This is the same preference
 * the old read-only preview used.
 */
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

/**
 * Replace the mapping for one agent variable. Removes any old key that
 * pointed to this agent var (so flipping the dropdown swaps cleanly,
 * leaving no orphaned aliases behind) and writes the new pairing.
 *
 * `surfaceKey === UNMAPPED_VALUE` clears the variable entirely.
 */
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

/**
 * Semantic grouping for the surface-value dropdown.
 *
 * Two tiers:
 *
 * PRIMARY — what an agent author actually wires up in a chunked run:
 *   "Chunk content" (the agent's input), "Chunk location" (which pages
 *   in the document), "Document" (filename + IDs), "Run" (job + run IDs).
 *
 * ADVANCED — baseline values declared for cross-surface consistency
 *   but conceptually mismatched with chunked runs. `selection` and
 *   `content` are widget concepts (operate on a selection / full doc),
 *   `text_before` / `text_after` assume a selection cursor inside a
 *   region — none of which exists in a chunked run. They're kept in
 *   the manifest so other surfaces (notes, code editor) can use the
 *   same vocabulary, and so legacy Phase-1 Jobs whose mappings target
 *   `selection` / `content` (back-compat aliases for chunk text) keep
 *   working. The editor hides this whole group behind a "Show more"
 *   toggle so it doesn't crowd the primary picker.
 *
 * `context` (free-form escape hatch) stays in PRIMARY — it's
 * universally applicable.
 */
const PRIMARY_GROUP_DEFINITIONS: readonly {
  id: string;
  label: string;
  names: readonly string[];
}[] = [
  {
    id: "chunk-content",
    label: "Chunk content (the agent's input)",
    names: ["clean_text", "raw_text", "pdf_page"],
  },
  {
    id: "chunk-location",
    label: "Chunk location",
    names: ["page_numbers", "chunk_index", "chunk_count"],
  },
  {
    id: "document",
    label: "Document",
    names: ["filename", "file_id", "processed_document_id"],
  },
  {
    id: "run",
    label: "Run",
    names: ["job_id", "run_id"],
  },
  {
    id: "other",
    label: "Other",
    names: ["context"],
  },
];

/**
 * Baseline values kept under "Show more". Items here are still
 * selectable; they just don't crowd the default view. Order matches
 * the manifest sort.
 */
const ADVANCED_GROUP_DEFINITION: {
  id: string;
  label: string;
  names: readonly string[];
} = {
  id: "advanced",
  label: "Selection-based (legacy / cross-surface)",
  names: ["selection", "content", "text_before", "text_after"],
};

interface SurfaceValueGroup {
  id: string;
  label: string;
  values: SurfaceValue[];
}

function buildGroups(values: readonly SurfaceValue[]): {
  primary: SurfaceValueGroup[];
  advanced: SurfaceValueGroup[];
} {
  const byName = new Map(values.map((v) => [v.name, v] as const));
  const claimed = new Set<string>();

  const primary: SurfaceValueGroup[] = [];
  for (const def of PRIMARY_GROUP_DEFINITIONS) {
    const groupValues: SurfaceValue[] = [];
    for (const name of def.names) {
      const v = byName.get(name);
      if (v) {
        groupValues.push(v);
        claimed.add(name);
      }
    }
    if (groupValues.length > 0) {
      primary.push({ id: def.id, label: def.label, values: groupValues });
    }
  }

  const advancedValues: SurfaceValue[] = [];
  for (const name of ADVANCED_GROUP_DEFINITION.names) {
    const v = byName.get(name);
    if (v) {
      advancedValues.push(v);
      claimed.add(name);
    }
  }
  const advanced: SurfaceValueGroup[] =
    advancedValues.length > 0
      ? [
          {
            id: ADVANCED_GROUP_DEFINITION.id,
            label: ADVANCED_GROUP_DEFINITION.label,
            values: advancedValues,
          },
        ]
      : [];

  // Defensive — anything not classified ends up in primary so it isn't
  // silently lost.
  const orphans = values.filter((v) => !claimed.has(v.name));
  if (orphans.length > 0) {
    primary.push({
      id: "uncategorized",
      label: "Uncategorized",
      values: orphans,
    });
  }

  return { primary, advanced };
}

/**
 * Is this surface value going to be empty at run time given the current
 * `source_variations` selection on the draft? Used to mute the item in
 * the dropdown and to surface a warning under any agent variable wired
 * to it.
 */
function isInactive(
  v: SurfaceValue,
  selectedVariations: SourceVariationKind[],
): boolean {
  if (
    v.name === "clean_text" ||
    v.name === "raw_text" ||
    v.name === "pdf_page"
  ) {
    return !selectedVariations.includes(v.name as SourceVariationKind);
  }
  // Legacy aliases mirror the primary text — empty when no variation is on.
  if (v.name === "selection" || v.name === "content") {
    return selectedVariations.length === 0;
  }
  return false;
}

/** The variation kind that gates this surface value, if any. */
function gatingVariation(name: string): SourceVariationKind | null {
  if (name === "clean_text" || name === "raw_text" || name === "pdf_page") {
    return name as SourceVariationKind;
  }
  return null;
}

const VARIATION_LABELS: Record<SourceVariationKind, string> = {
  clean_text: "Cleaned text",
  raw_text: "Raw text",
  pdf_page: "PDF page",
};

// ─── Component ────────────────────────────────────────────────────────────

export function VariableMappingEditor({
  agentName,
  agentVariables,
  mapping,
  selectedVariations,
  onChange,
}: VariableMappingEditorProps) {
  const manifest = getManifest(CONTENT_EXTRACTOR_SURFACE_NAME);

  const surfaceValues = useMemo(() => manifest?.values ?? [], [manifest]);

  const { primary: primaryGroups, advanced: advancedGroups } = useMemo(
    () => buildGroups(surfaceValues),
    [surfaceValues],
  );

  const inverse = useMemo(() => buildInverse(mapping), [mapping]);

  // Surface keys claimed by any agent variable — used to (a) disable
  // them in OTHER rows' dropdowns and (b) auto-reveal the advanced
  // section if any agent var is currently wired to an advanced value.
  const claimedSurfaceKeys = new Set(Object.keys(mapping));

  // If any current mapping points at an advanced value, the dropdown
  // expands the advanced section by default — otherwise the user
  // would see "Not mapped" in the trigger and wonder where their
  // selection went.
  const anyAdvancedClaimed = useMemo(() => {
    const advancedNames = new Set(
      advancedGroups.flatMap((g) => g.values.map((v) => v.name)),
    );
    for (const k of claimedSurfaceKeys) if (advancedNames.has(k)) return true;
    return false;
  }, [claimedSurfaceKeys, advancedGroups]);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const expandAdvanced = showAdvanced || anyAdvancedClaimed;

  if (!agentVariables || agentVariables.length === 0) {
    return (
      <p className="mt-1 text-[10px] text-muted-foreground/70 leading-snug">
        {agentName} declares no variables — the agent&apos;s prompt runs as-is.
      </p>
    );
  }

  // Quick lookup: surface name → SurfaceValue, used by the warning rows
  // to figure out the gating variation for an inactive mapping.
  const byName = new Map(surfaceValues.map((v) => [v.name, v] as const));

  const handleAutoSuggest = () => {
    const derived = deriveVariableMapping(agentVariables, selectedVariations);
    onChange(derived);
  };

  return (
    <div className="my-2 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Variable wiring
          </p>
          <p className="text-[10px] text-muted-foreground/80 leading-snug">
            Each run = one chunk. Wire the agent&apos;s content variable to a{" "}
            <span className="font-medium">Chunk content</span> source.
          </p>
        </div>
        <button
          type="button"
          onClick={handleAutoSuggest}
          className="inline-flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors shrink-0"
          title="Heuristically guess mappings based on the agent's variable names."
        >
          <Sparkles className="w-3 h-3" />
          Auto-suggest
        </button>
      </div>
      <ul className="space-y-1.5">
        {agentVariables.map((v) => {
          const currentSurfaceKey = inverse.get(v.name) ?? UNMAPPED_VALUE;
          const currentValue = byName.get(currentSurfaceKey);
          const inactiveReason =
            currentValue && isInactive(currentValue, selectedVariations)
              ? gatingVariation(currentValue.name)
              : null;
          return (
            <li key={v.name} className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <code className="font-mono text-[11px] text-foreground/90 truncate min-w-0 flex-1">
                  {v.name}
                </code>
                <span className="text-muted-foreground text-[10px]">←</span>
                <SurfaceValueSelect
                  value={currentSurfaceKey}
                  primaryGroups={primaryGroups}
                  advancedGroups={advancedGroups}
                  expandAdvanced={expandAdvanced}
                  onToggleAdvanced={() => setShowAdvanced((p) => !p)}
                  selectedVariations={selectedVariations}
                  disabledKeys={
                    new Set(
                      [...claimedSurfaceKeys].filter(
                        (k) => k !== currentSurfaceKey,
                      ),
                    )
                  }
                  onChange={(nextKey) =>
                    onChange(setAgentVarMapping(mapping, v.name, nextKey))
                  }
                />
              </div>
              {inactiveReason && (
                <p className="flex items-start gap-1 text-[10px] text-amber-700 dark:text-amber-400 leading-snug pl-1">
                  <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>
                    {VARIATION_LABELS[inactiveReason]} isn&apos;t enabled below
                    — this variable will be empty at run time.
                  </span>
                </p>
              )}
              {v.helpText && (
                <p className="text-[10px] text-muted-foreground/70 leading-snug pl-1">
                  {v.helpText}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Internal: surface-value select ───────────────────────────────────────

/**
 * Single-line label used both inside dropdown items and in the trigger
 * (when collapsed, the trigger reuses the active item's children).
 * Keeping both renderings to one line guarantees the dropdown row height
 * stays predictable — two-line labels break the visual grid and waste
 * vertical space.
 */
function SurfaceValueRow({
  value,
  muted,
}: {
  value: SurfaceValue;
  muted?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5 truncate min-w-0">
      <span className={`truncate ${muted ? "text-muted-foreground" : ""}`}>
        {value.label}
      </span>
      <code className="text-[10px] text-muted-foreground/80 font-mono truncate">
        {value.name}
      </code>
    </span>
  );
}

function SurfaceValueSelect({
  value,
  primaryGroups,
  advancedGroups,
  expandAdvanced,
  onToggleAdvanced,
  selectedVariations,
  disabledKeys,
  onChange,
}: {
  value: string;
  primaryGroups: SurfaceValueGroup[];
  advancedGroups: SurfaceValueGroup[];
  expandAdvanced: boolean;
  onToggleAdvanced: () => void;
  selectedVariations: SourceVariationKind[];
  disabledKeys: Set<string>;
  onChange: (next: string) => void;
}) {
  const renderGroup = (group: SurfaceValueGroup) => (
    <SelectGroup key={group.id}>
      <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground py-0.5">
        {group.label}
      </SelectLabel>
      {group.values.map((v) => {
        const inactive = isInactive(v, selectedVariations);
        return (
          <SelectItem
            key={v.name}
            value={v.name}
            disabled={disabledKeys.has(v.name)}
            className="text-[11px]"
          >
            <SurfaceValueRow value={v} muted={inactive} />
          </SelectItem>
        );
      })}
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
      <SelectContent className="max-h-[60vh] min-w-[18rem]">
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
        {advancedGroups.length > 0 && (
          <>
            <SelectSeparator className="my-1" />
            {/* Toggle row — Radix Select only auto-closes on SelectItem
                activation, so a plain <button> inside SelectContent
                keeps the menu open while flipping the section. */}
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
            {expandAdvanced &&
              advancedGroups.map((group) => renderGroup(group))}
          </>
        )}
      </SelectContent>
    </Select>
  );
}
