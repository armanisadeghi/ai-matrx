"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Search, Loader2, Table2, CheckSquare, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/utils/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import UserTableViewer from "@/components/user-generated-table-data/UserTableViewer";
import { filterAndSortBySearch } from "@/utils/search-scoring";

// Types
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

interface TableRow {
    id: string;
    data: Record<string, any>;
}

type SelectionType = 'table' | 'row' | 'column' | 'cell';
type ViewMode = 'tables' | 'table-options' | 'rows' | 'columns' | 'cell-row' | 'cell-column';

interface TableReference {
    type: 'full_table' | 'table_row' | 'table_column' | 'table_cell';
    table_id: string;
    table_name: string;
    row_id?: string;
    column_name?: string;
    column_display_name?: string;
    description: string;
}

interface TablesResourcePickerProps {
    onBack: () => void;
    onSelect: (reference: TableReference) => void;
}

export function TablesResourcePicker({ onBack, onSelect }: TablesResourcePickerProps) {
    const [tables, setTables] = useState<UserTable[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    
    // Selection state
    const [viewMode, setViewMode] = useState<ViewMode>('tables');
    const [selectedTable, setSelectedTable] = useState<UserTable | null>(null);
    const [selectionType, setSelectionType] = useState<SelectionType | null>(null);
    const [fields, setFields] = useState<TableField[]>([]);
    const [rows, setRows] = useState<TableRow[]>([]);
    const [selectedRow, setSelectedRow] = useState<TableRow | null>(null);
    const [selectedColumn, setSelectedColumn] = useState<TableField | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    
    // Preview modal state
    const [previewTableId, setPreviewTableId] = useState<string | null>(null);
    const [showPreviewModal, setShowPreviewModal] = useState(false);

    // Load user tables
    useEffect(() => {
        fetchTables();
    }, []);

    const fetchTables = async () => {
        try {
            setLoading(true);
            setError(null);
            const { data, error } = await supabase.rpc('get_user_tables');
            
            if (error) throw error;
            const tablesPayload = data as unknown as { success: boolean; error?: string; tables?: UserTable[] };
            if (!tablesPayload.success) throw new Error(tablesPayload.error || 'Failed to load tables');
            
            setTables(tablesPayload.tables || []);
        } catch (err) {
            console.error('Error fetching tables:', err);
            setError('Failed to load your tables');
        } finally {
            setLoading(false);
        }
    };

    // Load table details (fields and rows)
    const loadTableDetails = async (table: UserTable) => {
        try {
            setLoadingDetails(true);
            
            // Get fields
            const { data: tableDataRaw, error: tableError } = await supabase
                .rpc('get_user_table_complete', { p_table_id: table.id });
                
            if (tableError) throw tableError;
            const tableData = tableDataRaw as unknown as { success: boolean; error?: string; fields?: TableField[] };
            if (!tableData.success) throw new Error(tableData.error || 'Failed to load table');
            
            setFields(tableData.fields || []);
            
            // Get rows (first 100)
            const { data: rowsDataRaw, error: rowsError } = await supabase
                .rpc('get_user_table_data_paginated', {
                    p_table_id: table.id,
                    p_limit: 100,
                    p_offset: 0,
                    p_sort_field: null,
                    p_sort_direction: 'asc',
                    p_search_term: null
                });
                
            if (rowsError) throw rowsError;
            const rowsData = rowsDataRaw as unknown as { success: boolean; error?: string; data?: TableRow[] };
            if (!rowsData.success) throw new Error(rowsData.error || 'Failed to load rows');
            
            setRows(rowsData.data || []);
        } catch (err) {
            console.error('Error loading table details:', err);
            setError('Failed to load table details');
        } finally {
            setLoadingDetails(false);
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

    // Filter rows by search — each row's cell values are treated as body-weight fields.
    const filteredRows = useMemo(() => {
        if (!searchQuery.trim()) return rows;
        return filterAndSortBySearch(rows, searchQuery, [
            {
                get: (row) =>
                    Object.values(row.data)
                        .filter((v) => v != null)
                        .map((v) => String(v)),
                weight: "body",
            },
        ]);
    }, [rows, searchQuery]);

    // Filter columns by search
    const filteredColumns = useMemo(() => {
        if (!searchQuery.trim()) return fields;
        return filterAndSortBySearch(fields, searchQuery, [
            { get: (f) => f.display_name, weight: "title" },
            { get: (f) => f.field_name, weight: "subtitle" },
        ]);
    }, [fields, searchQuery]);

    // Get display value for a row
    const getRowDisplayValue = (row: TableRow) => {
        // First try meaningful field names
        const meaningfulFields = ['name', 'title', 'label', 'description'];
        for (const fieldName of meaningfulFields) {
            if (row.data[fieldName]) {
                return `${row.data[fieldName]}`;
            }
        }
        
        // Fall back to the first column based on field_order
        if (fields.length > 0) {
            const sortedFields = [...fields].sort((a, b) => a.field_order - b.field_order);
            const firstField = sortedFields[0];
            const firstValue = row.data[firstField.field_name];
            if (firstValue !== null && firstValue !== undefined) {
                return `${firstValue}`;
            }
        }
        
        // Last resort: use row ID
        return row.id.substring(0, 8);
    };

    // Handle table preview
    const handlePreviewTable = (e: React.MouseEvent, tableId: string) => {
        e.stopPropagation();
        setPreviewTableId(tableId);
        setShowPreviewModal(true);
    };

    const closePreviewModal = () => {
        setShowPreviewModal(false);
        setPreviewTableId(null);
    };

    // Handle table selection (navigate to options view)
    const handleTableSelect = (table: UserTable) => {
        setSelectedTable(table);
        setViewMode('table-options');
        setSearchQuery('');
    };

    // Handle selection type choice
    const handleSelectionTypeSelect = async (type: SelectionType) => {
        if (!selectedTable) return;
        
        setSelectionType(type);
        
        if (type === 'table') {
            // Immediate selection for full table
            onSelect({
                type: 'full_table',
                table_id: selectedTable.id,
                table_name: selectedTable.table_name,
                description: `Reference to entire table "${selectedTable.table_name}"`
            });
            return;
        }
        
        // Load details for other types
        await loadTableDetails(selectedTable);
        
        if (type === 'row') {
            setViewMode('rows');
        } else if (type === 'column') {
            setViewMode('columns');
        } else if (type === 'cell') {
            setViewMode('cell-row');
        }
    };

    // Handle row selection
    const handleRowSelect = (row: TableRow) => {
        if (selectionType === 'row') {
            onSelect({
                type: 'table_row',
                table_id: selectedTable!.id,
                table_name: selectedTable!.table_name,
                row_id: row.id,
                description: `Reference to row ${row.id} in table "${selectedTable!.table_name}"`
            });
        } else if (selectionType === 'cell') {
            setSelectedRow(row);
            setViewMode('cell-column');
            setSearchQuery('');
        }
    };

    // Handle column selection
    const handleColumnSelect = (column: TableField) => {
        if (selectionType === 'column') {
            onSelect({
                type: 'table_column',
                table_id: selectedTable!.id,
                table_name: selectedTable!.table_name,
                column_name: column.field_name,
                column_display_name: column.display_name,
                description: `Reference to column "${column.display_name}" in table "${selectedTable!.table_name}"`
            });
        } else if (selectionType === 'cell' && selectedRow) {
            onSelect({
                type: 'table_cell',
                table_id: selectedTable!.id,
                table_name: selectedTable!.table_name,
                row_id: selectedRow.id,
                column_name: column.field_name,
                column_display_name: column.display_name,
                description: `Reference to cell "${column.display_name}" in row ${selectedRow.id} of table "${selectedTable!.table_name}"`
            });
        }
    };

    // Handle back navigation
    const handleBackNavigation = () => {
        if (viewMode === 'table-options') {
            setViewMode('tables');
            setSelectedTable(null);
            setSelectionType(null);
            setSearchQuery('');
        } else if (viewMode === 'rows' || viewMode === 'columns' || viewMode === 'cell-row') {
            setViewMode('table-options');
            setSelectionType(null);
            setSearchQuery('');
        } else if (viewMode === 'cell-column') {
            setViewMode('cell-row');
            setSelectedRow(null);
            setSearchQuery('');
        } else {
            onBack();
        }
    };

    // Get header title
    const getHeaderTitle = () => {
        if (viewMode === 'tables') return 'Tables';
        if (viewMode === 'table-options') return selectedTable?.table_name || 'Select Type';
        if (viewMode === 'rows') return 'Select Row';
        if (viewMode === 'columns') return 'Select Column';
        if (viewMode === 'cell-row') return 'Select Row';
        if (viewMode === 'cell-column') return 'Select Column';
        return 'Tables';
    };

    return (
        <div className="flex flex-col max-h-[min(460px,70dvh)]">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 flex-shrink-0"
                    onClick={handleBackNavigation}
                    disabled={loadingDetails}
                >
                    <ChevronLeft className="w-4 h-4" />
                </Button>
                <Table2 className="w-4 h-4 flex-shrink-0 text-gray-600 dark:text-gray-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1 truncate">
                    {getHeaderTitle()}
                </span>
            </div>

            {/* Search */}
            <div className="px-2 py-2 border-b border-border">
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <Input
                        type="text"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-7 text-xs pl-7 pr-2 bg-background border-gray-300 dark:border-gray-700"
                        disabled={loadingDetails}
                    />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    </div>
                ) : error ? (
                    <div className="text-xs text-red-600 dark:text-red-400 text-center py-8">
                        {error}
                    </div>
                ) : viewMode === 'tables' ? (
                    // Show tables list
                    <div className="p-1">
                        {filteredTables.length === 0 ? (
                            <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
                                {searchQuery ? "No tables found" : "No tables yet"}
                            </div>
                        ) : (
                            <div className="space-y-0.5">
                                {filteredTables.map((table) => (
                                    <button
                                        key={table.id}
                                        onClick={() => handleTableSelect(table)}
                                        className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors group"
                                    >
                                        <Table2 className="w-4 h-4 flex-shrink-0 text-green-600 dark:text-green-500" />
                                        <div className="flex-1 text-left min-w-0">
                                            <div className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                                                {table.table_name}
                                            </div>
                                            {table.description && (
                                                <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                                                    {table.description}
                                                </div>
                                            )}
                                        </div>
                                        <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 flex-shrink-0" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : viewMode === 'table-options' ? (
                    // Show table options
                    <div className="p-2">
                        {selectedTable && (
                            <div className="space-y-1.5">
                                {/* Preview button */}
                                <button
                                    onClick={() => {
                                        setPreviewTableId(selectedTable.id);
                                        setShowPreviewModal(true);
                                    }}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50 hover:border-blue-300 dark:hover:border-blue-700 text-blue-700 dark:text-blue-400 transition-colors"
                                >
                                    <Eye className="w-4 h-4 flex-shrink-0" />
                                    <span className="text-xs font-medium">Preview Table Data</span>
                                </button>

                                {/* Selection type options */}
                                <div className="space-y-0.5">
                                    <div className="text-[10px] font-medium text-gray-600 dark:text-gray-400 px-1 mb-1">
                                        Select Reference Type:
                                    </div>
                                    <button
                                        onClick={() => handleSelectionTypeSelect('table')}
                                        disabled={loadingDetails}
                                        className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                                    >
                                        <div className="text-xs font-medium text-gray-900 dark:text-gray-100">
                                            Full Table
                                        </div>
                                        <div className="text-[10px] text-gray-500 dark:text-gray-400">
                                            Reference all rows and columns
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => handleSelectionTypeSelect('row')}
                                        disabled={loadingDetails}
                                        className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                                    >
                                        <div className="text-xs font-medium text-gray-900 dark:text-gray-100">
                                            Single Row
                                        </div>
                                        <div className="text-[10px] text-gray-500 dark:text-gray-400">
                                            Reference one specific row
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => handleSelectionTypeSelect('column')}
                                        disabled={loadingDetails}
                                        className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                                    >
                                        <div className="text-xs font-medium text-gray-900 dark:text-gray-100">
                                            Full Column
                                        </div>
                                        <div className="text-[10px] text-gray-500 dark:text-gray-400">
                                            Reference all values in one column
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => handleSelectionTypeSelect('cell')}
                                        disabled={loadingDetails}
                                        className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                                    >
                                        <div className="text-xs font-medium text-gray-900 dark:text-gray-100">
                                            Single Cell
                                        </div>
                                        <div className="text-[10px] text-gray-500 dark:text-gray-400">
                                            Reference one specific cell value
                                        </div>
                                    </button>
                                </div>
                                
                                {loadingDetails && (
                                    <div className="flex items-center justify-center py-4">
                                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (viewMode === 'rows' || viewMode === 'cell-row') ? (
                    // Show rows list
                    <div className="p-1">
                        {loadingDetails ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                            </div>
                        ) : filteredRows.length === 0 ? (
                            <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
                                {searchQuery ? "No rows found" : "No rows in table"}
                            </div>
                        ) : (
                            <div className="space-y-0.5">
                                {filteredRows.map((row) => (
                                    <button
                                        key={row.id}
                                        onClick={() => handleRowSelect(row)}
                                        className="w-full text-left px-2 py-2 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <CheckSquare className="w-3.5 h-3.5 flex-shrink-0 text-gray-500" />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                                                    {getRowDisplayValue(row)}
                                                </div>
                                                <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                                                    {Object.keys(row.data).length} fields
                                                </div>
                                            </div>
                                            <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (viewMode === 'columns' || viewMode === 'cell-column') ? (
                    // Show columns list
                    <div className="p-1">
                        {loadingDetails ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                            </div>
                        ) : filteredColumns.length === 0 ? (
                            <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
                                {searchQuery ? "No columns found" : "No columns in table"}
                            </div>
                        ) : (
                            <div className="space-y-0.5">
                                {filteredColumns.map((field) => (
                                    <button
                                        key={field.id}
                                        onClick={() => handleColumnSelect(field)}
                                        className="w-full text-left px-2 py-2 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <CheckSquare className="w-3.5 h-3.5 flex-shrink-0 text-gray-500" />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                                                    {field.display_name}
                                                </div>
                                                <div className="text-[10px] text-gray-500 dark:text-gray-400">
                                                    {field.data_type}{field.is_required && ' · Required'}
                                                </div>
                                            </div>
                                            <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : null}
            </div>

            {/* Preview Modal */}
            <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
                <DialogContent className="max-w-[95vw] w-full h-[90dvh] p-0 gap-0 flex flex-col">
                    <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-base font-semibold">Table Preview</DialogTitle>
                        </div>
                    </DialogHeader>
                    <div className="flex-1 overflow-auto min-h-0">
                        {previewTableId && (
                            <div className="h-full px-6 py-4">
                                <UserTableViewer 
                                    tableId={previewTableId}
                                    showTableSelector={false}
                                />
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
