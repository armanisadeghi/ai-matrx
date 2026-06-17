"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  Loader2,
  AlertCircle,
  Pencil,
  Maximize2,
  ArrowUpRight,
} from "lucide-react";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VariableInputComponent } from "@/features/agents/components/inputs/input-components/VariableInputComponent";
import { useScopeAutoSave } from "@/features/scope-system/hooks/useScopeAutoSave";
import type { ScopeContextRow } from "@/features/scope-system/redux/scopeValuesSlice";
import { EditContextItemSheet } from "./EditContextItemSheet";
import { EditScopeValueSheet } from "./EditScopeValueSheet";

interface ScopeFieldInputProps {
  scopeId: string;
  row: ScopeContextRow;
  /** When provided, shows a link to the item's dedicated page (the ↗). */
  itemHref?: string;
  /**
   * Override the field's title (defaults to the item's display_name). Used on the
   * Context Item Hub, where each row is the SAME item across different scopes, so
   * the row title should be the scope name instead.
   */
  nameLabel?: string;
  /** When set, the title becomes a link here (e.g. to the scope hub) instead of
   * the edit-item drawer trigger. */
  nameHref?: string;
  /** Optional node rendered in the field header's right cluster (e.g. a
   * knowledge-graph suggestion hint for this item). */
  headerSlot?: React.ReactNode;
}

/** Stable string key for change-detection across primitive and structured values. */
function canonical(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return "";
    }
  }
  return String(v).trim();
}

function rowToString(row: ScopeContextRow): string {
  if (row.value_text != null) return row.value_text;
  if (row.value_number != null) return String(row.value_number);
  if (row.value_boolean != null) return row.value_boolean ? "true" : "false";
  if (row.value_date != null) return row.value_date;
  if (row.value_document_url != null) return row.value_document_url;
  if (row.value_json != null) {
    try {
      return JSON.stringify(row.value_json, null, 2);
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * The value to seed a custom Smart-Input component with: structured values come
 * straight from value_json; everything else falls back to a string.
 */
function rowToComponentValue(row: ScopeContextRow): unknown {
  if (row.value_json != null) return row.value_json;
  if (row.value_number != null) return String(row.value_number);
  if (row.value_text != null) return row.value_text;
  if (row.value_boolean != null) return row.value_boolean ? "true" : "false";
  if (row.value_date != null) return row.value_date;
  if (row.value_document_url != null) return row.value_document_url;
  return "";
}

export function ScopeFieldInput({
  scopeId,
  row,
  itemHref,
  nameLabel,
  nameHref,
  headerSlot,
}: ScopeFieldInputProps) {
  const hasCustom = !!row.custom_component;
  const initialValue: unknown = hasCustom
    ? rowToComponentValue(row)
    : rowToString(row);
  const initialKey = canonical(initialValue);

  const [value, setValue] = useState<unknown>(initialValue);
  const [editingItem, setEditingItem] = useState(false);
  const [editingValue, setEditingValue] = useState(false);
  const isDirtyRef = useRef(false);
  const { commit, status } = useScopeAutoSave(
    scopeId,
    row.item_id,
    row.value_type,
    initialValue,
  );

  // Keep the latest commit closure reachable from the debounce timer / unmount flush.
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const pendingRef = useRef<{ v: unknown } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleCommit = (v: unknown) => {
    pendingRef.current = { v };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const p = pendingRef.current;
      pendingRef.current = null;
      if (p) {
        isDirtyRef.current = false;
        void commitRef.current(p.v);
      }
    }, 600);
  };

  // Flush a pending edit on unmount so a quick navigate doesn't drop it.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const p = pendingRef.current;
      pendingRef.current = null;
      if (p) void commitRef.current(p.v);
    };
  }, []);

  // Sync local input ONLY when the underlying stored value actually changes
  // (refetch landed new data, sibling save happened, etc.) AND the user is
  // not currently mid-edit. Without the isDirty guard, an in-flight render
  // would clobber the user's keystrokes.
  //
  // Deps are the canonical primitive key only — never include a hook-returned
  // function here; those are fresh closures per render and re-trigger this
  // effect on every keystroke, wiping the value back to `initial`.
  useEffect(() => {
    if (isDirtyRef.current) return;
    // Intentional store→input sync when not mid-edit; see the comment above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(initialValue);
    // initialValue is recomputed each render; key it off the canonical string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  const isJsonType = row.value_type === "object" || row.value_type === "array";
  const stringValue = typeof value === "string" ? value : canonical(value);

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1">
            {nameHref ? (
              <Link
                href={nameHref}
                className="text-sm font-medium text-foreground hover:text-primary"
              >
                {nameLabel ?? row.display_name}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setEditingItem(true)}
                className="group inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary"
                title="Edit this context item"
              >
                {nameLabel ?? row.display_name}
                <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
            {itemHref && (
              <Link
                href={itemHref}
                title="Open page"
                className="text-muted-foreground hover:text-primary"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
          <div className="flex items-center gap-1">
            {headerSlot}
            <FieldStatus
              status={status}
              hasValue={row.has_value || canonical(value).length > 0}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setEditingValue(true)}
              title="Open advanced value editor"
              aria-label="Open advanced value editor"
              className="h-6 w-6"
            >
              <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        </div>
        {hasCustom ? (
          <VariableInputComponent
            value={value}
            onChange={(v) => {
              isDirtyRef.current = true;
              setValue(v);
              scheduleCommit(v);
            }}
            variableName={row.display_name}
            customComponent={row.custom_component ?? undefined}
            hideLabel
            compact
          />
        ) : row.value_type === "date" ? (
          <Input
            id={`field-${row.item_id}`}
            type="date"
            value={stringValue}
            onChange={(e) => {
              isDirtyRef.current = true;
              setValue(e.target.value);
            }}
            onBlur={(e) => {
              isDirtyRef.current = false;
              commit(e.target.value);
            }}
            style={{ fontSize: "16px" }}
          />
        ) : (
          <ProTextarea
            id={`field-${row.item_id}`}
            value={stringValue}
            onChange={(e) => {
              isDirtyRef.current = true;
              setValue(e.target.value);
            }}
            onBlur={(e) => {
              isDirtyRef.current = false;
              commit(e.target.value);
            }}
            placeholder={placeholderForType(row.value_type)}
            minHeight={80}
            maxHeight={600}
            className={isJsonType ? "font-mono text-sm" : undefined}
            autoGrow
          />
        )}
        {row.description && (
          <p className="text-xs text-muted-foreground">{row.description}</p>
        )}
      </div>

      <EditContextItemSheet
        open={editingItem}
        onOpenChange={setEditingItem}
        itemId={row.item_id}
      />
      <EditScopeValueSheet
        open={editingValue}
        onOpenChange={setEditingValue}
        scopeId={scopeId}
        itemId={row.item_id}
      />
    </>
  );
}

function placeholderForType(t: ScopeContextRow["value_type"]): string {
  switch (t) {
    case "number":
      return "Enter a number";
    case "boolean":
      return "true / false";
    case "document":
      return "https://...";
    case "object":
    case "array":
      return "{ }";
    default:
      return "Type a value, leave to save";
  }
}

function FieldStatus({
  status,
  hasValue,
}: {
  status: "idle" | "saving" | "saved" | "error";
  hasValue: boolean;
}) {
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        saving
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
        <Check className="h-3 w-3" />
        saved
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400">
        <AlertCircle className="h-3 w-3" />
        not saved
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      {hasValue ? "" : "empty"}
    </span>
  );
}
