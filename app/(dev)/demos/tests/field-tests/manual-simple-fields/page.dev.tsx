// File: app/(authenticated)/tests/field-tests/manual-simple-fields/page.tsx
"use client";

import SimpleFields from "@/features/applet/runner/fields/core/SimpleFields";
import { normalizeFieldDefinition } from "@/types/customAppTypes";
import { ReactNode } from "react";
import { useFieldsWithBrokers } from "@/lib/redux/brokerSlice/hooks/useTempBroker";

type ComponentType =
    | "input"
    | "textarea"
    | "buttonSelection"
    | "buttonColumn"
    | "draggableTable"
    | "draggableEditableTable"
    | "dragEditModifyTable"
    | "dragTableRowAndColumn"
    | "select"
    | "multiselect"
    | "radio"
    | "checkbox"
    | "slider"
    | "number"
    | "date"
    | "switch"
    | "rangeSlider"
    | "numberInput"
    | "numberPicker"
    | "jsonField"
    | "fileUpload"
    | "searchableSelect"
    | "directMultiSelect"
    | "multiDate"
    | "simpleNumber"
    | "sortable"
    | "tagInput"
    | "dependentDropdown"
    | "addressBlock"
    | "starRating"
    | "phoneNumber"
    | "stepperNumber"
    | "multiSearchableSelect"
    | "conceptBrokerOptions";

type fieldDirection = "vertical" | "horizontal";

interface TableRules {
    canAddRows?: boolean;
    canDeleteRows?: boolean;
    canAddColumns?: boolean;
    canDeleteColumns?: boolean;
    canEditCells?: boolean;
    canRenameColumns?: boolean; // For column headers
    canSortRows?: boolean;
    canSortColumns?: boolean;
}

interface FieldOption {
    id: string; // Typically used for the value of the option.
    label: string; // Used as the human readable label for the option.
    description?: string; // This is where the 'context' is stored for the ai model. NOT SHOWN TO THE USER!
    helpText?: string; // Seen by the user.
    iconName?: string; // Icon name from lucide-react.
    parentId?: string; // Used to create a hierarchy of options.
    metadata?: any; // Used to store any additional data for the option.
    order?: number; // Used to sort the options.
    [key: string]: any; // Extensibility for future needs
}

interface ComponentProps {
    min: number;
    max: number;
    step: number;
    rows: number;
    minDate: string;
    maxDate: string;
    onLabel: string;
    offLabel: string;
    multiSelect: boolean;
    maxItems: number;
    minItems: number;
    gridCols: string;
    autoComplete: string;
    direction: fieldDirection;
    customContent: ReactNode;
    showSelectAll: boolean;
    width: string;
    valuePrefix: string;
    valueSuffix: string;
    maxLength: number;
    spellCheck: boolean;
    tableRules: TableRules;
}

interface FieldDefinition {
    id: string;
    label: string;
    description: string;
    helpText: string;
    component: ComponentType;
    required: boolean;
    placeholder: string;
    componentProps: ComponentProps;
    includeOther: boolean;
    group?: string;
    iconName?: string;
    defaultValue?: any;
    options?: FieldOption[];
}

type SimpleField = {
    id: string; // Required
    component: ComponentType; // Required
    label?: string;
    description?: string;
    helpText?: string;
    required?: boolean;
    placeholder?: string;
    includeOther?: boolean;
    group?: string;
    iconName?: string;
    defaultValue?: any;
    options?: FieldOption[];
    componentProps?: Partial<ComponentProps>;
};

type BrokerIdentifier =
    | { brokerId: string; source?: string; mappedItemId?: string }
    | { source: string; mappedItemId: string; brokerId?: string };

interface BrokerMapEntry {
    brokerId: string;
    mappedItemId: string;
    source: string;
    sourceId: string;
}

export default function ManualSimpleFields() {
    const source = "test-source";
    const sourceId = "test-source-1";
    
    const fields = [
        {
            label: "Test Field 1",
            component: "textarea" as const,
        },
        {
            label: "Test Field 2",
            component: "input" as const,
        },
        {
            label: "Test Field 3",
            component: "select" as const,
            options: [
                {
                    id: "test-option-1",
                    label: "Test Option 1",
                },
                {
                    id: "test-option-2",
                    label: "Test Option 2",
                },
                {
                    id: "test-option-3",
                    label: "Test Option 3",
                },
            ],
        },
    ];

    // Use the new simplified hook
    const result = useFieldsWithBrokers(fields, source, sourceId);

    return (
        <div className="flex flex-col h-full">
            {result && (
                <div className="flex-shrink-0">
                    <SimpleFields fields={result.fields} source={result.source} sourceId={result.sourceId} />
                </div>
            )}

            <div className="flex-1 mt-4">
                <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Normalized Fields Data</h3>
                <div className="flex gap-2 h-full overflow-auto">
                    {result?.fields.map((field, index) => (
                        <div key={field.id} className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{field.label || field.id}</h4>
                            <pre className="p-2 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-xs overflow-auto h-full border border-gray-300 dark:border-gray-600 rounded">
                                {JSON.stringify(field, null, 2)}
                            </pre>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
