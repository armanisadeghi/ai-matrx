"use client";
import React, { useEffect, useState, useRef, useCallback } from "react";
import {
    DragDropContext,
    Droppable,
    Draggable,
    DropResult,
    DraggableProvided,
    DraggableStateSnapshot,
    DraggableRubric,
} from "@hello-pangea/dnd";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerActions, brokerSelectors } from "@/lib/redux/brokerSlice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { GripHorizontal, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FieldDefinition } from "@/types/customAppTypes";
import { BrokerIdentifier, BrokerTableRow } from "@/lib/redux/brokerSlice/types";

// Use action creators from brokerConceptActions
const { setTable, updateCell, addRow, removeRow, addColumn, removeColumn, updateColumn, updateRowOrder, updateColumnOrder } =
    brokerActions;

const { selectTable, selectSortedRows, selectSortedColumns } = brokerSelectors;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const readCellText = (row: BrokerTableRow, columnId: string, emptyText: string): string => {
    if (!row.cells) {
        throw new TypeError(`Table row ${row.id} has no cell map`);
    }

    const value = row.cells[columnId];
    if (value === undefined || value === null) return emptyText;
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    throw new TypeError(`Table cell ${row.id}.${columnId} must contain a primitive value`);
};

const DragEditModifyTableField: React.FC<{
    field: FieldDefinition;
    appletId: string;
    isMobile?: boolean;
    source?: string;
    disabled?: boolean;
    className?: string; // Add this new prop
}> = ({ field, appletId, isMobile, source = "applet", disabled = false, className = "" }) => {
    const { id: fieldId, options, componentProps } = field;
    const { width, customContent } = componentProps;
    const safeWidthClass = ensureValidWidthClass(width);
    const dispatch = useAppDispatch();
    const brokerId = useAppSelector((state) => brokerSelectors.selectBrokerId(state, { source, mappedItemId: fieldId }));
    const stateValue = useAppSelector((state) => brokerSelectors.selectValue(state, brokerId));

    const idArgs: BrokerIdentifier = { source, mappedItemId: fieldId };

    // Redux state
    const table = useAppSelector((state) => selectTable(state, idArgs));
    const sortedRows = useAppSelector((state) => selectSortedRows(state, idArgs));
    const sortedColumns = useAppSelector((state) => selectSortedColumns(state, idArgs));

    // Local UI state
    const [editingCell, setEditingCell] = useState<{ rowId: string; columnId: string } | null>(null);
    const [editValue, setEditValue] = useState<string>("");
    const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
    const [columnEditValue, setColumnEditValue] = useState("");
    const tableRef = useRef<HTMLTableElement>(null);
    const [columnWidths, setColumnWidths] = useState<string[]>([]);

    // Column width measurement
    const measureColumnWidths = useCallback(() => {
        if (tableRef.current) {
            const headerCells = tableRef.current.querySelectorAll("thead th");
            const expectedCount = 1 + sortedColumns.length + 1; // Handle + Columns + Add Button
            if (headerCells.length === expectedCount) {
                setColumnWidths(Array.from(headerCells).map((th) => getComputedStyle(th).width));
            } else {
                requestAnimationFrame(() => {
                    if (tableRef.current) {
                        const currentHeaderCells = tableRef.current.querySelectorAll("thead th");
                        if (currentHeaderCells.length === expectedCount) {
                            setColumnWidths(Array.from(currentHeaderCells).map((th) => getComputedStyle(th).width));
                        }
                    }
                });
            }
        }
    }, [sortedColumns.length]);

    useEffect(() => {
        measureColumnWidths();
    }, [measureColumnWidths]);

    // Initialization and migration
    useEffect(() => {
        if (table) return;
        let initialTable;
        if (Array.isArray(stateValue) && stateValue.every(isRecord)) {
            // Migrate legacy state
            const allKeys = new Set<string>();
            stateValue.forEach((item) => Object.keys(item).forEach((key) => key !== "id" && key !== "order" && allKeys.add(key)));
            const columns = Array.from(allKeys).map((key, index) => ({
                id: key,
                name: key.charAt(0).toUpperCase() + key.slice(1),
                type: "text",
                order: index,
                isFixed: false,
                minWidthClass: "min-w-[150px]",
            }));
            const rows = stateValue.map((item, index) => ({
                id: typeof item.id === "string" ? item.id : `row-${Date.now()}-${index}`,
                cells: Object.fromEntries(Array.from(allKeys).map((key) => [key, item[key] ?? ""])),
                order: index,
            }));
            initialTable = { columns, rows };
        } else if (options && options.length > 0) {
            // Initialize from options
            const defaultColumns = [
                { id: "label", name: "Label", type: "text", order: 0, isFixed: false, minWidthClass: "min-w-[150px]" },
                { id: "description", name: "Description", type: "text", order: 1, isFixed: false, minWidthClass: "min-w-[200px]" },
            ];
            const rows = options.map((option, index) => ({
                id: option.id || `row-${Date.now()}-${index}`,
                cells: { label: option.label ?? "", description: option.description ?? "" },
                order: index,
            }));
            initialTable = { columns: defaultColumns, rows };
        } else {
            initialTable = { columns: [], rows: [] };
        }
        dispatch(setTable({ idArgs, table: initialTable }));
    }, [table, stateValue, options, dispatch, idArgs]);

    // Handlers
    const handleDragEnd = (result: DropResult) => {
        const { source, destination, type } = result;
        if (!destination || disabled || source.index === destination.index) return;
        if (type === "ROW") {
            const newRows = Array.from(sortedRows);
            const [movedRow] = newRows.splice(source.index, 1);
            if (!movedRow) {
                throw new RangeError(`No row exists at drag index ${source.index}`);
            }
            newRows.splice(destination.index, 0, movedRow);
            dispatch(updateRowOrder({ idArgs, rowIds: newRows.map((row) => row.id) }));
        } else if (type === "COLUMN") {
            const newColumns = Array.from(sortedColumns);
            const [movedCol] = newColumns.splice(source.index, 1);
            if (!movedCol) {
                throw new RangeError(`No column exists at drag index ${source.index}`);
            }
            newColumns.splice(destination.index, 0, movedCol);
            dispatch(updateColumnOrder({ idArgs, columnIds: newColumns.map((col) => col.id) }));
            requestAnimationFrame(measureColumnWidths);
        }
    };

    const handleAddRow = () => dispatch(addRow({ idArgs }));
    const handleDeleteRow = (rowId: string) => dispatch(removeRow({ idArgs, rowId }));
    const handleAddColumn = () => {
        const timestamp = Date.now();
        dispatch(
            addColumn({
                idArgs,
                column: { id: `col-${timestamp}`, name: "New Column", isFixed: false, minWidthClass: "min-w-[150px]" },
            })
        );
        requestAnimationFrame(measureColumnWidths);
    };
    const handleDeleteColumn = (columnId: string) => {
        const column = sortedColumns.find((col) => col.id === columnId);
        if (!column?.isFixed) {
            dispatch(removeColumn({ idArgs, columnId }));
            requestAnimationFrame(measureColumnWidths);
        }
    };
    const handleStartRenameColumn = (columnId: string) => {
        const column = sortedColumns.find((col) => col.id === columnId);
        if (!disabled && column && !column.isFixed) {
            if (typeof column.name !== "string") {
                throw new TypeError(`Table column ${column.id} has no editable name`);
            }
            setEditingColumnId(columnId);
            setColumnEditValue(column.name);
        }
    };
    const handleColumnRename = (columnId: string, newName: string) => {
        if (newName.trim()) {
            dispatch(updateColumn({ idArgs, columnId, updates: { name: newName } }));
        }
        setEditingColumnId(null);
        setColumnEditValue("");
    };
    const handleCellClick = (row: BrokerTableRow, columnId: string) => {
        if (!disabled) {
            setEditingCell({ rowId: row.id, columnId });
            setEditValue(readCellText(row, columnId, ""));
        }
    };
    const saveEdit = () => {
        if (editingCell) {
            dispatch(updateCell({ idArgs, ...editingCell, value: editValue }));
            setEditingCell(null);
            setEditValue("");
        }
    };

    const renderRowClone = (provided: DraggableProvided, snapshot: DraggableStateSnapshot, rubric: DraggableRubric) => {
        const row = sortedRows[rubric.source.index];
        if (!row) {
            throw new RangeError(`No row exists at drag index ${rubric.source.index}`);
        }
        const totalWidth =
            columnWidths.length === 1 + sortedColumns.length + 1
                ? columnWidths.reduce((sum, w) => sum + parseFloat(w || "0"), 0) + "px"
                : "auto";
        return (
            <table
                ref={provided.innerRef}
                {...provided.draggableProps}
                style={{ ...provided.draggableProps.style, width: totalWidth, opacity: 0.95 }}
                className="bg-textured shadow-lg rounded overflow-hidden"
            >
                <tbody>
                    <tr className="border-b border-border">
                        <td style={{ width: columnWidths[0] }} className="p-0 border-r border-border">
                            <div {...provided.dragHandleProps} className="h-full flex items-center justify-center p-2 cursor-grab">
                                <GripHorizontal className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                            </div>
                        </td>
                        {sortedColumns.map((col, index) => (
                            <td
                                key={col.id}
                                style={{ width: columnWidths[index + 1] }}
                                className="p-3 border-r border-border"
                            >
                                <span
                                    className={cn(
                                        col.id === "label"
                                            ? "font-medium text-gray-900 dark:text-gray-100"
                                            : "text-gray-700 dark:text-gray-300"
                                    )}
                                >
                                    {readCellText(row, col.id, "-")}
                                </span>
                            </td>
                        ))}
                        <td style={{ width: columnWidths[1 + sortedColumns.length] }} className="p-0" />
                    </tr>
                </tbody>
            </table>
        );
    };

    if (customContent) return <>{customContent}</>;

    return (
        <div className={`${safeWidthClass} ${className}`}>
            <DragDropContext onDragEnd={handleDragEnd}>
                <div className="w-full overflow-x-auto border-border rounded-lg">
                    <table ref={tableRef} className="min-w-full border-collapse" style={{ tableLayout: "auto" }}>
                        <thead className="bg-gray-50 dark:bg-gray-900/50 select-none">
                            <Droppable droppableId={`cols-${fieldId}`} direction="horizontal" type="COLUMN" isDropDisabled={disabled}>
                                {(providedCols) => (
                                    <tr
                                        ref={providedCols.innerRef}
                                        {...providedCols.droppableProps}
                                        className="border-b border-border"
                                    >
                                        <th className="w-10 sticky left-0 z-10 bg-inherit p-0 border-r border-border">
                                            <div className="h-full flex items-center justify-center p-2">
                                                <div className="w-5 h-5" />
                                            </div>
                                        </th>
                                        {sortedColumns.map((col, index) => {
                                            const isEditing = editingColumnId === col.id;
                                            return (
                                                <Draggable
                                                    key={col.id}
                                                    draggableId={col.id}
                                                    index={index}
                                                    isDragDisabled={disabled || col.isFixed || isEditing}
                                                >
                                                    {(providedCol, snapshotCol) => (
                                                        <th
                                                            ref={providedCol.innerRef}
                                                            {...providedCol.draggableProps}
                                                            {...(!isEditing ? providedCol.dragHandleProps : {})}
                                                            style={{
                                                                ...providedCol.draggableProps.style,
                                                                width: snapshotCol.isDragging ? columnWidths[index + 1] : undefined,
                                                            }}
                                                            className={cn(
                                                                "text-left p-0 relative group",
                                                                col.minWidthClass,
                                                                "border-r border-border",
                                                                !col.isFixed &&
                                                                    !disabled &&
                                                                    !isEditing &&
                                                                    "cursor-grab hover:bg-gray-100 dark:hover:bg-gray-700/50",
                                                                snapshotCol.isDragging &&
                                                                    "bg-blue-100 dark:bg-blue-900 shadow-md opacity-95 z-20"
                                                            )}
                                                        >
                                                            <div className="flex items-center justify-between h-full px-3 py-2 space-x-2">
                                                                {isEditing ? (
                                                                    <input
                                                                        type="text"
                                                                        value={columnEditValue}
                                                                        onChange={(e) => setColumnEditValue(e.target.value)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === "Enter")
                                                                                handleColumnRename(col.id, columnEditValue);
                                                                            if (e.key === "Escape") setEditingColumnId(null);
                                                                        }}
                                                                        onBlur={() => handleColumnRename(col.id, columnEditValue)}
                                                                        autoFocus
                                                                        className="flex-grow px-1 py-0.5 text-sm font-medium border rounded border-gray-300 dark:border-gray-600 bg-textured text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                                    />
                                                                ) : (
                                                                    <div
                                                                        className="flex items-center space-x-2 flex-grow min-w-0"
                                                                        onClick={() => handleStartRenameColumn(col.id)}
                                                                    >
                                                                        {!col.isFixed && !disabled && (
                                                                            <GripHorizontal className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                                                        )}
                                                                        <span className="font-medium text-sm text-gray-700 dark:text-gray-300 truncate">
                                                                            {col.name}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                {!col.isFixed && !disabled && !isEditing && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteColumn(col.id)}
                                                                        className="absolute top-1 right-1 p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 rounded-full hover:bg-red-200 dark:hover:bg-red-800/50 transition-opacity"
                                                                    >
                                                                        <X className="h-3 w-3 text-red-600 dark:text-red-400" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </th>
                                                    )}
                                                </Draggable>
                                            );
                                        })}
                                        {providedCols.placeholder}
                                        <th className="w-12 p-0">
                                            <button
                                                type="button"
                                                onClick={handleAddColumn}
                                                disabled={disabled}
                                                className={cn(
                                                    "h-full w-full flex items-center justify-center p-2",
                                                    !disabled && "hover:bg-gray-100 dark:hover:bg-gray-700",
                                                    disabled && "opacity-50 cursor-not-allowed"
                                                )}
                                            >
                                                <Plus className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                            </button>
                                        </th>
                                    </tr>
                                )}
                            </Droppable>
                        </thead>
                        <Droppable droppableId={`rows-${fieldId}`} type="ROW" isDropDisabled={disabled} renderClone={renderRowClone}>
                            {(providedRows, snapshotRows) => (
                                <tbody
                                    ref={providedRows.innerRef}
                                    {...providedRows.droppableProps}
                                    className={cn(snapshotRows.isDraggingOver && "bg-blue-50/50 dark:bg-blue-950/20")}
                                >
                                    {sortedRows.length === 0 && !disabled ? (
                                        <tr>
                                            <td
                                                colSpan={sortedColumns.length + 2}
                                                className="p-4 text-center text-sm text-gray-500 dark:text-gray-400"
                                            >
                                                No rows defined. Click 'Add Row'.
                                            </td>
                                        </tr>
                                    ) : (
                                        sortedRows.map((row, index) => (
                                            <Draggable
                                                key={row.id}
                                                draggableId={`row-${fieldId}-${row.id}`}
                                                index={index}
                                                isDragDisabled={disabled}
                                            >
                                                {(providedRow, snapshotRow) => (
                                                    <tr
                                                        ref={providedRow.innerRef}
                                                        {...providedRow.draggableProps}
                                                        style={{ ...providedRow.draggableProps.style }}
                                                        className={cn(
                                                            "bg-textured",
                                                            !snapshotRow.isDragging && "hover:bg-gray-50 dark:hover:bg-gray-700/50",
                                                            snapshotRow.isDragging ? "opacity-0" : "opacity-100",
                                                            "border-b border-border"
                                                        )}
                                                    >
                                                        <td className="w-10 sticky left-0 z-0 bg-inherit p-0 border-r border-border">
                                                            <div
                                                                {...providedRow.dragHandleProps}
                                                                className={cn(
                                                                    "h-full flex items-center justify-center p-2",
                                                                    !disabled && "cursor-grab hover:bg-gray-100 dark:hover:bg-gray-700"
                                                                )}
                                                            >
                                                                <GripHorizontal className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                                                            </div>
                                                        </td>
                                                        {sortedColumns.map((col) => (
                                                            <td key={col.id} className="p-0 border-r border-border">
                                                                {editingCell?.rowId === row.id && editingCell?.columnId === col.id ? (
                                                                    <input
                                                                        type="text"
                                                                        value={editValue}
                                                                        onChange={(e) => setEditValue(e.target.value)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === "Enter") saveEdit();
                                                                            if (e.key === "Escape") setEditingCell(null);
                                                                        }}
                                                                        onBlur={saveEdit}
                                                                        autoFocus
                                                                        className={cn(
                                                                            "w-full h-full px-3 py-2 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 bg-inherit",
                                                                            col.id === "label"
                                                                                ? "font-medium text-gray-900 dark:text-gray-100"
                                                                                : "text-gray-700 dark:text-gray-300"
                                                                        )}
                                                                    />
                                                                ) : (
                                                                    <span
                                                                        onClick={() => handleCellClick(row, col.id)}
                                                                        className={cn(
                                                                            "block w-full h-full px-3 py-2 text-sm cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap",
                                                                            col.id === "label"
                                                                                ? "font-medium text-gray-900 dark:text-gray-100"
                                                                                : "text-gray-700 dark:text-gray-300"
                                                                        )}
                                                                    >
                                                                        {readCellText(row, col.id, "-")}
                                                                    </span>
                                                                )}
                                                            </td>
                                                        ))}
                                                        <td className="w-12 p-0">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteRow(row.id)}
                                                                disabled={disabled}
                                                                className={cn(
                                                                    "h-full w-full flex items-center justify-center p-2",
                                                                    !disabled && "hover:bg-red-100 dark:hover:bg-red-900/50",
                                                                    disabled && "opacity-50 cursor-not-allowed"
                                                                )}
                                                            >
                                                                <X className="h-4 w-4 text-red-500 dark:text-red-400" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Draggable>
                                        ))
                                    )}
                                    {providedRows.placeholder}
                                </tbody>
                            )}
                        </Droppable>
                    </table>
                </div>
                <div className="mt-2">
                    <button
                        type="button"
                        onClick={handleAddRow}
                        disabled={disabled}
                        className={cn(
                            "px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
                            "hover:bg-gray-200 dark:hover:bg-gray-700",
                            "border border-gray-300 dark:border-gray-600 rounded-md text-sm",
                            disabled && "opacity-50 cursor-not-allowed",
                            "flex items-center space-x-1.5"
                        )}
                    >
                        <Plus className="h-4 w-4" />
                        <span>Add Row</span>
                    </button>
                </div>
                {!disabled && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-3 space-y-1">
                        <div>
                            • Drag <GripHorizontal className="inline h-3 w-3 -mt-0.5" /> rows vertically or column headers horizontally to
                            reorder (non-fixed columns).
                        </div>
                        <div>
                            • Click cells or column names (non-fixed) to edit. Add cols <Plus className="inline h-3 w-3 -mt-0.5" />. Del
                            rows/cols <X className="inline h-3 w-3 -mt-0.5" />.
                        </div>
                    </div>
                )}
            </DragDropContext>
        </div>
    );
};

export default DragEditModifyTableField;
