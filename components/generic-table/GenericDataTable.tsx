// File Location: @/components/generic-table/GenericDataTable.tsx

"use client";
import React, { ReactNode, useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import StructuredSectionCard from "@/components/official/StructuredSectionCard";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import GenericTablePagination from "./GenericTablePagination";

export interface ColumnConfig<T> {
    key: string;
    header: React.ReactNode;
    width?: string;
    className?: string;
    sortable?: boolean;
    hidden?: boolean;
    render?: (item: T, index: number) => React.ReactNode;
}

interface StatusBadgeConfig {
    key: keyof any;
    isDirtyKey?: keyof any;
    isLocalKey?: keyof any;
    isPublicKey?: keyof any;
}

export interface ActionConfig<T> {
    icon: React.ReactNode;
    label?: string;
    onClick: (item: T, e: React.MouseEvent) => void;
    showCondition?: (item: T) => boolean;
    className?: string;
    badgeStyle?: boolean;
    badgeVariant?: "default" | "outline";
    badgeClassName?: string;
    requiresConfirmation?: boolean;
    confirmationProps?: {
        getTitle: (item: T) => string;
        getDescription: (item: T) => string;
        confirmButtonText: string;
    };
    // Custom render function for complete action button/element override
    customRender?: (item: T, onClick: (e: React.MouseEvent) => void) => React.ReactNode;
}

export interface CustomTableSettings {
    // Action rendering settings
    actionsClassName?: string;
    actionButtonClassName?: string;
    actionButtonSize?: "sm" | "default" | "lg" | "icon";
    
    // Table appearance settings
    tableClassName?: string;
    tableHeaderClassName?: string;
    tableBodyClassName?: string;
    tableRowClassName?: string;
    useZebraStripes?: boolean;
    
    // Pagination settings
    hideEntriesInfo?: boolean;
    
    // Custom column rendering overrides  
    customColumnRender?: {
        [key: string]: (item: any, index: number) => React.ReactNode;
    }
}

interface GenericDataTableProps<T> {
    items: T[];
    filteredItems: T[];
    paginatedItems: T[];
    isLoading: boolean;
    
    // Column configuration
    columns: ColumnConfig<T>[];
    idField: keyof T;
    iconField?: {
        key: keyof T;
        renderIcon: (item: T) => React.ReactNode;
    };
    labelField: keyof T;
    hiddenColumns?: string[];  // ADDED: List of column keys to hide
    
    // Status badges
    statusBadge?: StatusBadgeConfig;
    
    // Empty state
    emptyState: {
        icon: React.ReactNode;
        title: string;
        description: string;
        buttonText: string;
        onButtonClick: () => void;
    };
    
    // Table settings
    title: string;
    headerActions: React.ReactNode[];
    
    // Row settings
    onRowClick?: (item: T) => void;
    
    // Sort settings
    sortBy: string;
    sortDirection: "asc" | "desc";
    onSortChange: (field: string) => void;
    
    // Actions config
    actions: ActionConfig<T>[];
    
    // Pagination settings
    totalItems: number;
    itemsPerPage: number;
    currentPage: number;
    onPageChange: (page: number) => void;
    onItemsPerPageChange: (items: number) => void;
    defaultPageSize?: number;  // ADDED: Default number of rows per page
    
    // Advanced customization
    customSettings?: CustomTableSettings;
    hideTableHeader?: boolean;
    hideActionsColumn?: boolean;
    hideStatusColumn?: boolean;
    hideIconColumn?: boolean;
    hideTableFooter?: boolean;
    
    // Custom rendering options
    renderHeader?: (columns: ColumnConfig<T>[]) => React.ReactNode;
    renderRow?: (item: T, index: number, columns: ColumnConfig<T>[]) => React.ReactNode;
    renderCell?: (item: T, column: ColumnConfig<T>, index: number) => React.ReactNode;
}

export default function GenericDataTable<T>({
    items,
    filteredItems,
    paginatedItems,
    isLoading,
    columns,
    idField,
    iconField,
    labelField,
    hiddenColumns = [],
    statusBadge,
    emptyState,
    title,
    headerActions,
    onRowClick,
    sortBy,
    sortDirection,
    onSortChange,
    actions,
    totalItems,
    itemsPerPage,
    currentPage,
    onPageChange,
    onItemsPerPageChange,
    defaultPageSize = 10,
    customSettings,
    hideTableHeader = false,
    hideActionsColumn = false,
    hideStatusColumn = false,
    hideIconColumn = false,
    hideTableFooter = false,
    renderHeader,
    renderRow,
    renderCell,
}: GenericDataTableProps<T>) {
    // Confirmation dialog state
    const [itemToAction, setItemToAction] = useState<T | null>(null);
    const [currentAction, setCurrentAction] = useState<ActionConfig<T> | null>(null);
    const [isActionLoading, setIsActionLoading] = useState(false);
    
    // Set default page size if specified
    useEffect(() => {
        if (defaultPageSize && defaultPageSize !== itemsPerPage) {
            onItemsPerPageChange(defaultPageSize);
        }
    }, [defaultPageSize]);

    // Apply hidden columns to the columns config
    const visibleColumns = columns.filter(col => 
        !col.hidden && !hiddenColumns.includes(col.key)
    );

    // Render status badge
    const renderStatusBadge = (item: T) => {
        if (!statusBadge) return null;
        
        const key = statusBadge.key;
        const isDirtyKey = statusBadge.isDirtyKey;
        const isLocalKey = statusBadge.isLocalKey;
        const isPublicKey = statusBadge.isPublicKey;
        // Status keys are declared as `keyof any` because this table is generic
        // over an unconstrained `T` — read them through a dynamic-key view
        // rather than indexing `T` directly (which cannot statically prove the
        // key exists on every instantiation of T).
        const itemFields = item as Record<PropertyKey, unknown>;

        if (isDirtyKey && itemFields[isDirtyKey]) {
            return (
                <Badge
                    variant="outline"
                    className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                >
                    Unsaved
                </Badge>
            );
        } else if (isLocalKey && itemFields[isLocalKey]) {
            return (
                <Badge
                    variant="outline"
                    className="bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400"
                >
                    Local
                </Badge>
            );
        } else if (isPublicKey && itemFields[isPublicKey]) {
            return (
                <Badge
                    variant="outline"
                    className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                >
                    Public
                </Badge>
            );
        } else {
            return (
                <Badge variant="outline" className="bg-gray-50 dark:bg-gray-900/20">
                    Private
                </Badge>
            );
        }
    };
    
    // Render sort indicator
    const renderSortIndicator = (field: string) => {
        return sortBy === field ? (
            <span className="ml-1 inline-block w-4 text-center">
                {sortDirection === "asc" ? "↑" : "↓"}
            </span>
        ) : null;
    };
    
    // Render column header
    const renderColumnHeader = (column: ColumnConfig<T>) => {
        if (column.hidden || hiddenColumns.includes(column.key)) return null;
        
        const headerContent = (
            <div className="flex items-center space-x-1 justify-center">
                <span>{column.header}</span>
                {column.sortable && renderSortIndicator(column.key)}
            </div>
        );
        
        return (
            <TableHead 
                key={column.key}
                className={`${column.width || ''} ${column.className || ''} ${
                    column.sortable 
                        ? 'cursor-pointer hover:text-blue-600 dark:hover:text-blue-400' 
                        : ''
                } ${customSettings?.tableHeaderClassName || ''}`}
                onClick={() => column.sortable && onSortChange(column.key)}
            >
                {headerContent}
            </TableHead>
        );
    };
    
    // Handle action click
    const handleActionClick = (item: T, action: ActionConfig<T>, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row click from triggering
        
        if (action.requiresConfirmation && action.confirmationProps) {
            setItemToAction(item);
            setCurrentAction(action);
        } else {
            // Execute action immediately if no confirmation required
            action.onClick(item, e);
        }
    };
    
    // Handle confirmed action
    const handleConfirmedAction = async () => {
        if (!itemToAction || !currentAction) return;
        
        try {
            setIsActionLoading(true);
            // Create a synthetic event (not used in most cases but included for compatibility)
            const syntheticEvent = { 
                stopPropagation: () => {}, 
                preventDefault: () => {} 
            } as React.MouseEvent;
            
            await currentAction.onClick(itemToAction, syntheticEvent);
            setItemToAction(null);
            setCurrentAction(null);
        } catch (error) {
            console.error("Failed to execute action:", error);
        } finally {
            setIsActionLoading(false);
        }
    };
    
    // Determine if we should show the actions column
    const showActionsColumn = !hideActionsColumn && actions.length > 0;
    
    // Determine if we should show the status column
    const showStatusColumn = !hideStatusColumn && statusBadge;
    
    // Determine if we should show the icon column
    const showIconColumn = !hideIconColumn && iconField;
    
    // Render action buttons
    const renderActionButtons = (item: T) => {
        return (
            <div className={`flex justify-end space-x-1 ${customSettings?.actionsClassName || ''}`}>
                {actions.map((action, actionIndex) => {
                    // Skip if the action has a show condition and it's false
                    if (action.showCondition && !action.showCondition(item)) {
                        return null;
                    }
                    
                    // Use custom render function if provided
                    if (action.customRender) {
                        return action.customRender(
                            item, 
                            (e) => handleActionClick(item, action, e)
                        );
                    }
                    
                    // Use badge style if specified
                    if (action.badgeStyle) {
                        return (
                            <Button
                                key={actionIndex}
                                variant="ghost"
                                size={customSettings?.actionButtonSize || "sm"}
                                onClick={(e) => handleActionClick(item, action, e)}
                                className={`opacity-70 group-hover:opacity-100 p-0 h-8 ${action.className || ''} ${customSettings?.actionButtonClassName || ''}`}
                            >
                                <Badge 
                                    variant={action.badgeVariant || "outline"} 
                                    className={action.badgeClassName || "bg-blue-50 dark:bg-blue-900/20 border-blue-500"}
                                >
                                    {action.label || 'Select'}
                                </Badge>
                            </Button>
                        );
                    }
                    
                    // Default icon button
                    return (
                        <Button
                            key={actionIndex}
                            variant="ghost"
                            size={customSettings?.actionButtonSize || "sm"}
                            onClick={(e) => handleActionClick(item, action, e)}
                            className={`opacity-70 group-hover:opacity-100 p-1 h-8 w-8 ${action.className || ''} ${customSettings?.actionButtonClassName || ''}`}
                        >
                            {action.icon}
                        </Button>
                    );
                })}
            </div>
        );
    };
    
    // Render table cell content
    const renderCellContent = (item: T, column: ColumnConfig<T>, index: number) => {
        // Use custom render function if provided at the table level
        if (renderCell) {
            return renderCell(item, column, index);
        }
        
        // Use custom column render from settings if provided
        if (customSettings?.customColumnRender?.[column.key]) {
            return customSettings.customColumnRender[column.key](item, index);
        }
        
        // Use column's render function if provided
        if (column.render) {
            return column.render(item, index);
        }
        
        // Default rendering
        return String(item[column.key as keyof T] || '');
    };
    
    return (
        <StructuredSectionCard 
            title={title} 
            headerActions={headerActions} 
        >
            {isLoading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                </div>
            ) : items.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                    {emptyState.icon}
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{emptyState.title}</h3>
                    <p className="text-gray-500 dark:text-gray-400 mb-4 max-w-md">
                        {emptyState.description}
                    </p>
                    <Button onClick={emptyState.onButtonClick}>{emptyState.buttonText}</Button>
                </div>
            ) : (
                <div className="overflow-auto">
                    <Table className={customSettings?.tableClassName || ''}>
                        {!hideTableHeader && (
                            <TableHeader className={customSettings?.tableHeaderClassName || ''}>
                                {renderHeader ? (
                                    renderHeader(visibleColumns)
                                ) : (
                                    <TableRow>
                                        {showIconColumn && (
                                            <TableHead className="w-[50px]">Icon</TableHead>
                                        )}
                                        
                                        {visibleColumns.map(renderColumnHeader)}
                                        
                                        {showStatusColumn && (
                                            <TableHead className="w-[120px] text-center">Status</TableHead>
                                        )}
                                        
                                        {showActionsColumn && (
                                            <TableHead className="w-[120px] text-right pr-2">Actions</TableHead>
                                        )}
                                    </TableRow>
                                )}
                            </TableHeader>
                        )}
                        <TableBody className={customSettings?.tableBodyClassName || ''}>
                            {paginatedItems.map((item, index) => (
                                renderRow ? (
                                    renderRow(item, index, visibleColumns)
                                ) : (
                                    <TableRow
                                        key={String(item[idField])}
                                        className={`group ${onRowClick ? 'cursor-pointer' : ''} hover:bg-gray-50 dark:hover:bg-gray-900/20 ${
                                            customSettings?.useZebraStripes && index % 2 === 1 ? "bg-gray-50 dark:bg-gray-900/10" : ""
                                        } ${customSettings?.tableRowClassName || ''}`}
                                        onClick={() => onRowClick && onRowClick(item)}
                                    >
                                        {showIconColumn && (
                                            <TableCell className="font-medium">
                                                <div className="flex items-center justify-center">
                                                    {iconField.renderIcon(item)}
                                                </div>
                                            </TableCell>
                                        )}
                                        
                                        {visibleColumns.map((column) => (
                                            <TableCell key={column.key} className={column.className}>
                                                {renderCellContent(item, column, index)}
                                            </TableCell>
                                        ))}
                                        
                                        {showStatusColumn && (
                                            <TableCell className="text-center">
                                                {renderStatusBadge(item)}
                                            </TableCell>
                                        )}
                                        
                                        {showActionsColumn && (
                                            <TableCell className="text-right p-0 pr-2">
                                                {renderActionButtons(item)}
                                            </TableCell>
                                        )}
                                    </TableRow>
                                )
                            ))}
                        </TableBody>
                    </Table>
                    
                    {/* Pagination Footer */}
                    {!hideTableFooter && filteredItems.length > 0 && (
                        <GenericTablePagination
                            totalItems={totalItems}
                            itemsPerPage={itemsPerPage}
                            currentPage={currentPage}
                            onPageChange={onPageChange}
                            onItemsPerPageChange={onItemsPerPageChange}
                            pageSizeOptions={[5, 10, 25, 50, 100]}
                            hideEntriesInfo={customSettings?.hideEntriesInfo}
                        />
                    )}
                </div>
            )}
            
            {/* Confirmation Dialog */}
            {currentAction?.confirmationProps && (
                <ConfirmDialog
                    open={!!itemToAction}
                    onOpenChange={(open) => !open && setItemToAction(null)}
                    onConfirm={handleConfirmedAction}
                    busy={isActionLoading}
                    variant="destructive"
                    title={itemToAction ? currentAction.confirmationProps.getTitle(itemToAction) : ''}
                    description={itemToAction ? currentAction.confirmationProps.getDescription(itemToAction) : ''}
                    confirmLabel={currentAction.confirmationProps.confirmButtonText}
                />
            )}
        </StructuredSectionCard>
    );
}