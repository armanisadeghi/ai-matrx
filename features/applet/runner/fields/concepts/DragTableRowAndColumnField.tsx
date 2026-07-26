import React, { useEffect, useState, useRef } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors, brokerActions } from "@/lib/redux/brokerSlice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { GripHorizontal, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { FieldOption } from "@/types/customAppTypes";
import { CommonFieldProps } from "../core/types";

// Extended interface for table data with order
interface TableOption extends FieldOption {
    order: number;
}

// Interface for column configuration
interface ColumnConfig {
    id: string;
    label: string;
    key: string;
    order: number;
    width?: string;
}

const DragTableRowAndColumnField: React.FC<CommonFieldProps> = ({ field, sourceId="no-applet-id", isMobile, source = "applet", disabled = false, className = "" }) => {
    const { id, label, options, componentProps } = field;
    const { width, customContent } = componentProps;
    const safeWidthClass = ensureValidWidthClass(width);
    const dispatch = useAppDispatch();
    const brokerId = useAppSelector((state) => brokerSelectors.selectBrokerId(state, { source, mappedItemId: id }));
    const stateValue = useAppSelector((state) => brokerSelectors.selectValue(state, brokerId));
    const [tableData, setTableData] = useState<TableOption[]>([]);
    const tableRef = useRef<HTMLTableElement>(null);
    const [columnWidths, setColumnWidths] = useState<string[]>([]);
    
    // Column configuration state
    const [columns, setColumns] = useState<ColumnConfig[]>([
        { id: 'drag-handle', label: '', key: 'dragHandle', order: 0, width: 'w-10' },
        { id: 'label', label: 'Label', key: 'label', order: 1, width: 'w-1/3' },
        { id: 'description', label: 'Description', key: 'description', order: 2 }
    ]);

    // Initialize data from options or state
    useEffect(() => {
        let initialData: TableOption[] = [];
        
        if (stateValue && Array.isArray(stateValue) && stateValue.length > 0 && 'order' in stateValue[0]) {
            initialData = stateValue as TableOption[];
        } else if (options && options.length > 0) {
            initialData = options.map((option, index) => ({ ...option, order: index }));
            dispatch(brokerActions.setValue({ brokerId, value: initialData }));
        } else if (stateValue && Array.isArray(stateValue)) {
            initialData = stateValue.map((item, index) => ({
                ...item,
                order: typeof item.order === 'number' ? item.order : index
            })) as TableOption[];
            
            const needsUpdateInRedux = initialData.some((item, index) =>
                !(stateValue[index] && typeof stateValue[index].order === 'number')
            );
            
            if (needsUpdateInRedux) {
                dispatch(brokerActions.setValue({ brokerId, value: initialData }));
            }
        }
        
        setTableData([...initialData].sort((a, b) => a.order - b.order));
    }, [options, stateValue, dispatch, id, source]);

    // Effect to measure and store column widths
    useEffect(() => {
        if (tableRef.current) {
            const headerCells = tableRef.current.querySelectorAll('thead th');
            if (headerCells.length > 0) {
                const widths = Array.from(headerCells).map(th => getComputedStyle(th).width);
                setColumnWidths(widths);
            }
        }
    }, []);

    // Handle row reordering
    const handleRowDragEnd = (result: DropResult) => {
        if (!result.destination || result.source.index === result.destination.index || disabled) return;
        
        setTableData(currentData => {
            const updatedData = Array.from(currentData);
            const [reorderedRow] = updatedData.splice(result.source.index, 1);
            updatedData.splice(result.destination!.index, 0, reorderedRow);
    
            const reorderedDataWithOrder = updatedData.map((row, index) => ({
                ...row,
                order: index
            }));
            
            dispatch(
                brokerActions.setValue({
                    brokerId,
                    value: reorderedDataWithOrder,
                })
            );
            
            return reorderedDataWithOrder;
        });
    };

    // Handle column reordering
    const handleColumnDragEnd = (result: DropResult) => {
        if (!result.destination || result.source.index === result.destination.index || disabled) return;
        
        // Don't allow moving the drag handle column
        if (result.draggableId === 'column-drag-handle') return;
        
        setColumns(currentColumns => {
            const updatedColumns = Array.from(currentColumns);
            const [reorderedColumn] = updatedColumns.splice(result.source.index, 1);
            updatedColumns.splice(result.destination!.index, 0, reorderedColumn);
    
            return updatedColumns.map((col, index) => ({
                ...col,
                order: index
            }));
        });
    };

    // Unified drag end handler
    const handleOnDragEnd = (result: DropResult) => {
        if (result.destination?.droppableId.startsWith('table-rows')) {
            handleRowDragEnd(result);
        } else if (result.destination?.droppableId.startsWith('table-columns')) {
            handleColumnDragEnd(result);
        }
    };

    if (customContent) return <>{customContent}</>;

    const sortedData = tableData;
    const sortedColumns = columns.sort((a, b) => a.order - b.order);

    // Define Column structure based on sorted columns
    const TableColumns = () => (
        <colgroup>
            {sortedColumns.map(col => (
                <col key={col.id} className={col.width} />
            ))}
        </colgroup>
    );

    // Render cell content based on column
    const renderCell = (row: TableOption, col: ColumnConfig, providedDraggable?: any, isDragging?: boolean) => {
        switch (col.key) {
            case 'dragHandle':
                return (
                    <div
                        {...(providedDraggable?.dragHandleProps || {})}
                        className={cn(
                            "h-full flex items-center justify-center p-2",
                            !disabled && "cursor-grab",
                            "transition-colors duration-150"
                        )}
                        aria-label="Drag to reorder row"
                    >
                        <GripHorizontal className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    </div>
                );
            case 'label':
                return <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{row.label}</span>;
            case 'description':
                return <span className="text-sm text-gray-700 dark:text-gray-300">{row.description || '-'}</span>;
            default:
                return null;
        }
    };

    return (
        <div className={`${safeWidthClass} ${className}`}>
            <div className="w-full overflow-x-auto border-border rounded-lg">
                <DragDropContext onDragEnd={handleOnDragEnd}>
                    <table ref={tableRef} className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                        <TableColumns />
                        <thead className="bg-gray-50 dark:bg-gray-900/50">
                            <Droppable droppableId={`table-columns-${id}`} direction="horizontal" isDropDisabled={disabled}>
                                {(providedDroppable, snapshotDroppable) => (
                                    <tr 
                                        ref={providedDroppable.innerRef}
                                        {...providedDroppable.droppableProps}
                                        className="border-b border-border"
                                    >
                                        {sortedColumns.map((col, colIndex) => (
                                            <Draggable 
                                                key={col.id} 
                                                draggableId={`column-${col.id}`} 
                                                index={colIndex}
                                                isDragDisabled={disabled || col.id === 'drag-handle'}
                                            >
                                                {(providedDraggable, snapshotDraggable) => (
                                                    <th
                                                        ref={providedDraggable.innerRef}
                                                        {...providedDraggable.draggableProps}
                                                        style={{
                                                            ...providedDraggable.draggableProps.style,
                                                        }}
                                                        className={cn(
                                                            colIndex < sortedColumns.length - 1 && "border-r border-border",
                                                            col.id === 'drag-handle' ? "p-0" : "p-3",
                                                            col.id !== 'drag-handle' ? "text-left" : "",
                                                            snapshotDraggable.isDragging && "shadow-lg opacity-90 bg-textured",
                                                        )}
                                                    >
                                                        {col.id === 'drag-handle' ? (
                                                            <div className="h-full flex items-center justify-center p-2">
                                                                <div className="w-5 h-5" />
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-medium text-sm text-gray-700 dark:text-gray-300">
                                                                    {col.label}
                                                                </span>
                                                                {!disabled && (
                                                                    <div
                                                                        {...providedDraggable.dragHandleProps}
                                                                        className="cursor-grab p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                                                                    >
                                                                        <GripVertical className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </th>
                                                )}
                                            </Draggable>
                                        ))}
                                        {providedDroppable.placeholder}
                                    </tr>
                                )}
                            </Droppable>
                        </thead>
                        <Droppable droppableId={`table-rows-${id}`} isDropDisabled={disabled}>
                            {(providedDroppable, snapshotDroppable) => (
                                <tbody
                                    ref={providedDroppable.innerRef}
                                    {...providedDroppable.droppableProps}
                                    className={cn(
                                        "divide-y divide-gray-200 dark:divide-gray-700",
                                        snapshotDroppable.isDraggingOver && "bg-blue-50/50 dark:bg-blue-950/20",
                                        "transition-colors duration-150 ease-in-out"
                                    )}
                                >
                                    {sortedData.length === 0 && !disabled && (
                                        <tr>
                                            <td colSpan={sortedColumns.length} className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                                                No options available or defined.
                                            </td>
                                        </tr>
                                    )}
                                    {sortedData.map((row, rowIndex) => (
                                        <Draggable key={row.id} draggableId={`row-${id}-${row.id}`} index={rowIndex} isDragDisabled={disabled}>
                                            {(providedDraggable, snapshotDraggable) => (
                                                <tr
                                                    ref={providedDraggable.innerRef}
                                                    {...providedDraggable.draggableProps}
                                                    style={{
                                                        ...providedDraggable.draggableProps.style,
                                                    }}
                                                    className={cn(
                                                        "bg-textured",
                                                        "hover:bg-gray-50 dark:hover:bg-gray-700/50",
                                                        snapshotDraggable.isDragging ? "shadow-xl opacity-95" : "shadow-none opacity-100",
                                                        "transition-[box-shadow,opacity] duration-150 ease-in-out"
                                                    )}
                                                >
                                                    {sortedColumns.map((col, colIndex) => (
                                                        <td
                                                            key={col.id}
                                                            className={cn(
                                                                colIndex < sortedColumns.length - 1 && "border-r border-border",
                                                                "align-middle",
                                                                col.id === 'drag-handle' ? "w-10 p-0" : "p-3"
                                                            )}
                                                            style={snapshotDraggable.isDragging && columnWidths[colIndex] ? { width: columnWidths[colIndex] } : {}}
                                                        >
                                                            {renderCell(row, col, providedDraggable, snapshotDraggable.isDragging)}
                                                        </td>
                                                    ))}
                                                </tr>
                                            )}
                                        </Draggable>
                                    ))}
                                    {providedDroppable.placeholder}
                                </tbody>
                            )}
                        </Droppable>
                    </table>
                </DragDropContext>
            </div>
            {!disabled && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Drag rows using the grip handles <GripHorizontal className="inline h-3 w-3 -mt-1" /> to reorder vertically. 
                    Drag columns using <GripVertical className="inline h-3 w-3 -mt-1" /> to reorder horizontally.
                </div>
            )}
        </div>
    );
};

export default DragTableRowAndColumnField;