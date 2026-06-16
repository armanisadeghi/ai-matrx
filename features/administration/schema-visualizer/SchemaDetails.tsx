// features/administration/schema-visualizer/SchemaDetails.tsx
// Standalone details panel — reads schema overview via React Query.

"use client";

import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { useSchemaVisualizerStore } from "./store";
import { useSchemaQuery } from "./hooks/useSchemaQuery";
import { TableDetails } from "./Details/TableDetails";
import { FieldDetails } from "./Details/FieldDetails";
import { RelationshipDetails } from "./Details/RelationshipDetails";

export function SchemaDetails() {
    const { selectedElement, isDetailsOpen, setDetailsOpen } =
        useSchemaVisualizerStore();
    const { data: overview } = useSchemaQuery();

    if (!selectedElement) return null;

    const table = overview?.tables?.[selectedElement.tableName];

    const panelTitle =
        selectedElement.type === "table"
            ? "Table Details"
            : selectedElement.type === "field"
              ? "Field Details"
              : "Relationship Details";

    const renderContent = () => {
        if (!selectedElement.tableName || !table) return null;

        switch (selectedElement.type) {
            case "table":
                return <TableDetails table={table} />;
            case "field":
                return (
                    <FieldDetails
                        table={table}
                        fieldName={selectedElement.fieldName!}
                    />
                );
            case "relationship":
                return (
                    <RelationshipDetails
                        table={table}
                        relationshipIndex={selectedElement.relationshipIndex!}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <MatrxDynamicPanelHost
            open={isDetailsOpen}
            onOpenChange={setDetailsOpen}
            title={panelTitle}
            position="right"
            defaultSize={36}
            contentClassName="overflow-y-auto"
        >
            {renderContent()}
        </MatrxDynamicPanelHost>
    );
}
