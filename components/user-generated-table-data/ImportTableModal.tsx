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
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
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
  cleanGrid,
  firstRowLooksLikeHeader,
  tableFromGrid,
  type Grid,
} from "@/utils/user-table-utls/grid-import";
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
import { ProTextarea } from "@/components/official/ProTextarea";
import { Textarea } from "@/components/ui/textarea";
import { RefusalNotice, refusal as importRefusal } from "@ai-matrx/records-ui";
import type { RecordsError } from "@ai-matrx/records";

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
  /** The file as a raw grid; whether its first row is column names is a guess the person can flip. */
  const [grid, setGrid] = useState<Grid | null>(null);
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(true);
  /** Set when the table exists but its rows did not all land — the notice then offers to open it. */
  const [createdTableId, setCreatedTableId] = useState<string | null>(null);

  // Preview state
  const [fullData, setFullData] = useState<Record<string, any>[]>([]);
  const [previewData, setPreviewData] = useState<Record<string, any>[]>([]);
  const [detectedFields, setDetectedFields] = useState<ImportFieldDefinition[]>(
    [],
  );
  const [showPreview, setShowPreview] = useState(false);

  // Loading/submission
  const [loading, setLoading] = useState(false);
  // 🚨 A REFUSAL, NOT A RED STRING (lane REFUSAL-SWEEP, 2026-09-23). This held
  // `err.message` and printed it in a red box: the store's words raw, no heading,
  // no remedy, and — for a bulk write that half-landed — nothing at all.
  const [error, setError] = useState<RecordsError | null>(null);

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
      Papa.parse<string[]>(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            acceptGrid(cleanGrid(results.data), file.name, setUploadError);
          } catch (err) {
            setUploadError("That file could not be read as CSV.");
            console.error(err);
            setLoading(false);
          }
        },
        error: (err) => {
          console.error("Import: CSV read failed", err);
          setUploadError("That file could not be read as CSV.");
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
          // RAW ROWS: `sheet_to_json` with no `header` option silently takes the
          // first row as column names — the same assumption the CSV path made.
          const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as unknown[][];
          acceptGrid(cleanGrid(rawRows), file.name, setUploadError);
        } catch (err) {
          setUploadError("That file could not be read as a spreadsheet.");
          console.error(err);
          setLoading(false);
        }
      };
      reader.readAsBinaryString(file);
    }
  };

  /**
   * The ONE place a read file becomes the preview. The only refusal is a grid
   * with nothing in it; whether the first row is column names is a guess, shown
   * as one and flippable (lane REFUSAL-SWEEP / VERIFIER-16).
   */
  const acceptGrid = (read: Grid, sourceName: string | null, refuse: (why: string) => void) => {
    if (read.length === 0) {
      refuse("There is nothing in this file to import — every line is blank.");
      setLoading(false);
      return;
    }
    const header = firstRowLooksLikeHeader(read);
    setGrid(read);
    setFirstRowIsHeader(header);
    applyGrid(read, header);
    setShowPreview(true);
    if (sourceName && !tableName) {
      setTableName(sourceName.replace(/\.[^/.]+$/, "").replace(/_/g, " "));
    }
    setLoading(false);
  };

  const applyGrid = (read: Grid, header: boolean) => {
    const { columns, rows } = tableFromGrid(read, header);
    // A header-only file still has columns; analyzeData needs a row to infer a
    // type from, so those columns start as text.
    const fields =
      rows.length > 0
        ? analyzeData(rows, { columns })
        : columns.map((column, index) => ({
            field_name: sanitizeFieldName(column),
            display_name: column,
            data_type: "string",
            field_order: index,
            is_required: false,
            included: true,
          }));
    setDetectedFields(fields);
    setFullData(rows);
    setPreviewData(rows.slice(0, 10));
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
      Papa.parse<string[]>(pasteData.trim(), {
        header: false,
        skipEmptyLines: true,
        delimiter: "", // Auto-detect
        complete: (results) => {
          try {
            acceptGrid(cleanGrid(results.data), null, setPasteError);
          } catch (err) {
            setPasteError("Those rows could not be read as a table.");
            console.error(err);
            setLoading(false);
          }
        },
        // Papa's string-input overload        // Papa's string-input overload types the error callback as (Error, string).
        error: (err: Error) => {
          console.error("Import: paste parse failed", err);
          setPasteError("Those rows could not be read as a table.");
          setLoading(false);
        },
      });
    } catch (err) {
      setPasteError("Those rows could not be read as a table.");
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
      setError(importRefusal("invalid_argument", "This table has no name yet.", "Type a name for it above, then import."));
      return;
    }

    if (fullData.length === 0 && detectedFields.length === 0) {
      setError(importRefusal("invalid_argument", "There is nothing to import yet.", "Pick a file or paste rows first."));
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
        setError(importRefusal("invalid_argument", "Every column is switched off, so nothing would be imported.", "Switch on at least one column, then import."));
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
        setError(
          importRefusal(
            "internal",
            "The table could not be created, so nothing was imported.",
            "Try the import again. Your file and settings are still here.",
            createResult.error,
          ),
        );
        return;
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

      // A header-only file makes the table and its columns, and has no rows to write.
      const bulkResult =
        operations.length === 0
          ? ({ success: true, data: { table_id: tableId, results: [] } } as unknown as Awaited<ReturnType<typeof bulkWrite>>)
          : await bulkWrite({ tableId, operations });
      if (isServiceFailure(bulkResult)) {
        // The store's own refusal, whole (FIX-15 keeps DETAIL and HINT on it).
        setError(
          bulkResult.refusal ??
            importRefusal(
              "internal",
              "The table was created but its rows were not written.",
              "Open the table and paste the rows in, or try the import again.",
              bulkResult.error,
            ),
        );
        setCreatedTableId(tableId);
        return;
      }

      // Sanity-check the per-op envelope. With insert ops this is belt-and-
      // suspenders — insert failures RAISE rather than soft-fail — but we
      // check so a future op-mix change cannot silently lose rows.
      const failedRows = bulkResult.data.results.filter(isBulkOpError);
      if (failedRows.length > 0) {
        // 🚨 NOTHING FAILS SILENTLY. This was a console warning and the modal
        // closed on a table missing rows the person believed were in it.
        setError(
          importRefusal(
            "refused_by_rule",
            `${failedRows.length} of ${operations.length} rows were not written; the other ${
              operations.length - failedRows.length
            } are in the new table.`,
            "Open the table to see what landed, then paste the missing rows in.",
          ),
        );
        setCreatedTableId(tableId);
        return;
      }

      // Reset form
      resetForm();

      // Call success callback
      onSuccess(tableId);
      onClose();
    } catch (err) {
      console.error("Error importing table:", err);
      setError(
        importRefusal(
          "internal",
          "The import stopped before it finished.",
          "Try it again. Your file and settings are still here.",
          err instanceof Error ? err.message : String(err),
        ),
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
    setGrid(null);
    setFirstRowIsHeader(true);
    setShowPreview(false);
    setUploadError("");
    setPasteError("");
    setError(null);
    setCreatedTableId(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[800px] max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Import Table from File or Clipboard</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-4">
          {error && (
            // The file and settings are still in the form, so the notice owns the
            // two doors out — unless the table already exists, when the way out
            // is to open it (lane REFUSAL-SWEEP).
            <RefusalNotice
              error={error}
              className="text-left"
              {...(createdTableId
                ? {
                    actions: (
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5 text-xs hover:bg-muted"
                          onClick={() => {
                            const id = createdTableId;
                            resetForm();
                            onSuccess(id);
                            onClose();
                          }}
                        >
                          Open the table
                        </button>
                      </div>
                    ),
                  }
                : { onKeepEditing: () => setError(null), onDiscard: resetForm })}
            />
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
                      <RefusalNotice
                        className="text-left"
                        error={importRefusal("invalid_argument", uploadError, "Pick another file, or save this one as CSV or Excel and pick it again.")}
                      />
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
                      <RefusalNotice
                        className="text-left"
                        error={importRefusal("invalid_argument", pasteError, "Copy the rows again with their header row, then paste.")}
                        onKeepEditing={() => {
                          setPasteError("");
                          document.getElementById("pasteData")?.focus();
                        }}
                        onDiscard={() => {
                          setPasteError("");
                          setPasteData("");
                        }}
                      />
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
                  <ProTextarea
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

                {/* THE FIRST ROW IS A GUESS, SHOWN AS ONE (VERIFIER-16). A one-line
                    file used to be refused as "empty" because its only line was
                    silently taken as column names. */}
                {grid ? (
                  <div className="space-y-1 rounded-md border p-3" data-matrx-import-first-row="">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="firstRowIsHeader"
                        checked={firstRowIsHeader}
                        onCheckedChange={(checked) => {
                          setFirstRowIsHeader(checked);
                          applyGrid(grid, checked);
                        }}
                      />
                      <Label htmlFor="firstRowIsHeader">First row is column names</Label>
                    </div>
                    <p className="text-xs text-muted-foreground" data-matrx-import-first-row-says="">
                      {firstRowIsHeader
                        ? fullData.length === 0
                          ? `This file has only column names, so the table will be created with these ${detectedFields.length} columns and no rows yet.`
                          : `The first row is used as column names, and the ${fullData.length} row${fullData.length === 1 ? "" : "s"} below it are imported.`
                        : `Every row is imported, ${fullData.length} in all, and the columns are named Column 1, Column 2 and so on — you can rename them once the table exists.`}
                    </p>
                  </div>
                ) : null}

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
                  {/*
                    🚨 SAY WHAT IS TRUE ABOUT THE RULES (lane REFUSAL-SWEEP,
                    2026-09-23). This wizard CREATES the table, so there are no
                    column rules yet for it to check these values against — which
                    is a different thing from having checked and found nothing,
                    and the screen used to say neither. Importing INTO a table
                    that already has rules is the Paste Rows wizard on the table
                    itself, and that one now asks the rules before it writes.
                  */}
                  <p
                    className="text-xs text-muted-foreground"
                    data-matrx-import-no-rules-yet=""
                  >
                    These columns are being created by this import, so they carry
                    no validation rules yet and nothing here has been checked
                    against any. You can add rules per column once the table
                    exists.
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
                fullData.length === 0
                  ? "Create the table"
                  : `Import ${fullData.length} ${fullData.length === 1 ? "row" : "rows"}`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
