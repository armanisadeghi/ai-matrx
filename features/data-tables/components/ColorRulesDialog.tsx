/**
 * ColorRulesDialog — the settings dialog behind a user data table's colors.
 *
 * Two things are edited here, and nothing else:
 *   1. COLOR BY A COLUMN — one choice/boolean column tints rows or its own
 *      cells, using the option colors the column already carries.
 *   2. RULES — an ordered list; the first rule that matches a row wins.
 *
 * Manual highlights (right-click) are NOT edited here — they are a gesture on
 * the grid, and they always beat what this dialog configures.
 *
 * This component never talks to Supabase. Every change leaves through
 * `onSetPath(path, value)`, one surgical path at a time, exactly as
 * `udt_set_table_style` expects — so two people editing different parts of a
 * table's style never overwrite each other.
 */
"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { resolveFieldFormat } from "@/lib/field-formats/format";
import type { TableField } from "@/utils/user-table-utls/table-utils";

import {
  COLOR_RULE_OP_LABELS,
  OPS_WITH_VALUE,
  STYLE_COLORS,
  STYLE_COLOR_LABELS,
  SWATCH_CLASS,
  isStyleColor,
  stylePath,
  type ColorRule,
  type ColorRuleOp,
  type StyleColor,
  type StyleTarget,
  type TableStyle,
} from "@ai-matrx/design-system/data-table/table-style";

/** Radix Select forbids an empty item value, so "no column" needs a sentinel. */
const NO_COLUMN = "__none__";

type ChoiceOption = { value: string; label?: string; color?: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: TableField[];
  style: TableStyle;
  /** Resolved options per column (value → color) for choice columns; may be missing for a column. */
  choicesByField?: Record<string, ChoiceOption[]>;
  /**
   * Distinct values ACTUALLY IN the table per column, from the rows the browser
   * holds. A choice column accepts off-list values (typed into a cell, they
   * render amber) and a rule must be able to name them — until 2026-09-25 the
   * value list showed only the declared options, so a value that was in every
   * row could not be colored (Arman: "the Active option I just added doesn't
   * appear"). Declared options come first; the rest say so.
   */
  valuesInData?: Record<string, string[]>;
  /** Persist ONE path; resolves when the write landed (the owner shows the error toast on failure and rethrows nothing). */
  onSetPath: (path: readonly string[], value: unknown) => Promise<void>;
};

// ─── Column kinds ───────────────────────────────────────────────────────────

type ColumnKind = "choice" | "boolean" | "number" | "text";

function columnKind(field: TableField): ColumnKind {
  const formatId = resolveFieldFormat(field.data_type, field.metadata).id;
  if (formatId === "choice" || formatId === "multi_choice") return "choice";
  if (formatId === "boolean" || field.data_type === "boolean") return "boolean";
  if (
    formatId === "number" ||
    formatId === "decimal" ||
    formatId === "integer" ||
    formatId === "currency" ||
    formatId === "percent" ||
    field.data_type === "number" ||
    field.data_type === "integer"
  ) {
    return "number";
  }
  return "text";
}

const OPS_BY_KIND: Record<ColumnKind, readonly ColorRuleOp[]> = {
  choice: ["is", "is_not", "contains", "is_empty", "not_empty"],
  boolean: ["is_true", "is_false"],
  number: ["is", "is_not", "is_empty", "not_empty", "gt", "gte", "lt", "lte"],
  text: ["is", "is_not", "contains", "is_empty", "not_empty"],
};

function opTakesValue(op: ColorRuleOp): boolean {
  return OPS_WITH_VALUE.includes(op);
}

// ─── Small shared bits ──────────────────────────────────────────────────────

function ColorSwatch({ color }: { color: StyleColor }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`h-3 w-3 shrink-0 rounded-sm ${SWATCH_CLASS[color]}`} />
      <span>{STYLE_COLOR_LABELS[color]}</span>
    </span>
  );
}

function TargetSelect({
  value,
  onChange,
  ariaLabel,
}: {
  value: StyleTarget;
  onChange: (next: StyleTarget) => void;
  ariaLabel: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next === "cell" ? "cell" : "row")}
    >
      <SelectTrigger className="h-8 w-[9.5rem]" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="row">Whole row</SelectItem>
        <SelectItem value="cell">This cell</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ColorRulesDialog({
  open,
  onOpenChange,
  fields,
  style,
  choicesByField,
  valuesInData,
  onSetPath,
}: Props) {
  const [rules, setRules] = useState<ColorRule[]>(() =>
    open && style.rules ? style.rules.map((r) => ({ ...r })) : [],
  );
  const [savingRules, setSavingRules] = useState(false);
  const [savingColorBy, setSavingColorBy] = useState(false);

  // The dialog is a snapshot editor for rules: re-read the style each time it
  // opens, so a closed-and-reopened dialog never shows a stale draft. This is
  // the sanctioned "adjust state while rendering" pattern — no effect, no
  // cascading render.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setRules(style.rules ? style.rules.map((r) => ({ ...r })) : []);
  }

  const colorByCandidates = fields.filter((f) => {
    const kind = columnKind(f);
    return kind === "choice" || kind === "boolean";
  });

  const fieldByName = new Map(fields.map((f) => [f.field_name, f]));
  const colorBy = style.colorBy ?? null;
  const colorByTarget: StyleTarget = colorBy?.target ?? "row";

  const setColorBy = async (next: { field: string; target: StyleTarget } | null) => {
    setSavingColorBy(true);
    try {
      await onSetPath(stylePath.colorBy(), next);
    } finally {
      setSavingColorBy(false);
    }
  };

  const updateRule = (id: string, patch: Partial<ColorRule>) => {
    setRules((current) =>
      current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    );
  };

  const moveRule = (index: number, delta: number) => {
    setRules((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const addRule = () => {
    const first = fields[0];
    if (!first) return;
    const kind = columnKind(first);
    setRules((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        field: first.field_name,
        op: OPS_BY_KIND[kind][0] ?? "is",
        color: "amber",
        target: "row",
      },
    ]);
  };

  const saveRules = async () => {
    setSavingRules(true);
    try {
      await onSetPath(stylePath.rules(), rules.length > 0 ? rules : null);
      onOpenChange(false);
    } finally {
      setSavingRules(false);
    }
  };

  const optionsFor = (fieldName: string): ChoiceOption[] => {
    const resolved = choicesByField?.[fieldName];
    let declared: ChoiceOption[] = [];
    if (resolved && resolved.length > 0) declared = resolved;
    else {
      const field = fieldByName.get(fieldName);
      const inline = field ? resolveFieldFormat(field.data_type, field.metadata).options?.choices : undefined;
      declared = inline ? inline.map((c) => ({ value: c.value, label: c.label, color: c.color })) : [];
    }
    const known = new Set(declared.map((o) => o.value));
    const extra = (valuesInData?.[fieldName] ?? [])
      .filter((v) => !known.has(v))
      .map((v) => ({ value: v, label: `${v} · in the table, not an option` }));
    return [...declared, ...extra];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Table colors</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 overflow-x-hidden">
          {/* ── Color by a column ─────────────────────────────────────── */}
          <section className="space-y-2">
            <Label className="text-sm font-medium">Color by a column</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={colorBy?.field ?? NO_COLUMN}
                disabled={savingColorBy}
                onValueChange={(next) => {
                  void setColorBy(
                    next === NO_COLUMN ? null : { field: next, target: colorByTarget },
                  );
                }}
              >
                <SelectTrigger className="h-8 w-[16rem]" aria-label="Column to color by">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_COLUMN}>None</SelectItem>
                  {colorByCandidates.map((field) => (
                    <SelectItem key={field.id} value={field.field_name}>
                      {field.display_name || field.field_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={colorByTarget}
                disabled={savingColorBy || !colorBy}
                onValueChange={(next) => {
                  if (!colorBy) return;
                  void setColorBy({
                    field: colorBy.field,
                    target: next === "cell" ? "cell" : "row",
                  });
                }}
              >
                <SelectTrigger className="h-8 w-[14rem]" aria-label="What the color paints">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="row">Tint the whole row</SelectItem>
                  <SelectItem value="cell">Tint only that column</SelectItem>
                </SelectContent>
              </Select>

              {savingColorBy ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              A choice column uses each option&apos;s own color; a checkbox column tints
              checked rows green.
            </p>
          </section>

          {/* ── Rules ─────────────────────────────────────────────────── */}
          <section className="space-y-2">
            <Label className="text-sm font-medium">Rules</Label>
            <p className="text-xs text-muted-foreground">
              First matching rule wins, top to bottom.
            </p>

            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rules yet.</p>
            ) : (
              <ul className="space-y-2">
                {rules.map((rule, index) => {
                  const field = fieldByName.get(rule.field);
                  const kind = field ? columnKind(field) : "text";
                  const ops = OPS_BY_KIND[kind];
                  const options = kind === "choice" ? optionsFor(rule.field) : [];
                  const useOptionSelect =
                    options.length > 0 && (rule.op === "is" || rule.op === "is_not");

                  return (
                    <li
                      key={rule.id}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2"
                    >
                      <Select
                        value={rule.field}
                        onValueChange={(next) => {
                          const nextField = fieldByName.get(next);
                          const nextOps = OPS_BY_KIND[nextField ? columnKind(nextField) : "text"];
                          updateRule(rule.id, {
                            field: next,
                            op: nextOps.includes(rule.op) ? rule.op : (nextOps[0] ?? "is"),
                            value: undefined,
                          });
                        }}
                      >
                        <SelectTrigger className="h-8 w-[12rem]" aria-label="Column">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {fields.map((f) => (
                            <SelectItem key={f.id} value={f.field_name}>
                              {f.display_name || f.field_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={rule.op}
                        onValueChange={(next) => {
                          const op = next as ColorRuleOp;
                          updateRule(rule.id, {
                            op,
                            value: opTakesValue(op) ? rule.value : undefined,
                          });
                        }}
                      >
                        <SelectTrigger className="h-8 w-[11rem]" aria-label="Condition">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ops.map((op) => (
                            <SelectItem key={op} value={op}>
                              {COLOR_RULE_OP_LABELS[op]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {opTakesValue(rule.op) ? (
                        useOptionSelect ? (
                          <Select
                            value={rule.value ?? ""}
                            onValueChange={(next) => updateRule(rule.id, { value: next })}
                          >
                            <SelectTrigger className="h-8 w-[12rem]" aria-label="Value">
                              <SelectValue placeholder="Pick an option" />
                            </SelectTrigger>
                            <SelectContent>
                              {options.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label ?? option.value}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            className="h-8 w-[12rem]"
                            aria-label="Value"
                            type={kind === "number" ? "number" : "text"}
                            value={rule.value ?? ""}
                            placeholder="Value"
                            onChange={(event) =>
                              updateRule(rule.id, { value: event.target.value })
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") event.preventDefault();
                            }}
                          />
                        )
                      ) : null}

                      <Select
                        value={rule.color}
                        onValueChange={(next) => {
                          if (isStyleColor(next)) updateRule(rule.id, { color: next });
                        }}
                      >
                        <SelectTrigger className="h-8 w-[9rem]" aria-label="Color">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STYLE_COLORS.map((color) => (
                            <SelectItem key={color} value={color}>
                              <ColorSwatch color={color} />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <TargetSelect
                        value={rule.target}
                        ariaLabel="What this rule paints"
                        onChange={(target) => updateRule(rule.id, { target })}
                      />

                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Move rule up"
                          disabled={index === 0}
                          onClick={() => moveRule(index, -1)}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Move rule down"
                          disabled={index === rules.length - 1}
                          onClick={() => moveRule(index, 1)}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Remove rule"
                          onClick={() =>
                            setRules((current) => current.filter((r) => r.id !== rule.id))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={addRule}
              disabled={fields.length === 0}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add rule
            </Button>
          </section>

          <p className="text-xs text-muted-foreground">
            Manual highlights (right-click a cell, row or column) always win over rules.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={savingRules}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void saveRules()} disabled={savingRules}>
            {savingRules ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Save rules
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
