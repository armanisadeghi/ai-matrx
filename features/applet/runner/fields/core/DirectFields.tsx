// File: features/applet/layouts/core/SimpleFields.tsx
"use client";
import React, { useEffect } from "react";
import FieldsWithLabels from "@/features/applet/runner/fields/core/FieldsWithlabels";
import { FieldDefinition } from "@/types/customAppTypes";
import { useFieldsWithBrokers } from "@/lib/redux/brokerSlice/hooks/useTempBroker";
import { brokerSelectors } from "@/lib/redux/brokerSlice";
import { useAppSelector } from "@/lib/redux/hooks";

interface DirectFieldsProps {
    fields: Partial<FieldDefinition> | Partial<FieldDefinition>[];
    sourceId?: string;
    source?: string;
    isMobile?: boolean;
    className?: string;
    showLabels?: boolean;
    labelPosition?: "top" | "left" | "right";
    onFieldResults?: (result: { source: string; sourceId: string; fields: FieldDefinition[] | undefined }) => void;
}

export const DirectFields: React.FC<DirectFieldsProps> = ({
    fields,
    sourceId = "direct-source-1",
    source = "direct",
    isMobile = false,
    className = "",
    showLabels = true,
    labelPosition = "top",
    onFieldResults,
}) => {
    const fieldArray = Array.isArray(fields) ? fields : [fields];
    const result = useFieldsWithBrokers(fieldArray, source, sourceId);

    useEffect(() => {
        if (!result) return;
        if (onFieldResults) {
            onFieldResults(result);
        }
    }, [result]);

    if (!result) return null;

    return (
        <FieldsWithLabels
            fields={result?.fields}
            sourceId={result?.sourceId}
            isMobile={isMobile}
            source={result?.source}
            className={className}
            showLabels={showLabels}
            labelPosition={labelPosition}
        />
    );
};

interface DirectFieldValueProps {
    field: FieldDefinition;
    source: string;
    className?: string;
}

export const DirectFieldValue: React.FC<DirectFieldValueProps> = ({ field, source, className = "" }) => {
    // const brokerId = useAppSelector((state) => brokerSelectors.selectBrokerId(state, { source, mappedItemId: field.id }));
    // const stateValue = useAppSelector((state) => brokerSelectors.selectValue(state, brokerId));

    const stateValue = useAppSelector((state) => brokerSelectors.selectValueWithoutBrokerId(state, { source, mappedItemId: field.id }));

    // Simple rendering logic
    const renderValue = (value: any) => {
        if (value === null) return "";
        if (value === undefined) return "";
        
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }
        
        return (
            <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-1 rounded overflow-auto">
                {JSON.stringify(value, null, 2)}
            </pre>
        );
    };

    return <div className={className}>{renderValue(stateValue)}</div>;
};

interface DirectFieldValuesProps {
    fields: FieldDefinition | FieldDefinition[];
    source: string;
    className?: string;
}

export const DirectFieldValues: React.FC<DirectFieldValuesProps> = ({ fields, source, className = "" }) => {
    const fieldArray = Array.isArray(fields) ? fields : [fields];

    return (
        <div className={`grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 bg-textured border-border rounded-lg p-4 ${className}`}>
            {fieldArray?.map((field) => (
                <React.Fragment key={field.id}>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300 py-1 pr-2 border-r border-border">
                        {field.label}
                    </div>
                    <div className="py-1">
                        <DirectFieldValue field={field} source={source} className="" />
                    </div>
                </React.Fragment>
            ))}
        </div>
    );
};
