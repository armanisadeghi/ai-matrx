"use client";

import React, { useEffect, useState, useCallback } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors } from "@/lib/redux/brokerSlice/selectors";
import { brokerActions } from "@/lib/redux/brokerSlice/slice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommonFieldProps } from "./core/types";
import { FieldOption } from "@/types/customAppTypes";
import { processFieldOptions } from "@/features/applet/utils/field-normalization";

interface SortableItem extends FieldOption {
    order: number;
}

function isSortableItem(value: unknown): value is SortableItem {
    if (typeof value !== "object" || value === null) return false;
    return (
        "id" in value &&
        typeof value.id === "string" &&
        "label" in value &&
        typeof value.label === "string" &&
        "order" in value &&
        typeof value.order === "number"
    );
}

const SortableField: React.FC<CommonFieldProps> = ({ field, sourceId="no-applet-id", isMobile, source = "applet", disabled = false, className = "" }) => {
    const { id, label, options, componentProps } = field;
    const { width, customContent } = componentProps;
    const safeWidthClass = ensureValidWidthClass(width);

    const dispatch = useAppDispatch();
    const brokerId = useAppSelector((state) => brokerSelectors.selectBrokerId(state, { source, mappedItemId: id }));
    const stateValue = useAppSelector((state) => brokerSelectors.selectValue(state, brokerId));

    const updateBrokerValue = useCallback(
        (updatedValue: SortableItem[]) => {
            dispatch(
                brokerActions.setValue({
                    brokerId,
                    value: updatedValue,
                })
            );
        },
        [dispatch, brokerId]
    );

    const [items, setItems] = useState<SortableItem[]>([]);
    const [activeItemId, setActiveItemId] = useState<string | null>(null);
    const availableOptions = processFieldOptions(options);

    // Initialize items from options or state
    useEffect(() => {
        const storedItems = Array.isArray(stateValue) ? stateValue.filter(isSortableItem) : [];
        if (storedItems.length > 0) {
            setItems(storedItems);
        } else if (availableOptions.length > 0) {
            const initialItems = availableOptions.map((option, index) => ({
                id: option.id,
                label: option.label,
                description: option.description,
                order: index,
            }));
            setItems(initialItems);
            updateBrokerValue(initialItems);
        }
    }, [options, stateValue, dispatch, id, source]);

    // Handler for drag end
    const handleOnDragEnd = (result: DropResult) => {
        if (!result.destination || disabled) return;

        const updatedItems = Array.from(items);
        const [reorderedItem] = updatedItems.splice(result.source.index, 1);
        updatedItems.splice(result.destination.index, 0, reorderedItem);

        const reorderedItems = updatedItems.map((item, index) => ({
            ...item,
            order: index,
        }));

        setItems(reorderedItems);
        updateBrokerValue(reorderedItems);
    };

    // Handler for moving item up
    const handleMoveUp = (itemId: string) => {
        if (disabled) return;
        setActiveItemId(itemId);

        const itemIndex = items.findIndex((item) => item.id === itemId);
        if (itemIndex > 0) {
            const updatedItems = [...items];
            [updatedItems[itemIndex - 1], updatedItems[itemIndex]] = [updatedItems[itemIndex], updatedItems[itemIndex - 1]];

            const reorderedItems = updatedItems.map((item, index) => ({
                ...item,
                order: index,
            }));

            setItems(reorderedItems);
            updateBrokerValue(reorderedItems);
        }
    };

    // Handler for moving item down
    const handleMoveDown = (itemId: string) => {
        if (disabled) return;
        setActiveItemId(itemId);

        const itemIndex = items.findIndex((item) => item.id === itemId);
        if (itemIndex < items.length - 1) {
            const updatedItems = [...items];
            [updatedItems[itemIndex], updatedItems[itemIndex + 1]] = [updatedItems[itemIndex + 1], updatedItems[itemIndex]];

            const reorderedItems = updatedItems.map((item, index) => ({
                ...item,
                order: index,
            }));

            setItems(reorderedItems);
            updateBrokerValue(reorderedItems);
        }
    };

    if (customContent) {
        return <>{customContent}</>;
    }

    const sortedItems = [...items].sort((a, b) => a.order - b.order);

    return (
        <div className={`${safeWidthClass} ${className}`}>
            <DragDropContext onDragEnd={handleOnDragEnd}>
                <Droppable droppableId={`sortable-${id}`} isDropDisabled={disabled}>
                    {(provided, snapshot) => (
                        <div
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                            className={cn(
                                "w-full border-border rounded-lg bg-gray-50 dark:bg-gray-900/50 overflow-hidden",
                                disabled && "opacity-60",
                                snapshot.isDraggingOver && "border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                            )}
                            style={{
                                position: "relative",
                                minHeight: "120px",
                            }}
                        >
                            {sortedItems.map((item, index) => (
                                <Draggable key={item.id} draggableId={item.id} index={index} isDragDisabled={disabled}>
                                    {(provided, snapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            {...provided.dragHandleProps}
                                            style={{
                                                ...provided.draggableProps.style,
                                                opacity: snapshot.isDragging ? 0.9 : 1,
                                                cursor: "move",
                                            }}
                                            className={cn(
                                                "relative flex items-center p-4 bg-textured",
                                                "transition-shadow duration-200",
                                                "border-b border-gray-100 dark:border-gray-700 last:border-b-0",
                                                snapshot.isDragging &&
                                                    "shadow-2xl dark:shadow-2xl shadow-gray-300/70 dark:shadow-gray-900/90 z-50",
                                                activeItemId === item.id && "bg-blue-50 dark:bg-blue-900/20",
                                                "group"
                                            )}
                                        >
                                            {/* Drag handle icon - visual only */}
                                            <div className="mr-3">
                                                <GripVertical className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                                            </div>

                                            {/* Item content */}
                                            <div className="flex-1 min-w-0">
                                                <div
                                                    className={cn(
                                                        "text-sm font-medium",
                                                        activeItemId === item.id
                                                            ? "text-blue-700 dark:text-blue-300"
                                                            : "text-gray-700 dark:text-gray-300"
                                                    )}
                                                >
                                                    {item.label}
                                                </div>
                                                {item.description && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.description}</div>
                                                )}
                                            </div>

                                            {/* Up/down buttons - prevent drag on these */}
                                            <div
                                                className="flex items-center space-x-1 ml-2"
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onTouchStart={(e) => e.stopPropagation()}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => handleMoveUp(item.id)}
                                                    disabled={index === 0 || disabled}
                                                    aria-label="Move up"
                                                    className={cn(
                                                        "p-1.5 rounded-lg text-gray-500 dark:text-gray-400",
                                                        "hover:bg-gray-100 dark:hover:bg-gray-700",
                                                        "focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400",
                                                        "transition-all duration-200",
                                                        "opacity-0 group-hover:opacity-100 focus:opacity-100",
                                                        (index === 0 || disabled) && "cursor-not-allowed",
                                                        activeItemId === item.id && "opacity-100"
                                                    )}
                                                >
                                                    <ArrowUp className="h-4 w-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleMoveDown(item.id)}
                                                    disabled={index === sortedItems.length - 1 || disabled}
                                                    aria-label="Move down"
                                                    className={cn(
                                                        "p-1.5 rounded-lg text-gray-500 dark:text-gray-400",
                                                        "hover:bg-gray-100 dark:hover:bg-gray-700",
                                                        "focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400",
                                                        "transition-all duration-200",
                                                        "opacity-0 group-hover:opacity-100 focus:opacity-100",
                                                        (index === sortedItems.length - 1 || disabled) && "cursor-not-allowed",
                                                        activeItemId === item.id && "opacity-100"
                                                    )}
                                                >
                                                    <ArrowDown className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </Draggable>
                            ))}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>

            {/* Instructions */}
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Drag and drop items to reorder, or use the up and down arrows
            </div>
        </div>
    );
};

export default SortableField;
