// components/json-viewer/renderers.tsx

import React from 'react';
import { cn } from '@/lib/utils';
import { formatValue, getValueColorClass } from './utils';
import type { JsonValue } from '@/types/json';

interface ArrayItemProps {
    item: JsonValue;
    itemPath: string;
    index: number;
    isLastItem: boolean;
    disabled: boolean;
}

export const ArrayItem: React.FC<ArrayItemProps> = ({
    item,
    itemPath,
    index,
    isLastItem,
    disabled
}) => {
    if (typeof item !== 'object' || item === null) {
        return (
            <div className={cn(
                "pl-4 py-1",
                !isLastItem && "border-b border-border/30"
            )}>
                <span className={cn("text-md", getValueColorClass(item, disabled))}>
                    {formatValue(item)}
                </span>
            </div>
        );
    }
    return null;  // Object items are handled by the main component
};

interface InlineArrayProps {
    arr: JsonValue[];
    disabled: boolean;
}

export const InlineArray: React.FC<InlineArrayProps> = ({ arr, disabled }) => {
    return (
        <span className="text-blue-500">
            [
            {arr.map((item, index) => (
                <React.Fragment key={index}>
                    <span className={cn("text-md", getValueColorClass(item, disabled))}>
                        {formatValue(item)}
                    </span>
                    {index < arr.length - 1 && ", "}
                </React.Fragment>
            ))}
            ]
        </span>
    );
};

export const ValueDisplay: React.FC<{ value: JsonValue; disabled: boolean }> = ({ value, disabled }) => {
    return (
        <span className={cn("text-md", getValueColorClass(value, disabled))}>
            {formatValue(value)}
        </span>
    );
};
