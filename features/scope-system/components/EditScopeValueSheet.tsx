"use client";

import { toastWriteFailure } from "@/lib/errors/toastWriteFailure";
import { useState, useEffect, useId } from "react";
import { Loader2, Pencil, AlertTriangle, Info } from "lucide-react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setScopeContextValue } from "@/features/scopes/redux/scopeContextView";
import { ContextValueInput } from "@/features/scopes/components/reference/ContextValueInput";
import type { VariableCustomComponent } from "@ai-matrx/chat/agents/types/agent-definition.types";
import { useScopeFieldRows } from "@/features/scope-system/hooks/useScopeFieldRows";
import { cellDraft, cellWrite } from "./scope-detail-values";
import { EditContextItemSheet } from "./EditContextItemSheet";
import { PartialValueBadge } from "@/features/scopes/components/PartialValueBadge";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface EditScopeValueSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scopeId: string;
  itemId: string;
}

export function EditScopeValueSheet({
  open,
  onOpenChange,
  scopeId,
  itemId,
}: EditScopeValueSheetProps) {
  const generatedId = useId();
  const dispatch = useAppDispatch();
  const { rows } = useScopeFieldRows(scopeId);
  const row = rows.find((r) => r.field.id === itemId);
  const field = row?.field;

  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState<unknown>("");
  const [changeSummary, setChangeSummary] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [editingItemDef, setEditingItemDef] = useState(false);

  const valueId = `scope-value-editor-${generatedId}`;
  const valueLabelId = `scope-value-editor-label-${generatedId}`;
  const descriptionId = field?.description
    ? `scope-value-editor-description-${generatedId}`
    : undefined;
  const jsonErrorId = jsonError
    ? `scope-value-editor-error-${generatedId}`
    : undefined;
  const summaryId = `scope-value-summary-${generatedId}`;

  const hasCustom = !!field?.custom_component;

  useEffect(() => {
    if (!open || !row) return;
    // Opening against a row intentionally seeds a fresh controlled draft.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(cellDraft(row.value, hasCustom));
    setChangeSummary("");
    setJsonError(null);
  }, [open, row]);

  if (!row || !field) return null;

  async function handleSave(event?: React.FormEvent) {
    event?.preventDefault();
    if (!row || !field) return;
    setJsonError(null);
    const summary = changeSummary.trim() || undefined;

    // Custom component: whatever the Smart-Input emits is the cell.
    if (hasCustom) {
      const payload = cellWrite(scopeId, field, value, summary);
      setBusy(true);
      try {
        await dispatch(setScopeContextValue(payload)).unwrap();
        toast.success("Saved");
        onOpenChange(false);
      } catch (err) {
        toastWriteFailure(err, { action: "save this value" });
      } finally {
        setBusy(false);
      }
      return;
    }

    if (field.kind === "reference" || field.kind === "document") {
      const payload = cellWrite(scopeId, field, value, summary);
      setBusy(true);
      try {
        await dispatch(setScopeContextValue(payload)).unwrap();
        toast.success("Saved");
        onOpenChange(false);
      } catch (err) {
        toastWriteFailure(err, { action: "save this value" });
      } finally {
        setBusy(false);
      }
      return;
    }

    const trimmed = typeof value === "string" ? value.trim() : "";

    // Validation UX this sheet owns (surfaced inline); reading the draft as the
    // field's kind is the ONE shared `cellWrite`.
    if (
      field.kind === "number" &&
      trimmed !== "" &&
      Number.isNaN(Number(trimmed))
    ) {
      toast.error("Not a valid number");
      return;
    }
    if (
      (field.kind === "object" || field.kind === "array") &&
      trimmed !== ""
    ) {
      try {
        JSON.parse(trimmed);
      } catch (err) {
        setJsonError(err instanceof Error ? err.message : "Invalid JSON");
        return;
      }
    }
    const payload = cellWrite(scopeId, field, value, summary);

    setBusy(true);
    try {
      await dispatch(setScopeContextValue(payload)).unwrap();
      toast.success("Saved");
      onOpenChange(false);
    } catch (err) {
      toastWriteFailure(err, { action: "save this value" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <MatrxDynamicPanelHost
        open={open}
        onOpenChange={onOpenChange}
        title={field.label}
        description="Advanced value editor. Changes create a new version; previous versions are kept in history."
        expandButtonLabel="Scope value"
        dismissDisabled={busy}
        initialFocus
        position="right"
        defaultSize={42}
        maxSize={92}
        headerActions={
          <Button
            icon={<Pencil />}
            type="submit"
            variant="quiet"
            onClick={() => setEditingItemDef(true)}
            title="Edit context item definition"
            aria-label="Edit context item definition"
            className="shrink-0"
          />
        }
      >
        <form className="space-y-5" onSubmit={handleSave}>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px] capitalize">
              {field.kind}
            </Badge>
            {row.value?.version != null && (
              <Badge variant="outline" className="text-[10px]">
                v{row.value?.version}
              </Badge>
            )}
            {field.context_policy && (
              <Badge variant="outline" className="text-[10px] capitalize">
                fetch: {field.context_policy.replace(/_/g, " ")}
              </Badge>
            )}
            {field.sensitivity && (
              <Badge variant="outline" className="text-[10px] capitalize">
                {field.sensitivity}
              </Badge>
            )}
            <PartialValueBadge incomplete={row.value?.incomplete ?? null} />
          </div>

          {field.description && (
            <div
              id={descriptionId}
              className="rounded-md bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground inline-flex items-start gap-2 w-full"
            >
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{field.description}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label id={valueLabelId} htmlFor={valueId} className="text-xs">
              Value
              {(field.kind === "object" || field.kind === "array") && (
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
              kind={field.kind}
              customComponent={field.custom_component as VariableCustomComponent | null}
              value={value}
              onChange={setValue}
              onCommit={setValue}
              referenceConfig={field.kind === "reference" ? field : null}
              scopeId={scopeId}
              displayName={field.label}
              placeholder={
                field.kind === "document"
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
                <ErrorAlchemyMenu className="ml-auto" />
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
              variant="quiet"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button icon={busy && <Loader2 className="animate-spin" />} variant="primary" type="submit" disabled={busy}>
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
