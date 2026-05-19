"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/utils/supabase/client";
import { unwrapUserTableMutation } from "@/utils/user-tables-rpc";
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
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import {
  CalendarIcon,
  Zap,
  ClipboardCopy,
  Download,
  CheckCircle,
  MoreHorizontal
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";

interface TableField {
  id: string;
  field_name: string;
  display_name: string;
  data_type: string;
  field_order: number;
  is_required: boolean;
}

interface EditRowModalProps {
  tableId: string;
  rowId: string | null;
  rowData: Record<string, any> | null;
  fields: TableField[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  cleanupHtmlText?: (text: string) => string;
  containsCleanableHtml?: (text: string) => boolean;
}

export default function EditRowModal({
  tableId,
  rowId,
  rowData: initialRowData,
  fields,
  isOpen,
  onClose,
  onSuccess,
  cleanupHtmlText,
  containsCleanableHtml,
}: EditRowModalProps) {
  const [rowData, setRowData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize row data when modal opens
  useEffect(() => {
    if (isOpen && initialRowData) {
      setRowData(initialRowData);
    }
  }, [isOpen, initialRowData]);

  // Handle field value change
  const handleValueChange = (fieldName: string, value: any) => {
    setRowData((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  // Handle HTML cleanup for a specific field
  const handleFieldCleanup = (fieldName: string) => {
    if (!cleanupHtmlText) return;

    const currentValue = rowData[fieldName];
    if (currentValue && typeof currentValue === "string") {
      const cleanedValue = cleanupHtmlText(currentValue);
      handleValueChange(fieldName, cleanedValue);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!rowId) {
      setError("No row selected for editing");
      return;
    }

    // Validate required fields
    const missingFields = fields
      .filter(
        (field) =>
          field.is_required &&
          (rowData[field.field_name] === null ||
            rowData[field.field_name] === undefined),
      )
      .map((field) => field.display_name);

    if (missingFields.length > 0) {
      setError(`Please fill in required fields: ${missingFields.join(", ")}`);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Call the RPC function
      const { data, error } = await supabase.rpc(
        "update_data_row_in_user_table",
        {
          p_row_id: rowId,
          p_data: rowData,
        },
      );

      if (error) throw error;
      unwrapUserTableMutation(data ?? null);

      onSuccess();
      onClose();
    } catch (err) {
      console.error("Error updating row:", err);
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setLoading(false);
    }
  };

  // Render different input based on data type
  const renderFieldInput = (field: TableField) => {
    const value = rowData[field.field_name];

    switch (field.data_type) {
      case "boolean":
        return (
          <Checkbox
            id={field.field_name}
            checked={value === true}
            onCheckedChange={(checked) =>
              handleValueChange(field.field_name, checked)
            }
          />
        );

      case "date":
        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal"
              >
                {value ? (
                  format(new Date(value), "PPP")
                ) : (
                  <span>Pick a date</span>
                )}
                <CalendarIcon className="ml-auto h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={value ? new Date(value) : undefined}
                onSelect={(date) =>
                  handleValueChange(
                    field.field_name,
                    date ? format(date, "yyyy-MM-dd") : null,
                  )
                }
                initialFocus
              />
            </PopoverContent>
          </Popover>
        );

      case "number":
      case "integer":
        return (
          <Input
            id={field.field_name}
            type="number"
            value={value === null || value === undefined ? "" : value}
            onChange={(e) => {
              const val =
                e.target.value === ""
                  ? null
                  : field.data_type === "integer"
                    ? parseInt(e.target.value)
                    : parseFloat(e.target.value);
              handleValueChange(field.field_name, val);
            }}
            step={field.data_type === "integer" ? 1 : 0.01}
          />
        );

      case "datetime":
        return (
          <Input
            id={field.field_name}
            type="datetime-local"
            value={value || ""}
            onChange={(e) =>
              handleValueChange(field.field_name, e.target.value)
            }
          />
        );

      default: // string and other types
        const stringValue =
          value === null || value === undefined ? "" : String(value);
        const hasCleanableHtml =
          containsCleanableHtml && containsCleanableHtml(stringValue);

        return (
          <div className="relative">
            <Textarea
              id={field.field_name}
              value={stringValue}
              onChange={(e) =>
                handleValueChange(field.field_name, e.target.value)
              }
              rows={6}
              className="resize-y pr-10"
            />
            {hasCleanableHtml && cleanupHtmlText && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 h-6 w-6 p-0 hover:bg-purple-100 dark:hover:bg-purple-900/30"
                onClick={() => handleFieldCleanup(field.field_name)}
                title={`Clean up HTML formatting in ${field.display_name}`}
              >
                <Zap className="h-3 w-3 text-purple-500 dark:text-purple-400" />
              </Button>
            )}
          </div>
        );
    }
  };

  // Build a human-readable row object using display names
  const getRowAsObject = () => {
    const obj: Record<string, unknown> = {};
    fields
      .sort((a, b) => a.field_order - b.field_order)
      .forEach((field) => {
        obj[field.display_name] = rowData[field.field_name] ?? null;
      });
    return obj;
  };

  const [copiedRow, setCopiedRow] = useState(false);

  const copyRowAsJson = async () => {
    try {
      const json = JSON.stringify(getRowAsObject(), null, 2);
      await navigator.clipboard.writeText(json);
      setCopiedRow(true);
      toast({
        title: "Copied",
        description: "Row copied as JSON",
        variant: "success",
      });
      setTimeout(() => setCopiedRow(false), 2000);
    } catch {
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const copyRowAsCsv = async () => {
    try {
      const sortedFields = [...fields].sort(
        (a, b) => a.field_order - b.field_order,
      );
      const headers = sortedFields
        .map((f) => `"${f.display_name.replace(/"/g, '""')}"`)
        .join(",");
      const values = sortedFields
        .map((f) => {
          const val = rowData[f.field_name] ?? "";
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(",");
      await navigator.clipboard.writeText(`${headers}\n${values}`);
      setCopiedRow(true);
      toast({
        title: "Copied",
        description: "Row copied as CSV",
        variant: "success",
      });
      setTimeout(() => setCopiedRow(false), 2000);
    } catch {
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const downloadRowAsJson = () => {
    const json = JSON.stringify(getRowAsObject(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `row_${rowId}.json`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const downloadRowAsCsv = () => {
    const sortedFields = [...fields].sort(
      (a, b) => a.field_order - b.field_order,
    );
    const headers = sortedFields
      .map((f) => `"${f.display_name.replace(/"/g, '""')}"`)
      .join(",");
    const values = sortedFields
      .map((f) => {
        const val = rowData[f.field_name] ?? "";
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(",");
    const csv = `${headers}\n${values}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `row_${rowId}.csv`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  if (!rowId || !fields.length) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Edit Row</DialogTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5">
                  {copiedRow ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <MoreHorizontal className="h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={copyRowAsJson}>
                  <ClipboardCopy className="h-4 w-4 mr-2" />
                  Copy as JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={copyRowAsCsv}>
                  <ClipboardCopy className="h-4 w-4 mr-2" />
                  Copy as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={downloadRowAsJson}>
                  <Download className="h-4 w-4 mr-2" />
                  Download as JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={downloadRowAsCsv}>
                  <Download className="h-4 w-4 mr-2" />
                  Download as CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {error && (
            <div className="bg-red-50 p-2 rounded-md text-red-500 text-sm">
              {error}
            </div>
          )}

          <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-2 scrollbar-none">
            {fields
              .sort((a, b) => a.field_order - b.field_order)
              .map((field) => (
                <div key={field.id} className="space-y-2">
                  <div className="flex items-center">
                    <Label htmlFor={field.field_name} className="flex-grow">
                      {field.display_name}
                      {field.is_required && (
                        <span className="text-red-500 ml-1">*</span>
                      )}
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      {field.data_type}
                    </span>
                  </div>
                  {renderFieldInput(field)}
                </div>
              ))}
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
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
