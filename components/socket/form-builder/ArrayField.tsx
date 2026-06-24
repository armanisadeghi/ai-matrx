import React, { useState, useEffect, useMemo } from "react";
import { FancyInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Files, Plus, Trash } from "lucide-react";
import DynamicIcon from "@/components/official/icons/DynamicIcon.dynamic";
import { formatLabel, formatPlaceholder } from "../utils/label-util";
import { SchemaField } from "@/constants/socket-schema";

interface ArrayFieldProps {
    fieldKey: string;
    field: SchemaField;
    fullPath: string;
    value: any[];
    hasError: boolean;
    onChange: (key: string, value: any) => void;
    onBlur: (key: string, field: SchemaField, value: any) => void;
}

const ArrayField: React.FC<ArrayFieldProps> = ({ fieldKey, field, fullPath, value: externalValue = [], hasError, onChange, onBlur }) => {
    // Initialize internal state with at least one item if externalValue is empty
    const [internalValue, setInternalValue] = useState<any[]>(externalValue.length > 0 ? externalValue : [""]);

    // Sync internal state with external value, ensuring at least one item
    useEffect(() => {
        setInternalValue(externalValue.length > 0 ? externalValue : [""]);
    }, [externalValue]);

    // Handle changing a specific item in the array
    const handleItemChange = (index: number, newValue: string) => {
        const updatedValues = [...internalValue];
        updatedValues[index] = newValue;
        setInternalValue(updatedValues);
    };

    // Handle removing an item, ensuring at least one item remains
    const handleRemoveItem = (index: number) => {
        if (internalValue.length <= 1) {
            // If only one item exists, don't remove it, just clear it
            const updatedValues = [""];
            setInternalValue(updatedValues);
            onChange(fullPath, updatedValues);
        } else {
            // Remove the item as usual
            const updatedValues = internalValue.filter((_, i) => i !== index);
            setInternalValue(updatedValues);
            onChange(fullPath, updatedValues);
        }
    };

    // Handle adding a new item
    const handleAddItem = () => {
        const updatedValues = [...internalValue, ""];
        setInternalValue(updatedValues);
        onChange(fullPath, updatedValues);
    };

    // When an item loses focus, send all changes to parent
    const handleItemBlur = () => {
        onChange(fullPath, internalValue);
        onBlur(fullPath, field, internalValue);
    };

    // Get the appropriate icon based on iconName in the field or use a default
    const getIcon = useMemo(() => {
        const iconName = field.ICON_NAME || "Files";
        const Icon = (props: any) => <DynamicIcon name={iconName} fallbackIcon="Files" {...props} />;
        return <Icon className="w-4 h-4" />;
    }, [field.ICON_NAME]);

    // Memoize the rendered items to prevent unnecessary re-renders
    const renderedItems = useMemo(() => {
        return internalValue.map((item, index) => (
            <div key={`${fullPath}[${index}]`} className="flex items-center gap-2 w-full">
                <FancyInput
                    type="text"
                    prefix={getIcon}
                    value={item || ""}
                    onChange={(e) => handleItemChange(index, e.target.value)}
                    onBlur={handleItemBlur}
                    className={`w-full bg-gray-100 dark:bg-gray-800 ${hasError ? "border-red-500" : ""}`}
                    wrapperClassName="w-full"
                    placeholder={`${formatPlaceholder(fieldKey)} item ${index + 1}`}
                />
                <Button variant="destructive" size="sm" onClick={() => handleRemoveItem(index)}>
                    <Trash className="w-4 h-4" />
                </Button>
            </div>
        ));
    }, [internalValue, fullPath, hasError, fieldKey, getIcon]);

    return (
        <div className="grid grid-cols-12 gap-4 mb-4 w-full">
            <Label className="col-span-1 text-sm font-medium">
                <div className="flex items-start gap-1">
                    <span className="text-slate-700 dark:text-slate-300">{formatLabel(fieldKey)}</span>
                    {field.REQUIRED && <span className="text-red-500 text-sm leading-none">*</span>}
                </div>
            </Label>
            <div className="col-span-11 w-full">
                <div className="space-y-2 w-full">
                    {renderedItems}
                    <Button
                        onClick={handleAddItem}
                        variant="outline"
                        className="border-gray-500 text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 rounded-lg"
                    >
                        <Plus className="w-5 h-5 mr-1" />
                        Add {formatLabel(fieldKey)}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ArrayField;
