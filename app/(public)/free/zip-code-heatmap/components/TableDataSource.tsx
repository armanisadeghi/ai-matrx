"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Database,
  Table2,
  Search,
  Loader2,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/utils/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ZipCodeData } from "../page";
import { filterAndSortBySearch } from "@/utils/search-scoring";

function isUserTablesRpcResult(
  data: unknown,
): data is { success: boolean; error?: string; tables?: UserTable[] } {
  return (
    typeof data === "object" &&
    data !== null &&
    "success" in data &&
    typeof (data as { success: unknown }).success === "boolean"
  );
}

function isUserTableCompleteRpcResult(
  data: unknown,
): data is { success: boolean; error?: string; fields?: TableField[] } {
  return (
    typeof data === "object" &&
    data !== null &&
    "success" in data &&
    typeof (data as { success: unknown }).success === "boolean"
  );
}

type PaginatedRow = { data: Record<string, unknown> };

function isUserTableDataPaginatedResult(
  data: unknown,
): data is { success: boolean; error?: string; data?: PaginatedRow[] } {
  return (
    typeof data === "object" &&
    data !== null &&
    "success" in data &&
    typeof (data as { success: unknown }).success === "boolean"
  );
}

interface UserTable {
  id: string;
  table_name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  is_public: boolean;
}

interface TableField {
  id: string;
  field_name: string;
  display_name: string;
  data_type: string;
  field_order: number;
  is_required: boolean;
}

interface TableDataSourceProps {
  onDataLoad: (data: ZipCodeData[]) => void;
  onLoadingChange: (loading: boolean) => void;
}

export default function TableDataSource({
  onDataLoad,
  onLoadingChange,
}: TableDataSourceProps) {
  const [tables, setTables] = useState<UserTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Selection state
  const [selectedTable, setSelectedTable] = useState<UserTable | null>(null);
  const [fields, setFields] = useState<TableField[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [zipCodeColumn, setZipCodeColumn] = useState<string>("");
  const [countColumn, setCountColumn] = useState<string>("");
  const [loadingData, setLoadingData] = useState(false);

  // Load user tables
  useEffect(() => {
    fetchTables();
  }, []);

  const fetchTables = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.rpc("get_user_tables");

      if (error) throw error;
      if (!isUserTablesRpcResult(data)) {
        throw new Error("Invalid response from get_user_tables");
      }
      if (!data.success) throw new Error(data.error || "Failed to load tables");

      setTables(data.tables || []);
    } catch (err) {
      console.error("Error fetching tables:", err);
      setError("Failed to load your tables");
    } finally {
      setLoading(false);
    }
  };

  // Load table fields when a table is selected
  useEffect(() => {
    if (selectedTable) {
      loadTableFields(selectedTable.id);
    } else {
      setFields([]);
      setZipCodeColumn("");
      setCountColumn("");
    }
  }, [selectedTable]);

  const loadTableFields = async (tableId: string) => {
    try {
      setLoadingFields(true);
      const { data, error } = await supabase.rpc("get_user_table_complete", {
        p_table_id: tableId,
      });

      if (error) throw error;
      if (!isUserTableCompleteRpcResult(data)) {
        throw new Error("Invalid response from get_user_table_complete");
      }
      if (!data.success) throw new Error(data.error || "Failed to load table");

      const tableFields = data.fields || [];
      setFields(tableFields);

      // Attempt fuzzy matching for zip code and count columns
      const fuzzyMatchZipCode = tableFields.find(
        (f: TableField) =>
          f.field_name.toLowerCase().includes("zip") ||
          f.display_name.toLowerCase().includes("zip") ||
          f.field_name.toLowerCase().includes("postal"),
      );

      const fuzzyMatchCount = tableFields.find(
        (f: TableField) =>
          f.field_name.toLowerCase().includes("count") ||
          f.display_name.toLowerCase().includes("count") ||
          f.field_name.toLowerCase().includes("total") ||
          f.field_name.toLowerCase().includes("quantity") ||
          f.field_name.toLowerCase().includes("amount"),
      );

      if (fuzzyMatchZipCode) {
        setZipCodeColumn(fuzzyMatchZipCode.field_name);
      }
      if (fuzzyMatchCount) {
        setCountColumn(fuzzyMatchCount.field_name);
      }
    } catch (err) {
      console.error("Error loading table fields:", err);
      setError("Failed to load table fields");
    } finally {
      setLoadingFields(false);
    }
  };

  // Filter tables by search
  const filteredTables = useMemo(() => {
    if (!searchQuery.trim()) return tables;
    return filterAndSortBySearch(tables, searchQuery, [
      { get: (t) => t.table_name, weight: "title" },
      { get: (t) => t.description, weight: "body" },
    ]);
  }, [tables, searchQuery]);

  const handleTableSelect = (table: UserTable) => {
    setSelectedTable(table);
    setError(null);
  };

  const handleLoadData = async () => {
    if (!selectedTable || !zipCodeColumn || !countColumn) {
      setError("Please select a table and both columns");
      return;
    }

    try {
      setLoadingData(true);
      setError(null);
      onLoadingChange(true);

      // Fetch all rows from the table
      const { data: rowsData, error: rowsError } = await supabase.rpc(
        "get_user_table_data_paginated",
        {
          p_table_id: selectedTable.id,
          p_limit: 10000, // Get up to 10k rows
          p_offset: 0,
          p_sort_field: undefined,
          p_sort_direction: "asc",
          p_search_term: undefined,
        },
      );

      if (rowsError) throw rowsError;
      if (!isUserTableDataPaginatedResult(rowsData)) {
        throw new Error("Invalid response from get_user_table_data_paginated");
      }
      if (!rowsData.success)
        throw new Error(rowsData.error || "Failed to load data");

      const rows = rowsData.data || [];

      // Transform rows into ZipCodeData format
      const zipData: ZipCodeData[] = rows
        .map((row: PaginatedRow) => {
          const zipCode = String(row.data[zipCodeColumn] ?? "").trim();
          const count = Number(row.data[countColumn]) || 0;

          if (!zipCode || isNaN(count)) {
            return null;
          }

          return {
            zipCode,
            count,
          };
        })
        .filter((item): item is ZipCodeData => item !== null);

      if (zipData.length === 0) {
        throw new Error("No valid zip code data found in the selected columns");
      }

      onDataLoad(zipData);
    } catch (err) {
      console.error("Error loading table data:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoadingData(false);
      onLoadingChange(false);
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Table Selection */}
      <div className="space-y-2">
        <Label className="text-sm">Select Table</Label>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <Input
              type="text"
              placeholder="Search tables..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 text-sm"
            />
            <div className="border rounded-md max-h-[200px] overflow-y-auto">
              {filteredTables.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4">
                  {searchQuery ? "No tables found" : "No tables available"}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredTables.map((table) => (
                    <button
                      key={table.id}
                      onClick={() => handleTableSelect(table)}
                      className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors ${
                        selectedTable?.id === table.id ? "bg-muted" : ""
                      }`}
                    >
                      <Table2 className="w-4 h-4 flex-shrink-0 text-primary" />
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-sm font-medium truncate">
                          {table.table_name}
                        </div>
                        {table.description && (
                          <div className="text-xs text-muted-foreground truncate">
                            {table.description}
                          </div>
                        )}
                      </div>
                      {selectedTable?.id === table.id && (
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Column Mapping */}
      {selectedTable && (
        <>
          {loadingFields ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-sm">Zip Code Column</Label>
                <Select value={zipCodeColumn} onValueChange={setZipCodeColumn}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select column..." />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map((field) => (
                      <SelectItem key={field.id} value={field.field_name}>
                        <div className="flex flex-col items-start">
                          <span className="font-medium">
                            {field.display_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {field.data_type}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Count Column</Label>
                <Select value={countColumn} onValueChange={setCountColumn}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select column..." />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map((field) => (
                      <SelectItem key={field.id} value={field.field_name}>
                        <div className="flex flex-col items-start">
                          <span className="font-medium">
                            {field.display_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {field.data_type}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleLoadData}
                disabled={!zipCodeColumn || !countColumn || loadingData}
                className="w-full"
                size="sm"
              >
                {loadingData ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading Data...
                  </>
                ) : (
                  "Load Data from Table"
                )}
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}
