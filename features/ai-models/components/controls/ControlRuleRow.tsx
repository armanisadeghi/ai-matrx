"use client";

/**
 * One setting row of the structured Controls editor.
 *
 * Collapsed: key + label, effective-rule summary, resolved value, provenance
 * chips (setting / family / override). Expanded: typed inputs mapped 1:1 to
 * ControlRule fields, a destination toggle (this model's override vs the whole
 * family with its blast radius), and a raw-JSON escape hatch per source rule.
 */

import React, { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EnhancedEditableJsonViewer } from "@/components/ui/JsonComponents/JsonEditor";
import { cn } from "@/lib/utils";
import type { AiSetting, ControlRule } from "../../types";
import {
  resolveControlForKey,
  validateAutoNoneLaw,
  type ControlRowModel,
} from "../../controls/resolveControls";
import RuleValueInput from "./RuleValueInput";

export type RuleDestination = "override" | "family";

interface ControlRuleRowProps {
  row: ControlRowModel;
  modelMaxTokens: number | null | undefined;
  /** Distinct sibling models served by this row's wire contract (family). */
  familyModelCount: number;
  apiName: string | null;
  /** Draft edit for this key, if any. */
  draft: { destination: RuleDestination; rule: ControlRule | null } | null;
  /** rule=null means "remove this key at that destination". */
  onDraftChange: (
    key: string,
    destination: RuleDestination,
    rule: ControlRule | null,
  ) => void;
  onDiscardDraft: (key: string) => void;
  readOnly?: boolean;
}

function summarizeRule(rule: ControlRule): string {
  const bits: string[] = [];
  if (rule.supported === false) bits.push("unsupported");
  if (rule.const !== undefined) bits.push(`const=${JSON.stringify(rule.const)}`);
  if (rule.default !== undefined)
    bits.push(`default=${JSON.stringify(rule.default)}`);
  if (rule.clamp)
    bits.push(
      `clamp ${rule.clamp.min ?? "…"}–${rule.clamp.max ?? "…"}`,
    );
  if (rule.ui_values) bits.push(`ui_values[${rule.ui_values.length}]`);
  if (rule.value_map) bits.push(`value_map[${Object.keys(rule.value_map).length}]`);
  if (rule.provider_key) bits.push(`→ ${rule.provider_key}`);
  if (rule.processor) bits.push(`processor:${rule.processor}`);
  if (rule.send_when_unset) bits.push("send_when_unset");
  return bits.length ? bits.join(" · ") : "passthrough";
}

export default function ControlRuleRow({
  row,
  modelMaxTokens,
  familyModelCount,
  apiName,
  draft,
  onDraftChange,
  onDiscardDraft,
  readOnly,
}: ControlRuleRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [showRawRule, setShowRawRule] = useState(false);

  const destination: RuleDestination = draft?.destination ?? "override";
  // The rule being edited at the chosen destination (draft wins over stored).
  const storedAtDestination =
    destination === "family" ? row.familyRule : row.overrideRule;
  const editedRule: ControlRule =
    draft?.rule ?? storedAtDestination ?? {};

  // Effective merged rule with the draft applied — drives the live preview.
  const effectiveMerged: ControlRule =
    draft === null
      ? row.merged
      : destination === "family"
        ? { ...(draft.rule ?? {}), ...(row.overrideRule ?? {}) }
        : { ...(row.familyRule ?? {}), ...(draft.rule ?? {}) };

  const previewResolved = resolveControlForKey(
    row.key,
    effectiveMerged,
    row.setting,
    modelMaxTokens,
  );
  const autoNoneIssues = validateAutoNoneLaw(effectiveMerged);

  const label =
    (row.setting?.ui as { label?: string } | null)?.label ?? row.key;
  const isDirty = draft !== null;

  const patch = (fields: Partial<ControlRule>) => {
    const next: ControlRule = { ...editedRule, ...fields };
    // Drop explicitly-cleared fields so the stored rule stays sparse.
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) delete next[k as keyof ControlRule];
    }
    onDraftChange(row.key, destination, next);
  };

  const setDestination = (dest: RuleDestination) => {
    if (dest === destination) return;
    // Re-seed the draft from the stored rule at the new destination.
    onDraftChange(
      row.key,
      dest,
      draft?.rule ?? (dest === "family" ? row.familyRule : row.overrideRule) ?? {},
    );
  };

  const enumForDefault =
    previewResolved?.enum ??
    (Array.isArray(row.setting?.canonical_values)
      ? row.setting?.canonical_values
      : null);

  return (
    <div
      className={cn(
        "border rounded-md overflow-hidden",
        isDirty && "border-orange-400/60",
      )}
    >
      {/* Collapsed header */}
      <button
        type="button"
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="text-xs font-medium font-mono shrink-0">{row.key}</span>
        {label !== row.key && (
          <span className="text-[10px] text-muted-foreground truncate hidden lg:inline">
            {label}
          </span>
        )}
        {!row.provenance.known && (
          <Badge
            variant="outline"
            className="h-4 px-1 text-[10px] bg-red-50 dark:bg-red-900/20 text-red-600 border-red-300 shrink-0"
          >
            unknown setting key
          </Badge>
        )}
        {effectiveMerged.supported === false && (
          <Badge variant="outline" className="h-4 px-1 text-[10px] shrink-0">
            hidden
          </Badge>
        )}
        <span className="flex-1 min-w-0 text-[10px] text-muted-foreground truncate">
          {summarizeRule(effectiveMerged)}
        </span>
        {/* Provenance chips */}
        <span className="flex items-center gap-1 shrink-0">
          {row.provenance.family.length > 0 && (
            <Badge
              variant="outline"
              className="h-4 px-1 text-[10px] text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700"
              title={`Family rule fields: ${row.provenance.family.join(", ")}`}
            >
              family
            </Badge>
          )}
          {row.provenance.override.length > 0 && (
            <Badge
              variant="outline"
              className="h-4 px-1 text-[10px] text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-700"
              title={`Override fields: ${row.provenance.override.join(", ")}`}
            >
              override
            </Badge>
          )}
          {isDirty && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-orange-400"
              title="Unsaved draft"
            />
          )}
        </span>
      </button>

      {expanded && (
        <div className="border-t px-3 py-2 space-y-2.5 bg-muted/10">
          {row.setting?.description && (
            <p className="text-[10px] text-muted-foreground leading-snug">
              {row.setting.description}
            </p>
          )}

          {!readOnly && (
            <div className="flex items-center gap-1 text-[10px]">
              <span className="text-muted-foreground mr-1">Save edits to</span>
              <button
                type="button"
                onClick={() => setDestination("override")}
                className={cn(
                  "px-2 py-0.5 rounded border transition-colors",
                  destination === "override"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted",
                )}
              >
                This model only
              </button>
              <button
                type="button"
                onClick={() => setDestination("family")}
                className={cn(
                  "px-2 py-0.5 rounded border transition-colors",
                  destination === "family"
                    ? "bg-amber-500 text-white border-amber-500"
                    : "bg-background hover:bg-muted text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700",
                )}
                title="Writes ai.api.rules — the shared wire-contract envelope"
              >
                Whole family — affects {familyModelCount} model
                {familyModelCount === 1 ? "" : "s"}
                {apiName ? ` on ${apiName}` : ""}
              </button>
              {isDirty && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px] gap-1 ml-auto"
                  onClick={() => onDiscardDraft(row.key)}
                >
                  <RotateCcw className="h-3 w-3" />
                  Discard
                </Button>
              )}
            </div>
          )}

          {/* Typed rule fields */}
          <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 items-center">
            <span className="text-[10px] text-muted-foreground">Supported</span>
            <div className="flex items-center gap-2">
              <Switch
                checked={editedRule.supported !== false}
                disabled={readOnly}
                onCheckedChange={(on) =>
                  patch({ supported: on ? undefined : false })
                }
              />
              <span className="text-[10px] text-muted-foreground">
                {editedRule.supported === false
                  ? "hidden from users, never sent"
                  : "exposed"}
              </span>
            </div>

            <span className="text-[10px] text-muted-foreground">Default</span>
            <RuleValueInput
              valueType={row.setting?.value_type ?? "string"}
              enumValues={enumForDefault}
              min={previewResolved?.min ?? null}
              max={previewResolved?.max ?? null}
              value={editedRule.default}
              disabled={readOnly}
              placeholder={
                row.setting?.default_value != null
                  ? `setting default: ${JSON.stringify(row.setting.default_value)}`
                  : "unset"
              }
              onChange={(v) => patch({ default: v })}
            />

            {(row.setting?.value_type === "number" ||
              row.setting?.value_type === "integer") && (
              <>
                <span className="text-[10px] text-muted-foreground">Clamp</span>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    className="h-7 w-24 text-xs"
                    placeholder={`min ${row.setting?.canonical_min ?? ""}`}
                    disabled={readOnly}
                    value={editedRule.clamp?.min ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const min = raw === "" ? undefined : Number(raw);
                      const clamp = { ...(editedRule.clamp ?? {}) };
                      if (min === undefined) delete clamp.min;
                      else clamp.min = min;
                      patch({
                        clamp: Object.keys(clamp).length ? clamp : undefined,
                      });
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground">–</span>
                  <Input
                    type="number"
                    className="h-7 w-24 text-xs"
                    placeholder={`max ${row.setting?.canonical_max ?? ""}`}
                    disabled={readOnly}
                    value={editedRule.clamp?.max ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const max = raw === "" ? undefined : Number(raw);
                      const clamp = { ...(editedRule.clamp ?? {}) };
                      if (max === undefined) delete clamp.max;
                      else clamp.max = max;
                      patch({
                        clamp: Object.keys(clamp).length ? clamp : undefined,
                      });
                    }}
                  />
                </div>
              </>
            )}

            {(row.setting?.value_type === "enum" ||
              editedRule.ui_values !== undefined) && (
              <>
                <span className="text-[10px] text-muted-foreground">
                  UI vocabulary
                </span>
                <UiValuesEditor
                  canonical={
                    Array.isArray(row.setting?.canonical_values)
                      ? row.setting.canonical_values.map(String)
                      : []
                  }
                  value={
                    Array.isArray(editedRule.ui_values)
                      ? editedRule.ui_values.map(String)
                      : null
                  }
                  disabled={readOnly}
                  onChange={(vals) => patch({ ui_values: vals ?? undefined })}
                />
              </>
            )}
          </div>

          {autoNoneIssues.length > 0 && (
            <div className="flex items-start gap-1.5 text-[10px] text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <div>
                {autoNoneIssues.map((issue) => (
                  <p key={issue}>{issue}</p>
                ))}
              </div>
            </div>
          )}

          {/* Live resolved preview */}
          <div className="text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground">Resolves to: </span>
            <code className="font-mono break-all">
              {previewResolved ? JSON.stringify(previewResolved) : "(not exposed)"}
            </code>
          </div>

          {/* Raw escape hatch — everything ControlRule supports */}
          <div>
            <button
              type="button"
              className="text-[10px] text-primary hover:underline"
              onClick={() => setShowRawRule((v) => !v)}
            >
              {showRawRule ? "Hide" : "Edit"} raw rule (
              {destination === "family" ? "family" : "override"} source —
              value_map, processor, provider_key, …)
            </button>
            {showRawRule && (
              <div className="mt-1.5 border rounded">
                <EnhancedEditableJsonViewer
                  data={editedRule as object}
                  onSave={async (d) => {
                    if (typeof d === "string" || readOnly) return;
                    onDraftChange(row.key, destination, d as ControlRule);
                  }}
                  hideHeader={false}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Ordered multi-select chips over the canonical vocabulary + house tokens. */
function UiValuesEditor({
  canonical,
  value,
  onChange,
  disabled,
}: {
  canonical: string[];
  value: string[] | null;
  onChange: (vals: string[] | null) => void;
  disabled?: boolean;
}) {
  const options = Array.from(new Set([...canonical, "auto", "none"]));
  const active = value ?? [];
  return (
    <div className="flex flex-wrap items-center gap-1">
      {options.map((opt) => {
        const on = active.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() => {
              const next = on
                ? active.filter((v) => v !== opt)
                : [...active, opt];
              onChange(next.length ? next : null);
            }}
            className={cn(
              "px-1.5 py-0.5 rounded border text-[10px] transition-colors",
              on
                ? "bg-primary/10 border-primary text-primary"
                : "bg-background hover:bg-muted text-muted-foreground",
            )}
          >
            {opt}
          </button>
        );
      })}
      {value === null && (
        <span className="text-[10px] text-muted-foreground ml-1">
          (unset — vocabulary derives from value_map / canonical values)
        </span>
      )}
    </div>
  );
}
