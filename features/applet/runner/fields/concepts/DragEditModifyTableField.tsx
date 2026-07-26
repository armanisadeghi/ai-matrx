'use client';

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
import { GripHorizontal, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommonFieldProps } from "../core/types";

// --- Types (assuming these are correct from previous versions) ---
type CellValue = string | number | boolean | null;
interface TableRowData {
    id: string;
    order: number;
    data: { [columnKey: string]: CellValue; };
}
interface ColumnDefinition {
    id: string;
    key: string;
    name: string;
    isFixed?: boolean;
    minWidthClass?: string;
}
interface TableState {
    rows: TableRowData[];
    columns: ColumnDefinition[];
}

// MODIFIED: isFixed is now false for default columns to make them draggable
const defaultColumns: ColumnDefinition[] = [
    { id: 'col-label', key: 'label', name: 'Label', isFixed: false, minWidthClass: 'min-w-[150px]' },
    { id: 'col-desc', key: 'description', name: 'Description', isFixed: false, minWidthClass: 'min-w-[200px]' },
];

const THROTTLE_INTERVAL_MS = 300; // Throttle delay for Redux updates

// --- Component Implementation ---
const DragEditModifyTableField: React.FC<CommonFieldProps> = ({ field, sourceId="no-applet-id", isMobile, source = "applet", disabled = false, className = "" }) => {
    const { id: fieldId, label: fieldLabel, options, componentProps } = field;
    const { width, customContent } = componentProps;
    const safeWidthClass = ensureValidWidthClass(width);
    const dispatch = useAppDispatch();
    const brokerId = useAppSelector((state) => brokerSelectors.selectBrokerId(state, { source, mappedItemId: fieldId }));
    const stateValue = useAppSelector((state) => brokerSelectors.selectValue(state, brokerId));

    const [tableRows, setTableRows] = useState<TableRowData[]>([]);
    const [columns, setColumns] = useState<ColumnDefinition[]>(defaultColumns);
    const [editingCell, setEditingCell] = useState<{ rowId: string; columnKey: string } | null>(null);
    const [editValue, setEditValue] = useState<string>("");
    const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
    const [columnEditValue, setColumnEditValue] = useState("");
    const tableRef = useRef<HTMLTableElement>(null);
    const [columnWidths, setColumnWidths] = useState<string[]>([]);
    const initialReduxUpdateDone = useRef(false);
    const throttleTimerRef = useRef<NodeJS.Timeout | null>(null);


    // --- Column Width Measurement ---
    const measureColumnWidths = useCallback(() => {
        if (tableRef.current) {
            const headerCells = tableRef.current.querySelectorAll('thead th');
            const expectedCount = 1 + columns.length + 1; // Handle + N Cols + Add Button
            if (headerCells.length === expectedCount) {
                const widths = Array.from(headerCells).map(th => getComputedStyle(th).width);
                setColumnWidths(widths);
            } else {
                requestAnimationFrame(() => {
                    if (tableRef.current) {
                        const currentHeaderCells = tableRef.current.querySelectorAll('thead th');
                        if (currentHeaderCells.length === expectedCount) {
                            setColumnWidths(Array.from(currentHeaderCells).map(th => getComputedStyle(th).width));
                        } else {
                            console.warn("M: Column width measurement mismatch. Expected:", expectedCount, "Got:", currentHeaderCells.length, "Cols:", columns.length);
                            if (columnWidths.length !== expectedCount) {
                                 console.log("M: Setting fallback widths");
                                 setColumnWidths([...Array(expectedCount).fill('auto')]);
                            }
                        }
                    }
                });
            }
        }
    }, [columns.length, columnWidths.length]);

    useEffect(() => {
        measureColumnWidths();
    }, [measureColumnWidths]);

    // --- Redux Update Logic ---
    const immediateDispatchUpdateBrokerValue = useCallback((currentRows: TableRowData[], currentCols: ColumnDefinition[]) => {
        const newState: TableState = { rows: currentRows, columns: currentCols };
        dispatch(brokerActions.setValue({ brokerId, value: newState }));
    }, [dispatch, brokerId]);

    const throttledUpdateReduxState = useCallback((currentRows: TableRowData[], currentCols: ColumnDefinition[]) => {
        if (throttleTimerRef.current) {
            clearTimeout(throttleTimerRef.current);
        }
        throttleTimerRef.current = setTimeout(() => {
            immediateDispatchUpdateBrokerValue(currentRows, currentCols);
            throttleTimerRef.current = null; 
        }, THROTTLE_INTERVAL_MS);
    }, [immediateDispatchUpdateBrokerValue]);

    useEffect(() => {
        return () => {
            if (throttleTimerRef.current) {
                clearTimeout(throttleTimerRef.current);
                throttleTimerRef.current = null;
            }
        };
    }, []);


    // --- State Initialization and Migration ---
    useEffect(() => {
        let newRows: TableRowData[] = [];
        // Start with a fresh copy of defaultColumns, which now have isFixed: false
        let newColumns: ColumnDefinition[] = defaultColumns.map(col => ({...col}));
        let needsReduxUpdate = false;

        if (stateValue) {
            if (typeof stateValue === 'object' && stateValue !== null && 'rows' in stateValue && 'columns' in stateValue) {
                const storedState = stateValue as TableState;
                newRows = storedState.rows?.map((r, i) => ({ id: r.id || `row-${Date.now()}-${i}`, order: r.order ?? i, data: r.data || {} })) ?? [];
                
                if (storedState.columns?.length > 0) {
                    newColumns = storedState.columns.map(storedCol => {
                        const defaultMatch = defaultColumns.find(dc => dc.key === storedCol.key);
                        // Base defaults for any column, then specific defaults from defaultColumns (e.g. name, key for "label"), then stored overrides
                        return { 
                            isFixed: false, // Default to not fixed
                            minWidthClass: 'min-w-[150px]', 
                            ...defaultMatch, // Apply if a default column definition exists
                            ...storedCol    // Apply stored properties, potentially overriding isFixed
                        };
                    });
                } else {
                    // newColumns is already set to defaultColumns above
                    if (newRows.length > 0 && !storedState.columns) needsReduxUpdate = true;
                }

                 newRows = newRows.map(row => {
                    const updatedData = { ...row.data }; let rowDataChanged = false;
                    newColumns.forEach(col => { if (!(col.key in updatedData)) { updatedData[col.key] = ''; rowDataChanged = true; }});
                    if (rowDataChanged && !needsReduxUpdate) needsReduxUpdate = true;
                    return { ...row, data: updatedData };
                });

            } else if (Array.isArray(stateValue)) {
                console.log("Migrating legacy table state (array) for field:", fieldId);
                // newColumns already initialized from defaultColumns
                const tempColKeys = new Set<string>(newColumns.map(c => c.key));
                newRows = stateValue.map((item: any, index) => {
                    const rowData: { [key: string]: CellValue } = { label: item.label ?? '', description: item.description ?? '' };
                    Object.keys(item).forEach(key => {
                        if (!['id', 'order', 'label', 'description', 'data'].includes(key)) {
                            rowData[key] = item[key];
                            if (!tempColKeys.has(key)) {
                                newColumns.push({ id: `col-dyn-${key}-${Date.now()}`, key: key, name: key.charAt(0).toUpperCase() + key.slice(1), isFixed: false, minWidthClass: 'min-w-[150px]' });
                                tempColKeys.add(key);
                            }
                        } else if (key === 'data' && typeof item.data === 'object' && item.data !== null) {
                            Object.assign(rowData, item.data);
                            Object.keys(item.data).forEach(dataKey => {
                                if (!tempColKeys.has(dataKey)) {
                                    newColumns.push({ id: `col-dyn-${dataKey}-${Date.now()}`, key: dataKey, name: dataKey.charAt(0).toUpperCase() + dataKey.slice(1), isFixed: false, minWidthClass: 'min-w-[150px]' });
                                    tempColKeys.add(dataKey);
                                }
                            });
                        }
                    });
                    return { id: item.id || `row-${Date.now()}-${index}`, order: typeof item.order === 'number' ? item.order : index, data: rowData };
                });
                needsReduxUpdate = true;
            }
        } else if (options && options.length > 0) {
            // newColumns already initialized from defaultColumns
            newRows = options.map((option: any, index) => ({ id: option.id || `row-${Date.now()}-${index}`, order: index, data: { label: option.label ?? '', description: option.description ?? '' }}));
            newRows = newRows.map(row => {
                const dataWithDefaults = { ...row.data };
                newColumns.forEach(col => { // Use current newColumns which includes defaults
                    if (!(col.key in dataWithDefaults)) {
                        dataWithDefaults[col.key] = '';
                    }
                });
                return { ...row, data: dataWithDefaults };
            });
            needsReduxUpdate = true;
        }

        setTableRows([...newRows].sort((a, b) => a.order - b.order));
        setColumns(newColumns);

        if (needsReduxUpdate && !initialReduxUpdateDone.current && (newRows.length > 0 || JSON.stringify(newColumns) !== JSON.stringify(defaultColumns.map(col => ({...col}))))) {
            immediateDispatchUpdateBrokerValue(newRows, newColumns);
            initialReduxUpdateDone.current = true;
        }
        requestAnimationFrame(measureColumnWidths);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [options, fieldId, stateValue, immediateDispatchUpdateBrokerValue]);


    // --- Drag End Handler ---
    const handleDragEnd = (result: DropResult) => {
        const { source: dragSource, destination, type } = result;
        if (!destination || disabled) return;
        if (type === 'ROW') {
            if (dragSource.index === destination.index) return;
            setTableRows(currentRows => { 
                const updatedRows = Array.from(currentRows); 
                const [reorderedRow] = updatedRows.splice(dragSource.index, 1); 
                updatedRows.splice(destination.index!, 0, reorderedRow); 
                const reorderedDataWithOrder = updatedRows.map((row, index) => ({ ...row, order: index })); 
                throttledUpdateReduxState(reorderedDataWithOrder, columns); 
                return reorderedDataWithOrder; 
            });
        } else if (type === 'COLUMN') {
            if (dragSource.index === destination.index) return;
            setColumns(currentCols => { 
                const updatedCols = Array.from(currentCols); 
                const [reorderedCol] = updatedCols.splice(dragSource.index, 1); 
                updatedCols.splice(destination.index!, 0, reorderedCol); 
                throttledUpdateReduxState(tableRows, updatedCols); 
                requestAnimationFrame(measureColumnWidths); 
                return updatedCols; 
            });
        }
    };

    // --- Row/Column/Cell Modifications ---
    const handleAddRow = () => {
        const newId = `row-${Date.now()}`; 
        const newData = columns.reduce((acc, col) => { acc[col.key] = ''; return acc; }, {} as { [key: string]: CellValue }); 
        const newRow: TableRowData = { id: newId, order: tableRows.length, data: newData }; 
        const updatedRows = [...tableRows, newRow]; 
        setTableRows(updatedRows); 
        throttledUpdateReduxState(updatedRows, columns);
    };
    const handleDeleteRow = (rowId: string) => {
        const updatedRows = tableRows.filter(row => row.id !== rowId).map((row, index) => ({ ...row, order: index })); 
        setTableRows(updatedRows); 
        throttledUpdateReduxState(updatedRows, columns);
    };
    const handleAddColumn = () => {
        const timestamp = Date.now(); 
        const newColKey = `newCol${timestamp}`; 
        const newColumn: ColumnDefinition = { id: `col-dyn-${timestamp}`, key: newColKey, name: `New Column`, isFixed: false, minWidthClass: 'min-w-[150px]'}; 
        const updatedColumns = [...columns, newColumn]; 
        const updatedRows = tableRows.map(row => ({ ...row, data: { ...row.data, [newColKey]: '' } })); 
        setColumns(updatedColumns); 
        setTableRows(updatedRows); 
        throttledUpdateReduxState(updatedRows, updatedColumns); 
        requestAnimationFrame(measureColumnWidths);
    };
    const handleStartRenameColumn = (column: ColumnDefinition) => {
        if(disabled || column.isFixed) return; 
        setEditingColumnId(column.id); 
        setColumnEditValue(column.name);
    };
    const handleColumnRename = (columnId: string, newName: string) => {
        if (!newName.trim()) { setEditingColumnId(null); setColumnEditValue(""); return; } 
        let colUpdated = false; 
        const updatedColumns = columns.map(col => { 
            if (col.id === columnId && col.name !== newName) { 
                colUpdated = true; return { ...col, name: newName }; 
            } 
            return col; 
        }); 
        if (colUpdated) { 
            setColumns(updatedColumns); 
            throttledUpdateReduxState(tableRows, updatedColumns); 
        } 
        setEditingColumnId(null); 
        setColumnEditValue("");
    };
    const handleDeleteColumn = (columnIdToDelete: string) => {
        if(disabled) return; 
        let targetColumn: ColumnDefinition | undefined; 
        const updatedColumns = columns.filter(col => { 
            if (col.id === columnIdToDelete) { 
                targetColumn = col; return false; 
            } 
            return true; 
        }); 
        if (!targetColumn || targetColumn.isFixed) return; 
        const columnKeyToDelete = targetColumn.key; 
        const updatedRows = tableRows.map(row => { 
            const newData = { ...row.data }; 
            delete newData[columnKeyToDelete]; 
            return { ...row, data: newData }; 
        }); 
        setColumns(updatedColumns); 
        setTableRows(updatedRows); 
        throttledUpdateReduxState(updatedRows, updatedColumns); 
        requestAnimationFrame(measureColumnWidths);
    };
    const handleCellClick = (rowId: string, columnKey: string, currentValue: CellValue) => {
         if (!disabled) { 
             const valueAsString = (currentValue === null || currentValue === undefined) ? '' : String(currentValue); 
             setEditingCell({ rowId, columnKey }); 
             setEditValue(valueAsString); 
         }
    };
    const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value);
    const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => { 
        if (e.key === 'Enter') {
            e.preventDefault();
            saveEdit(); 
        } else if (e.key === 'Escape') {
            cancelEdit(); 
        }
    };
    const saveEdit = () => {
        if (!editingCell) return; 
        const { rowId, columnKey } = editingCell; 
        setTableRows(currentRows => { 
            const updatedRows = currentRows.map(row => 
                row.id === rowId ? { ...row, data: { ...row.data, [columnKey]: editValue } } : row 
            ); 
            throttledUpdateReduxState(updatedRows, columns); 
            return updatedRows; 
        }); 
        setEditingCell(null); 
        setEditValue("");
    };
    const cancelEdit = () => { 
        setEditingCell(null); 
        setEditValue(""); 
    };

    if (customContent) return <>{customContent}</>;
    const sortedRows = tableRows; 

    const renderRowClone = (provided: DraggableProvided, snapshot: DraggableStateSnapshot, rubric: DraggableRubric) => {
        const item = sortedRows[rubric.source.index]; 
        const totalWidth = columnWidths.length === (1 + columns.length + 1) ? columnWidths.reduce((sum, width) => sum + parseFloat(width || '0'), 0) + 'px' : 'auto'; 
        return ( 
        <table ref={provided.innerRef} {...provided.draggableProps} style={{ ...provided.draggableProps.style, borderCollapse: 'collapse', tableLayout: 'fixed', width: totalWidth, opacity: 0.95 }} className={cn("bg-textured", "shadow-lg rounded overflow-hidden")}> 
            <tbody> 
                <tr className="border-b border-border"> 
                    <td className="p-0 border-r border-border align-middle" style={{ width: columnWidths[0] ?? 'auto' }}> 
                        <div {...provided.dragHandleProps} className="h-full flex items-center justify-center p-2 cursor-grab"> 
                            <GripHorizontal className="h-4 w-4 text-gray-400 dark:text-gray-500" /> 
                        </div> 
                    </td> 
                    {columns.map((col, index) => ( 
                        <td key={col.id} className={cn("p-3 align-middle overflow-hidden text-ellipsis whitespace-nowrap", "border-r border-border")} style={{ width: columnWidths[index + 1] ?? 'auto' }} > 
                            <span className={cn("text-sm", col.key === 'label' ? "font-medium text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300")}> 
                                {String(item.data[col.key] ?? '-')} 
                            </span> 
                        </td> 
                    ))} 
                    <td className="p-0 align-middle" style={{ width: columnWidths[1 + columns.length] ?? 'auto' }}> 
                        <div className="h-full w-full flex items-center justify-center p-2" /> 
                    </td> 
                </tr> 
            </tbody> 
        </table> );
    };

    return (
        <div className={`${safeWidthClass} ${className}`}>
            <DragDropContext onDragEnd={handleDragEnd}>
                <div className="w-full overflow-x-auto border-border rounded-lg">
                    <table ref={tableRef} className="min-w-full border-collapse" style={{ tableLayout: 'auto' }}>
                        <thead className="bg-gray-50 dark:bg-gray-900/50 select-none">
                            <Droppable droppableId={`cols-${fieldId}`} direction="horizontal" type="COLUMN" isDropDisabled={disabled}>
                                {(providedCols) => (
                                    <tr ref={providedCols.innerRef} {...providedCols.droppableProps} className="border-b border-border">
                                        <th className="w-10 sticky left-0 z-10 bg-inherit p-0 border-r border-border align-middle">
                                            <div className="h-full flex items-center justify-center p-2"><div className="w-5 h-5" /></div>
                                        </th>
                                        {columns.map((col, index) => {
                                            const isCurrentlyEditingThisColumn = editingColumnId === col.id;
                                            return (
                                                <Draggable 
                                                    key={col.id} 
                                                    draggableId={col.id} 
                                                    index={index} 
                                                    isDragDisabled={disabled || !!col.isFixed || isCurrentlyEditingThisColumn}
                                                >
                                                    {(providedColDraggable, snapshotColDraggable) => {
                                                        const style = {
                                                            ...providedColDraggable.draggableProps.style,
                                                            width: snapshotColDraggable.isDragging && columnWidths[index + 1] ? columnWidths[index + 1] : undefined,
                                                        };
                                                        return (
                                                            <th
                                                                ref={providedColDraggable.innerRef}
                                                                {...providedColDraggable.draggableProps}
                                                                {...(!isCurrentlyEditingThisColumn ? providedColDraggable.dragHandleProps : {})}
                                                                style={style}
                                                                className={cn(
                                                                    "text-left p-0 relative group", col.minWidthClass,
                                                                    "border-r border-border",
                                                                    !col.isFixed && !disabled && !isCurrentlyEditingThisColumn && "cursor-grab",
                                                                    !snapshotColDraggable.isDragging && !col.isFixed && !disabled && !isCurrentlyEditingThisColumn && "hover:bg-gray-100 dark:hover:bg-gray-700/50",
                                                                    snapshotColDraggable.isDragging && "bg-blue-100 dark:bg-blue-900 shadow-md opacity-95 z-20"
                                                                )}
                                                                title={col.isFixed ? col.name : (isCurrentlyEditingThisColumn ? col.name : `Drag to reorder, Click name to edit`)}
                                                            >
                                                                <div className="flex items-center justify-between h-full px-3 py-2 space-x-2">
                                                                    {isCurrentlyEditingThisColumn ? (
                                                                         <input type="text" value={columnEditValue} onChange={(e) => setColumnEditValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { handleColumnRename(col.id, columnEditValue); e.preventDefault(); } else if (e.key === 'Escape') { setEditingColumnId(null); setColumnEditValue(""); }}} onBlur={() => handleColumnRename(col.id, columnEditValue)} autoFocus className="flex-grow px-1 py-0.5 text-sm font-medium border rounded border-gray-300 dark:border-gray-600 bg-textured text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                                                    ) : (
                                                                        <div className="flex items-center space-x-2 flex-grow min-w-0" onClick={() => handleStartRenameColumn(col)}>
                                                                            {!col.isFixed && !disabled && <GripHorizontal className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />}
                                                                            <span className="font-medium text-sm text-gray-700 dark:text-gray-300 truncate">{col.name}</span>
                                                                        </div>
                                                                    )}
                                                                     {!col.isFixed && !disabled && !isCurrentlyEditingThisColumn && (
                                                                         <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteColumn(col.id); }} className="absolute top-1 right-1 p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 rounded-full hover:bg-red-200 dark:hover:bg-red-800/50 transition-opacity" title={`Delete "${col.name}" column`} > <X className="h-3 w-3 text-red-600 dark:text-red-400" /> </button>
                                                                     )}
                                                                </div>
                                                            </th>
                                                        );
                                                    }}
                                                </Draggable>
                                            );
                                        })}
                                        {providedCols.placeholder}
                                        <th className="w-12 p-0 align-middle">
                                            <button type="button" onClick={handleAddColumn} disabled={disabled} className={cn("h-full w-full flex items-center justify-center p-2",!disabled && "hover:bg-gray-100 dark:hover:bg-gray-700","transition-colors duration-150",disabled && "opacity-50 cursor-not-allowed")} title="Add column"><Plus className="h-4 w-4 text-gray-500 dark:text-gray-400" /></button>
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
                                    className={cn(snapshotRows.isDraggingOver && "bg-blue-50/50 dark:bg-blue-950/20", "transition-colors duration-150 ease-in-out")}
                                >
                                    {sortedRows.length === 0 && !disabled ? (
                                        <tr><td colSpan={1 + columns.length + 1} className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">No rows defined. Click 'Add Row'.</td></tr>
                                    ) : (
                                        sortedRows.map((row, rowIndex) => (
                                            <Draggable key={row.id} draggableId={`row-${fieldId}-${row.id}`} index={rowIndex} isDragDisabled={disabled}>
                                                {(providedRowDraggable, snapshotRowDraggable) => (
                                                    <tr
                                                        ref={providedRowDraggable.innerRef}
                                                        {...providedRowDraggable.draggableProps}
                                                        style={{ ...providedRowDraggable.draggableProps.style }}
                                                        className={cn(
                                                            "bg-textured",
                                                            !snapshotRowDraggable.isDragging && "hover:bg-gray-50 dark:hover:bg-gray-700/50",
                                                            snapshotRowDraggable.isDragging ? "opacity-0" : "opacity-100",
                                                            "border-b border-border",
                                                            "transition-opacity duration-150 ease-in-out"
                                                        )}
                                                    >
                                                        <td className="w-10 sticky left-0 z-0 bg-inherit p-0 border-r border-border align-middle">
                                                            <div {...providedRowDraggable.dragHandleProps} className={cn("h-full flex items-center justify-center p-2",!disabled && "cursor-grab hover:bg-gray-100 dark:hover:bg-gray-700","transition-colors duration-150")} aria-label="Drag to reorder row">
                                                                <GripHorizontal className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                                                            </div>
                                                        </td>
                                                        {columns.map((col) => (
                                                            <td key={col.id} className={cn("p-0 align-middle", "border-r border-border")}>
                                                                {editingCell?.rowId === row.id && editingCell?.columnKey === col.key ? (
                                                                    <input type="text" value={editValue} onChange={handleEditChange} onKeyDown={handleEditKeyDown} onBlur={saveEdit} autoFocus className={cn("w-full h-full px-3 py-2 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 bg-inherit", col.key === 'label' ? "font-medium text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300")} />
                                                                ) : (
                                                                    <span onClick={() => handleCellClick(row.id, col.key, row.data[col.key])} className={cn("block w-full h-full px-3 py-2 text-sm cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap", col.key === 'label' ? "font-medium text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300")}>
                                                                        {row.data[col.key] === null || row.data[col.key] === undefined || String(row.data[col.key]).trim() === '' ? '-' : String(row.data[col.key])}
                                                                    </span>
                                                                )}
                                                            </td>
                                                        ))}
                                                        <td className="w-12 p-0 align-middle">
                                                            <button type="button" onClick={() => handleDeleteRow(row.id)} disabled={disabled} className={cn("h-full w-full flex items-center justify-center p-2",!disabled && "hover:bg-red-100 dark:hover:bg-red-900/50","transition-colors duration-150",disabled && "opacity-50 cursor-not-allowed")} title="Delete row">
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
                    <button type="button" onClick={handleAddRow} disabled={disabled} className={cn("px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300","hover:bg-gray-200 dark:hover:bg-gray-700","border border-gray-300 dark:border-gray-600 rounded-md text-sm","transition-colors duration-150","flex items-center space-x-1.5",disabled && "opacity-50 cursor-not-allowed")}>
                        <Plus className="h-4 w-4" /><span>Add Row</span>
                    </button>
                </div>
                 {!disabled && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-3 space-y-1">
                        <div>• Drag <GripHorizontal className="inline h-3 w-3 -mt-0.5"/> rows vertically or column headers horizontally to reorder (non-fixed columns).</div>
                        <div>• Click cells or column names (non-fixed) to edit. Add cols <Plus className="inline h-3 w-3 -mt-0.5"/>. Del rows/cols <X className="inline h-3 w-3 -mt-0.5"/>.</div>
                    </div>
                )}
            </DragDropContext>
        </div>
    );
};

export default DragEditModifyTableField;