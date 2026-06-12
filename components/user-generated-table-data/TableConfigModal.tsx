"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/utils/supabase/client";
import { unwrapUserTableMutation } from "@/utils/user-tables-rpc";
import { changeFieldType } from "@/features/data-tables/service";
import {
  isServiceFailure,
  type FieldDataType,
} from "@/features/data-tables/types";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  GripVertical,
  Settings,
  Type,
  Eye,
  EyeOff,
  AlertTriangle,
  Save,
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
}

interface TableInfo {
  id: string;
  table_name: string;
  description: string;
  is_public: boolean;
  version: number;
}

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

  // Track changes
  const [hasChanges, setHasChanges] = useState(false);
  const [dataTypeChanges, setDataTypeChanges] = useState<
    Record<string, string>
  >({});

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
      setError(null);
    }
  }, [isOpen, initialFields, initialTableInfo]);

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

  // Handle drag and drop for field reordering
  const handleDragStart = (e: React.DragEvent, fieldId: string) => {
    setDraggedField(fieldId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetFieldId: string) => {
    e.preventDefault();

    if (!draggedField || draggedField === targetFieldId) return;

    const draggedIndex = fields.findIndex((f) => f.id === draggedField);
    const targetIndex = fields.findIndex((f) => f.id === targetFieldId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newFields = [...fields];
    const [draggedItem] = newFields.splice(draggedIndex, 1);
    newFields.splice(targetIndex, 0, draggedItem);

    // Update field orders
    const updatedFields = newFields.map((field, index) => ({
      ...field,
      field_order: index + 1,
    }));

    setFields(updatedFields);
    setDraggedField(null);
    setHasChanges(true);
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

  const getDataTypeColor = (dataType: string) => {
    const colors = {
      string: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      number:
        "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      integer:
        "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      boolean:
        "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      date: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      datetime:
        "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      json: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
      array: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
    };
    return colors[dataType] || colors.string;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[800px] max-h-[90dvh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configure Table: {tableInfo.table_name}
            {hasChanges && <span className="text-orange-500">*</span>}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="fields" className="flex-1 overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="fields">Fields & Order</TabsTrigger>
            <TabsTrigger value="table">Table Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="fields" className="flex-1 overflow-hidden mt-4">
            <div className="space-y-4 max-h-[50dvh] overflow-y-auto pr-2">
              {Object.keys(dataTypeChanges).length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-medium">
                      Data Type Changes Detected
                    </span>
                  </div>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    Changing data types will attempt to convert existing data.
                    Some conversions may fail.
                  </p>
                </div>
              )}

              {fields.map((field, index) => (
                <Card
                  key={field.id}
                  className={`cursor-move transition-all ${
                    draggedField === field.id ? "opacity-50 scale-95" : ""
                  } ${dataTypeChanges[field.id] ? "ring-2 ring-amber-400" : ""}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, field.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, field.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <CardTitle className="text-sm">
                            {field.display_name}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">
                            Order: {field.field_order} • Field:{" "}
                            {field.field_name}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getDataTypeColor(field.data_type)}>
                          {field.data_type}
                        </Badge>
                        {dataTypeChanges[field.id] && (
                          <Badge
                            variant="outline"
                            className="text-amber-600 border-amber-400"
                          >
                            Will convert
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Display Name</Label>
                        <Input
                          value={field.display_name}
                          onChange={(e) =>
                            handleFieldChange(
                              field.id,
                              "display_name",
                              e.target.value,
                            )
                          }
                          className="h-8"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Data Type</Label>
                        <Select
                          value={field.data_type}
                          onValueChange={(value) =>
                            handleFieldChange(field.id, "data_type", value)
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
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
                    </div>

                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`required-${field.id}`}
                          checked={field.is_required}
                          onCheckedChange={(checked) =>
                            handleFieldChange(field.id, "is_required", checked)
                          }
                        />
                        <Label
                          htmlFor={`required-${field.id}`}
                          className="text-xs"
                        >
                          Required
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`public-${field.id}`}
                          checked={field.is_public}
                          onCheckedChange={(checked) =>
                            handleFieldChange(field.id, "is_public", checked)
                          }
                        />
                        <Label
                          htmlFor={`public-${field.id}`}
                          className="text-xs"
                        >
                          Public
                        </Label>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="table" className="flex-1 overflow-hidden mt-4">
            <div className="space-y-6">
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
            </div>
          </TabsContent>
        </Tabs>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
          </div>
        )}

        <DialogFooter>
          <div className="flex justify-between items-center w-full">
            <div className="text-sm text-muted-foreground">
              {hasChanges ? "You have unsaved changes" : "No changes made"}
            </div>
            <div className="flex gap-2">
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
