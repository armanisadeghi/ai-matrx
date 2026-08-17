"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/utils/supabase/client";
import { unwrapUserTableMutation } from "@/utils/user-tables-rpc";
import {
  changeFieldType,
  deleteField,
  setFieldFormat,
  setValidationMode,
} from "@/features/data-tables/service";
import { FieldFormatPicker } from "@/lib/field-formats/FieldFormatPicker";
import { resolveFieldFormat } from "@/lib/field-formats/format";
import type { FieldFormatConfig } from "@/lib/field-formats/types";
import {
  isServiceFailure,
  type FieldDataType,
  type ValidationMode,
} from "@/features/data-tables/types";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { toast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  GripVertical,
  Settings,
  Type,
  Eye,
  EyeOff,
  AlertTriangle,
  Loader2,
  Save,
  Shield,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  sanitizeFieldName,
  validateFieldName,
} from "@/utils/user-table-utls/field-name-sanitizer";

interface TableField {
  id: string;
  field_name: string;
  display_name: string;
  data_type: string;
  field_order: number;
  is_required: boolean;
  is_public: boolean;
  default_value?: any;
  validation_rules?: any;
  metadata?: Record<string, unknown> | null;
}

interface TableInfo {
  id: string;
  table_name: string;
  description: string;
  is_public: boolean;
  version: number;
  /**
   * Optional because the callsites hand this component a cast of the full
   * `udt_datasets` row, whose TS shape is narrower than what it carries at
   * runtime. Absent/unknown reads as "permissive", which is the column default.
   */
  validation_mode?: string;
}

const toValidationMode = (raw: unknown): ValidationMode =>
  raw === "strict" ? "strict" : "permissive";

interface TableConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableId: string;
  tableInfo: TableInfo;
  fields: TableField[];
  onSuccess: () => void;
}

const DATA_TYPES = [
  { value: "string", label: "Text", description: "Any text content" },
  { value: "number", label: "Number", description: "Decimal numbers" },
  { value: "integer", label: "Integer", description: "Whole numbers only" },
  { value: "boolean", label: "Boolean", description: "True/False values" },
  { value: "date", label: "Date", description: "Date values" },
  { value: "datetime", label: "DateTime", description: "Date and time values" },
  { value: "json", label: "JSON", description: "Structured data" },
  { value: "array", label: "Array", description: "List of values" },
];

export default function TableConfigModal({
  isOpen,
  onClose,
  tableId,
  tableInfo: initialTableInfo,
  fields: initialFields,
  onSuccess,
}: TableConfigModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Table metadata state
  const [tableInfo, setTableInfo] = useState<TableInfo>(initialTableInfo);

  // Fields state
  const [fields, setFields] = useState<TableField[]>([]);
  const [draggedField, setDraggedField] = useState<string | null>(null);
  // Index where the dragged item would land (drop ghost position). This is the
  // index in the list *between* cards (0 = before first card, length = after last).
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // Scroll container + auto-scroll machinery. While dragging near the top/bottom
  // edges we scroll the list so the user can reach off-screen rows.
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRaf = useRef<number | null>(null);
  const autoScrollVelocity = useRef(0);

  // Track changes
  const [hasChanges, setHasChanges] = useState(false);
  const [dataTypeChanges, setDataTypeChanges] = useState<
    Record<string, string>
  >({});
  /** fieldId → format the user picked this session (saved on Save Changes). */
  const [formatChanges, setFormatChanges] = useState<
    Record<string, FieldFormatConfig>
  >({});
  const [deletingFieldId, setDeletingFieldId] = useState<string | null>(null);

  // Initialize fields when modal opens
  useEffect(() => {
    if (isOpen && initialFields) {
      const sortedFields = [...initialFields].sort(
        (a, b) => a.field_order - b.field_order,
      );
      setFields(sortedFields);
      setTableInfo(initialTableInfo);
      setHasChanges(false);
      setDataTypeChanges({});
      setFormatChanges({});
      setError(null);
    }
  }, [isOpen, initialFields, initialTableInfo]);

  /**
   * Remove a column. THE ONLY delete-column path in the product — before this
   * existed a user could add columns forever and never remove one.
   *
   * Applies immediately (not on Save Changes) because it is a destructive
   * server-side operation the user has explicitly confirmed; batching it behind
   * an unrelated Save button is how people delete things by accident.
   */
  const handleDeleteField = async (field: TableField) => {
    if (fields.length <= 1) {
      toast({
        title: "Cannot remove the last column",
        description: "Add another column first, then remove this one.",
        variant: "destructive",
      });
      return;
    }

    const ok = await confirm({
      title: `Remove "${field.display_name}"?`,
      description:
        "This column and its values are removed from every row in the table. Row history keeps a record, but there is no undo in the app.",
      confirmLabel: "Remove column",
      variant: "destructive",
    });
    if (!ok) return;

    setDeletingFieldId(field.id);
    const result = await deleteField({ tableId, fieldId: field.id });
    setDeletingFieldId(null);

    if (isServiceFailure(result)) {
      toast({
        title: "Could not remove the column",
        description: result.error,
        variant: "destructive",
      });
      return;
    }

    setFields((prev) => prev.filter((f) => f.id !== field.id));
    toast({
      title: `Removed "${result.data.display_name}"`,
      description:
        result.data.rows_cleared > 0
          ? `Cleared its value from ${result.data.rows_cleared} row${result.data.rows_cleared === 1 ? "" : "s"}.`
          : "No rows carried a value for it.",
      variant: "success",
    });
    onSuccess();
  };

  // Handle table info changes
  const handleTableInfoChange = (key: keyof TableInfo, value: any) => {
    setTableInfo((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  // Handle field changes
  const handleFieldChange = (
    fieldId: string,
    key: keyof TableField,
    value: any,
  ) => {
    setFields((prev) =>
      prev.map((field) =>
        field.id === fieldId ? { ...field, [key]: value } : field,
      ),
    );

    // Track data type changes specifically
    if (key === "data_type") {
      // A format is only valid over certain storage types, so changing the
      // storage type resets the column to its plain format rather than leaving
      // a Currency format sitting on a boolean.
      setFormatChanges((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
      const originalField = initialFields.find((f) => f.id === fieldId);
      if (originalField && originalField.data_type !== value) {
        setDataTypeChanges((prev) => ({ ...prev, [fieldId]: value }));
      } else {
        setDataTypeChanges((prev) => {
          const updated = { ...prev };
          delete updated[fieldId];
          return updated;
        });
      }
    }

    setHasChanges(true);
  };

  // Continuous auto-scroll loop. Runs while a non-zero velocity is set; the
  // velocity is recalculated on every dragOver based on pointer proximity to
  // the scroll container's top/bottom edges.
  const stepAutoScroll = useCallback(() => {
    const el = scrollRef.current;
    const v = autoScrollVelocity.current;
    if (el && v !== 0) {
      el.scrollTop += v;
      autoScrollRaf.current = requestAnimationFrame(stepAutoScroll);
    } else {
      autoScrollRaf.current = null;
    }
  }, []);

  const updateAutoScroll = useCallback(
    (clientY: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // Activation zone height (px) at each edge.
      const zone = 64;
      const maxSpeed = 18;
      let velocity = 0;
      const distTop = clientY - rect.top;
      const distBottom = rect.bottom - clientY;
      if (distTop < zone) {
        // Closer to the edge → faster. Ease quadratically.
        const ratio = Math.max(0, Math.min(1, (zone - distTop) / zone));
        velocity = -Math.ceil(maxSpeed * ratio * ratio);
      } else if (distBottom < zone) {
        const ratio = Math.max(0, Math.min(1, (zone - distBottom) / zone));
        velocity = Math.ceil(maxSpeed * ratio * ratio);
      }
      autoScrollVelocity.current = velocity;
      if (velocity !== 0 && autoScrollRaf.current === null) {
        autoScrollRaf.current = requestAnimationFrame(stepAutoScroll);
      }
    },
    [stepAutoScroll],
  );

  const stopAutoScroll = useCallback(() => {
    autoScrollVelocity.current = 0;
    if (autoScrollRaf.current !== null) {
      cancelAnimationFrame(autoScrollRaf.current);
      autoScrollRaf.current = null;
    }
  }, []);

  // Cleanup any pending RAF on unmount.
  useEffect(() => () => stopAutoScroll(), [stopAutoScroll]);

  // Handle drag and drop for field reordering
  const handleDragStart = (e: React.DragEvent, fieldId: string) => {
    setDraggedField(fieldId);
    e.dataTransfer.effectAllowed = "move";
  };

  // Compute the drop index for a card based on whether the pointer is in the
  // top or bottom half of the hovered card.
  const handleCardDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    updateAutoScroll(e.clientY);
    if (!draggedField) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const isAfter = e.clientY > rect.top + rect.height / 2;
    setDropIndex(isAfter ? index + 1 : index);
  };

  const reorder = (toIndex: number) => {
    if (!draggedField) return;
    const draggedIndex = fields.findIndex((f) => f.id === draggedField);
    if (draggedIndex === -1) return;

    // Adjust target when removing an earlier item shifts indices.
    let insertAt = toIndex;
    if (draggedIndex < toIndex) insertAt -= 1;

    const newFields = [...fields];
    const [draggedItem] = newFields.splice(draggedIndex, 1);
    newFields.splice(insertAt, 0, draggedItem);

    const updatedFields = newFields.map((field, idx) => ({
      ...field,
      field_order: idx + 1,
    }));

    if (insertAt !== draggedIndex) {
      setFields(updatedFields);
      setHasChanges(true);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dropIndex !== null) reorder(dropIndex);
    setDraggedField(null);
    setDropIndex(null);
    stopAutoScroll();
  };

  const handleDragEnd = () => {
    setDraggedField(null);
    setDropIndex(null);
    stopAutoScroll();
  };

  // Handle save
  const handleSave = async () => {
    if (!hasChanges) {
      onClose();
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Prepare table updates
      const tableUpdates = {
        table_name:
          tableInfo.table_name !== initialTableInfo.table_name
            ? tableInfo.table_name
            : undefined,
        description:
          tableInfo.description !== initialTableInfo.description
            ? tableInfo.description
            : undefined,
        is_public:
          tableInfo.is_public !== initialTableInfo.is_public
            ? tableInfo.is_public
            : undefined,
      };

      // Remove undefined values
      const cleanTableUpdates = Object.fromEntries(
        Object.entries(tableUpdates).filter(
          ([_, value]) => value !== undefined,
        ),
      );

      // Prepare field updates AND collect type-change candidates.
      // Type changes are split off because they need to walk every row in the
      // table and rewrite the JSONB cell value via udt_change_field_type —
      // the legacy update_user_table_config RPC only flips the declared type
      // on udt_dataset_fields and leaves rows mis-shapen.
      const typeChanges: Array<{
        fieldId: string;
        displayName: string;
        from: string;
        to: FieldDataType;
      }> = [];

      const fieldUpdates = fields
        .map((field) => {
          const originalField = initialFields.find((f) => f.id === field.id);
          if (!originalField) return null;

          const updates: any = { id: field.id };

          // CRITICAL: Sanitize field_name before allowing updates
          if (field.field_name !== originalField.field_name) {
            const sanitizedFieldName = sanitizeFieldName(field.field_name);

            // Validate the sanitized field name
            if (!validateFieldName(sanitizedFieldName)) {
              throw new Error(
                `Invalid field name: "${field.field_name}". Field names must start with a lowercase letter and contain only lowercase letters, numbers, and underscores.`,
              );
            }

            // Log warning if field name was modified during sanitization
            if (field.field_name !== sanitizedFieldName) {
              console.warn(
                `Field name "${field.field_name}" was sanitized to "${sanitizedFieldName}"`,
              );
            }

            updates.field_name = sanitizedFieldName;
          }

          if (field.display_name !== originalField.display_name)
            updates.display_name = field.display_name;
          if (field.data_type !== originalField.data_type) {
            updates.data_type = field.data_type;
            typeChanges.push({
              fieldId: field.id,
              displayName: field.display_name,
              from: originalField.data_type,
              to: field.data_type as FieldDataType,
            });
          }
          if (field.field_order !== originalField.field_order)
            updates.field_order = field.field_order;
          if (field.is_required !== originalField.is_required)
            updates.is_required = field.is_required;
          if (field.is_public !== originalField.is_public)
            updates.is_public = field.is_public;

          // Only return if there are actual changes
          return Object.keys(updates).length > 1 ? updates : null;
        })
        .filter(Boolean);

      // Confirm row-rewrite before doing it. The legacy code silently flipped
      // declared types only; this confirms the destructive part is intentional.
      if (typeChanges.length > 0) {
        const summary = typeChanges
          .map((t) => `• ${t.displayName}: ${t.from} → ${t.to}`)
          .join("\n");
        const ok = await confirm({
          title: `Convert ${typeChanges.length === 1 ? "1 column" : `${typeChanges.length} columns`}?`,
          description: `${summary}\n\nExisting cell values will be coerced to the new type. Values that cannot be converted will become null.`,
          confirmLabel: "Convert",
          variant: "destructive",
        });
        if (!ok) {
          setLoading(false);
          return;
        }
      }

      // Call the RPC function
      const rpcParams: any = { p_table_id: tableId };
      if (Object.keys(cleanTableUpdates).length > 0) {
        rpcParams.p_table_updates = cleanTableUpdates;
      }
      if (fieldUpdates.length > 0) {
        rpcParams.p_field_updates = fieldUpdates;
      }

      const { data, error: rpcError } = await supabase.rpc(
        "update_user_table_config",
        rpcParams,
      );

      if (rpcError) throw rpcError;
      unwrapUserTableMutation(data ?? null);

      // `validation_mode` is not part of update_user_table_config's table
      // updates — it goes through its own service (direct RLS UPDATE). Only
      // sent when it actually changed, and a refusal is surfaced, never
      // swallowed: arming strict mode is the whole point of this control.
      const nextMode = toValidationMode(tableInfo.validation_mode);
      if (nextMode !== toValidationMode(initialTableInfo.validation_mode)) {
        const modeResult = await setValidationMode({ tableId, mode: nextMode });
        if (isServiceFailure(modeResult)) throw new Error(modeResult.error);
        toast({
          title:
            nextMode === "strict"
              ? "Strict validation is on"
              : "Strict validation is off",
          description:
            nextMode === "strict"
              ? "New and edited rows must match the column types and carry every required field."
              : "Rows are accepted even when they do not match the column types.",
          variant: "success",
        });
      }

      // After the metadata flip lands, walk rows for each type-changed field
      // and coerce their JSONB cell values to the new type via the dedicated
      // SECURITY DEFINER RPC. cast_or_null is the safer default — un-castable
      // values become null rather than silently keeping the old shape.
      let totalRewritten = 0;
      const typeFailures: string[] = [];
      for (const change of typeChanges) {
        const res = await changeFieldType({
          tableId,
          fieldId: change.fieldId,
          newType: change.to,
          strategy: "cast_or_null",
        });
        if (isServiceFailure(res)) {
          typeFailures.push(`${change.displayName}: ${res.error}`);
        } else {
          totalRewritten += res.data.rows_rewritten;
        }
      }

      // Display formats are a pure UI layer over the stored type — no data is
      // touched, so they save unconditionally and need no confirmation.
      const formatFailures: string[] = [];
      for (const [fieldId, format] of Object.entries(formatChanges)) {
        const res = await setFieldFormat({ tableId, fieldId, format });
        if (isServiceFailure(res)) {
          const label =
            fields.find((f) => f.id === fieldId)?.display_name ?? fieldId;
          formatFailures.push(`${label}: ${res.error}`);
        }
      }
      if (formatFailures.length > 0) {
        toast({
          title: "Some formats could not be saved",
          description: formatFailures.join("\n"),
          variant: "destructive",
        });
      }

      if (typeChanges.length > 0) {
        if (typeFailures.length > 0) {
          toast({
            title: "Some columns could not be converted",
            description: typeFailures.join("\n"),
            variant: "destructive",
          });
        } else {
          toast({
            title: `Converted ${typeChanges.length === 1 ? "1 column" : `${typeChanges.length} columns`}`,
            description: `${totalRewritten} row${totalRewritten === 1 ? "" : "s"} rewritten`,
            variant: "success",
          });
        }
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error("Error updating table configuration:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update table configuration",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0 sm:w-[calc(100vw-2rem)] sm:max-w-6xl">
        <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12 sm:px-5">
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <Settings className="h-5 w-5" />
            <span className="shrink-0">Configure Table:</span>
            <EntityRef
              token="dataset"
              id={tableId}
              name={tableInfo.table_name}
              openInNewTab
              alwaysShowActions
              className="min-w-0"
              labelClassName="truncate"
            />
            {hasChanges && <span className="text-orange-500">*</span>}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="fields" className="min-h-0">
          <TabsList className="mx-3 mt-2 grid w-auto grid-cols-2 sm:mx-4">
            <TabsTrigger value="fields">Fields & Order</TabsTrigger>
            <TabsTrigger value="table">Table Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="fields" className="mt-0 min-h-0 overflow-hidden">
            <div
              ref={scrollRef}
              className="max-h-[62dvh] space-y-2 overflow-x-hidden overflow-y-auto px-3 py-3 scroll-smooth [scrollbar-gutter:stable] sm:px-4"
              onDragOver={(e) => {
                // Keep auto-scroll responsive even when hovering gaps between cards.
                if (draggedField) {
                  e.preventDefault();
                  updateAutoScroll(e.clientY);
                }
              }}
              onDrop={handleDrop}
            >
              {fields.map((field, index) => (
                <React.Fragment key={field.id}>
                  {/* Drop ghost — a colored bar showing exactly where the
                      dragged card will land. */}
                  {draggedField && dropIndex === index && (
                    <div className="h-1.5 -my-0.5 rounded-full bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.25)] transition-all" />
                  )}
                  <Card
                    data-field-card={field.id}
                    data-converting={Boolean(dataTypeChanges[field.id])}
                    className={`cursor-move border-2 transition-[border-color,background-color,opacity,transform] ${
                      draggedField === field.id ? "opacity-40 scale-[0.98]" : ""
                    } ${
                      dataTypeChanges[field.id]
                        ? "border-amber-400 bg-amber-50/40 dark:bg-amber-950/20"
                        : "border-border"
                    }`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, field.id)}
                    onDragOver={(e) => handleCardDragOver(e, index)}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-x-2 gap-y-2 px-2.5 py-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:grid-cols-[auto_minmax(13rem,1fr)_8rem_9.5rem_7.5rem_6.5rem_auto] lg:gap-x-3">
                      <GripVertical className="col-start-1 row-start-1 h-4 w-4 self-center text-muted-foreground lg:row-start-1" />
                      <div className="col-span-2 col-start-2 row-start-1 min-w-0 sm:col-span-2 lg:col-span-1 lg:col-start-2">
                        <div className="flex items-center gap-2">
                          <Input
                            value={field.display_name}
                            onChange={(e) =>
                              handleFieldChange(
                                field.id,
                                "display_name",
                                e.target.value,
                              )
                            }
                            className="h-8 text-sm"
                          />
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          #{field.field_order} • {field.field_name}
                        </p>
                      </div>

                      {/* Two adjacent selects that can both read "Text" are
                            unreadable without captions — "Stores" is the
                            database type (changing it rewrites data), "Shows
                            as" is the display format (changing it never does). */}
                      <div className="col-start-2 row-start-2 min-w-0 lg:col-start-3 lg:row-start-1">
                        <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-muted-foreground">
                          Stores
                        </span>
                        <Select
                          value={field.data_type}
                          onValueChange={(value) =>
                            handleFieldChange(field.id, "data_type", value)
                          }
                        >
                          <SelectTrigger className="h-8 w-full text-xs">
                            <span className="truncate">
                              {DATA_TYPES.find(
                                (type) => type.value === field.data_type,
                              )?.label ?? "Text"}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {DATA_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                <div>
                                  <div className="font-medium">
                                    {type.label}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {type.description}
                                  </div>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <FieldFormatPicker
                        label="Shows as"
                        className="col-start-3 row-start-2 min-w-0 space-y-0 lg:col-start-4 lg:row-start-1"
                        optionsPresentation="popover"
                        triggerClassName="h-8 w-full"
                        dataType={field.data_type}
                        value={
                          formatChanges[field.id] ??
                          resolveFieldFormat(field.data_type, field.metadata)
                        }
                        onChange={(next) => {
                          setFormatChanges((prev) => ({
                            ...prev,
                            [field.id]: next,
                          }));
                          setHasChanges(true);
                        }}
                      />

                      <div className="col-start-2 row-start-3 flex h-8 items-center gap-3 sm:col-span-2 sm:col-start-4 sm:row-start-2 lg:col-span-1 lg:col-start-5 lg:row-start-1">
                        <div className="flex items-center gap-1.5">
                          <Checkbox
                            id={`required-${field.id}`}
                            checked={field.is_required}
                            onCheckedChange={(checked) =>
                              handleFieldChange(
                                field.id,
                                "is_required",
                                checked,
                              )
                            }
                          />
                          <Label
                            htmlFor={`required-${field.id}`}
                            className="text-[11px]"
                          >
                            Req
                          </Label>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Checkbox
                            id={`public-${field.id}`}
                            checked={field.is_public}
                            onCheckedChange={(checked) =>
                              handleFieldChange(field.id, "is_public", checked)
                            }
                          />
                          <Label
                            htmlFor={`public-${field.id}`}
                            className="text-[11px]"
                          >
                            Pub
                          </Label>
                        </div>
                      </div>

                      <div className="col-span-2 col-start-3 row-start-3 flex h-8 items-center justify-end sm:col-span-1 sm:col-start-4 sm:row-start-1 lg:col-start-6 lg:row-start-1 lg:justify-start">
                        {dataTypeChanges[field.id] && (
                          <Badge
                            variant="outline"
                            className="shrink-0 border-amber-400 text-amber-600"
                          >
                            Will convert
                          </Badge>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="col-start-4 row-start-1 h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive sm:col-start-5 lg:col-start-7 lg:row-start-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteField(field);
                        }}
                        disabled={
                          loading ||
                          fields.length <= 1 ||
                          deletingFieldId === field.id
                        }
                        title={
                          fields.length <= 1
                            ? "A table must keep at least one column"
                            : `Remove ${field.display_name}`
                        }
                      >
                        {deletingFieldId === field.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </Card>
                  {/* Drop ghost at the very end of the list. */}
                  {draggedField &&
                    dropIndex === index + 1 &&
                    index === fields.length - 1 && (
                      <div className="h-1.5 -my-0.5 rounded-full bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.25)] transition-all" />
                    )}
                </React.Fragment>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="table" className="mt-0 min-h-0 overflow-hidden">
            {/* Own scroll area, same as the Fields tab: this tab's content is
                taller than the dialog on a laptop, and the parent's
                `overflow-hidden` clips the tail with no scrollbar — which is
                how the Data Validation section arrived unreachable. */}
            <div className="max-h-[62dvh] space-y-6 overflow-y-auto px-4 py-3 [scrollbar-gutter:stable]">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="table-name">Table Name</Label>
                  <Input
                    id="table-name"
                    value={tableInfo.table_name}
                    onChange={(e) =>
                      handleTableInfoChange("table_name", e.target.value)
                    }
                    placeholder="Enter table name"
                  />
                </div>

                <div>
                  <Label htmlFor="table-description">Description</Label>
                  <Textarea
                    id="table-description"
                    value={tableInfo.description || ""}
                    onChange={(e) =>
                      handleTableInfoChange("description", e.target.value)
                    }
                    placeholder="Describe what this table contains..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-medium">Visibility Settings</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      {tableInfo.is_public ? (
                        <Eye className="h-4 w-4 text-green-600" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      )}
                      <div>
                        <div className="font-medium text-sm">Public Access</div>
                        <div className="text-xs text-muted-foreground">
                          Anyone can view this table
                        </div>
                      </div>
                    </div>
                    <Checkbox
                      checked={tableInfo.is_public}
                      onCheckedChange={(checked) =>
                        handleTableInfoChange("is_public", checked)
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-medium">Data Validation</h3>
                <div className="flex items-center justify-between gap-4 p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {toValidationMode(tableInfo.validation_mode) ===
                    "strict" ? (
                      <ShieldCheck className="h-4 w-4 shrink-0 text-green-600" />
                    ) : (
                      <Shield className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div>
                      <Label
                        htmlFor="strict-validation"
                        className="font-medium text-sm"
                      >
                        Strict Validation
                      </Label>
                      <div className="text-xs text-muted-foreground">
                        Reject writes that violate the column types or drop a
                        required field. Existing rows are grandfathered (their
                        other fields stay editable). Recommended for newly
                        imported tables where column types are well-defined.
                      </div>
                    </div>
                  </div>
                  <Switch
                    id="strict-validation"
                    checked={
                      toValidationMode(tableInfo.validation_mode) === "strict"
                    }
                    onCheckedChange={(checked) =>
                      handleTableInfoChange(
                        "validation_mode",
                        checked ? "strict" : "permissive",
                      )
                    }
                  />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
          </div>
        )}

        <DialogFooter className="shrink-0 border-t px-4 py-3 sm:px-5">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-h-5 items-center gap-2 text-sm text-muted-foreground">
              {Object.keys(dataTypeChanges).length > 0 && (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              )}
              {Object.keys(dataTypeChanges).length > 0
                ? `${Object.keys(dataTypeChanges).length} ${Object.keys(dataTypeChanges).length === 1 ? "column" : "columns"} will be converted when saved`
                : hasChanges
                  ? "You have unsaved changes"
                  : "No changes made"}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={loading}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={loading || !hasChanges}>
                <Save className="h-4 w-4 mr-2" />
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
