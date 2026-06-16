"use client";

import { useState, useEffect } from "react";
import { Loader2, Pencil, AlertTriangle, Info } from "lucide-react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  setScopeContextValue,
  selectValuesByScope,
  type ScopeContextRow,
} from "@/features/scope-system/redux/scopeValuesSlice";
import { buildScopeValuePayload } from "@/features/scope-system/utils/scopeValuePayload";
import { VariableInputComponent } from "@/features/agents/components/inputs/input-components/VariableInputComponent";
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
  if (row.value_document_url != null) return row.value_document_url;
  return "";
}

export function EditScopeValueSheet({
  open,
  onOpenChange,
  scopeId,
  itemId,
}: EditScopeValueSheetProps) {
  const dispatch = useAppDispatch();
  const rows = useAppSelector((s) => selectValuesByScope(s, scopeId));
  const row = rows?.find((r) => r.item_id === itemId);

  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState("");
  const [booleanValue, setBooleanValue] = useState<string>("");
  const [customValue, setCustomValue] = useState<unknown>("");
  const [changeSummary, setChangeSummary] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [editingItemDef, setEditingItemDef] = useState(false);

  const hasCustom = !!row?.custom_component;

  useEffect(() => {
    if (!open || !row) return;
    setValue(rowToString(row));
    setBooleanValue(
      row.value_boolean == null ? "" : row.value_boolean ? "true" : "false",
    );
    setCustomValue(rowToComponentValue(row));
    setChangeSummary("");
    setJsonError(null);
  }, [open, row]);

  if (!row) return null;

  async function handleSave() {
    if (!row) return;
    setJsonError(null);
    const payload: Parameters<typeof setScopeContextValue>[0] = {
      scope_id: scopeId,
      context_item_id: itemId,
      change_summary: changeSummary.trim() || undefined,
    };

    // Custom component: route whatever the Smart-Input emits via the shared mapper.
    if (hasCustom) {
      Object.assign(
        payload,
        buildScopeValuePayload(customValue, row.value_type),
      );
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

    const trimmed = value.trim();

    if (row.value_type === "number") {
      if (trimmed === "") {
        payload.value_text = null;
      } else {
        const n = Number(trimmed);
        if (Number.isNaN(n)) {
          toast.error("Not a valid number");
          return;
        }
        payload.value_number = n;
      }
    } else if (row.value_type === "boolean") {
      if (booleanValue === "true") payload.value_boolean = true;
      else if (booleanValue === "false") payload.value_boolean = false;
      else payload.value_text = null;
    } else if (row.value_type === "date") {
      payload.value_date = trimmed || null;
    } else if (row.value_type === "document") {
      payload.value_document_url = trimmed || null;
    } else if (row.value_type === "object" || row.value_type === "array") {
      if (trimmed === "") {
        payload.value_json = null;
      } else {
        try {
          payload.value_json = JSON.parse(trimmed);
        } catch (err) {
          setJsonError(err instanceof Error ? err.message : "Invalid JSON");
          return;
        }
      }
    } else {
      payload.value_text = trimmed || null;
    }

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
        <div className="space-y-5">
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
            <div className="rounded-md bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground inline-flex items-start gap-2 w-full">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{row.description}</span>
            </div>
          )}

          {hasCustom ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Value</Label>
              <VariableInputComponent
                value={customValue}
                onChange={setCustomValue}
                variableName={row.display_name}
                customComponent={row.custom_component ?? undefined}
                hideLabel
              />
            </div>
          ) : row.value_type === "boolean" ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Value</Label>
              <Select
                value={booleanValue}
                onValueChange={setBooleanValue}
                disabled={busy}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Yes / True</SelectItem>
                  <SelectItem value="false">No / False</SelectItem>
                  <SelectItem value="">— (empty)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : row.value_type === "date" ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Value</Label>
              <Input
                type="date"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                style={{ fontSize: "16px" }}
                disabled={busy}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">
                Value
                {(row.value_type === "object" ||
                  row.value_type === "array") && (
                  <span className="ml-1.5 text-muted-foreground font-normal">
                    (parsed as JSON)
                  </span>
                )}
              </Label>
              <ProTextarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                minHeight={200}
                autoGrow
                className={
                  row.value_type === "object" || row.value_type === "array"
                    ? "font-mono text-sm"
                    : undefined
                }
                placeholder={
                  row.value_type === "object" || row.value_type === "array"
                    ? "{ }"
                    : row.value_type === "document"
                      ? "https://..."
                      : "Enter the value"
                }
                disabled={busy}
              />
              {jsonError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 inline-flex items-start gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {jsonError}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Change summary (optional)</Label>
            <Input
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
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save value
            </Button>
          </div>
        </div>
      </MatrxDynamicPanelHost>

      <EditContextItemSheet
        open={editingItemDef}
        onOpenChange={setEditingItemDef}
        itemId={itemId}
      />
    </>
  );
}
