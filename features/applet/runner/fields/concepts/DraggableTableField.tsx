import React, { useEffect, useState, useRef } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd"; // Added DropResult type
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors, brokerActions } from "@/lib/redux/brokerSlice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { FieldOption } from "@/types/customAppTypes";
import { CommonFieldProps } from "../core/types";

// Extended interface for table data with order
interface TableOption extends FieldOption {
    order: number;
}

const DraggableTableField: React.FC<CommonFieldProps> = ({ field, sourceId="no-applet-id", isMobile, source = "applet", disabled = false, className = "" }) => {
    const { id, label, options, componentProps } = field;
    const { width, customContent } = componentProps;
    const safeWidthClass = ensureValidWidthClass(width);

    const dispatch = useAppDispatch();
    const brokerId = useAppSelector((state) => brokerSelectors.selectBrokerId(state, { source, mappedItemId: id }));
    const stateValue = useAppSelector((state) => brokerSelectors.selectValue(state, brokerId));

    const [tableData, setTableData] = useState<TableOption[]>([]);
    const tableRef = useRef<HTMLTableElement>(null);
    const [columnWidths, setColumnWidths] = useState<string[]>([]); // State to store measured column widths

    // Initialize data from options or state
    useEffect(() => {
        let initialData: TableOption[] = [];
        if (stateValue && Array.isArray(stateValue) && stateValue.length > 0 && 'order' in stateValue[0]) {
            initialData = stateValue as TableOption[]; // Added type assertion for clarity
        } else if (options && options.length > 0) {
            initialData = options.map((option, index) => ({ ...option, order: index }));
            dispatch(brokerActions.setValue({ brokerId, value: initialData }));
        } else if (stateValue && Array.isArray(stateValue)) {
            // Ensure all items have an order property
            initialData = stateValue.map((item, index) => ({
                ...item,
                order: typeof item.order === 'number' ? item.order : index
            })) as TableOption[];

            // Check if any item's order was newly assigned
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
        // This effect runs once after the component mounts and the tableRef is set.
        // If your table's structure or parent width changes dynamically affecting column widths,
        // you might need a more complex trigger or a ResizeObserver.
    }, []); // Empty dependency array to run once on mount

    // Handle row reordering
    const handleRowDragEnd = (result: DropResult) => { // Used DropResult type
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

    if (customContent) return <>{customContent}</>;

    const sortedData = tableData;

    // Define Column structure
    const TableColumns = () => <colgroup><col className="w-10" /><col className="w-1/3" /><col /></colgroup>;

    return (
        <div className={`${safeWidthClass} ${className}`}>
            <div className="w-full overflow-x-auto border-border rounded-lg">
                <table ref={tableRef} className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                    <TableColumns />
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                        <tr className="border-b border-border">
                            <th className="p-0 border-r border-border"><div className="h-full flex items-center justify-center p-2"><div className="w-5 h-5" /></div></th>
                            <th className="text-left border-r border-border p-3"><span className="font-medium text-sm text-gray-700 dark:text-gray-300">Label</span></th>
                            <th className="text-left p-3"><span className="font-medium text-sm text-gray-700 dark:text-gray-300">Description</span></th>
                        </tr>
                    </thead>
                    <DragDropContext onDragEnd={handleRowDragEnd}>
                        <Droppable droppableId={`table-rows-${id}`} isDropDisabled={disabled}>
                            {(providedDroppable, snapshotDroppable) => ( // Renamed snapshot for clarity
                                <tbody
                                    ref={providedDroppable.innerRef}
                                    {...providedDroppable.droppableProps}
                                    className={cn(
                                        "divide-y divide-gray-200 dark:divide-gray-700",
                                        snapshotDroppable.isDraggingOver && "bg-blue-50/50 dark:bg-blue-950/20",
                                        "transition-colors duration-150 ease-in-out"
                                    )}
                                >
                                    {sortedData.length === 0 && !disabled && (<tr><td colSpan={3} className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">No options available or defined.</td></tr>)}
                                    {sortedData.map((row, rowIndex) => (
                                        <Draggable key={row.id} draggableId={`row-${id}-${row.id}`} index={rowIndex} isDragDisabled={disabled}>
                                            {(providedDraggable, snapshotDraggable) => ( // Renamed snapshot for clarity
                                                <tr
                                                    ref={providedDraggable.innerRef}
                                                    {...providedDraggable.draggableProps}
                                                    style={{
                                                        ...providedDraggable.draggableProps.style,
                                                        // No other inline styles needed on TR here, library handles position
                                                    }}
                                                    className={cn(
                                                        "bg-textured",
                                                        "hover:bg-gray-50 dark:hover:bg-gray-700/50",
                                                        snapshotDraggable.isDragging ? "shadow-xl opacity-95" : "shadow-none opacity-100", // Enhanced shadow
                                                        "transition-[box-shadow,opacity] duration-150 ease-in-out"
                                                    )}
                                                >
                                                    <td
                                                        className="w-10 p-0 border-r border-border align-middle"
                                                        style={snapshotDraggable.isDragging && columnWidths[0] ? { width: columnWidths[0] } : {}}
                                                    >
                                                        <div
                                                            {...providedDraggable.dragHandleProps} // Apply drag handle props here
                                                            className={cn(
                                                                "h-full flex items-center justify-center p-2",
                                                                !disabled && "cursor-grab",
                                                                "transition-colors duration-150"
                                                            )}
                                                            aria-label="Drag to reorder row" // Accessibility improvement
                                                        >
                                                            <GripHorizontal className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                                                        </div>
                                                    </td>
                                                    <td
                                                        className="w-1/3 p-3 border-r border-border align-middle"
                                                        style={snapshotDraggable.isDragging && columnWidths[1] ? { width: columnWidths[1] } : {}}
                                                    >
                                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{row.label}</span>
                                                    </td>
                                                    <td
                                                        className="p-3 align-middle"
                                                        style={snapshotDraggable.isDragging && columnWidths[2] ? { width: columnWidths[2] } : {}}
                                                    >
                                                        <span className="text-sm text-gray-700 dark:text-gray-300">{row.description || '-'}</span>
                                                    </td>
                                                </tr>
                                            )}
                                        </Draggable>
                                    ))}
                                    {providedDroppable.placeholder}
                                </tbody>
                            )}
                        </Droppable>
                    </DragDropContext>
                </table>
            </div>
            {!disabled && (<div className="text-xs text-gray-500 dark:text-gray-400 mt-2">Drag rows using the grip handles <GripHorizontal className="inline h-3 w-3 -mt-1" /> to reorder.</div>)}
        </div>
    );
};

export default DraggableTableField;