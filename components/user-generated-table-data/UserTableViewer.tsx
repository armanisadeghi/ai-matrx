"use client";

import React, { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/utils/supabase/client";
import TableToolbar from "./TableToolbar";
import {
  Pencil,
  Trash,
  Loader,
  Expand,
  Link,
  Zap,
  Eye,
  AlertCircle,
  History,
} from "lucide-react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { VersionHistoryViewer } from "@/features/data-tables/components/VersionHistoryViewer";
import { EditableCell } from "@/features/data-tables/components/EditableCell";
import { useTableRealtime } from "@/features/data-tables/hooks/useTableRealtime";
import { bulkWrite, upsertCell } from "@/features/data-tables/service";
import {
  isServiceFailure,
  type BulkMergeOp,
  type FieldDataType,
} from "@/features/data-tables/types";
import { TableLoadingComponent } from "@/components/matrx/LoadingComponents";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import TableReferenceModal from "./TableReferenceModal";
import ColumnHeaderMenu from "./ColumnHeaderMenu";

interface UserTable {
  id: string;
  table_name: string;
  description: string;
  row_count: number;
  field_count: number;
  user_id?: string;
}

/** User-table RPCs return `{ success: boolean, error?: string, ... }` as `Json` — validate before reading fields. */
function assertRpcSuccessEnvelope(
  data: unknown,
): asserts data is { success: boolean; error?: string } {
  if (
    typeof data !== "object" ||
    data === null ||
    typeof (data as { success?: unknown }).success !== "boolean"
  ) {
    throw new Error("Invalid table RPC response");
  }
}

function rowOrderingIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function rowIdFromRpcDataRow(row: unknown): string | undefined {
  if (row && typeof row === "object" && "id" in row) {
    const id = (row as { id: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

interface UserTableViewerProps {
  tableId: string;
  showTableSelector?: boolean;
}

const UserTableViewer = ({
  tableId,
  showTableSelector = false,
}: UserTableViewerProps) => {
  const router = useRouter();
  const [tableInfo, setTableInfo] = useState<any>(null);
  const [fields, setFields] = useState([]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Ownership state
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Sorting state
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [savedSortField, setSavedSortField] = useState<string | null>(null);
  const [savedSortDirection, setSavedSortDirection] = useState<
    "asc" | "desc" | null
  >(null);
  const [savingSortPreference, setSavingSortPreference] = useState(false);

  // Search state
  const [searchTerm, setSearchTerm] = useState("");

  // Per-column filter state. Maps field_name -> filter substring. Applied
  // client-side over the full dataset (loaded on demand) so filtering works
  // across pages, not just the current server page.
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>(
    {},
  );
  const [fullDatasetCache, setFullDatasetCache] = useState<any[] | null>(null);
  const [loadingFullDataset, setLoadingFullDataset] = useState(false);

  // Row action state
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [selectedRowData, setSelectedRowData] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Row history sheet state. historyRowId is the udt_dataset_rows.id whose
  // version log is currently visible; null = sheet closed.
  const [historyRowId, setHistoryRowId] = useState<string | null>(null);

  // Additional modals
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [showAddRowModal, setShowAddRowModal] = useState(false);
  const [showPasteRowsDialog, setShowPasteRowsDialog] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showTableSettingsModal, setShowTableSettingsModal] = useState(false);
  const [showReferenceOverlay, setShowReferenceOverlay] = useState(false);

  // Table selector state
  const [tables, setTables] = useState<UserTable[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);

  // Text expansion modal state
  const [expandedText, setExpandedText] = useState<string | null>(null);
  const [expandedFieldName, setExpandedFieldName] = useState<string | null>(
    null,
  );
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [expandedFieldKey, setExpandedFieldKey] = useState<string | null>(null);
  const [showTextModal, setShowTextModal] = useState(false);
  const [expandedTextModified, setExpandedTextModified] = useState(false);
  const [savingExpandedText, setSavingExpandedText] = useState(false);

  // Reference modal state
  const [showReferenceModal, setShowReferenceModal] = useState(false);
  const [referenceRowId, setReferenceRowId] = useState<string | null>(null);
  const [referenceRowData, setReferenceRowData] = useState<any>(null);

  // Row ordering state
  const [rowOrderingEnabled, setRowOrderingEnabled] = useState(false);
  const [showRowOrderingModal, setShowRowOrderingModal] = useState(false);

  // Fetch current user on mount
  useEffect(() => {
    const fetchCurrentUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    fetchCurrentUser();
  }, []);

  // Update isReadOnly when tableInfo or currentUserId changes
  useEffect(() => {
    if (tableInfo && currentUserId !== null) {
      const tableOwnerId = tableInfo.user_id;
      setIsReadOnly(tableOwnerId !== currentUserId);
    }
  }, [tableInfo, currentUserId]);

  // Show toast when trying to edit in read-only mode
  const showReadOnlyToast = () => {
    toast({
      title: "View Only",
      description:
        "You don't have edit access to this shared table. You would need to duplicate it first to make changes.",
      variant: "default",
    });
  };

  // Add this helper function after the other state declarations and before formatCellValue
  const cleanupHtmlText = (text: string): string => {
    if (!text || typeof text !== "string") return text;

    // Replace <br> and <br/> tags with newlines
    let cleaned = text.replace(/<br\s*\/?>/gi, "\n");

    // Replace HTML entities
    cleaned = cleaned.replace(/&lt;/g, "<");
    cleaned = cleaned.replace(/&gt;/g, ">");
    cleaned = cleaned.replace(/&amp;/g, "&");
    cleaned = cleaned.replace(/&quot;/g, '"');
    cleaned = cleaned.replace(/&#39;/g, "'");
    cleaned = cleaned.replace(/&nbsp;/g, " ");

    // Remove any remaining HTML tags
    cleaned = cleaned.replace(/<[^>]*>/g, "");

    // Clean up extra whitespace but preserve intentional line breaks
    cleaned = cleaned.replace(/\n\s*\n/g, "\n\n"); // Multiple newlines become double newlines
    cleaned = cleaned.replace(/^\s+|\s+$/g, ""); // Trim start and end

    return cleaned;
  };

  // Add this helper function to detect if text contains HTML that can be cleaned
  const containsCleanableHtml = (text: string): boolean => {
    if (!text || typeof text !== "string") return false;

    // Check for <br> tags or other common HTML patterns
    return (
      /<br\s*\/?>/gi.test(text) ||
      /&lt;|&gt;|&amp;|&quot;|&#39;|&nbsp;/g.test(text) ||
      /<[^>]*>/g.test(text)
    );
  };

  // Add this function to handle the cleanup and update
  const handleCleanupText = async (
    fieldName: string,
    originalText: string,
    rowId: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation(); // Prevent row edit modal from opening

    try {
      const cleanedText = cleanupHtmlText(originalText);

      if (cleanedText === originalText) {
        // No changes needed
        return;
      }

      // Surgical single-field write via udt_upsert_cell — uses jsonb_set so
      // it cannot accidentally drop other fields, fires validation + version
      // triggers, and is permission-gated by owner-or-editor.
      const result = await upsertCell({
        tableId,
        rowId,
        fieldName,
        value: cleanedText,
      });
      if (isServiceFailure(result)) throw new Error(result.error);

      // Clear sorted data cache when data is modified
      setAllSortedData(null);

      // Reload the table data to reflect changes
      loadTableData(currentPage, limit, sortField, sortDirection, searchTerm);
    } catch (err) {
      console.error("Error cleaning up text:", err);
      setError(err instanceof Error ? err.message : "Failed to cleanup text");
    }
  };

  // Load tables for selector
  const loadTables = async () => {
    if (!showTableSelector) return;

    try {
      setTablesLoading(true);
      const { data, error } = await supabase.rpc("get_user_tables");

      if (error) throw error;
      assertRpcSuccessEnvelope(data);
      if (!data.success) throw new Error(data.error || "Failed to load tables");

      const listUnknown = (data as { tables?: unknown }).tables;
      setTables(Array.isArray(listUnknown) ? (listUnknown as UserTable[]) : []);
    } catch (err) {
      console.error("Error fetching tables:", err);
    } finally {
      setTablesLoading(false);
    }
  };

  // Handle table selection change
  const handleTableChange = (value: string) => {
    if (value !== tableId) {
      router.push(`/data/${value}`);
    }
  };

  // Load table data
  const loadTableData = async (
    page = 1,
    pageLimit = limit,
    sort = sortField,
    direction = sortDirection,
    search = searchTerm,
    forceReload = false,
  ) => {
    setLoading(true);
    // Any server reload makes the client-side filter cache stale; drop it so
    // the filter effect re-fetches fresh full data when filters are active.
    setFullDatasetCache(null);
    try {
      // Load table metadata and fields (always reload if forceReload is true)
      let currentTableInfo = tableInfo;
      let currentFields = fields;
      let effectiveSort = sort;
      let effectiveDirection = direction;

      if (!tableInfo || !fields.length || forceReload) {
        const { data: tableData, error: tableError } = await supabase.rpc(
          "get_user_table_complete",
          { p_table_id: tableId },
        );

        if (tableError) throw tableError;
        assertRpcSuccessEnvelope(tableData);
        if (!tableData.success)
          throw new Error(tableData.error || "Failed to load table");

        const complete = tableData as typeof tableData & {
          table: unknown;
          fields: unknown[];
          row_count: number;
        };
        currentTableInfo = complete.table;
        currentFields = complete.fields;

        setTableInfo(complete.table);
        setFields(complete.fields);
        setTotalCount(complete.row_count);
        setTotalPages(Math.ceil(complete.row_count / pageLimit));

        // Apply saved default sort on initial load (when no sort is specified)
        if (!sort && currentTableInfo?.row_ordering_config?.default_sort) {
          const savedSort = currentTableInfo.row_ordering_config.default_sort;
          const fieldExists = currentFields.some(
            (f: any) => f.field_name === savedSort.field,
          );
          if (fieldExists) {
            effectiveSort = savedSort.field;
            effectiveDirection = savedSort.direction || "asc";
            // Update state to reflect the applied sort
            setSortField(savedSort.field);
            setSortDirection(savedSort.direction || "asc");
            setSavedSortField(savedSort.field);
            setSavedSortDirection(savedSort.direction || "asc");
          }
        }
      }

      // Then load paginated data
      const offset = (page - 1) * pageLimit;
      const { data: paginatedData, error: paginatedError } = await supabase.rpc(
        "get_user_table_data_paginated_v2",
        {
          p_table_id: tableId,
          p_limit: pageLimit,
          p_offset: offset,
          p_sort_field: effectiveSort,
          p_sort_direction: effectiveDirection,
          p_search_term: search || null,
        },
      );

      if (paginatedError) throw paginatedError;
      assertRpcSuccessEnvelope(paginatedData);
      if (!paginatedData.success)
        throw new Error(paginatedData.error || "Failed to load data");

      const pagePayload = paginatedData as typeof paginatedData & {
        data: unknown[];
        pagination: {
          total_count: number;
          page_count: number;
          current_page: number;
        };
      };
      let processedData = pagePayload.data;

      // Apply row ordering if enabled and no other sorting is active
      if (
        currentTableInfo?.row_ordering_config?.enabled &&
        currentTableInfo.row_ordering_config.order &&
        !effectiveSort
      ) {
        const orderConfig = rowOrderingIds(
          currentTableInfo.row_ordering_config.order,
        );
        processedData = [...pagePayload.data].sort((a, b) => {
          const aId = rowIdFromRpcDataRow(a);
          const bId = rowIdFromRpcDataRow(b);
          const aIndex = aId !== undefined ? orderConfig.indexOf(aId) : -1;
          const bIndex = bId !== undefined ? orderConfig.indexOf(bId) : -1;

          // If both items are in the order config, sort by their position
          if (aIndex !== -1 && bIndex !== -1) {
            return aIndex - bIndex;
          }

          // If only one item is in the order config, prioritize it
          if (aIndex !== -1) return -1;
          if (bIndex !== -1) return 1;

          // If neither item is in the order config, maintain original order
          return 0;
        });
      }

      // Apply client-side sorting if we have a sort field and conditions are right for client-side sorting
      if (
        effectiveSort &&
        !search &&
        page === 1 &&
        pageLimit >= pagePayload.pagination.total_count
      ) {
        // Use currentFields (local variable) since state might not be updated yet
        const fieldDef = currentFields.find(
          (f: any) => f.field_name === effectiveSort,
        );
        const fieldDataType = fieldDef?.data_type;
        processedData = smartSort(
          processedData,
          effectiveSort,
          effectiveDirection as "asc" | "desc",
          fieldDataType,
        );
      }

      setData(processedData);
      setTotalCount(pagePayload.pagination.total_count);
      setTotalPages(pagePayload.pagination.page_count);
      setCurrentPage(pagePayload.pagination.current_page);
    } catch (err) {
      console.error("Error loading table data:", err);
      setError(err instanceof Error ? err.message : "Failed to load table");
    } finally {
      setLoading(false);
    }
  };

  // Initial data load
  useEffect(() => {
    if (tableId) {
      loadTableData();
      if (showTableSelector) {
        loadTables();
      }
    }
  }, [tableId, showTableSelector]);

  // --- Column filtering -------------------------------------------------

  // Cap on how many rows we pull for client-side column filtering. Large
  // tables beyond this filter only across the loaded subset.
  const FILTER_FETCH_CAP = 5000;

  const hasColumnFilters = Object.values(columnFilters).some(
    (v) => v.trim() !== "",
  );

  // Load the full dataset (sans server sort/pagination) so column filters can
  // run across every row. Respects the active global search term so the two
  // compose. Triggered lazily the first time a column filter becomes active.
  const loadFullDataset = async () => {
    try {
      setLoadingFullDataset(true);
      const { data: allData, error } = await supabase.rpc(
        "get_user_table_data_paginated_v2",
        {
          p_table_id: tableId,
          p_limit: Math.min(Math.max(totalCount, 1), FILTER_FETCH_CAP),
          p_offset: 0,
          p_sort_field: null,
          p_sort_direction: "asc",
          p_search_term: searchTerm || null,
        },
      );

      if (error) throw error;
      assertRpcSuccessEnvelope(allData);
      if (!allData.success)
        throw new Error(allData.error || "Failed to load data for filtering");

      const payload = allData as typeof allData & { data: unknown[] };
      setFullDatasetCache(payload.data as any[]);
    } catch (err) {
      console.error("Error loading full dataset for filtering:", err);
    } finally {
      setLoadingFullDataset(false);
    }
  };

  useEffect(() => {
    if (!hasColumnFilters) return;
    if (fullDatasetCache || loadingFullDataset) return;
    if (totalCount === 0) return;
    void loadFullDataset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasColumnFilters, fullDatasetCache, loadingFullDataset, totalCount]);

  // Update a single column's filter. Resets to page 1; when the last filter is
  // cleared we re-sync with the server page so pagination stays authoritative.
  const handleColumnFilterChange = (fieldName: string, value: string) => {
    const next = { ...columnFilters };
    if (value.trim()) {
      next[fieldName] = value;
    } else {
      delete next[fieldName];
    }
    setColumnFilters(next);
    setCurrentPage(1);

    const stillFiltering = Object.values(next).some((v) => v.trim() !== "");
    if (!stillFiltering) {
      loadTableData(1, limit, sortField, sortDirection, searchTerm);
    }
  };

  // Apply active column filters to a row set (case-insensitive substring).
  const applyColumnFilters = (rows: any[]): any[] => {
    if (!hasColumnFilters) return rows;
    const active = Object.entries(columnFilters).filter(([, v]) =>
      v.trim(),
    );
    return rows.filter((row) =>
      active.every(([fieldName, term]) => {
        const value = row?.data?.[fieldName];
        if (value === null || value === undefined) return false;
        const haystack =
          typeof value === "object"
            ? JSON.stringify(value)
            : String(value);
        return haystack.toLowerCase().includes(term.trim().toLowerCase());
      }),
    );
  };

  // Live updates from other clients (or our own writes that bypass the
  // local refetch). Debounced so a 1k-row bulk import doesn't trigger 1k
  // refetches; a single refetch ~400ms after the burst stops is enough.
  const realtimeRefetchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  useTableRealtime(tableId, () => {
    if (realtimeRefetchTimer.current) {
      clearTimeout(realtimeRefetchTimer.current);
    }
    realtimeRefetchTimer.current = setTimeout(() => {
      void loadTableData(currentPage, limit, sortField, sortDirection, searchTerm);
    }, 400);
  });
  useEffect(
    () => () => {
      if (realtimeRefetchTimer.current) clearTimeout(realtimeRefetchTimer.current);
    },
    [],
  );

  // Check row ordering status when table info changes
  useEffect(() => {
    if (tableInfo) {
      setRowOrderingEnabled(checkRowOrderingEnabled());
    }
  }, [tableInfo]);

  // Keep saved sort state in sync with tableInfo (for UI display purposes)
  // Note: The actual sort is applied in loadTableData when the table info is first loaded
  useEffect(() => {
    if (tableInfo?.row_ordering_config?.default_sort) {
      const { field, direction } = tableInfo.row_ordering_config.default_sort;
      setSavedSortField(field);
      setSavedSortDirection(direction || "asc");
    } else if (tableInfo) {
      setSavedSortField(null);
      setSavedSortDirection(null);
    }
  }, [tableInfo?.row_ordering_config?.default_sort]);

  // Handle page change
  const handlePageChange = (page) => {
    setCurrentPage(page);

    // When column filters are active, pagination is purely client-side over
    // the filtered set — the derived slice handles it, no server fetch.
    if (hasColumnFilters) {
      return;
    }

    // If we have client-side sorted data cached, use it for pagination
    if (allSortedData && allSortedData.length > 0 && sortField) {
      const startIndex = (page - 1) * limit;
      const pageData = allSortedData.slice(startIndex, startIndex + limit);
      setData(pageData);
    } else {
      loadTableData(page, limit);
    }
  };

  // Handle rows per page change
  const handleLimitChange = (newLimit) => {
    const numLimit = parseInt(newLimit, 10);
    setLimit(numLimit);
    // Reset to first page when changing limit
    setCurrentPage(1);

    // Column filters paginate client-side over the derived slice.
    if (hasColumnFilters) {
      return;
    }

    // If we have client-side sorted data cached, use it
    if (allSortedData && allSortedData.length > 0 && sortField) {
      const pageData = allSortedData.slice(0, numLimit);
      setData(pageData);
      setTotalPages(Math.ceil(allSortedData.length / numLimit));
    } else {
      loadTableData(1, numLimit);
    }
  };

  // Threshold for client-side sorting (rows) - prevents loading too much data
  const CLIENT_SORT_THRESHOLD = 1000;

  // State for storing all sorted data when doing client-side sorting
  const [allSortedData, setAllSortedData] = useState<any[] | null>(null);

  // Smart numeric sorting helper
  const isNumericValue = (value: any): boolean => {
    if (value === null || value === undefined || value === "") return false;
    const stringValue = String(value).trim();
    return !isNaN(Number(stringValue)) && isFinite(Number(stringValue));
  };

  const parseNumericValue = (value: any): number => {
    if (value === null || value === undefined || value === "") return -Infinity;
    return Number(String(value).trim());
  };

  // Get the data type for a field by name
  const getFieldDataType = (fieldName: string): string | undefined => {
    const field = fields.find((f: any) => f.field_name === fieldName);
    return field?.data_type;
  };

  const smartSort = (
    data: any[],
    fieldName: string,
    direction: "asc" | "desc",
    declaredDataType?: string,
  ) => {
    // If the field is declared as integer or number, force numeric sorting
    const forceNumeric =
      declaredDataType === "integer" || declaredDataType === "number";

    return [...data].sort((a, b) => {
      const aValue = a.data[fieldName];
      const bValue = b.data[fieldName];

      // Handle null/undefined values
      if (aValue === null || aValue === undefined) {
        if (bValue === null || bValue === undefined) return 0;
        return direction === "asc" ? -1 : 1;
      }
      if (bValue === null || bValue === undefined) {
        return direction === "asc" ? 1 : -1;
      }

      // Use declared data type to determine if numeric, otherwise detect from values
      const aIsNumeric = forceNumeric || isNumericValue(aValue);
      const bIsNumeric = forceNumeric || isNumericValue(bValue);

      if (aIsNumeric && bIsNumeric) {
        // Both are numeric - do numeric comparison
        const aNum = parseNumericValue(aValue);
        const bNum = parseNumericValue(bValue);
        const result = aNum - bNum;
        return direction === "asc" ? result : -result;
      } else if (aIsNumeric && !bIsNumeric) {
        // Mixed types - numeric values come first in ascending order
        return direction === "asc" ? -1 : 1;
      } else if (!aIsNumeric && bIsNumeric) {
        // Mixed types - numeric values come first in ascending order
        return direction === "asc" ? 1 : -1;
      } else {
        // Both are non-numeric - do string comparison
        const aStr = String(aValue).toLowerCase();
        const bStr = String(bValue).toLowerCase();
        const result = aStr.localeCompare(bStr);
        return direction === "asc" ? result : -result;
      }
    });
  };

  // Handle sorting. Pass an explicit direction to set it directly (used by the
  // per-column header menu); omit it to toggle asc/desc on repeated clicks.
  const handleSort = async (field, explicitDirection?: "asc" | "desc") => {
    const newDirection =
      explicitDirection ??
      (field === sortField && sortDirection === "asc" ? "desc" : "asc");
    setSortField(field);
    setSortDirection(newDirection);

    // While column filters are active, sorting is applied client-side over the
    // filtered set in the render derivation — no server round-trip needed.
    if (hasColumnFilters) {
      return;
    }

    // Get the declared data type for type-aware sorting
    const fieldDataType = getFieldDataType(field);

    // For small datasets without search, use client-side sorting for correct type handling
    if (totalCount <= CLIENT_SORT_THRESHOLD && !searchTerm) {
      // Check if we already have all data cached, just resort it
      if (allSortedData && allSortedData.length === totalCount) {
        const resortedData = smartSort(
          allSortedData,
          field,
          newDirection,
          fieldDataType,
        );
        setAllSortedData(resortedData);
        // Show the appropriate page slice
        const startIndex = (currentPage - 1) * limit;
        const pageData = resortedData.slice(startIndex, startIndex + limit);
        setData(pageData);
        return;
      }

      // Load all data for client-side sorting
      setLoading(true);
      try {
        const { data: allData, error } = await supabase.rpc(
          "get_user_table_data_paginated",
          {
            p_table_id: tableId,
            p_limit: totalCount,
            p_offset: 0,
            p_sort_field: null, // Don't use server-side sorting
            p_sort_direction: "asc",
            p_search_term: null,
          },
        );

        if (error) throw error;
        assertRpcSuccessEnvelope(allData);
        if (!allData.success)
          throw new Error(allData.error || "Failed to load data");

        const allPayload = allData as typeof allData & { data: unknown[] };
        // Sort all data client-side with type awareness
        const sortedData = smartSort(
          allPayload.data,
          field,
          newDirection,
          fieldDataType,
        );
        setAllSortedData(sortedData);

        // Show the appropriate page slice
        const startIndex = (currentPage - 1) * limit;
        const pageData = sortedData.slice(startIndex, startIndex + limit);
        setData(pageData);
      } catch (err) {
        console.error("Error during client-side sorting:", err);
        // Fallback to server-side sorting
        setAllSortedData(null);
        loadTableData(currentPage, limit, field, newDirection);
      } finally {
        setLoading(false);
      }
    } else {
      // Fall back to server-side sorting for large datasets or when searching
      setAllSortedData(null);
      loadTableData(currentPage, limit, field, newDirection);
    }
  };

  // Clear the active sort and restore the table's natural/server order.
  const clearSort = () => {
    setSortField(null);
    setSortDirection("asc");
    setAllSortedData(null);
    if (!hasColumnFilters) {
      loadTableData(currentPage, limit, null, "asc", searchTerm);
    }
  };

  // Handle search
  const handleSearch = (e) => {
    e.preventDefault();
    // Clear sorted data cache when searching (server-side search + sort needed)
    setAllSortedData(null);
    loadTableData(1, limit, sortField, sortDirection, searchTerm);
  };

  // Clear search
  const clearSearch = () => {
    setSearchTerm("");
    // Clear sorted data cache when clearing search
    setAllSortedData(null);
    loadTableData(1, limit, sortField, sortDirection, "");
  };

  // Handle edit row
  const handleEditRow = (rowId, rowData) => {
    setSelectedRowId(rowId);
    setSelectedRowData(rowData);
    setShowEditModal(true);
  };

  // Handle delete row
  const handleDeleteRow = (rowId) => {
    setSelectedRowId(rowId);
    setShowDeleteModal(true);
  };

  // Handle text expansion
  const handleExpandText = (
    text: string,
    fieldName: string,
    rowId: string,
    fieldKey: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation(); // Prevent row edit modal from opening
    setExpandedText(text);
    setExpandedFieldName(fieldName);
    setExpandedRowId(rowId);
    setExpandedFieldKey(fieldKey);
    setExpandedTextModified(false);
    setShowTextModal(true);
  };

  // Handle HTML cleanup in the text expansion modal
  const handleCleanupExpandedText = () => {
    if (!expandedText) return;

    const cleanedText = cleanupHtmlText(expandedText);
    setExpandedText(cleanedText);
    setExpandedTextModified(true);
  };

  // Handle saving expanded text changes to the database
  const handleSaveExpandedText = async () => {
    if (!expandedRowId || !expandedFieldKey || !expandedText) return;

    try {
      setSavingExpandedText(true);

      // Surgical single-field write via udt_upsert_cell.
      const result = await upsertCell({
        tableId,
        rowId: expandedRowId,
        fieldName: expandedFieldKey,
        value: expandedText,
      });
      if (isServiceFailure(result)) throw new Error(result.error);

      // Clear sorted data cache when data is modified
      setAllSortedData(null);

      // Reload the table data to reflect changes
      await loadTableData(
        currentPage,
        limit,
        sortField,
        sortDirection,
        searchTerm,
      );

      setExpandedTextModified(false);
      setShowTextModal(false);

      // Reset expanded text state
      setExpandedText(null);
      setExpandedFieldName(null);
      setExpandedRowId(null);
      setExpandedFieldKey(null);
    } catch (err) {
      console.error("Error saving expanded text:", err);
      setError(
        err instanceof Error ? err.message : "Failed to save text changes",
      );
    } finally {
      setSavingExpandedText(false);
    }
  };

  // Handle manual text changes in the expanded modal
  const handleExpandedTextChange = (newText: string) => {
    setExpandedText(newText);
    setExpandedTextModified(true);
  };

  // Check if row ordering is enabled for this table
  const checkRowOrderingEnabled = () => {
    if (!tableInfo?.row_ordering_config) return false;
    return tableInfo.row_ordering_config.enabled === true;
  };

  // Get the current row order from the table config
  const getCurrentRowOrder = () => {
    if (!tableInfo?.row_ordering_config?.order) return [];
    return tableInfo.row_ordering_config.order;
  };

  // Update row ordering configuration
  const updateRowOrdering = async (newOrder: string[]) => {
    try {
      const { data, error } = await supabase.rpc(
        "update_user_table_row_ordering",
        {
          p_table_id: tableId,
          p_enabled: true,
          p_order: newOrder,
        },
      );

      if (error) throw error;
      assertRpcSuccessEnvelope(data);
      if (!data.success)
        throw new Error(data.error || "Failed to update row order");

      // Clear sorted data cache when row ordering changes
      setAllSortedData(null);

      // Reload table data to reflect new order
      await loadTableData(
        currentPage,
        limit,
        sortField,
        sortDirection,
        searchTerm,
        true,
      );
    } catch (err) {
      console.error("Error updating row order:", err);
      setError(
        err instanceof Error ? err.message : "Failed to update row order",
      );
    }
  };

  // Enable row ordering for the table
  const enableRowOrdering = async () => {
    if (!data.length) return;

    // Create initial order based on current data
    const initialOrder = data.map((row) => row.id);
    await updateRowOrdering(initialOrder);
    setRowOrderingEnabled(true);
  };

  // Disable row ordering
  const disableRowOrdering = async () => {
    try {
      const { data, error } = await supabase.rpc(
        "update_user_table_row_ordering",
        {
          p_table_id: tableId,
          p_enabled: false,
          p_order: [],
        },
      );

      if (error) throw error;
      assertRpcSuccessEnvelope(data);
      if (!data.success)
        throw new Error(data.error || "Failed to disable row ordering");

      // Clear sorted data cache when row ordering changes
      setAllSortedData(null);

      setRowOrderingEnabled(false);
      await loadTableData(
        currentPage,
        limit,
        sortField,
        sortDirection,
        searchTerm,
        true,
      );
    } catch (err) {
      console.error("Error disabling row ordering:", err);
      setError(
        err instanceof Error ? err.message : "Failed to disable row ordering",
      );
    }
  };

  // Save current sort as default
  const saveDefaultSort = async () => {
    if (!sortField) return;

    try {
      setSavingSortPreference(true);

      const { data, error } = await supabase.rpc(
        "update_user_table_default_sort",
        {
          p_table_id: tableId,
          p_sort_field: sortField,
          p_sort_direction: sortDirection,
        },
      );

      if (error) throw error;
      assertRpcSuccessEnvelope(data);
      if (!data.success)
        throw new Error(data.error || "Failed to save sort preference");

      // Update saved sort state
      setSavedSortField(sortField);
      setSavedSortDirection(sortDirection);

      // Update tableInfo to reflect the change
      if (tableInfo) {
        setTableInfo({
          ...tableInfo,
          row_ordering_config: {
            ...tableInfo.row_ordering_config,
            default_sort: { field: sortField, direction: sortDirection },
          },
        });
      }
    } catch (err) {
      console.error("Error saving sort preference:", err);
      setError(
        err instanceof Error ? err.message : "Failed to save sort preference",
      );
    } finally {
      setSavingSortPreference(false);
    }
  };

  // Clear saved default sort
  const clearDefaultSort = async () => {
    try {
      setSavingSortPreference(true);

      const { data, error } = await supabase.rpc(
        "update_user_table_default_sort",
        {
          p_table_id: tableId,
          p_sort_field: null,
        },
      );

      if (error) throw error;
      assertRpcSuccessEnvelope(data);
      if (!data.success)
        throw new Error(data.error || "Failed to clear sort preference");

      // Clear saved sort state
      setSavedSortField(null);
      setSavedSortDirection(null);

      // Update tableInfo to reflect the change
      if (tableInfo) {
        const newConfig = { ...tableInfo.row_ordering_config };
        delete newConfig.default_sort;
        setTableInfo({
          ...tableInfo,
          row_ordering_config: newConfig,
        });
      }
    } catch (err) {
      console.error("Error clearing sort preference:", err);
      setError(
        err instanceof Error ? err.message : "Failed to clear sort preference",
      );
    } finally {
      setSavingSortPreference(false);
    }
  };

  // Check if current sort matches saved sort
  const isSortSaved =
    sortField === savedSortField && sortDirection === savedSortDirection;

  // Check if any data in the current table contains cleanable HTML
  const hasCleanableHtmlInTable = () => {
    if (!data || !fields) return false;

    const stringFields = fields.filter((field) => field.data_type === "string");
    if (stringFields.length === 0) return false;

    return data.some((row) =>
      stringFields.some((field) => {
        const value = row.data[field.field_name];
        return (
          value && typeof value === "string" && containsCleanableHtml(value)
        );
      }),
    );
  };

  // Handle bulk HTML cleanup for all rows in the table
  const handleBulkHtmlCleanup = async () => {
    if (!data || !fields) return;

    try {
      setLoading(true);

      const stringFields = fields.filter(
        (field) => field.data_type === "string",
      );
      const updates = [];

      // Collect all rows that need cleaning
      for (const row of data) {
        const cleanedData = {};
        let hasChanges = false;

        for (const field of stringFields) {
          const value = row.data[field.field_name];
          if (
            value &&
            typeof value === "string" &&
            containsCleanableHtml(value)
          ) {
            const cleanedValue = cleanupHtmlText(value);
            if (cleanedValue !== value) {
              cleanedData[field.field_name] = cleanedValue;
              hasChanges = true;
            }
          }
        }

        if (hasChanges) {
          updates.push({
            rowId: row.id,
            data: cleanedData,
          });
        }
      }

      if (updates.length === 0) {
        setError("No HTML content found to clean up");
        return;
      }

      // One atomic bulkWrite with op:'merge' — sends only the changed fields
      // per row (jsonb_concat preserves unchanged keys). Replaces the prior
      // chunked Promise.all(N round-trips) loop.
      const operations: BulkMergeOp[] = updates.map((u) => ({
        op: "merge",
        row_id: u.rowId,
        data: u.data,
      }));
      const bulkResult = await bulkWrite({ tableId, operations });
      if (isServiceFailure(bulkResult)) {
        throw new Error(bulkResult.error);
      }
      const processedCount = updates.length;

      // Clear sorted data cache when data is modified
      setAllSortedData(null);

      // Reload the table data to reflect changes
      await loadTableData(
        currentPage,
        limit,
        sortField,
        sortDirection,
        searchTerm,
      );

      // Show success message
      setError(null);
      // You could add a success toast here if you have a toast system
      console.log(`Successfully cleaned HTML in ${processedCount} rows`);
    } catch (err) {
      console.error("Error during bulk HTML cleanup:", err);
      setError(
        err instanceof Error ? err.message : "Failed to cleanup HTML content",
      );
    } finally {
      setLoading(false);
    }
  };

  // Handle reference modal
  const handleShowReference = (
    rowId: string,
    rowData: any,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation(); // Prevent row edit modal from opening
    setReferenceRowId(rowId);
    setReferenceRowData(rowData);
    setShowReferenceModal(true);
  };

  // Add this helper function somewhere in the component, before the return statement
  const formatCellValue = (value: any, dataType: string) => {
    if (value === null || value === undefined)
      return {
        display: "—",
        isTruncated: false,
        fullText: "",
        hasCleanableHtml: false,
      };

    // Format based on data type
    switch (dataType) {
      case "json":
        const jsonDisplay =
          typeof value === "object" ? JSON.stringify(value) : value;
        return {
          display: jsonDisplay,
          isTruncated: false,
          fullText: jsonDisplay,
          hasCleanableHtml: false,
        };
      case "array":
        const arrayDisplay = Array.isArray(value)
          ? JSON.stringify(value)
          : value;
        return {
          display: arrayDisplay,
          isTruncated: false,
          fullText: arrayDisplay,
          hasCleanableHtml: false,
        };
      case "boolean":
        const boolDisplay = value ? "True" : "False";
        return {
          display: boolDisplay,
          isTruncated: false,
          fullText: boolDisplay,
          hasCleanableHtml: false,
        };
      case "date":
      case "datetime":
        try {
          const dateDisplay = new Date(value).toLocaleString();
          return {
            display: dateDisplay,
            isTruncated: false,
            fullText: dateDisplay,
            hasCleanableHtml: false,
          };
        } catch (e) {
          return {
            display: value,
            isTruncated: false,
            fullText: value,
            hasCleanableHtml: false,
          };
        }
      case "string":
        // For string fields, handle multiline content intelligently
        const stringValue = String(value);
        const hasCleanableHtml = containsCleanableHtml(stringValue);
        const lines = stringValue.split("\n");

        // If multiline, show first line with indicator
        if (lines.length > 1) {
          const firstLine = lines[0];
          return {
            display: firstLine,
            isTruncated: true,
            fullText: stringValue,
            hasCleanableHtml,
            multilineIndicator: `+${lines.length - 1} more lines`,
          };
        }

        // For single line, let CSS handle truncation based on available space
        return {
          display: stringValue,
          isTruncated: stringValue.length > 100, // Only consider "truncated" if reasonably long
          fullText: stringValue,
          hasCleanableHtml,
        };
      default:
        const defaultDisplay = String(value);
        const defaultHasCleanableHtml = containsCleanableHtml(defaultDisplay);
        return {
          display: defaultDisplay,
          isTruncated: defaultDisplay.length > 100,
          fullText: defaultDisplay,
          hasCleanableHtml: defaultHasCleanableHtml,
        };
    }
  };

  if (loading && !tableInfo) return <TableLoadingComponent />;
  if (error)
    return (
      <div className="py-6 text-center text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
        <p className="font-medium">Error: {error}</p>
        <p className="text-sm mt-1 text-red-400 dark:text-red-300">
          Please try again or contact support if the issue persists.
        </p>
      </div>
    );
  if (!tableInfo)
    return (
      <div className="py-6 text-center bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800">
        <p className="font-medium">No table found</p>
        <p className="text-muted-foreground mt-2">
          The requested table could not be found or accessed.
        </p>
      </div>
    );

  // Derive the rows actually shown. When column filters are active we filter
  // (and sort) the full dataset client-side, then paginate the result. With no
  // filters we defer entirely to the server-driven `data`.
  let displayRows = data;
  let effectiveTotalCount = totalCount;
  let effectiveTotalPages = totalPages;

  if (hasColumnFilters) {
    const source = fullDatasetCache ?? data;
    let filtered = applyColumnFilters(source);
    if (sortField) {
      filtered = smartSort(
        filtered,
        sortField,
        sortDirection,
        getFieldDataType(sortField),
      );
    }
    effectiveTotalCount = filtered.length;
    effectiveTotalPages = Math.max(1, Math.ceil(filtered.length / limit));
    const startIndex = (currentPage - 1) * limit;
    displayRows = filtered.slice(startIndex, startIndex + limit);
  }

  // True while we're fetching the full dataset for a freshly-applied filter.
  const filteringInProgress =
    hasColumnFilters && loadingFullDataset && !fullDatasetCache;
  const showLoadingRow = loading || filteringInProgress;

  return (
    <div className="space-y-4 p-2">
      {/* Table header with optional selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{tableInfo.table_name}</h2>
          {tableInfo.description && (
            <p className="text-gray-500 dark:text-gray-400">
              {tableInfo.description}
            </p>
          )}
        </div>

        {showTableSelector && tables.length > 0 && (
          <div className="min-w-[250px]">
            <Select value={tableId} onValueChange={handleTableChange}>
              <SelectTrigger
                id="table-select"
                className="bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <SelectValue placeholder="Select a table" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                {tables.map((table) => (
                  <SelectItem
                    key={table.id}
                    value={table.id}
                    className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <div className="flex flex-col">
                      <span>{table.table_name}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {table.row_count} rows • {table.field_count} fields
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Read-only banner for shared tables */}
      {isReadOnly && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-sm">
          <Eye className="h-4 w-4" />
          <span className="font-medium">Shared Table</span>
          <span className="text-purple-500 dark:text-purple-400">
            (read only)
          </span>
        </div>
      )}

      {/* Sort indicator with save option */}
      {sortField && !isReadOnly && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            Sorted by{" "}
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {fields.find((f: any) => f.field_name === sortField)
                ?.display_name || sortField}
            </span>
            <span className="ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
          </span>
          {isSortSaved ? (
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Saved as default
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              onClick={saveDefaultSort}
              disabled={savingSortPreference}
            >
              {savingSortPreference ? "Saving..." : "Save as default"}
            </Button>
          )}
          {savedSortField && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
              onClick={clearDefaultSort}
              disabled={savingSortPreference}
              title="Clear saved sort"
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Toolbar with search */}
      <TableToolbar
        tableId={tableId}
        tableInfo={tableInfo}
        fields={fields}
        loadTableData={(forceReload) =>
          loadTableData(
            currentPage,
            limit,
            sortField,
            sortDirection,
            searchTerm,
            forceReload,
          )
        }
        selectedRowId={selectedRowId}
        selectedRowData={selectedRowData}
        isReadOnly={isReadOnly}
        // Search props
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        handleSearch={handleSearch}
        clearSearch={clearSearch}
        // Modal visibility state
        showEditModal={showEditModal}
        showDeleteModal={showDeleteModal}
        showAddColumnModal={showAddColumnModal}
        showAddRowModal={showAddRowModal}
        showExportModal={showExportModal}
        showTableSettingsModal={showTableSettingsModal}
        showReferenceOverlay={showReferenceOverlay}
        showRowOrderingModal={showRowOrderingModal}
        showPasteRowsDialog={showPasteRowsDialog}
        // Modal visibility state setters
        setShowEditModal={setShowEditModal}
        setShowDeleteModal={setShowDeleteModal}
        setShowAddColumnModal={setShowAddColumnModal}
        setShowAddRowModal={setShowAddRowModal}
        setShowExportModal={setShowExportModal}
        setShowTableSettingsModal={setShowTableSettingsModal}
        setShowReferenceOverlay={setShowReferenceOverlay}
        setShowRowOrderingModal={setShowRowOrderingModal}
        setShowPasteRowsDialog={setShowPasteRowsDialog}
        // Success callbacks
        onEditSuccess={() => {
          setShowEditModal(false);
          setSelectedRowId(null);
          setSelectedRowData(null);
          // Clear sorted data cache when data is modified
          setAllSortedData(null);
          loadTableData(currentPage, limit);
        }}
        onDeleteSuccess={() => {
          setShowDeleteModal(false);
          setSelectedRowId(null);
          // Clear sorted data cache when data is modified
          setAllSortedData(null);
          loadTableData(currentPage, limit);
        }}
        // Sort state for export
        sortField={sortField}
        sortDirection={sortDirection}
        // HTML cleanup functions
        cleanupHtmlText={cleanupHtmlText}
        containsCleanableHtml={containsCleanableHtml}
        hasCleanableHtmlInTable={hasCleanableHtmlInTable()}
        handleBulkHtmlCleanup={handleBulkHtmlCleanup}
        // Row ordering functions
        rowOrderingEnabled={rowOrderingEnabled}
        enableRowOrdering={enableRowOrdering}
        disableRowOrdering={disableRowOrdering}
        onRowOrderingSuccess={() => {
          // Clear any active sorting when row ordering is updated
          setSortField(null);
          setSortDirection("asc");
          // Clear sorted data cache when row ordering changes
          setAllSortedData(null);
          loadTableData(currentPage, limit, null, "asc", searchTerm, true);
        }}
      />

      {/* Table */}
      <div className="border rounded-xl border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm [&>div]:max-h-[70dvh] [&>div]:overflow-auto">
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {fields.map((field) => {
                const isSorted = sortField === field.field_name;
                const filterValue = columnFilters[field.field_name] ?? "";
                return (
                  <TableHead
                    key={field.id}
                    className="sticky top-0 z-20 bg-gray-100 dark:bg-gray-800 font-semibold text-gray-700 dark:text-gray-300 py-3 min-w-[150px] border-b border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => handleSort(field.field_name)}
                        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded px-1 py-0.5 hover:bg-gray-200/70 dark:hover:bg-gray-700/70"
                        title={`Sort by ${field.display_name}`}
                      >
                        <div className="flex w-full items-center gap-1">
                          <span className="truncate">{field.display_name}</span>
                          {isSorted && (
                            <span className="flex-shrink-0">
                              {sortDirection === "asc" ? "↑" : "↓"}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
                          {field.data_type}
                        </span>
                      </button>
                      <ColumnHeaderMenu
                        fieldName={field.field_name}
                        displayName={field.display_name}
                        isSorted={isSorted}
                        sortDirection={sortDirection}
                        filterValue={filterValue}
                        onSortAsc={() => handleSort(field.field_name, "asc")}
                        onSortDesc={() => handleSort(field.field_name, "desc")}
                        onClearSort={clearSort}
                        onFilterChange={(value) =>
                          handleColumnFilterChange(field.field_name, value)
                        }
                      />
                    </div>
                  </TableHead>
                );
              })}
              <TableHead className="sticky top-0 z-20 bg-gray-100 dark:bg-gray-800 w-[140px] text-gray-700 dark:text-gray-300 text-center py-3 border-b border-gray-200 dark:border-gray-700">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
            <TableBody>
              {showLoadingRow ? (
                <TableRow>
                  <TableCell
                    colSpan={fields.length + 1}
                    className="text-center py-8"
                  >
                    <div className="flex justify-center items-center">
                      <Loader className="animate-spin h-5 w-5 mr-3 text-primary" />
                      {filteringInProgress ? "Filtering data..." : "Loading data..."}
                    </div>
                  </TableCell>
                </TableRow>
              ) : displayRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={fields.length + 1}
                    className="text-center py-8"
                  >
                    {hasColumnFilters
                      ? "No rows match the current filters"
                      : "No data found"}
                  </TableCell>
                </TableRow>
              ) : (
                displayRows.map((row, index) => (
                  <TableRow
                    key={row.id}
                    className={`
                    ${index % 2 === 0 ? "bg-white dark:bg-gray-950" : "bg-gray-50 dark:bg-gray-900"}
                    hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${isReadOnly ? "cursor-default" : "cursor-pointer"}
                  `}
                    onClick={() => {
                      if (isReadOnly) {
                        // In read-only mode, don't open edit modal
                        return;
                      }
                      handleEditRow(row.id, row.data);
                    }}
                  >
                    {fields.map((field) => {
                      const rawValue = row.data[field.field_name];
                      const cellData =
                        rawValue !== null
                          ? formatCellValue(rawValue, field.data_type)
                          : null;
                      const display = cellData ? (
                        <div className="flex items-center justify-between group min-w-0">
                          <div className="flex-1 min-w-0">
                            <div
                              className="truncate text-left"
                              title={
                                cellData.isTruncated
                                  ? cellData.fullText
                                  : undefined
                              }
                            >
                              {String(cellData.display)}
                            </div>
                            {cellData.multilineIndicator && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {cellData.multilineIndicator}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      );
                      return (
                        <TableCell
                          key={`${row.id}-${field.id}`}
                          className="py-3 max-w-0 group"
                        >
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <div className="flex-1 min-w-0">
                              <EditableCell
                                tableId={tableId}
                                rowId={row.id}
                                fieldName={field.field_name}
                                fieldDisplayName={field.display_name}
                                dataType={field.data_type as FieldDataType}
                                value={rawValue}
                                display={display}
                                editable={!isReadOnly}
                                onSaved={() => {
                                  setAllSortedData(null);
                                  void loadTableData(
                                    currentPage,
                                    limit,
                                    sortField,
                                    sortDirection,
                                    searchTerm,
                                  );
                                }}
                              />
                            </div>
                            {cellData && (
                              <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
                                {cellData.hasCleanableHtml && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                                    onClick={(e) =>
                                      handleCleanupText(
                                        field.field_name,
                                        cellData.fullText,
                                        row.id,
                                        e,
                                      )
                                    }
                                    title={`Clean up HTML formatting in ${field.display_name}`}
                                  >
                                    <Zap className="h-3 w-3 text-purple-500 dark:text-purple-400" />
                                  </Button>
                                )}
                                {cellData.isTruncated && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                                    onClick={(e) =>
                                      handleExpandText(
                                        cellData.fullText,
                                        field.display_name,
                                        row.id,
                                        field.field_name,
                                        e,
                                      )
                                    }
                                    title={`Expand ${field.display_name}`}
                                  >
                                    <Expand className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center">
                      <div className="flex justify-center space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShowReference(row.id, row.data, e);
                          }}
                          title="Get Reference"
                        >
                          <Link className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                        </Button>
                        {isReadOnly ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              showReadOnlyToast();
                            }}
                            title="View only - no edit access"
                            className="cursor-not-allowed"
                          >
                            <Eye className="h-4 w-4 text-purple-400 dark:text-purple-500" />
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditRow(row.id, row.data);
                              }}
                              title="Edit Row"
                            >
                              <Pencil className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                setHistoryRowId(row.id);
                              }}
                              title="View row history"
                            >
                              <History className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRow(row.id);
                              }}
                              title="Delete Row"
                            >
                              <Trash className="h-4 w-4 text-red-500 dark:text-red-400" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
      </div>

      {/* Pagination */}
      {!loading && displayRows.length > 0 && (
        <div className="flex justify-between items-center mt-4">
          <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
            <Select value={String(limit)} onValueChange={handleLimitChange}>
              <SelectTrigger className="h-8 w-[70px] bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                <SelectItem
                  value="5"
                  className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  5
                </SelectItem>
                <SelectItem
                  value="10"
                  className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  10
                </SelectItem>
                <SelectItem
                  value="20"
                  className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  20
                </SelectItem>
                <SelectItem
                  value="50"
                  className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  50
                </SelectItem>
                <SelectItem
                  value="100"
                  className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  100
                </SelectItem>
              </SelectContent>
            </Select>
            <span className="ml-4 whitespace-nowrap">
              of {effectiveTotalCount} rows
              {hasColumnFilters && " (filtered)"}
            </span>
          </div>

          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                  className={
                    currentPage === 1 ? "pointer-events-none opacity-50" : ""
                  }
                />
              </PaginationItem>

              {[...Array(Math.min(5, effectiveTotalPages))].map((_, i) => {
                const pageNum = currentPage <= 3 ? i + 1 : currentPage + i - 2;

                if (pageNum > effectiveTotalPages) return null;

                return (
                  <PaginationItem key={pageNum}>
                    <PaginationLink
                      onClick={() => handlePageChange(pageNum)}
                      isActive={currentPage === pageNum}
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}

              <PaginationItem>
                <PaginationNext
                  onClick={() =>
                    handlePageChange(
                      Math.min(effectiveTotalPages, currentPage + 1),
                    )
                  }
                  className={
                    currentPage === effectiveTotalPages
                      ? "pointer-events-none opacity-50"
                      : ""
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* Text Expansion Modal */}
      <Dialog
        open={showTextModal}
        onOpenChange={(open) => {
          if (!open && expandedTextModified) {
            // Could add a confirmation dialog here if needed
          }
          setShowTextModal(open);
        }}
      >
        <DialogContent className="sm:max-w-[60vw] max-h-[80dvh]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>
                {expandedFieldName
                  ? `${expandedFieldName} - Full Content`
                  : "Full Content"}
                {expandedTextModified && (
                  <span className="text-orange-500 ml-2">*</span>
                )}
              </DialogTitle>
              {expandedText && containsCleanableHtml(expandedText) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCleanupExpandedText}
                  className="flex items-center gap-2"
                  title="Clean up HTML formatting"
                  disabled={savingExpandedText}
                >
                  <Zap className="h-4 w-4 text-purple-500 dark:text-purple-400" />
                  <span className="text-sm">Clean HTML</span>
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="max-h-[50dvh] overflow-y-auto">
            <Textarea
              value={expandedText || ""}
              onChange={(e) => handleExpandedTextChange(e.target.value)}
              className="min-h-[300px] resize-none font-mono text-sm"
              placeholder="No content"
              disabled={savingExpandedText}
            />
          </div>
          <DialogFooter className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {expandedTextModified
                ? "You have unsaved changes"
                : "Click to edit the content above"}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowTextModal(false)}
                disabled={savingExpandedText}
              >
                Cancel
              </Button>
              {expandedTextModified && (
                <Button
                  onClick={handleSaveExpandedText}
                  disabled={savingExpandedText}
                >
                  {savingExpandedText ? "Saving..." : "Save Changes"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reference Modal */}
      <TableReferenceModal
        isOpen={showReferenceModal}
        onClose={() => setShowReferenceModal(false)}
        tableId={tableId}
        tableInfo={tableInfo}
        rowId={referenceRowId}
        rowData={referenceRowData}
        fields={fields}
      />

      {/* Row version history (P1 audit log surface) */}
      <MatrxDynamicPanelHost
        open={historyRowId !== null}
        onOpenChange={(open) => {
          if (!open) setHistoryRowId(null);
        }}
        title="Row history"
        description="Every change to this row, newest first."
        position="right"
        defaultSize={32}
        contentClassName="overflow-y-auto"
      >
        <VersionHistoryViewer rowId={historyRowId} />
      </MatrxDynamicPanelHost>
    </div>
  );
};

export default UserTableViewer;
