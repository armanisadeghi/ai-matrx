"use client";

import React, { useMemo } from "react";
import SectionCard from "@/components/official/cards/SectionCard";
import { ComponentType } from "@/types/customAppTypes";
import { useAppSelector } from "@/lib/redux/hooks";
import { useThemeMode } from "@/styles/themes/useThemeMode";
import { selectFieldById } from "@/lib/redux/app-builder/selectors/fieldSelectors";
import FieldPreviewAs from "./FieldPreviewAs";
import { componentOptions } from "@/features/applet/constants/field-constants";
import FieldContainerPreview from "./FieldContainerPreview";
import { usePreviewBrokers } from "@/lib/redux/brokerSlice/hooks/useTempBroker";
import { ThemeSwitcherMinimal } from "@/styles/themes/ThemeSwitcher";

interface FieldPreviewProps {
    fieldId: string;
    componentType: ComponentType | null;
}

const FieldPreview: React.FC<FieldPreviewProps> = ({ fieldId, componentType = "textarea" }) => {
    const field = useAppSelector((state) => selectFieldById(state, fieldId));
    const mode = useThemeMode();

    // Memoize component type values to prevent recreation on every render
    const componentTypeValues = useMemo(() =>
        componentOptions.map(option => option.value),
        []
    );

    // Use the new usePreviewBrokers hook
    const brokerResult = usePreviewBrokers(fieldId, componentTypeValues);

    if (!field || !brokerResult) {
        return (
            <SectionCard title="Component Preview" color="gray" spacing="relaxed">
                <div className="mt-6 p-4 text-center text-gray-500 dark:text-gray-400">Loading preview...</div>
            </SectionCard>
        );
    }

    // Get the broker identifier for the current component type
    const identifier = brokerResult.getIdentifier(componentType);

    return (
        <SectionCard
            titleNode={
                <div className="flex justify-between items-center w-full">
                    <h3 className="text-md font-semibold capitalize text-gray-900 dark:text-gray-100">
                        Your New <span className="text-blue-600 dark:text-blue-500 font-bold">{componentType}</span>
                    </h3>
                    <ThemeSwitcherMinimal
                        text={mode === 'dark' ? 'See it in light mode' : 'See it in dark mode'}
                        className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                    />
                </div>
            }
            color="gray"
            spacing="relaxed"
        >
            {/* Current component preview */}
            <div className="mt-6 mb-8 border border-border rounded p-4 bg-textured shadow-sm rounded-xl min-h-[250px]">
                {/* Use FieldContainerPreview instead of fieldController directly */}
                {componentType && (
                    <FieldContainerPreview
                        fields={[
                            {
                                ...field,
                                component: componentType,
                                id: identifier.mappedItemId,
                            },
                        ]}
                        appletId={brokerResult.sourceId}
                        source="preview"
                    />
                )}
            </div>

            <FieldPreviewAs fieldId={fieldId} initialComponentType={componentType} />
        </SectionCard>
    );
};

export default FieldPreview;
