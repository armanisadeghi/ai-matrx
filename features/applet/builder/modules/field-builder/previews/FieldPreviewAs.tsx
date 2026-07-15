"use client";

import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import HelpIcon from "@/components/official/HelpIcon";
import { ComponentType } from "@/types/customAppTypes";
import { componentOptions, getCategorizedComponentOptions } from "@/features/applet/constants/field-constants";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFieldById } from "@/lib/redux/app-builder/selectors/fieldSelectors";
import FieldContainerPreview from "./FieldContainerPreview";
import { usePreviewBrokers } from "@/lib/redux/brokerSlice/hooks/useTempBroker";

interface FieldPreviewAsProps {
    fieldId: string;
    initialComponentType?: ComponentType | null;
}

const FieldPreviewAs: React.FC<FieldPreviewAsProps> = ({ fieldId, initialComponentType = "textarea" }) => {
    const [viewAsComponentType, setViewAsComponentType] = useState<ComponentType | null>(initialComponentType);
    const field = useAppSelector((state) => selectFieldById(state, fieldId));
    const categorizedComponentOptions = useMemo(() => getCategorizedComponentOptions(), []);
    const [selectedCategory, setSelectedCategory] = useState("Text");
    
    // Memoize component type values to prevent recreation on every render
    const componentTypeValues = useMemo(() => 
        componentOptions.map(option => option.value), 
        []
    );
    
    const brokerResult = usePreviewBrokers(fieldId, componentTypeValues);

    const handleComponentTypeChange = (newType: ComponentType) => {
        setViewAsComponentType(newType);
    };

    const handleCategoryChange = (category: string) => {
        setSelectedCategory(category);
        // Reset component type if it doesn't belong to the new category
        const categoryOptions = categorizedComponentOptions.find((cat) => cat.category === category)?.options || [];
        if (!categoryOptions.some((opt) => opt.value === viewAsComponentType)) {
            setViewAsComponentType(categoryOptions[0]?.value || null);
        }
    };

    if (!field || !brokerResult) {
        return <div className="mt-6 p-4 text-center text-gray-500 dark:text-gray-400">Loading preview...</div>;
    }

    // Get the broker identifier for the current component type
    const identifier = viewAsComponentType ? brokerResult.getIdentifier(viewAsComponentType) : null;

    // Get options for the selected category
    const currentCategoryOptions = categorizedComponentOptions.find(
        (cat) => cat.category === selectedCategory
    )?.options || [];

    return (
        <div className="space-y-4">
            {/* Component type selector */}
            <div className="space-y-3">
                <Label className="text-gray-900 dark:text-gray-100">View As Different Component Type</Label>
                <HelpIcon
                    text={
                        "Not all Fields will make sense for your specific settings, but we like to let you 'shop around' to find the best fit. notice that if you provide more values, your component can take on more forms, without breaking."
                    }
                />
                {/* Category Buttons */}
                <div className="flex flex-wrap gap-2">
                    {categorizedComponentOptions.map((cat) => (
                        <Button
                            key={cat.category}
                            variant={selectedCategory === cat.category ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleCategoryChange(cat.category)}
                            className={
                                selectedCategory === cat.category
                                    ? "bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-800 text-white"
                                    : "border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300"
                            }
                        >
                            {cat.category}
                        </Button>
                    ))}
                </div>
                {/* Component Buttons for Selected Category */}
                <div className="flex flex-wrap gap-2">
                    {currentCategoryOptions.map((option) => (
                        <Button
                            key={option.value}
                            variant={viewAsComponentType === option.value ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleComponentTypeChange(option.value)}
                            className={
                                viewAsComponentType === option.value
                                    ? "bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white"
                                    : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                            }
                        >
                            {option.label}
                        </Button>
                    ))}
                </div>
            </div>

            {viewAsComponentType && identifier && (
                <div className="border border-border rounded p-4 bg-textured shadow-sm rounded-xl min-h-[250px]">
                    <h3 className="text-md font-semibold mb-4 capitalize text-gray-900 dark:text-gray-100">
                        Rendered In Sample Container{"  "}
                    </h3>
                    <FieldContainerPreview 
                        fields={[
                            {
                                ...field,
                                component: viewAsComponentType,
                                id: identifier.mappedItemId
                            }
                        ]}
                        appletId={fieldId}
                        source="preview"
                    />
                </div>
            )}
        </div>
    );
};

export default FieldPreviewAs;
