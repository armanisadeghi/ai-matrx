// File: app/(authenticated)/tests/field-tests/direct-fields/page.tsx
"use client";

import { DirectFields, DirectFieldValues } from "@/features/applet/runner/fields/core/DirectFields";
import { FieldDefinition } from "@/types/customAppTypes";
import { useState } from "react";
import FieldDefinitionTable from "./FieldDefinitionTable";

export default function DirectFieldsPage() {
    const [fields, setFields] = useState<FieldDefinition[] | undefined>(undefined);
    const [source, setSource] = useState("test-source");
    const [sourceId, setSourceId] = useState("test-source-1");

    const initialFields = [
        {
            label: "Test Field 1",
            component: "textarea" as const,
            helpText: "This is a test field",
        },
        {
            label: "Test Field 2",
            component: "input" as const,
        },
        {
            label: "Upload Medical File PDF",
            component: "fileUpload" as const,
            helpText: "Provide the full medical report in PDF format",
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

    const handleFieldResults = (result: { source: string; sourceId: string; fields: FieldDefinition[] | undefined }) => {
        if (!result.fields) return;
        setFields(result.fields);
        setSource(result.source);
        setSourceId(result.sourceId);
    };

    return (
        <div className="flex flex-col h-full p-4">
            <div className="flex-shrink-0">
                <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Field Demo</h3>
                <DirectFields fields={initialFields} source={source} sourceId={sourceId} onFieldResults={handleFieldResults} />
            </div>

            {fields && fields.length > 0 && (
                <>
                    <hr className="border-gray-300 dark:border-gray-600 my-4" />
                    <div className="flex-shrink-0">
                        <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Live Field Values</h3>
                        <DirectFieldValues fields={fields} source={source} />
                    </div>
                </>
            )}

            <hr className="border-gray-300 dark:border-gray-600 my-4" />
            <div className="flex-1 mt-4">
                <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Normalized Fields Data</h3>
                
                {fields && fields.length > 0 && (
                    <div className="mb-4">
                        <FieldDefinitionTable fields={fields} />
                    </div>
                )}
                
                <div className="flex gap-2 h-full overflow-auto">
                    {fields?.map((field, index) => (
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
