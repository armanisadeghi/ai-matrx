"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, AlertCircle, Pencil, Maximize2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useScopeAutoSave } from "@/features/scope-system/hooks/useScopeAutoSave";
import type { ScopeContextRow } from "@/features/scope-system/redux/scopeValuesSlice";
import { EditContextItemSheet } from "./EditContextItemSheet";
import { EditScopeValueSheet } from "./EditScopeValueSheet";

interface ScopeFieldInputProps {
  scopeId: string;
  row: ScopeContextRow;
}

const INPUT_NO_ZOOM: React.CSSProperties = { fontSize: "16px" };

function rowToString(row: ScopeContextRow): string {
  if (row.value_text != null) return row.value_text;
  if (row.value_number != null) return String(row.value_number);
  if (row.value_boolean != null) return row.value_boolean ? "true" : "false";
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

export function ScopeFieldInput({ scopeId, row }: ScopeFieldInputProps) {
  const initial = rowToString(row);
  const [value, setValue] = useState(initial);
  const [editingItem, setEditingItem] = useState(false);
  const [editingValue, setEditingValue] = useState(false);
  const isDirtyRef = useRef(false);
  const { commit, status } = useScopeAutoSave(
    scopeId,
    row.item_id,
    row.value_type,
    initial,
  );

  // Sync local input ONLY when the underlying stored value actually changes
  // (refetch landed new data, sibling save happened, etc.) AND the user is
  // not currently mid-edit. Without the isDirty guard, an in-flight render
  // would clobber the user's keystrokes.
  //
  // Deps are the primitive `initial` only — never include a hook-returned
  // function here; those are fresh closures per render and re-trigger this
  // effect on every keystroke, wiping the value back to `initial`.
  useEffect(() => {
    if (isDirtyRef.current) return;
    setValue(initial);
  }, [initial]);

  const isJsonType =
    row.value_type === "object" || row.value_type === "array";

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setEditingItem(true)}
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary"
            title="Edit this context item"
          >
            {row.display_name}
            <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          <div className="flex items-center gap-1">
            <FieldStatus
              status={status}
              hasValue={row.has_value || value.trim().length > 0}
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
        <Textarea
          id={`field-${row.item_id}`}
          value={value}
          onChange={(e) => {
            isDirtyRef.current = true;
            setValue(e.target.value);
          }}
          onBlur={(e) => {
            isDirtyRef.current = false;
            commit(e.target.value);
          }}
          placeholder={placeholderForType(row.value_type)}
          rows={3}
          className={
            isJsonType
              ? "font-mono text-sm resize-y min-h-[80px]"
              : "resize-y min-h-[80px]"
          }
          style={INPUT_NO_ZOOM}
        />
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
