"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/utils/supabase/client";
import Papa from "papaparse";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload,
  Clipboard,
  Settings2,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createTable,
  VALID_DATA_TYPES,
  normalizeDataType,
} from "@/utils/user-table-utls/table-utils";
import { sanitizeFieldName } from "@/utils/user-table-utls/field-name-sanitizer";
import {
  analyzeData,
  type DetectedField,
} from "@/utils/user-table-utls/type-inference";
import { bulkWrite } from "@/features/data-tables/service";
import {
  isBulkOpError,
  isServiceFailure,
  type BulkInsertOp,
} from "@/features/data-tables/types";

interface ImportTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (tableId: string) => void;
  /**
   * Optional pre-loaded file (e.g. from the Smart Import handoff on
   * /workbooks). When provided, the modal opens directly to the preview
   * stage with this file already parsed.
   */
  prefilledFile?: File | null;
}

// Local alias preserved so existing JSX references continue to type-check.
type ImportFieldDefinition = DetectedField;

export default function ImportTableModal({
  isOpen,
  onClose,
  onSuccess,
  prefilledFile = null,
}: ImportTableModalProps) {
  const [activeTab, setActiveTab] = useState<"upload" | "paste">("upload");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Common fields
  const [tableName, setTableName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [authenticatedRead, setAuthenticatedRead] = useState(false);

  // Upload state
  const [fileName, setFileName] = useState<string>("");
  const [uploadError, setUploadError] = useState<string>("");

  // Paste state
  const [pasteData, setPasteData] = useState("");
  const [pasteError, setPasteError] = useState<string>("");

  // Preview state
  const [fullData, setFullData] = useState<Record<string, any>[]>([]);
  const [previewData, setPreviewData] = useState<Record<string, any>[]>([]);
  const [detectedFields, setDetectedFields] = useState<ImportFieldDefinition[]>(
    [],
  );
  const [showPreview, setShowPreview] = useState(false);

  // Loading/submission
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Smart Import handoff — when /workbooks routes a typed-looking file here,
  // it passes it as `prefilledFile`. We auto-process it the same way the
  // file-picker change handler does, so the user lands on the preview/config
  // stage without an extra click.
  useEffect(() => {
    if (isOpen && prefilledFile) {
      handleFileSelect(prefilledFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, prefilledFile]);

  const handleFileSelect = (file: File) => {
    if (!file) return;

    const fileExt = file.name.toLowerCase();
    const isCSV = fileExt.endsWith(".csv");
    const isExcel = fileExt.endsWith(".xlsx") || fileExt.endsWith(".xls");
    const isGoogleSheetsShortcut = fileExt.endsWith(".gsheet");

    if (!isCSV && !isExcel) {
      setUploadError(
        isGoogleSheetsShortcut
          ? "Google Sheets shortcuts can't be imported directly. In Sheets choose File → Download → Microsoft Excel (.xlsx), then upload that."
          : "Please upload a CSV or Excel file (.csv, .xlsx, .xls). If you're importing from Google Sheets, use File → Download → Microsoft Excel (.xlsx) first.",
      );
      return;
    }

    setFileName(file.name);
    setUploadError("");
    setLoading(true);

    if (isCSV) {
      // Handle CSV files
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const data = results.data as Record<string, any>[];
            if (data.length === 0) {
              setUploadError("CSV file is empty");
              setLoading(false);
              return;
            }

            // Analyze and set preview
            const fields = analyzeData(data);
            setDetectedFields(fields);
            setFullData(data); // Store all data
            setPreviewData(data.slice(0, 10)); // Show first 10 rows
            setShowPreview(true);

            // Auto-generate table name from filename if not set
            if (!tableName) {
              const name = file.name
                .replace(/\.[^/.]+$/, "")
                .replace(/_/g, " ");
              setTableName(name);
            }

            setLoading(false);
          } catch (err) {
            setUploadError("Failed to parse CSV file");
            console.error(err);
            setLoading(false);
          }
        },
        error: (err) => {
          setUploadError(`Error reading CSV file: ${err.message}`);
          setLoading(false);
        },
      });
    } else {
      // Handle Excel files
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const XLSX = await import("xlsx");
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: "binary" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<
            string,
            any
          >[];

          if (jsonData.length === 0) {
            setUploadError("Excel file is empty");
            setLoading(false);
            return;
          }

          // Analyze and set preview
          const fields = analyzeData(jsonData);
          setDetectedFields(fields);
          setFullData(jsonData); // Store all data
          setPreviewData(jsonData.slice(0, 10)); // Show first 10 rows
          setShowPreview(true);

          // Auto-generate table name from filename if not set
          if (!tableName) {
            const name = file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
            setTableName(name);
          }

          setLoading(false);
        } catch (err) {
          setUploadError("Failed to parse Excel file");
          console.error(err);
          setLoading(false);
        }
      };
      reader.readAsBinaryString(file);
    }
  };

  const handlePaste = () => {
    if (!pasteData.trim()) {
      setPasteError("Please paste some data");
      return;
    }

    setPasteError("");
    setLoading(true);

    try {
      // Parse TSV/CSV data (tab or comma separated)
      Papa.parse(pasteData.trim(), {
        header: true,
        skipEmptyLines: true,
        delimiter: "", // Auto-detect
        complete: (results) => {
          try {
            const data = results.data as Record<string, any>[];
            if (data.length === 0) {
              setPasteError("No valid data found");
              setLoading(false);
              return;
            }

            // Analyze and set preview
            const fields = analyzeData(data);
            setDetectedFields(fields);
            setFullData(data); // Store all data
            setPreviewData(data.slice(0, 10)); // Show first 10 rows
            setShowPreview(true);
            setLoading(false);
          } catch (err) {
            setPasteError("Failed to parse pasted data");
            console.error(err);
            setLoading(false);
          }
        },
        error: (err) => {
          setPasteError(`Error parsing data: ${err.message}`);
          setLoading(false);
        },
      });
    } catch (err) {
      setPasteError("Failed to process pasted data");
      console.error(err);
      setLoading(false);
    }
  };

  const updateFieldType = (index: number, newType: string) => {
    const updated = [...detectedFields];
    updated[index].data_type = newType;
    setDetectedFields(updated);
  };

  const toggleFieldInclusion = (index: number) => {
    const updated = [...detectedFields];
    updated[index].included = !updated[index].included;
    setDetectedFields(updated);
  };

  const handleSubmit = async () => {
    if (!tableName.trim()) {
      setError("Please enter a table name");
      return;
    }

    if (fullData.length === 0) {
      setError("No data to import");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Filter to only included fields
      const includedFields = detectedFields
        .filter((f) => f.included)
        .map((f) => ({
          field_name: f.field_name,
          display_name: f.display_name,
          data_type: f.data_type,
          field_order: f.field_order,
          is_required: f.is_required,
        }));

      if (includedFields.length === 0) {
        setError("Please select at least one column to import");
        setLoading(false);
        return;
      }

      // Create the table with included fields only
      const createResult = await createTable(supabase, {
        tableName: tableName.trim(),
        description:
          description.trim() || `Imported table with ${fullData.length} rows`,
        isPublic,
        authenticatedRead,
        fields: includedFields,
      });

      if (!createResult.success || !createResult.tableId) {
        throw new Error(createResult.error || "Failed to create table");
      }

      const tableId = createResult.tableId;

      // Build one bulk-write payload from every parsed row.
      // udt_bulk_write inserts the whole batch in a single transaction — fast
      // (one round-trip instead of N) and atomic (any failure rolls everything
      // back). The pre-existing loop here did N round-trips and silently
      // swallowed per-row errors; the atomicity upgrade is intentional.
      const operations: BulkInsertOp[] = fullData.map((row) => {
        const rowData: Record<string, unknown> = {};
        includedFields.forEach((field) => {
          const originalKey = Object.keys(row).find(
            (key) => sanitizeFieldName(key) === field.field_name,
          );
          if (originalKey) {
            rowData[field.field_name] = row[originalKey];
          }
        });
        return { op: "insert", data: rowData };
      });

      const bulkResult = await bulkWrite({ tableId, operations });
      if (isServiceFailure(bulkResult)) {
        throw new Error(`Failed to import rows: ${bulkResult.error}`);
      }

      // Sanity-check the per-op envelope. With insert ops this is belt-and-
      // suspenders — insert failures RAISE rather than soft-fail — but we
      // check so a future op-mix change cannot silently lose rows.
      const failedRows = bulkResult.data.results.filter(isBulkOpError);
      if (failedRows.length > 0) {
        console.warn(
          `Import: ${failedRows.length} of ${operations.length} rows reported errors`,
          failedRows,
        );
      }

      // Reset form
      resetForm();

      // Call success callback
      onSuccess(tableId);
      onClose();
    } catch (err) {
      console.error("Error importing table:", err);
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTableName("");
    setDescription("");
    setIsPublic(false);
    setAuthenticatedRead(false);
    setFileName("");
    setPasteData("");
    setFullData([]);
    setPreviewData([]);
    setDetectedFields([]);
    setShowPreview(false);
    setUploadError("");
    setPasteError("");
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Import Table from File or Clipboard</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-950 p-3 rounded-md text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {!showPreview ? (
            <>
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as "upload" | "paste")}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger
                    value="upload"
                    className="flex items-center gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    Upload File
                  </TabsTrigger>
                  <TabsTrigger
                    value="paste"
                    className="flex items-center gap-2"
                  >
                    <Clipboard className="h-4 w-4" />
                    Paste Data
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="upload" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Upload CSV or Excel File</Label>
                    <div
                      className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {/*
                        No `accept` filter — Drive / Google Sheets pickers
                        and many mobile pickers grey everything out when
                        one is set. `handleFileSelect` validates by
                        extension after pick and shows a clear error if
                        it's not a CSV/XLSX.
                      */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileSelect(file);
                        }}
                        className="hidden"
                      />
                      {fileName ? (
                        <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                          <CheckCircle2 className="h-5 w-5" />
                          <span className="font-medium">{fileName}</span>
                        </div>
                      ) : (
                        <>
                          <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Click to upload or drag and drop
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            CSV, XLSX, or XLS files
                          </p>
                        </>
                      )}
                    </div>
                    {uploadError && (
                      <p className="text-sm text-red-500">{uploadError}</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="paste" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="pasteData">Paste Table Data</Label>
                    <Textarea
                      id="pasteData"
                      value={pasteData}
                      onChange={(e) => setPasteData(e.target.value)}
                      placeholder="Paste data from Google Sheets, Excel, or any table&#10;Example:&#10;Name    Age    Email&#10;John    25     john@example.com&#10;Jane    30     jane@example.com"
                      rows={10}
                      className="font-mono text-sm"
                    />
                    {pasteError && (
                      <p className="text-sm text-red-500">{pasteError}</p>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Copy table data from Google Sheets, Excel, or any
                      spreadsheet and paste it here.
                    </p>
                  </div>
                  <Button
                    onClick={handlePaste}
                    disabled={loading || !pasteData.trim()}
                    className="w-full"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Settings2 className="h-4 w-4 mr-2" />
                        Analyze Data
                      </>
                    )}
                  </Button>
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <>
              {/* Table configuration */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tableName">Table Name</Label>
                  <Input
                    id="tableName"
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    placeholder="e.g. Customer Data"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add a description for this table"
                    rows={2}
                  />
                </div>

                <div className="flex gap-4">
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
                    <Label htmlFor="authenticatedRead">
                      Authenticated Access
                    </Label>
                  </div>
                </div>

                {/* Field type configuration */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Column Configuration</Label>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {detectedFields.filter((f) => f.included).length} of{" "}
                      {detectedFields.length} columns selected
                    </span>
                  </div>
                  <div className="border rounded-lg p-3 space-y-2 max-h-[200px] overflow-y-auto">
                    {detectedFields.map((field, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <Switch
                          id={`field-${index}-include`}
                          checked={field.included}
                          onCheckedChange={() => toggleFieldInclusion(index)}
                          className="scale-90"
                        />
                        <span
                          className={`text-sm font-medium min-w-[150px] truncate ${!field.included ? "text-gray-400 line-through" : ""}`}
                        >
                          {field.display_name}
                        </span>
                        <Select
                          value={field.data_type}
                          onValueChange={(value) =>
                            updateFieldType(index, value)
                          }
                          disabled={!field.included}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {VALID_DATA_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Toggle columns on/off to include or exclude them. Data types
                    are auto-detected but can be changed.
                  </p>
                </div>

                {/* Data preview */}
                <div className="space-y-2">
                  <Label>
                    Data Preview (first 10 rows - only showing included columns)
                  </Label>
                  <div className="border rounded-lg overflow-auto max-h-[250px]">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                        <tr>
                          {detectedFields
                            .filter((f) => f.included)
                            .map((field, i) => (
                              <th
                                key={i}
                                className="px-3 py-2 text-left font-medium text-xs"
                              >
                                {field.display_name}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.map((row, i) => (
                          <tr key={i} className="border-t dark:border-gray-700">
                            {detectedFields
                              .filter((f) => f.included)
                              .map((field, j) => {
                                // Use sanitizeFieldName consistently to match how field_name was created
                                const originalKey = Object.keys(row).find(
                                  (key) =>
                                    sanitizeFieldName(key) === field.field_name,
                                );
                                const value = originalKey
                                  ? row[originalKey]
                                  : "";
                                return (
                                  <td
                                    key={j}
                                    className="px-3 py-2 text-xs truncate max-w-[200px]"
                                  >
                                    {String(value)}
                                  </td>
                                );
                              })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          {showPreview && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowPreview(false);
                setFullData([]);
                setPreviewData([]);
                setDetectedFields([]);
                setFileName("");
              }}
              disabled={loading}
            >
              Back
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </Button>
          {showPreview && (
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                `Import ${fullData.length} Rows`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
