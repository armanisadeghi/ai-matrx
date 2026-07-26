import React, { useEffect, useState, useRef, useCallback } from "react";
import {
    DragDropContext,
    Droppable,
    Draggable,
    DropResult,
    DraggableProvided,
    DraggableStateSnapshot,
    DraggableRubric
} from "@hello-pangea/dnd";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors, brokerActions } from "@/lib/redux/brokerSlice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { FieldOption } from "@/types/customAppTypes";
import { CommonFieldProps } from "../core/types";

// --- Type Definitions ---

interface TableRowData extends FieldOption {
    order: number;
    [key: string]: any; // For dynamic data properties
}

interface ColumnDefinition {
    id: string;
    // FIX 1: Ensure key is a string that exists as a property on TableRowData, excluding id/order
    key: Extract<keyof Omit<TableRowData, 'id' | 'order'>, string>;
    name: string;
    widthClass?: string;
    minWidthClass?: string;
}

interface TableState {
    rows: TableRowData[];
    columns: ColumnDefinition[];
}

const defaultColumns: ColumnDefinition[] = [
    { id: 'col-label', key: 'label', name: 'Label', widthClass: 'w-1/3', minWidthClass: 'min-w-[150px]' },
    { id: 'col-desc', key: 'description', name: 'Description', minWidthClass: 'min-w-[200px]' },
];

// --- Component Implementation ---

const DraggableEditableTableField: React.FC<CommonFieldProps> = ({ field, sourceId="no-applet-id", isMobile, source = "applet", disabled = false, className = "" }) => {
    const { id: fieldId, label: fieldLabel, options, componentProps } = field;
    const { width, customContent } = componentProps;
    const safeWidthClass = ensureValidWidthClass(width);
    const dispatch = useAppDispatch();
    const brokerId = useAppSelector((state) => brokerSelectors.selectBrokerId(state, { source, mappedItemId: fieldId }));
    const stateValue = useAppSelector((state) => brokerSelectors.selectValue(state, brokerId));

    const [tableRows, setTableRows] = useState<TableRowData[]>([]);
    const [columns, setColumns] = useState<ColumnDefinition[]>(defaultColumns);
    const [editingCell, setEditingCell] = useState<{ rowId: string; columnKey: string } | null>(null);
    const [editValue, setEditValue] = useState("");
    const tableRef = useRef<HTMLTableElement>(null);
    const [columnWidths, setColumnWidths] = useState<string[]>([]);

    // --- Column Width Measurement ---
    const measureColumnWidths = useCallback(() => {
        if (tableRef.current) {
            const headerCells = tableRef.current.querySelectorAll('thead th');
            if (headerCells.length === 1 + columns.length) {
                const widths = Array.from(headerCells).map(th => getComputedStyle(th).width);
                setColumnWidths(widths);
            } else {
                requestAnimationFrame(() => {
                    if (tableRef.current) {
                        const currentHeaderCells = tableRef.current.querySelectorAll('thead th');
                        if (currentHeaderCells.length === 1 + columns.length) {
                            const widths = Array.from(currentHeaderCells).map(th => getComputedStyle(th).width);
                            setColumnWidths(widths);
                        } else {
                            console.warn("M: Column width measurement mismatch. Expected:", 1 + columns.length, "Got:", currentHeaderCells.length);
                        }
                    }
                });
            }
        }
    }, [columns.length]); // Depend on columns.length for accuracy

    useEffect(() => {
        measureColumnWidths();
    }, [measureColumnWidths]);

    // --- State Initialization and Migration ---
    useEffect(() => {
        let initialRows: TableRowData[] = [];
        let initialColumns: ColumnDefinition[] = [...defaultColumns];
        let stateNeedsUpdate = false;

        if (stateValue) {
            if (typeof stateValue === 'object' && stateValue !== null && 'rows' in stateValue && 'columns' in stateValue) {
                const storedState = stateValue as TableState;
                initialRows = storedState.rows?.map((r, i) => ({ ...r, order: r.order ?? i })) ?? [];
                if (storedState.columns?.length > 0) {
                    // Ensure loaded columns have all necessary properties, especially 'key'
                    initialColumns = storedState.columns.map(c => ({
                        ...defaultColumns.find(dc => dc.id === c.id), // Get defaults for widthClass etc.
                        ...c // Override with stored values
                    }));
                } else {
                    initialColumns = [...defaultColumns];
                }
            } else if (Array.isArray(stateValue)) {
                initialRows = stateValue.map((item, index) => ({
                    ...item,
                    order: typeof item.order === 'number' ? item.order : index
                }));
                initialColumns = [...defaultColumns];
                stateNeedsUpdate = true;
            }
        } else if (options && options.length > 0) {
            initialRows = options.map((option, index) => ({ ...option, order: index }));
            initialColumns = [...defaultColumns];
            stateNeedsUpdate = true;
        }

        setTableRows([...initialRows].sort((a, b) => a.order - b.order));
        setColumns(initialColumns);

        if (stateNeedsUpdate) {
            updateReduxState(initialRows, initialColumns);
        }
        requestAnimationFrame(measureColumnWidths);
    }, [options, stateValue]);

    const updateReduxState = (rows: TableRowData[], cols: ColumnDefinition[]) => {
        const newState: TableState = { rows, columns: cols };
        dispatch(brokerActions.setValue({ brokerId, value: newState }));
    };

    // --- Drag End Handler ---
    const handleDragEnd = (result: DropResult) => {
        const { source, destination, type } = result;
        if (!destination || disabled) return;

        if (type === 'ROW') {
            if (source.index === destination.index) return;
            setTableRows(currentRows => {
                const updatedRows = Array.from(currentRows);
                const [reorderedRow] = updatedRows.splice(source.index, 1);
                updatedRows.splice(destination.index!, 0, reorderedRow);
                const reorderedDataWithOrder = updatedRows.map((row, index) => ({ ...row, order: index }));
                updateReduxState(reorderedDataWithOrder, columns);
                return reorderedDataWithOrder;
            });
        } else if (type === 'COLUMN') {
            if (source.index === destination.index) return;
            setColumns(currentCols => {
                const updatedCols = Array.from(currentCols);
                const [reorderedCol] = updatedCols.splice(source.index, 1);
                updatedCols.splice(destination.index!, 0, reorderedCol);
                updateReduxState(tableRows, updatedCols);
                // Important: Defer measurement until after state update has likely re-rendered
                requestAnimationFrame(measureColumnWidths);
                return updatedCols;
            });
        }
    };

    // --- Cell Editing Logic ---
    const handleCellClick = (rowId: string, columnKey: string, currentValue: any) => {
        if (!disabled) {
            const valueAsString = (currentValue === null || currentValue === undefined) ? '' : String(currentValue);
            setEditingCell({ rowId, columnKey });
            setEditValue(valueAsString);
        }
    };
    const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value);
    const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') saveEdit(); else if (e.key === 'Escape') cancelEdit(); };
    const saveEdit = () => {
        if (!editingCell) return;
        const { rowId, columnKey } = editingCell;
        setTableRows(currentRows => {
            const updatedRows = currentRows.map(row =>
                row.id === rowId ? { ...row, [columnKey]: editValue } : row
            );
            updateReduxState(updatedRows, columns);
            return updatedRows;
        });
        setEditingCell(null); setEditValue("");
    };
    const cancelEdit = () => { setEditingCell(null); setEditValue(""); };

    if (customContent) return <>{customContent}</>;
    const sortedRows = tableRows;

    // --- Render Clone Function (for Rows) ---
    const renderRowClone = (
        provided: DraggableProvided,
        snapshot: DraggableStateSnapshot,
        rubric: DraggableRubric
    ) => {
        const item = sortedRows[rubric.source.index];
        const totalWidth = columnWidths.length === (1 + columns.length)
            ? columnWidths.reduce((sum, width) => sum + parseFloat(width || '0'), 0) + 'px'
            : 'auto';

        return (
            <table ref={provided.innerRef} {...provided.draggableProps}
                style={{ ...provided.draggableProps.style, borderCollapse: 'collapse', tableLayout: 'fixed', width: totalWidth, opacity: 0.95 }}
                className={cn("bg-textured", "shadow-lg rounded overflow-hidden")}>
                <tbody>
                    <tr className="border-b border-border">
                        <td className="p-0 border-r border-border align-middle" style={{ width: columnWidths[0] ?? 'auto' }}>
                            <div {...provided.dragHandleProps} className="h-full flex items-center justify-center p-2 cursor-grab">
                                <GripHorizontal className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                            </div>
                        </td>
                        {columns.map((col, index) => (
                            <td key={col.id}
                                className={cn("p-3 align-middle overflow-hidden text-ellipsis whitespace-nowrap", index < columns.length - 1 && "border-r border-border")}
                                style={{ width: columnWidths[index + 1] ?? 'auto' }}
                            >
                                <span className={cn("text-sm", col.key === 'label' ? "font-medium text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300")}>
                                    {item[col.key] || '-'}
                                </span>
                            </td>
                        ))}
                    </tr>
                </tbody>
            </table>
        );
    };

    // --- Main Component Return JSX ---
    return (
        <div className={`${safeWidthClass} ${className}`}>
            <DragDropContext onDragEnd={handleDragEnd}>
                <div className="w-full overflow-x-auto border-border rounded-lg">
                    <table ref={tableRef} className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                        <thead className="bg-gray-50 dark:bg-gray-900/50 select-none">
                            <Droppable droppableId={`cols-${fieldId}`} direction="horizontal" type="COLUMN" isDropDisabled={disabled}>
                                {(providedCols) => (
                                    <tr ref={providedCols.innerRef} {...providedCols.droppableProps} className="border-b border-border">
                                        <th className="w-10 p-0 border-r border-border align-middle">
                                            <div className="h-full flex items-center justify-center p-2"><div className="w-5 h-5" /></div>
                                        </th>
                                        {columns.map((col, index) => (
                                            <Draggable key={col.id} draggableId={col.id} index={index} isDragDisabled={disabled}>
                                                {(providedColDraggable, snapshotColDraggable) => {
                                                    // FIX 2: Apply measured width to the dragging column header
                                                    const style = {
                                                        ...providedColDraggable.draggableProps.style,
                                                        width: snapshotColDraggable.isDragging && columnWidths[index + 1]
                                                                ? columnWidths[index + 1]
                                                                : undefined,
                                                    };
                                                    return (
                                                        <th
                                                            ref={providedColDraggable.innerRef}
                                                            {...providedColDraggable.draggableProps}
                                                            {...providedColDraggable.dragHandleProps}
                                                            style={style} // Apply the combined style
                                                            className={cn(
                                                                "text-left p-3 relative", // Added relative for icon positioning if needed
                                                                col.widthClass,
                                                                col.minWidthClass,
                                                                index < columns.length - 1 && "border-r border-border",
                                                                !disabled && "cursor-grab",
                                                                // More subtle hover when not dragging this specific column
                                                                !snapshotColDraggable.isDragging && !disabled && "hover:bg-gray-100 dark:hover:bg-gray-700/50",
                                                                snapshotColDraggable.isDragging && "bg-blue-100 dark:bg-blue-900 shadow-md opacity-95"
                                                            )}
                                                        >
                                                            <div className="flex items-center space-x-2"> {/* Flex container for icon and text */}
                                                                {/* FIX 3: Add Grip Icon (non-interactive for drag) */}
                                                                {!disabled && <GripHorizontal className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />}
                                                                <span className="font-medium text-sm text-gray-700 dark:text-gray-300">{col.name}</span>
                                                            </div>
                                                        </th>
                                                    );
                                                }}
                                            </Draggable>
                                        ))}
                                        {providedCols.placeholder}
                                    </tr>
                                )}
                            </Droppable>
                        </thead>
                        <Droppable droppableId={`rows-${fieldId}`} type="ROW" isDropDisabled={disabled} renderClone={renderRowClone}>
                            {(providedRows, snapshotRows) => (
                                <tbody ref={providedRows.innerRef} {...providedRows.droppableProps}
                                    className={cn(snapshotRows.isDraggingOver && "bg-blue-50/50 dark:bg-blue-950/20", "transition-colors duration-150 ease-in-out")}>
                                    {sortedRows.length === 0 && !disabled && (<tr><td colSpan={1 + columns.length} className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">No options available.</td></tr>)}
                                    {sortedRows.map((row, rowIndex) => (
                                        <Draggable key={row.id} draggableId={`row-${fieldId}-${row.id}`} index={rowIndex} isDragDisabled={disabled}>
                                            {(providedRowDraggable, snapshotRowDraggable) => (
                                                <tr ref={providedRowDraggable.innerRef} {...providedRowDraggable.draggableProps}
                                                    style={{ ...providedRowDraggable.draggableProps.style }}
                                                    className={cn(
                                                        "bg-textured",
                                                        !snapshotRowDraggable.isDragging && "hover:bg-gray-50 dark:hover:bg-gray-700/50",
                                                        snapshotRowDraggable.isDragging ? "opacity-0" : "opacity-100",
                                                        "border-b border-border",
                                                        "transition-opacity duration-150 ease-in-out"
                                                    )}>
                                                    <td className="w-10 p-0 border-r border-border align-middle">
                                                        <div {...providedRowDraggable.dragHandleProps} className={cn("h-full flex items-center justify-center p-2",!disabled && "cursor-grab hover:bg-gray-100 dark:hover:bg-gray-700","transition-colors duration-150")} aria-label="Drag to reorder row">
                                                            <GripHorizontal className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                                                        </div>
                                                    </td>
                                                    {columns.map((col, index) => (
                                                        <td key={col.id} className={cn(
                                                            "p-0 align-middle",
                                                            col.widthClass,
                                                            index < columns.length - 1 && "border-r border-border"
                                                        )}>
                                                            {editingCell?.rowId === row.id && editingCell?.columnKey === col.key ? (
                                                                <input type="text" value={editValue} onChange={handleEditChange} onKeyDown={handleEditKeyDown} onBlur={saveEdit} autoFocus
                                                                    className={cn("w-full h-full px-3 py-2 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 bg-inherit", col.key === 'label' ? "font-medium text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300")} />
                                                            ) : (
                                                                <span onClick={() => handleCellClick(row.id, col.key, row[col.key])}
                                                                    className={cn("block w-full h-full px-3 py-2 text-sm cursor-pointer", col.key === 'label' ? "font-medium text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300")}>
                                                                    {row[col.key] === null || row[col.key] === undefined ? '-' : String(row[col.key])}
                                                                </span>
                                                            )}
                                                        </td>
                                                    ))}
                                                </tr>
                                            )}
                                        </Draggable>
                                    ))}
                                    {providedRows.placeholder}
                                </tbody>
                            )}
                        </Droppable>
                    </table>
                </div>
                {!disabled && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 space-y-1">
                        <div>• Drag <GripHorizontal className="inline h-3 w-3 -mt-0.5"/> rows or column headers <GripHorizontal className="inline h-3 w-3 -mt-0.5"/> to reorder.</div>
                        <div>• Click cells to edit.</div>
                    </div>
                )}
            </DragDropContext>
        </div>
    );
};

export default DraggableEditableTableField;