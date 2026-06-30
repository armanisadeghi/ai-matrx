"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/utils/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createTable,
  type FieldDefinition,
  VALID_DATA_TYPES,
} from "@/utils/user-table-utls/table-utils";
import { sanitizeFieldName } from "@/utils/user-table-utls/field-name-sanitizer";

interface CreateTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (tableId: string) => void;
}

export default function CreateTableModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateTableModalProps) {
  const [tableName, setTableName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [authenticatedRead, setAuthenticatedRead] = useState(false);
  const [addFields, setAddFields] = useState(false);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableNameWarning, setTableNameWarning] = useState<string | null>(null);
  const [checkingName, setCheckingName] = useState(false);

  // Handle generating field name from display name
  const generateFieldName = (name: string) => {
    return sanitizeFieldName(name);
  };

  // Check if table name already exists (real-time validation)
  const checkTableNameAvailability = async (name: string) => {
    if (!name.trim()) {
      setTableNameWarning(null);
      return;
    }

    setCheckingName(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) {
        setTableNameWarning(null);
        return;
      }

      const { data, error } = await supabase
        .schema("workbench")
        .from("udt_datasets")
        .select("id")
        .eq("table_name", name)
        .eq("user_id", userId)
        .maybeSingle();

      if (data) {
        setTableNameWarning(
          `A table named "${name}" already exists. Please choose a different name.`,
        );
      } else {
        setTableNameWarning(null);
      }
    } catch (err) {
      console.error("Error checking table name:", err);
      setTableNameWarning(null);
    } finally {
      setCheckingName(false);
    }
  };

  // Debounced table name check
  useEffect(() => {
    const timer = setTimeout(() => {
      if (tableName) {
        checkTableNameAvailability(tableName);
      }
    }, 500); // Wait 500ms after user stops typing

    return () => clearTimeout(timer);
  }, [tableName]);

  // Add a new field
  const addField = () => {
    const newField: FieldDefinition = {
      field_name: "",
      display_name: "",
      data_type: "string",
      field_order: fields.length,
      is_required: false,
    };

    setFields([...fields, newField]);
  };

  // Remove a field
  const removeField = (index: number) => {
    const newFields = [...fields];
    newFields.splice(index, 1);

    // Update field_order for remaining fields
    const updatedFields = newFields.map((field, idx) => ({
      ...field,
      field_order: idx,
    }));

    setFields(updatedFields);
  };

  // Update a field property
  const updateField = (
    index: number,
    property: keyof FieldDefinition,
    value: any,
  ) => {
    const newFields = [...fields];
    newFields[index] = {
      ...newFields[index],
      [property]: value,
    };

    // If display name changes, update field_name
    if (property === "display_name") {
      newFields[index].field_name = generateFieldName(value);
    }

    setFields(newFields);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError(null);

      // Prepare fields if any were added
      const initialFields = addFields && fields.length > 0 ? fields : null;

      // Call the utility function
      const result = await createTable(supabase, {
        tableName,
        description,
        isPublic,
        authenticatedRead,
        fields: initialFields,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      // Reset form
      setTableName("");
      setDescription("");
      setIsPublic(false);
      setAuthenticatedRead(false);
      setAddFields(false);
      setFields([]);

      // Call success callback with the new table ID
      if (result.tableId) {
        onSuccess(result.tableId);
      }
      onClose();
    } catch (err) {
      console.error("Error creating table:", err);
      if (err instanceof Error) {
        setError(err.message);
      } else if (typeof err === "object" && err !== null) {
        setError(JSON.stringify(err));
      } else {
        setError("An unexpected error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create New Table</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {error && (
            <div className="bg-red-50 p-2 rounded-md text-red-500 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="tableName">Table Name</Label>
            <Input
              id="tableName"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="e.g. Customer Data"
              required
              className={
                tableNameWarning
                  ? "border-orange-500 focus:ring-orange-500"
                  : ""
              }
            />
            {checkingName && (
              <p className="text-xs text-muted-foreground">
                Checking availability...
              </p>
            )}
            {tableNameWarning && !checkingName && (
              <p className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1">
                <span>⚠️</span> {tableNameWarning}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description for this table"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Switch
                id="isPublic"
                checked={isPublic}
                onCheckedChange={setIsPublic}
              />
              <Label htmlFor="isPublic">Public Access</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="authenticatedRead"
                checked={authenticatedRead}
                onCheckedChange={setAuthenticatedRead}
              />
              <Label htmlFor="authenticatedRead">Authenticated Access</Label>
            </div>
          </div>

          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="addFields"
                checked={addFields}
                onCheckedChange={(checked) => {
                  setAddFields(checked);
                  if (checked && fields.length === 0) {
                    addField(); // Add first field automatically
                  }
                }}
              />
              <Label htmlFor="addFields">Add Initial Fields</Label>
            </div>

            {addFields && (
              <div className="space-y-4 mt-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-medium">Fields</h3>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addField}
                  >
                    <Plus className="h-4 w-4" />
                    Add Field
                  </Button>
                </div>

                {fields.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    No fields added yet. Click 'Add Field' to begin.
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[40dvh] overflow-y-auto pr-2">
                    {fields.map((field, index) => (
                      <div
                        key={index}
                        className="border p-3 rounded-md space-y-3 relative"
                      >
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="absolute top-2 right-2 h-6 w-6"
                          onClick={() => removeField(index)}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>

                        <div className="space-y-2">
                          <Label htmlFor={`field-${index}-display`}>
                            Field Name
                          </Label>
                          <Input
                            id={`field-${index}-display`}
                            value={field.display_name}
                            onChange={(e) =>
                              updateField(index, "display_name", e.target.value)
                            }
                            placeholder="e.g. Total Revenue"
                            required
                          />
                          <p className="text-xs text-muted-foreground">
                            Internal field name:{" "}
                            <code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">
                              {field.field_name || "auto-generated"}
                            </code>
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label htmlFor={`field-${index}-type`}>
                              Data Type
                            </Label>
                            <Select
                              value={field.data_type}
                              onValueChange={(value) =>
                                updateField(index, "data_type", value)
                              }
                            >
                              <SelectTrigger id={`field-${index}-type`}>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                              <SelectContent>
                                {VALID_DATA_TYPES.map((type) => (
                                  <SelectItem key={type} value={type}>
                                    {type.charAt(0).toUpperCase() +
                                      type.slice(1)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex items-center space-x-2 pt-8">
                            <Switch
                              id={`field-${index}-required`}
                              checked={field.is_required}
                              onCheckedChange={(checked) =>
                                updateField(index, "is_required", checked)
                              }
                            />
                            <Label htmlFor={`field-${index}-required`}>
                              Required
                            </Label>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !!tableNameWarning || checkingName}
            >
              {loading ? "Creating..." : "Create Table"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
