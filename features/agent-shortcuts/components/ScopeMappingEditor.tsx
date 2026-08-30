"use client";

import React, { useState } from "react";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, Plus, X } from "lucide-react";
import {
  DEFAULT_AVAILABLE_SCOPES,
  SCOPE_LEVEL_META,
  type ScopeLevel,
} from "../constants";

export interface AgentVariableDefinition {
  name: string;
  default_value?: unknown;
  description?: string | null;
}

export interface ScopeMappingEditorProps {
  /**
   * The persisted mapping. Shape: `{ [scopeKey]: variableName }`.
   * Each scope key is unique; the same variable name may appear under
   * multiple scope keys.
   */
  scopeMappings: Record<string, string> | null;
  variableDefinitions: AgentVariableDefinition[];
  onChange: (mappings: Record<string, string> | null) => void;
  compact?: boolean;
}

const STANDARD_SCOPES: string[] = [...DEFAULT_AVAILABLE_SCOPES];
const CUSTOM_OPTION = "__custom__";

function labelForScope(scope: string): string {
  return SCOPE_LEVEL_META[scope as ScopeLevel]?.label ?? scope;
}

interface Row {
  id: string;
  variableName: string;
  scopeKey: string;
  isDraft: boolean;
}

function draftId(): string {
  return `draft-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Variable-first mapping editor. Each row binds one agent variable to one
 * surface scope key. The same variable may appear in multiple rows (mapped to
 * different scope keys). Scope keys are unique across rows — the persisted
 * shape is `Record<scopeKey, variableName>`, so duplicate scope keys are
 * impossible by construction.
 */
export function ScopeMappingEditor({
  scopeMappings,
  variableDefinitions,
  onChange,
  compact = false,
}: ScopeMappingEditorProps) {
  const mappings = scopeMappings ?? {};
  const hasVariables = variableDefinitions.length > 0;

  // Draft rows hold in-progress entries where variable or scope is still blank.
  // Once both sides are set we commit into `scopeMappings` and drop the draft.
  const [drafts, setDrafts] = useState<Row[]>([]);
  // Row id currently in "type a custom scope key" mode.
  const [customKeyFor, setCustomKeyFor] = useState<string | null>(null);
  const [customKeyDraft, setCustomKeyDraft] = useState("");

  const committedRows: Row[] = Object.entries(mappings).map(
    ([scopeKey, variableName]) => ({
      id: scopeKey,
      scopeKey,
      variableName,
      isDraft: false,
    }),
  );
  const rows: Row[] = [...committedRows, ...drafts];
  const usedScopeKeys = new Set(
    rows.map((r) => r.scopeKey).filter((k): k is string => !!k),
  );

  // ── Mapping write helpers ──────────────────────────────────────────────
  const setMappings = (next: Record<string, string>) => {
    onChange(Object.keys(next).length > 0 ? next : null);
  };

  // ── Row handlers ───────────────────────────────────────────────────────
  const updateVariable = (row: Row, nextVar: string) => {
    if (row.isDraft) {
      if (nextVar && row.scopeKey) {
        setMappings({ ...mappings, [row.scopeKey]: nextVar });
        setDrafts((prev) => prev.filter((d) => d.id !== row.id));
      } else {
        setDrafts((prev) =>
          prev.map((d) =>
            d.id === row.id ? { ...d, variableName: nextVar } : d,
          ),
        );
      }
      return;
    }
    if (!nextVar) {
      const next = { ...mappings };
      delete next[row.scopeKey];
      setMappings(next);
      return;
    }
    setMappings({ ...mappings, [row.scopeKey]: nextVar });
  };

  const updateScopeKey = (row: Row, nextKey: string) => {
    if (!nextKey || nextKey === row.scopeKey) return;
    if (usedScopeKeys.has(nextKey)) return;

    if (row.isDraft) {
      if (row.variableName) {
        setMappings({ ...mappings, [nextKey]: row.variableName });
        setDrafts((prev) => prev.filter((d) => d.id !== row.id));
      } else {
        setDrafts((prev) =>
          prev.map((d) => (d.id === row.id ? { ...d, scopeKey: nextKey } : d)),
        );
      }
      return;
    }

    // Committed row: rename the scope key, preserving the variable mapping.
    const next = { ...mappings };
    const value = next[row.scopeKey];
    delete next[row.scopeKey];
    next[nextKey] = value;
    setMappings(next);
  };

  const removeRow = (row: Row) => {
    if (customKeyFor === row.id) {
      setCustomKeyFor(null);
      setCustomKeyDraft("");
    }
    if (row.isDraft) {
      setDrafts((prev) => prev.filter((d) => d.id !== row.id));
      return;
    }
    const next = { ...mappings };
    delete next[row.scopeKey];
    setMappings(next);
  };

  const addRow = () => {
    setDrafts((prev) => [
      ...prev,
      { id: draftId(), variableName: "", scopeKey: "", isDraft: true },
    ]);
  };

  const beginCustomKey = (rowId: string) => {
    setCustomKeyFor(rowId);
    setCustomKeyDraft("");
  };

  const confirmCustomKey = (row: Row) => {
    const key = customKeyDraft.trim().toLowerCase();
    if (!key) return;
    if (key !== row.scopeKey && usedScopeKeys.has(key)) return;
    updateScopeKey(row, key);
    setCustomKeyFor(null);
    setCustomKeyDraft("");
  };

  const cancelCustomKey = () => {
    setCustomKeyFor(null);
    setCustomKeyDraft("");
  };

  // ── Render helpers ─────────────────────────────────────────────────────
  const triggerClass = compact ? "h-7 text-xs" : "h-8";
  const iconBtnClass = compact ? "h-7 w-7 p-0" : "h-8 w-8 p-0";

  const renderVariableSelect = (row: Row) => (
    <Select
      value={row.variableName || undefined}
      onValueChange={(v) => updateVariable(row, v)}
      disabled={!hasVariables}
    >
      <SelectTrigger className={triggerClass}>
        <SelectValue
          placeholder={
            hasVariables ? "Select variable..." : "Agent has no variables"
          }
        >
          {row.variableName ? (
            <code className="font-mono text-xs">{`{{${row.variableName}}}`}</code>
          ) : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {variableDefinitions.map((v) => (
          <SelectItem key={v.name} value={v.name}>
            <code className="font-mono text-xs">{`{{${v.name}}}`}</code>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const renderScopeControl = (row: Row) => {
    if (customKeyFor === row.id) {
      return (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            value={customKeyDraft}
            onChange={(e) => setCustomKeyDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                confirmCustomKey(row);
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelCustomKey();
              }
            }}
            placeholder="custom_key"
            className={compact ? "h-7 text-[16px]" : "h-8 text-[16px]"}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => confirmCustomKey(row)}
            disabled={!customKeyDraft.trim()}
            className={iconBtnClass}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={cancelCustomKey}
            className={iconBtnClass}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      );
    }

    const currentIsCustom =
      !!row.scopeKey && !STANDARD_SCOPES.includes(row.scopeKey);

    return (
      <Select
        value={row.scopeKey || undefined}
        onValueChange={(v) => {
          if (v === CUSTOM_OPTION) {
            beginCustomKey(row.id);
            return;
          }
          updateScopeKey(row, v);
        }}
      >
        <SelectTrigger className={triggerClass}>
          <SelectValue placeholder="Select scope key...">
            {row.scopeKey ? (
              <span className="flex items-baseline gap-2">
                <span className="font-medium">
                  {labelForScope(row.scopeKey)}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {row.scopeKey}
                </span>
              </span>
            ) : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STANDARD_SCOPES.map((s) => {
            const isTaken = usedScopeKeys.has(s) && s !== row.scopeKey;
            return (
              <SelectItem key={s} value={s} disabled={isTaken}>
                <div className="flex flex-col">
                  <span className={compact ? "text-xs" : "text-sm"}>
                    {labelForScope(s)}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {s}
                    {isTaken ? " · used" : ""}
                  </span>
                </div>
              </SelectItem>
            );
          })}
          {currentIsCustom && (
            <SelectItem key={row.scopeKey} value={row.scopeKey}>
              <div className="flex flex-col">
                <span className="font-mono text-xs">{row.scopeKey}</span>
                <span className="text-[10px] text-muted-foreground">
                  custom
                </span>
              </div>
            </SelectItem>
          )}
          <SelectItem value={CUSTOM_OPTION}>
            <span className="text-xs italic text-muted-foreground">
              + Custom key...
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
    );
  };

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p
          className={`text-muted-foreground ${compact ? "text-[11px]" : "text-xs"}`}
        >
          No mappings. Click <span className="font-medium">Add mapping</span>{" "}
          to route a variable from a surface scope key.
        </p>
      ) : (
        <div
          className={`border border-border rounded-md ${compact ? "text-xs" : "text-sm"}`}
        >
          {rows.map((row) => (
            <div
              key={row.id}
              className={`flex items-center gap-2 ${compact ? "p-2" : "p-3"} border-b border-border last:border-b-0`}
            >
              <div className="flex-1 min-w-0">{renderVariableSelect(row)}</div>
              <div
                className={`flex-shrink-0 text-muted-foreground ${compact ? "text-[10px]" : "text-xs"}`}
              >
                from
              </div>
              <div className="flex-1 min-w-0">{renderScopeControl(row)}</div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeRow(row)}
                className={iconBtnClass}
                aria-label="Remove mapping"
              >
                <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        disabled={!hasVariables}
        className={compact ? "h-8" : "h-9"}
      >
        <Plus className="h-4 w-4 mr-1" />
        Add mapping
      </Button>

      {!hasVariables && (
        <p
          className={`text-muted-foreground ${compact ? "text-[10px]" : "text-xs"}`}
        >
          This agent has no variables to map scope keys to.
        </p>
      )}
    </div>
  );
}
