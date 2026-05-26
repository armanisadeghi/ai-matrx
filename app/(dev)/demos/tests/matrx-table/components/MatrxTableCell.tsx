'use client';

import React from "react";
import {Cell} from "react-table";
import {TableData} from "@/types/tableTypes";
import {TableCell} from "@/components/ui/table";
import {TableActionIcon} from "./MatrixTableActions";
import {truncateText} from "./StandardTabUtil";
import { motion } from "motion/react";
import MatrixTableTooltip from "./MatrixTableTooltip";


const MatrxTableCell: React.FC<{
    cell: Cell<TableData>;
    actions: string[];
    rowData: TableData;
    onAction: (actionName: string, rowData: TableData) => void;
    truncateAt: number;
}> = ({cell, actions, rowData, onAction, truncateAt}) => {
    if (cell.column.id === 'actions') {
        return (
            <TableCell className="text-card-foreground">
                <div className="flex items-center space-x-1">
                    {actions.map((actionName, index) => (
                        <TableActionIcon
                            key={index}
                            actionName={actionName}
                            data={rowData}
                            onAction={onAction}
                        />
                    ))}
                </div>
            </TableCell>
        );
    }

    const cellContent = truncateText(cell.value, truncateAt);

    const { key: cellKey, ...cellProps } = cell.getCellProps();

    return (
        <TableCell key={cellKey} {...cellProps} className="text-card-foreground">
            <MatrixTableTooltip content={cell.value} side="top">
                <motion.div
                    initial={false}
                    animate={{
                        scale: 1,
                        transition: {type: "spring", stiffness: 300, damping: 10},
                    }}
                >
                    {cellContent}
                </motion.div>
            </MatrixTableTooltip>
        </TableCell>
    );
};

export default MatrxTableCell;
