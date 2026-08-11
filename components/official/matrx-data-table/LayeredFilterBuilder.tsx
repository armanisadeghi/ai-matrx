"use client";

import { useState, type DragEvent, type KeyboardEvent } from "react";
import { GripVertical, Plus, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  LAYERED_FILTER_OPERATOR_LABELS,
  isCompleteLayeredFilterRule,
  isLayeredFilterOperator,
  layeredFilterNeedsValue,
  layeredFilterRuleSummary,
  operatorsForLayeredField,
  type LayeredFilterField,
  type LayeredFilterRule,
} from "./layered-filters";

export interface LayeredFilterBuilderProps {
  fields: readonly LayeredFilterField[];
  rules: readonly LayeredFilterRule[];
  onChange: (rules: LayeredFilterRule[]) => void;
  maxRules?: number;
  label?: string;
}

function moveRule(
  rules: readonly LayeredFilterRule[],
  from: number,
  to: number,
): LayeredFilterRule[] {
  if (from === to || to < 0 || to >= rules.length) return [...rules];
  const next = [...rules];
  const [moved] = next.splice(from, 1);
  if (!moved) return next;
  next.splice(to, 0, moved);
  return next;
}

export function LayeredFilterBuilder({
  fields,
  rules,
  onChange,
  maxRules = 20,
  label = "Advanced filters",
}: LayeredFilterBuilderProps) {
  const [open, setOpen] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  if (fields.length === 0) return null;

  const updateRule = (index: number, patch: Partial<LayeredFilterRule>) => {
    onChange(
      rules.map((rule, candidate) =>
        candidate === index ? { ...rule, ...patch } : rule,
      ),
    );
  };

  const addRule = () => {
    const field = fields[0];
    if (!field || rules.length >= maxRules) return;
    const operator = operatorsForLayeredField(field)[0] ?? "contains";
    onChange([
      ...rules,
      {
        id: `layer-${Date.now()}-${rules.length}`,
        field: field.id,
        operator,
        value: field.kind === "select" ? (field.options[0]?.value ?? "") : "",
      },
    ]);
  };

  const removeRule = (index: number) => {
    onChange(rules.filter((_, candidate) => candidate !== index));
  };

  const reorder = (from: number, to: number) => {
    onChange(moveRule(rules, from, to));
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            const completeRules = rules.filter(isCompleteLayeredFilterRule);
            if (completeRules.length !== rules.length) onChange(completeRules);
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant={rules.length > 0 ? "secondary" : "outline"}
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs"
            aria-label={label}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {rules.length > 0 ? `${rules.length} layers` : "Advanced"}
            </span>
            {rules.length > 0 ? (
              <span className="sm:hidden">{rules.length}</span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-[min(46rem,calc(100vw-1rem))] p-0"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Narrow these results
              </p>
              <p className="text-xs text-muted-foreground">
                Every layer must match. Drag layers to put them in the order
                that makes sense to you.
              </p>
            </div>
            {rules.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-xs text-muted-foreground"
                onClick={() => onChange([])}
              >
                Clear layers
              </Button>
            ) : null}
          </div>

          <div className="max-h-[min(28rem,65vh)] space-y-1.5 overflow-y-auto p-2.5 scrollbar-thin">
            {rules.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-3 py-5 text-center">
                <p className="text-sm font-medium text-foreground">
                  Start with one simple layer
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  For example: Keyword contains ITAD, then Keyword doesn&apos;t
                  have the word “what”.
                </p>
              </div>
            ) : (
              rules.map((rule, index) => (
                <LayeredRuleRow
                  key={rule.id}
                  index={index}
                  rule={rule}
                  fields={fields}
                  dragging={draggedIndex === index}
                  onChange={(patch) => updateRule(index, patch)}
                  onRemove={() => removeRule(index)}
                  onDragStart={() => setDraggedIndex(index)}
                  onDragEnd={() => setDraggedIndex(null)}
                  onDrop={(targetIndex) => {
                    if (draggedIndex !== null)
                      reorder(draggedIndex, targetIndex);
                    setDraggedIndex(null);
                  }}
                  onKeyboardMove={(direction) =>
                    reorder(index, index + direction)
                  }
                />
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
            <p className="text-[11px] text-muted-foreground">
              The regular search still works and is applied before these layers.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 gap-1 px-2 text-xs"
              disabled={rules.length >= maxRules}
              onClick={addRule}
            >
              <Plus className="h-3.5 w-3.5" /> Add layer
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {rules.map((rule, index) => (
        <span
          key={`summary-${rule.id}`}
          className={cn(
            "inline-flex max-w-60 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
            isCompleteLayeredFilterRule(rule)
              ? "border-border bg-muted/50 text-foreground"
              : "border-dashed border-warning/50 bg-warning/10 text-warning",
          )}
        >
          <button
            type="button"
            className="min-w-0 truncate text-left"
            onClick={() => setOpen(true)}
            title={
              isCompleteLayeredFilterRule(rule)
                ? layeredFilterRuleSummary(rule, fields)
                : `Layer ${index + 1} needs a value`
            }
          >
            <span className="mr-1 text-muted-foreground">{index + 1}</span>
            {isCompleteLayeredFilterRule(rule)
              ? layeredFilterRuleSummary(rule, fields)
              : "Choose a value"}
          </button>
          <button
            type="button"
            className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Remove filter layer ${index + 1}`}
            onClick={() => removeRule(index)}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

function LayeredRuleRow({
  index,
  rule,
  fields,
  dragging,
  onChange,
  onRemove,
  onDragStart,
  onDragEnd,
  onDrop,
  onKeyboardMove,
}: {
  index: number;
  rule: LayeredFilterRule;
  fields: readonly LayeredFilterField[];
  dragging: boolean;
  onChange: (patch: Partial<LayeredFilterRule>) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: (targetIndex: number) => void;
  onKeyboardMove: (direction: -1 | 1) => void;
}) {
  const field =
    fields.find((candidate) => candidate.id === rule.field) ?? fields[0];
  if (!field) return null;
  const operators = operatorsForLayeredField(field);
  const needsValue = layeredFilterNeedsValue(rule.operator);

  const handleMoveKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    onKeyboardMove(event.key === "ArrowUp" ? -1 : 1);
  };

  return (
    <div
      className={cn(
        "grid grid-cols-[1.75rem_minmax(7.5rem,1fr)_minmax(8.5rem,1fr)_minmax(9rem,1.4fr)_1.75rem] items-center gap-1 rounded-md border border-border bg-card p-1.5 max-sm:grid-cols-[1.75rem_1fr_1.75rem]",
        dragging && "opacity-50",
      )}
      onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
      onDrop={(event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        onDrop(index);
      }}
    >
      <button
        type="button"
        draggable
        className="flex h-7 w-7 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
        aria-label={`Move filter layer ${index + 1}. Use arrow keys or drag.`}
        title="Drag to reorder; arrow keys also work"
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        onKeyDown={handleMoveKey}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <Select
        value={field.id}
        onValueChange={(nextFieldId) => {
          const nextField = fields.find(
            (candidate) => candidate.id === nextFieldId,
          );
          if (!nextField) return;
          const operator = operatorsForLayeredField(nextField)[0] ?? "contains";
          onChange({
            field: nextField.id,
            operator,
            value:
              nextField.kind === "select"
                ? (nextField.options[0]?.value ?? "")
                : "",
            valueTo: undefined,
          });
        }}
      >
        <SelectTrigger
          size="sm"
          className="h-7 w-full text-xs max-sm:col-span-1"
          aria-label={`Filter layer ${index + 1} field`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fields.map((candidate) => (
            <SelectItem
              key={candidate.id}
              value={candidate.id}
              className="text-xs"
            >
              {candidate.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={rule.operator}
        onValueChange={(operator) => {
          if (!isLayeredFilterOperator(operator)) return;
          onChange({
            operator,
            valueTo: operator === "between" ? rule.valueTo : undefined,
          });
        }}
      >
        <SelectTrigger
          size="sm"
          className="h-7 w-full text-xs max-sm:col-start-2"
          aria-label={`Filter layer ${index + 1} operator`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((operator) => (
            <SelectItem key={operator} value={operator} className="text-xs">
              {LAYERED_FILTER_OPERATOR_LABELS[operator]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="min-w-0 max-sm:col-span-3 max-sm:col-start-1">
        {!needsValue ? (
          <span className="flex h-7 items-center px-2 text-xs text-muted-foreground">
            No value needed
          </span>
        ) : field.kind === "select" ? (
          <Select
            value={rule.value}
            onValueChange={(value) => onChange({ value })}
          >
            <SelectTrigger
              size="sm"
              className="h-7 w-full text-xs"
              aria-label={`Filter layer ${index + 1} value`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="text-xs"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-center gap-1">
            <Input
              value={rule.value}
              onChange={(event) => onChange({ value: event.target.value })}
              inputMode={field.kind === "number" ? "decimal" : "text"}
              placeholder={
                field.kind === "number"
                  ? (field.placeholder ?? "Value")
                  : "Value…"
              }
              className="h-7 min-w-0 text-base sm:text-xs"
              aria-label={`Filter layer ${index + 1} value`}
            />
            {rule.operator === "between" ? (
              <>
                <span className="text-[11px] text-muted-foreground">and</span>
                <Input
                  value={rule.valueTo ?? ""}
                  onChange={(event) =>
                    onChange({ valueTo: event.target.value })
                  }
                  inputMode="decimal"
                  placeholder="Value"
                  className="h-7 min-w-0 text-base sm:text-xs"
                  aria-label={`Filter layer ${index + 1} upper value`}
                />
              </>
            ) : null}
          </div>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive max-sm:col-start-3 max-sm:row-start-1"
        aria-label={`Remove filter layer ${index + 1}`}
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
