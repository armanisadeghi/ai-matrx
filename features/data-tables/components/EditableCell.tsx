/**
 * EditableCell — inline cell editor for a single udt_dataset_rows cell.
 *
 * Double-click to enter edit mode; the input shape adapts to the field's
 * `data_type` (text, number, checkbox, date, datetime, textarea). Commits
 * via `udt_upsert_cell` (surgical jsonb_set — cannot drop other fields).
 * Enter / blur commits; Escape cancels.
 *
 * Defensive: if the cell is read-only (e.g. caller passes `editable={false}`
 * because the user lacks editor permission), renders the display content only.
 */
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";

import { upsertCell } from "../service";
import { isServiceFailure, type FieldDataType } from "../types";

type Props = {
  tableId: string;
  rowId: string;
  fieldName: string;
  fieldDisplayName: string;
  dataType: FieldDataType | string;
  value: unknown;
  /** What the parent already renders for the read-only state. */
  display: ReactNode;
  /** Disable edit mode entirely (e.g. viewer permission only). */
  editable?: boolean;
  /** Notify parent so it can refresh its row cache. */
  onSaved?: (newValue: unknown) => void;
};

export function EditableCell({
  tableId,
  rowId,
  fieldName,
  fieldDisplayName,
  dataType,
  value,
  display,
  editable = true,
  onSaved,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<unknown>(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Sync draft with prop when value changes from upstream (e.g. realtime).
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  // Auto-focus on entering edit mode.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if ("select" in inputRef.current) inputRef.current.select();
    }
  }, [editing]);

  const enterEdit = useCallback(() => {
    if (!editable || saving) return;
    setDraft(value);
    setEditing(true);
  }, [editable, saving, value]);

  const cancelEdit = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  const commitEdit = useCallback(async () => {
    if (saving) return;

    const normalized = normalize(draft, dataType);

    // Skip the write if nothing actually changed.
    if (valuesEqual(normalized, value)) {
      setEditing(false);
      return;
    }

    setSaving(true);
    const result = await upsertCell({
      tableId,
      rowId,
      fieldName,
      value: normalized,
    });
    setSaving(false);

    if (isServiceFailure(result)) {
      toast({
        title: `Could not update ${fieldDisplayName}`,
        description: result.error,
        variant: "destructive",
      });
      // Stay in edit mode so the user can correct or cancel.
      return;
    }

    setEditing(false);
    onSaved?.(normalized);
  }, [
    dataType,
    draft,
    fieldDisplayName,
    fieldName,
    onSaved,
    rowId,
    saving,
    tableId,
    value,
  ]);

  const handleKey = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === "Enter" && !e.shiftKey && dataType !== "json") {
      e.preventDefault();
      void commitEdit();
    }
  };

  if (!editing) {
    return (
      <div
        className={`relative ${editable ? "cursor-text" : ""}`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          enterEdit();
        }}
        title={editable ? `Double-click to edit ${fieldDisplayName}` : undefined}
      >
        {display}
        {saving && (
          <div className="absolute inset-y-0 right-0 flex items-center">
            <Loader2 className="size-3 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    );
  }

  // ─── edit mode ────────────────────────────────────────────────────────────

  if (dataType === "boolean") {
    return (
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={draft === true}
          onCheckedChange={(checked) => {
            setDraft(checked === true);
            // Boolean commits immediately — there's nothing to "type" further.
            setTimeout(() => void commitEdit(), 0);
          }}
        />
        {saving && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
      </div>
    );
  }

  if (dataType === "number" || dataType === "integer") {
    return (
      <Input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="number"
        step={dataType === "integer" ? 1 : "any"}
        value={draft === null || draft === undefined ? "" : String(draft)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => void commitEdit()}
        onClick={(e) => e.stopPropagation()}
        disabled={saving}
        className="h-8 text-sm"
      />
    );
  }

  if (dataType === "date") {
    return (
      <Input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="date"
        value={typeof draft === "string" ? draft.slice(0, 10) : ""}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => void commitEdit()}
        onClick={(e) => e.stopPropagation()}
        disabled={saving}
        className="h-8 text-sm"
      />
    );
  }

  if (dataType === "datetime") {
    return (
      <Input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="datetime-local"
        value={
          typeof draft === "string" && draft.length >= 16
            ? draft.slice(0, 16)
            : ""
        }
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => void commitEdit()}
        onClick={(e) => e.stopPropagation()}
        disabled={saving}
        className="h-8 text-sm"
      />
    );
  }

  // string / json / array — multi-line capable
  return (
    <Textarea
      ref={inputRef as React.RefObject<HTMLTextAreaElement>}
      value={
        draft === null || draft === undefined
          ? ""
          : typeof draft === "object"
            ? JSON.stringify(draft, null, 2)
            : String(draft)
      }
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={handleKey}
      onBlur={() => void commitEdit()}
      onClick={(e) => e.stopPropagation()}
      disabled={saving}
      rows={dataType === "json" || dataType === "array" ? 4 : 1}
      className="min-h-8 text-sm"
    />
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function normalize(raw: unknown, dataType: FieldDataType | string): unknown {
  if (raw === "" || raw === undefined) return null;
  if (raw === null) return null;

  switch (dataType) {
    case "number":
      return typeof raw === "number" ? raw : Number(raw);
    case "integer":
      return typeof raw === "number" ? Math.trunc(raw) : Math.trunc(Number(raw));
    case "boolean":
      return Boolean(raw);
    case "date":
    case "datetime":
      return String(raw);
    case "json":
    case "array":
      if (typeof raw === "string") {
        try {
          return JSON.parse(raw);
        } catch {
          // Let the trigger (or server) decide whether to accept the raw string.
          return raw;
        }
      }
      return raw;
    default:
      return typeof raw === "string" ? raw : String(raw);
  }
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a === "object" || typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}
