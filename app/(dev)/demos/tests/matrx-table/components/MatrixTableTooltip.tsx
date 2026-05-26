// app/(authenticated)/tests/matrx-table/components/MatrixTableTooltip.tsx

"use client"

import React from 'react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"

interface MatrixTableTooltipProps {
    content: React.ReactNode;
    children: React.ReactNode;
    side?: 'top' | 'bottom' | 'left' | 'right';
    sideOffset?: number;
}

const MatrixTableTooltip: React.FC<MatrixTableTooltipProps> = (
    {
        content,
        children,
        side = 'top',
        sideOffset = 4
    }) => {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    {children}
                </TooltipTrigger>
                <TooltipContent side={side} sideOffset={sideOffset}>
                    {content}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};

export default MatrixTableTooltip;
