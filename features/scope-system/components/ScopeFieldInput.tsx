"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  Loader2,
  AlertCircle,
  Pencil,
  Maximize2,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useScopeAutoSave } from "@/features/scope-system/hooks/useScopeAutoSave";
import type { ScopeContextRow } from "@/features/scope-system/redux/scopeValuesSlice";
import {
  ContextValueInput,
  placeholderForType,
} from "@/features/scopes/components/reference/ContextValueInput";
import { referenceConfigFromItem } from "@/features/scopes/utils/referenceCell";
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
  if (row.value_timestamp != null) return row.value_timestamp;
  if (row.value_time != null) return row.value_time;
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
  if (row.value_timestamp != null) return row.value_timestamp;
  if (row.value_time != null) return row.value_time;
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
  const generatedId = useId();
  const fieldId = `scope-value-${generatedId}`;
  const labelId = `scope-value-label-${generatedId}`;
  const descriptionId = row.description
    ? `scope-value-description-${generatedId}`
    : undefined;
  const keyboardHintId = `scope-value-keyboard-hint-${generatedId}`;
  const fieldGroupRef = useRef<HTMLDivElement>(null);
  const advancedEditorButtonRef = useRef<HTMLButtonElement>(null);
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
  const pendingRef = useRef<{ v: unknown } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function focusValueControl() {
    const field = document.getElementById(fieldId);
    const target = field?.matches("input, textarea, button, [role='combobox']")
      ? field
      : field?.querySelector<HTMLElement>(
          "input, textarea, button, [role='combobox'], [tabindex='0']",
        );
    (target as HTMLElement | null)?.focus();
  }

  function handleCompositeKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const actions = Array.from(
      fieldGroupRef.current?.querySelectorAll<HTMLElement>(
        "button[tabindex='-1'], a[tabindex='-1']",
      ) ?? [],
    ).filter((element) => !element.hasAttribute("disabled"));
    const actionIndex = actions.indexOf(event.target as HTMLElement);
    if (event.key === "F6") {
      event.preventDefault();
      if (actionIndex >= 0) focusValueControl();
      else actions[0]?.focus();
      return;
    }
    if (actionIndex < 0) return;
    if (event.key === "Escape") {
      event.preventDefault();
      focusValueControl();
      return;
    }
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight")
      nextIndex = (actionIndex + 1) % actions.length;
    if (event.key === "ArrowLeft")
      nextIndex = (actionIndex - 1 + actions.length) % actions.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = actions.length - 1;
    if (nextIndex == null) return;
    event.preventDefault();
    actions[nextIndex]?.focus();
  }

  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

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
    setValue(initialValue);
    // initialValue is recomputed each render; key it off the canonical string.
  }, [initialKey]);

  return (
    <>
      <div
        ref={fieldGroupRef}
        className="space-y-1.5"
        onKeyDown={handleCompositeKeyDown}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1">
            {nameHref ? (
              <Link
                tabIndex={-1}
                href={nameHref}
                className="text-sm font-medium text-foreground hover:text-primary"
              >
                <span id={labelId}>{nameLabel ?? row.display_name}</span>
              </Link>
            ) : (
              <>
                <Label
                  id={labelId}
                  htmlFor={fieldId}
                  className="text-sm font-medium text-foreground"
                >
                  {nameLabel ?? row.display_name}
                </Label>
                <button
                  tabIndex={-1}
                  type="button"
                  onClick={() => setEditingItem(true)}
                  className="rounded-sm text-muted-foreground opacity-60 transition-opacity hover:text-primary hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label={`Edit ${nameLabel ?? row.display_name} definition`}
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </>
            )}
            {itemHref && (
              <Link
                tabIndex={-1}
                href={itemHref}
                title="Open page"
                aria-label={`Open ${nameLabel ?? row.display_name} page`}
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
              ref={advancedEditorButtonRef}
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setEditingValue(true)}
              title="Open advanced value editor"
              aria-label={`Open advanced value editor for ${nameLabel ?? row.display_name}`}
              tabIndex={-1}
              aria-keyshortcuts="F6"
              className="h-6 w-6"
            >
              <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        </div>
        <ContextValueInput
          id={fieldId}
          aria-labelledby={labelId}
          aria-describedby={[descriptionId, keyboardHintId]
            .filter(Boolean)
            .join(" ")}
          valueType={row.value_type}
          customComponent={row.custom_component}
          value={value}
          onChange={(v) => {
            isDirtyRef.current = true;
            setValue(v);
            if (hasCustom) scheduleCommit(v);
          }}
          onCommit={(v) => {
            isDirtyRef.current = false;
            commit(v);
          }}
          referenceConfig={
            row.value_type === "reference" ? referenceConfigFromItem(row) : null
          }
          scopeId={scopeId}
          displayName={row.display_name}
          placeholder={placeholderForType(
            row.value_type,
            "Type a value, leave to save",
          )}
          auxiliaryControlsTabIndex={-1}
          minHeight={80}
          maxHeight={600}
        />
        {row.description && (
          <p id={descriptionId} className="text-xs text-muted-foreground">
            {row.description}
          </p>
        )}
        <span id={keyboardHintId} className="sr-only">
          Press F6 for field actions. Use Left and Right Arrow to move between
          actions, then F6 or Escape to return to the value.
        </span>
      </div>

      <EditContextItemSheet
        open={editingItem}
        onOpenChange={setEditingItem}
        itemId={row.item_id}
      />
      <EditScopeValueSheet
        open={editingValue}
        onOpenChange={(nextOpen) => {
          setEditingValue(nextOpen);
          if (!nextOpen) {
            requestAnimationFrame(() =>
              advancedEditorButtonRef.current?.focus(),
            );
          }
        }}
        scopeId={scopeId}
        itemId={row.item_id}
      />
    </>
  );
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
      <span
        aria-live="polite"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        saving
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span
        aria-live="polite"
        className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"
      >
        <Check className="h-3 w-3" />
        saved
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        role="alert"
        className="inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400"
      >
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
