"use client";

import { useState, useEffect, useId } from "react";
import { Loader2, Pencil, AlertTriangle, Info } from "lucide-react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  setScopeContextValue,
  selectValuesByScope,
  type ScopeContextRow,
} from "@/features/scope-system/redux/scopeValuesSlice";
import { buildScopeValuePayload } from "@/features/scope-system/utils/scopeValuePayload";
import { ContextValueInput } from "@/features/scopes/components/reference/ContextValueInput";
import { referenceConfigFromItem } from "@/features/scopes/utils/referenceCell";
import { EditContextItemSheet } from "./EditContextItemSheet";

interface EditScopeValueSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scopeId: string;
  itemId: string;
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

/** Seed value for a custom Smart-Input component: structured value_json verbatim, else string. */
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

export function EditScopeValueSheet({
  open,
  onOpenChange,
  scopeId,
  itemId,
}: EditScopeValueSheetProps) {
  const generatedId = useId();
  const dispatch = useAppDispatch();
  const rows = useAppSelector((s) => selectValuesByScope(s, scopeId));
  const row = rows?.find((r) => r.item_id === itemId);

  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState<unknown>("");
  const [changeSummary, setChangeSummary] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [editingItemDef, setEditingItemDef] = useState(false);

  const valueId = `scope-value-editor-${generatedId}`;
  const valueLabelId = `scope-value-editor-label-${generatedId}`;
  const descriptionId = row?.description
    ? `scope-value-editor-description-${generatedId}`
    : undefined;
  const jsonErrorId = jsonError
    ? `scope-value-editor-error-${generatedId}`
    : undefined;
  const summaryId = `scope-value-summary-${generatedId}`;

  const hasCustom = !!row?.custom_component;

  useEffect(() => {
    if (!open || !row) return;
    // Opening against a row intentionally seeds a fresh controlled draft.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(hasCustom ? rowToComponentValue(row) : rowToString(row));
    setChangeSummary("");
    setJsonError(null);
  }, [open, row]);

  if (!row) return null;

  async function handleSave(event?: React.FormEvent) {
    event?.preventDefault();
    if (!row) return;
    setJsonError(null);
    const payload: Parameters<typeof setScopeContextValue>[0] = {
      scope_id: scopeId,
      context_item_id: itemId,
      change_summary: changeSummary.trim() || undefined,
    };

    // Custom component: route whatever the Smart-Input emits via the shared mapper.
    if (hasCustom) {
      Object.assign(payload, buildScopeValuePayload(value, row.value_type));
      setBusy(true);
      try {
        await dispatch(setScopeContextValue(payload)).unwrap();
        toast.success("Saved");
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (row.value_type === "reference") {
      payload.value_text =
        typeof value === "string" && value.trim() ? value : null;
      setBusy(true);
      try {
        await dispatch(setScopeContextValue(payload)).unwrap();
        toast.success("Saved");
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setBusy(false);
      }
      return;
    }

    const trimmed = typeof value === "string" ? value.trim() : "";

    // Validation UX this sheet owns (surfaced inline); the column routing itself
    // is delegated to the ONE shared mapper so the two never drift on a new type.
    if (
      row.value_type === "number" &&
      trimmed !== "" &&
      Number.isNaN(Number(trimmed))
    ) {
      toast.error("Not a valid number");
      return;
    }
    if (
      (row.value_type === "object" || row.value_type === "array") &&
      trimmed !== ""
    ) {
      try {
        JSON.parse(trimmed);
      } catch (err) {
        setJsonError(err instanceof Error ? err.message : "Invalid JSON");
        return;
      }
    }
    Object.assign(payload, buildScopeValuePayload(value, row.value_type));

    setBusy(true);
    try {
      await dispatch(setScopeContextValue(payload)).unwrap();
      toast.success("Saved");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <MatrxDynamicPanelHost
        open={open}
        onOpenChange={onOpenChange}
        title={row.display_name}
        description="Advanced value editor. Changes create a new version; previous versions are kept in history."
        expandButtonLabel="Scope value"
        dismissDisabled={busy}
        initialFocus
        position="right"
        defaultSize={42}
        maxSize={92}
        headerActions={
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setEditingItemDef(true)}
            title="Edit context item definition"
            aria-label="Edit context item definition"
            className="h-6 w-6 shrink-0"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        }
      >
        <form className="space-y-5" onSubmit={handleSave}>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px] capitalize">
              {row.value_type}
            </Badge>
            {row.version != null && (
              <Badge variant="outline" className="text-[10px]">
                v{row.version}
              </Badge>
            )}
            {row.fetch_hint && (
              <Badge variant="outline" className="text-[10px] capitalize">
                fetch: {row.fetch_hint.replace(/_/g, " ")}
              </Badge>
            )}
            {row.sensitivity && (
              <Badge variant="outline" className="text-[10px] capitalize">
                {row.sensitivity}
              </Badge>
            )}
          </div>

          {row.description && (
            <div
              id={descriptionId}
              className="rounded-md bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground inline-flex items-start gap-2 w-full"
            >
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{row.description}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label id={valueLabelId} htmlFor={valueId} className="text-xs">
              Value
              {(row.value_type === "object" || row.value_type === "array") && (
                <span className="ml-1.5 text-muted-foreground font-normal">
                  (parsed as JSON)
                </span>
              )}
            </Label>
            <ContextValueInput
              id={valueId}
              aria-labelledby={valueLabelId}
              aria-describedby={
                [descriptionId, jsonErrorId].filter(Boolean).join(" ") ||
                undefined
              }
              valueType={row.value_type}
              customComponent={row.custom_component}
              value={value}
              onChange={setValue}
              onCommit={setValue}
              referenceConfig={
                row.value_type === "reference"
                  ? referenceConfigFromItem(row)
                  : null
              }
              scopeId={scopeId}
              displayName={row.display_name}
              placeholder={
                row.value_type === "document"
                  ? "https://..."
                  : "Enter the value"
              }
              minHeight={200}
              maxHeight={600}
              disabled={busy}
            />
            {jsonError && (
              <p
                id={jsonErrorId}
                role="alert"
                className="text-xs text-rose-600 dark:text-rose-400 inline-flex items-start gap-1"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {jsonError}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={summaryId} className="text-xs">
              Change summary (optional)
            </Label>
            <Input
              id={summaryId}
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              placeholder="What changed and why?"
              style={{ fontSize: "16px" }}
              disabled={busy}
            />
            <p className="text-[10px] text-muted-foreground">
              Logged with this version in the history.
            </p>
          </div>

          <div className="flex gap-2 pt-4 border-t border-border">
            <div className="flex-1" />
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save value
            </Button>
          </div>
        </form>
      </MatrxDynamicPanelHost>

      <EditContextItemSheet
        open={editingItemDef}
        onOpenChange={setEditingItemDef}
        itemId={itemId}
      />
    </>
  );
}
