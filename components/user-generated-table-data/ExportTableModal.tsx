"use client";
import { useState } from "react";
import { supabase } from "@/utils/supabase/client";
import {
  unwrapGetUserTableComplete,
  unwrapGetUserTableDataPaginatedRows,
} from "@/utils/user-tables-rpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Download,
  ClipboardCopy,
  CheckCircle,
  Mail,
  Loader2,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ExportTableModalProps {
  tableId: string;
  tableName: string;
  isOpen: boolean;
  onClose: () => void;
  sortField?: string | null;
  sortDirection?: "asc" | "desc";
  searchTerm?: string;
}

export default function ExportTableModal({
  tableId,
  tableName,
  isOpen,
  onClose,
  sortField,
  sortDirection = "asc",
  searchTerm,
}: ExportTableModalProps) {
  const [exportScope, setExportScope] = useState<"all" | "search">(
    searchTerm ? "search" : "all",
  );
  const [exportTab, setExportTab] = useState("download");
  const [downloadFormat, setDownloadFormat] = useState("csv");
  const [copyFormat, setCopyFormat] = useState("markdown");
  const [emailFormat, setEmailFormat] = useState("csv");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailed, setEmailed] = useState(false);

  // Reset scope when searchTerm changes
  const hasSearch = Boolean(searchTerm?.trim());

  // Fetch filtered data using the paginated endpoint with search term
  const fetchFilteredData = async () => {
    // Fetch fields separately since the paginated endpoint doesn't include them
    const { data: fieldsData, error: fieldsError } = await supabase
      .schema("workbench")
      .from("udt_dataset_fields")
      .select(
        "id, field_name, display_name, data_type, field_order, is_required, default_value, validation_rules",
      )
      .eq("table_id", tableId)
      .order("field_order");

    if (fieldsError)
      throw new Error(fieldsError.message || "Failed to fetch table fields");

    const { data, error } = await supabase.rpc(
      "get_user_table_data_paginated_v2",
      {
        p_table_id: tableId,
        p_limit: 10000, // Large limit to get all search results
        p_offset: 0,
        p_sort_field: sortField || null,
        p_sort_direction: sortDirection,
        p_search_term: searchTerm || null,
      },
    );

    if (error)
      throw new Error(error.message || "Failed to fetch filtered data");

    const rows = unwrapGetUserTableDataPaginatedRows(data ?? null);

    // Return in the same format as get_user_table_complete for compatibility
    return {
      success: true,
      fields: fieldsData || [],
      data: rows,
    };
  };

  // Get the appropriate data source based on export scope
  const fetchExportData = async () => {
    if (exportScope === "search" && hasSearch) {
      return await fetchFilteredData();
    }
    // Full table export
    const { data, error } = await supabase.rpc("get_user_table_complete", {
      p_table_id: tableId,
      p_sort_field: sortField || null,
      p_sort_direction: sortDirection,
    });
    if (error) throw error;
    const u = unwrapGetUserTableComplete(data ?? null);
    return { success: true, fields: u.fields, data: u.data };
  };

  // Generate CSV from table data (client-side, for filtered exports)
  const convertToCsv = (tableData: any) => {
    if (!tableData?.fields || !tableData?.data) {
      throw new Error("Invalid table data for CSV conversion");
    }
    const fields = tableData.fields;
    const data = tableData.data;

    const headers = fields.map(
      (f: any) => `"${f.display_name.replace(/"/g, '""')}"`,
    );
    const rows = data.map((row: any) =>
      fields
        .map((f: any) => {
          const val = row.data?.[f.field_name] ?? "";
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(","),
    );

    return [headers.join(","), ...rows].join("\n");
  };

  // Convert data to Markdown table format
  const convertToMarkdown = (tableData: any) => {
    if (!tableData || !tableData.fields || !tableData.data) {
      throw new Error("Invalid table data for Markdown conversion");
    }

    const fields = tableData.fields;
    const data = tableData.data;

    // Create the table header with the table name
    let markdown = `# ${tableName}\n\n`;

    // Create the header row
    const headers = fields.map((field: any) => field.display_name);
    markdown += `| ${headers.join(" | ")} |\n`;

    // Create the separator row
    markdown += `| ${headers.map(() => "---").join(" | ")} |\n`;

    // Create the data rows
    data.forEach((row: any) => {
      const rowValues = fields.map((field: any) => {
        const value = row.data[field.field_name];
        return value !== null ? String(value).replace(/\|/g, "\\|") : "";
      });

      markdown += `| ${rowValues.join(" | ")} |\n`;
    });

    return markdown;
  };

  // Convert data to simplified JSON format (just the visible data)
  const convertToSimpleJson = (tableData: any) => {
    if (!tableData || !tableData.fields || !tableData.data) {
      throw new Error("Invalid table data for JSON conversion");
    }

    const fields = tableData.fields;
    const data = tableData.data;

    // Create array of objects with column name -> value mapping
    return data.map((row: any) => {
      const rowObj: Record<string, any> = {};
      fields.forEach((field: any) => {
        rowObj[field.display_name] = row.data[field.field_name];
      });
      return rowObj;
    });
  };

  // Copy content to clipboard
  const copyToClipboard = async (content: string, formatName: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast({
        title: "Copied to clipboard",
        description: `Table has been copied as ${formatName}`,
        variant: "success",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Helper to trigger a file download
  const downloadFile = (
    content: string,
    filename: string,
    mimeType: string,
  ) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const filePrefix = `${tableName.replace(/\s+/g, "_")}${exportScope === "search" ? "_filtered" : ""}`;

  // Handle export
  const handleExport = async () => {
    try {
      setLoading(true);
      setError(null);

      if (exportTab === "download") {
        if (downloadFormat === "csv") {
          if (exportScope === "search" && hasSearch) {
            // Client-side CSV from filtered data
            const tableData = await fetchFilteredData();
            const csv = convertToCsv(tableData);
            downloadFile(csv, `${filePrefix}_export.csv`, "text/csv");
          } else {
            // Server-side CSV export (original behavior)
            const { data, error } = await supabase.rpc(
              "export_user_table_as_csv",
              {
                p_table_id: tableId,
                p_sort_field: sortField || null,
                p_sort_direction: sortDirection,
              },
            );
            if (error) throw error;
            if (!data) throw new Error("Failed to export data");
            downloadFile(data, `${filePrefix}_export.csv`, "text/csv");
          }
        } else if (downloadFormat === "json") {
          const tableData = await fetchExportData();
          const simpleData = convertToSimpleJson(tableData);
          downloadFile(
            JSON.stringify(simpleData, null, 2),
            `${filePrefix}_export.json`,
            "application/json",
          );
        } else if (downloadFormat === "markdown") {
          const tableData = await fetchExportData();
          downloadFile(
            convertToMarkdown(tableData),
            `${filePrefix}.md`,
            "text/markdown",
          );
        } else if (downloadFormat === "fullSchema") {
          const tableData = await fetchExportData();
          downloadFile(
            JSON.stringify(tableData, null, 2),
            `${filePrefix}_full_schema.json`,
            "application/json",
          );
        }
      } else if (exportTab === "email") {
        const response = await fetch("/api/export/email-table", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tableId, tableName, format: emailFormat }),
        });

        const data = await response.json();
        if (!data.success) throw new Error(data.msg || "Failed to send email");

        setEmailed(true);
        toast({
          title: "Email sent",
          description: `Table has been emailed to you as ${emailFormat.toUpperCase()}`,
          variant: "success",
        });
        setTimeout(() => setEmailed(false), 2000);
      } else {
        // Copy to clipboard
        const tableData = await fetchExportData();
        if (copyFormat === "markdown") {
          await copyToClipboard(convertToMarkdown(tableData), "Markdown");
        } else if (copyFormat === "json") {
          const simpleData = convertToSimpleJson(tableData);
          await copyToClipboard(JSON.stringify(simpleData, null, 2), "JSON");
        } else if (copyFormat === "fullSchema") {
          await copyToClipboard(
            JSON.stringify(tableData, null, 2),
            "Full Schema JSON",
          );
        }
      }

      onClose();
    } catch (err: unknown) {
      console.error("Error exporting table:", err);
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "An unexpected error occurred";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Export Table</DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded-md text-red-500 dark:text-red-400 text-sm border border-red-100 dark:border-red-800">
              {error}
            </div>
          )}

          {/* Export scope toggle - only shown when a search is active */}
          {hasSearch && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Export Scope</Label>
              <RadioGroup
                value={exportScope}
                onValueChange={(v) => setExportScope(v as "all" | "search")}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="search" id="scope-search" />
                  <Label htmlFor="scope-search" className="font-normal text-sm">
                    Current search results
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all" id="scope-all" />
                  <Label htmlFor="scope-all" className="font-normal text-sm">
                    Entire table
                  </Label>
                </div>
              </RadioGroup>
              {exportScope === "search" && (
                <p className="text-xs text-muted-foreground">
                  Exporting rows matching: &quot;{searchTerm}&quot;
                </p>
              )}
            </div>
          )}

          <Tabs
            defaultValue="download"
            value={exportTab}
            onValueChange={setExportTab}
            className="w-full"
          >
            <TabsList className="grid grid-cols-3 mb-4">
              <TabsTrigger value="download" className="flex items-center gap-1">
                <Download className="h-4 w-4" />
                Download
              </TabsTrigger>
              <TabsTrigger value="copy" className="flex items-center gap-1">
                <ClipboardCopy className="h-4 w-4" />
                Copy
              </TabsTrigger>
              <TabsTrigger value="email" className="flex items-center gap-1">
                <Mail className="h-4 w-4" />
                Email
              </TabsTrigger>
            </TabsList>

            <TabsContent value="download" className="space-y-4">
              <div className="space-y-2">
                <Label>Download Format</Label>
                <RadioGroup
                  value={downloadFormat}
                  onValueChange={setDownloadFormat}
                  className="flex flex-col space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="csv" id="download-csv" />
                    <Label htmlFor="download-csv" className="font-normal">
                      CSV (Comma Separated Values)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="json" id="download-json" />
                    <Label htmlFor="download-json" className="font-normal">
                      JSON (Simple Data Structure)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="markdown" id="download-markdown" />
                    <Label htmlFor="download-markdown" className="font-normal">
                      Markdown Table
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem
                      value="fullSchema"
                      id="download-fullSchema"
                    />
                    <Label
                      htmlFor="download-fullSchema"
                      className="font-normal text-gray-500 dark:text-gray-400"
                    >
                      JSON (Internal Schema)
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </TabsContent>

            <TabsContent value="copy" className="space-y-4">
              <div className="space-y-2">
                <Label>Copy Format</Label>
                <RadioGroup
                  value={copyFormat}
                  onValueChange={setCopyFormat}
                  className="flex flex-col space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="markdown" id="copy-markdown" />
                    <Label htmlFor="copy-markdown" className="font-normal">
                      Markdown Table
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="json" id="copy-json" />
                    <Label htmlFor="copy-json" className="font-normal">
                      JSON (Simple Data Structure)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="fullSchema" id="copy-fullSchema" />
                    <Label
                      htmlFor="copy-fullSchema"
                      className="font-normal text-gray-500 dark:text-gray-400"
                    >
                      JSON (Internal Schema)
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </TabsContent>

            <TabsContent value="email" className="space-y-4">
              <div className="space-y-2">
                <Label>Email Format</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Send the table directly to your email
                </p>
                <RadioGroup
                  value={emailFormat}
                  onValueChange={setEmailFormat}
                  className="flex flex-col space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="csv" id="email-csv" />
                    <Label htmlFor="email-csv" className="font-normal">
                      CSV (Comma Separated Values)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="json" id="email-json" />
                    <Label htmlFor="email-json" className="font-normal">
                      JSON (Simple Data Structure)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="markdown" id="email-markdown" />
                    <Label htmlFor="email-markdown" className="font-normal">
                      Markdown Table
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleExport}
            disabled={loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                {exportTab === "copy" ? (
                  <>
                    {copied ? (
                      <CheckCircle className="mr-2 h-4 w-4" />
                    ) : (
                      <ClipboardCopy className="mr-2 h-4 w-4" />
                    )}
                    Copy to Clipboard
                  </>
                ) : exportTab === "email" ? (
                  <>
                    {emailed ? (
                      <CheckCircle className="mr-2 h-4 w-4" />
                    ) : (
                      <Mail className="mr-2 h-4 w-4" />
                    )}
                    Email to Me
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </>
                )}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
