'use client';

import React from "react";
import {Edit, Eye, Maximize2, Trash} from "lucide-react";
import MatrxTooltip from "@/components/matrx/MatrxTooltip";
import {Button} from "@/components/ui/button";
import {ActionDefinition} from "@/types/tableTypes";
// @ts-ignore - TableData declared locally but not exported, using any for now
type TableData = any;

export const actionDefinitions: Record<string, ActionDefinition> = {
    edit: {
        name: 'edit',
        label: "Edit this item.tsx",
        icon: <Edit className="h-3 w-3"/>,
        className: "text-primary hover:bg-primary hover:text-primary-foreground",
    },
    delete: {
        name: 'delete',
        label: "Delete this item.tsx",
        icon: <Trash className="h-4 w-4"/>,
        className: "text-destructive hover:bg-destructive hover:text-destructive-foreground",
    },
    view: {
        name: 'view',
        label: "View this item.tsx",
        icon: <Eye className="h-4 w-4"/>,
        className: "text-primary hover:bg-secondary hover:text-secondary-foreground",
    },
    expand: {
        name: 'expand',
        label: "Expand view",
        icon: <Maximize2 className="h-4 w-4"/>,
        className: "text-secondary hover:bg-secondary hover:text-secondary-foreground",
    },
};

export const TableActionIcon: React.FC<{
    actionName: string;
    data: TableData;
    onAction: (actionName: string, data: TableData) => void;
}> = ({actionName, data, onAction}) => {
    const action = actionDefinitions[actionName];
    if (!action) return null;

    const {name, label, icon, className} = action;

    return (
        <MatrxTooltip content={label} placement="left">
            <Button
                onClick={(e) => {
                    e.stopPropagation();
                    onAction(name, data);
                }}
                size="sm"
                variant="ghost"
                className={`p-1 ${className || "transition-all duration-300 hover:scale-105"}`}
            >
                {React.cloneElement(icon as React.ReactElement, {className: 'w-3 h-3'} as any)}
            </Button>
        </MatrxTooltip>
    );
};

