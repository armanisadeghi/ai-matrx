// features/administration/schema-visualizer/SchemaNode.tsx
// Standalone schema node — renders a SchemaTable (no entity types).

import React, { memo } from "react";
// eslint-disable-next-line no-restricted-syntax -- inside the SchemaVisualizer dynamic(ssr:false) front-door gate (index.tsx); React Flow stays STATIC in-gate per the code-splitting skill (rule 3).
import { Handle, Position } from "reactflow";
import { Key } from "lucide-react";
import { ComponentIcon } from "./ComponentIcon";
import { useSchemaVisualizerStore } from "./store";
import type { SchemaNodeData, SchemaRelationship } from "./types-standalone";

type RelationshipType = SchemaRelationship["relationshipType"];

interface SchemaNodeProps {
    data: SchemaNodeData;
}

const relationshipTypes: Array<{ type: RelationshipType; title: string }> = [
    { type: "foreignKey", title: "Foreign Key" },
    { type: "manyToMany", title: "Many to Many" },
    { type: "inverseForeignKey", title: "Inverse Foreign Key" },
];

interface FieldRowProps {
    columnName: string;
    dataType: string;
    isPrimaryKey: boolean;
    tableName: string;
}

function FieldRow({ columnName, dataType, isPrimaryKey, tableName }: FieldRowProps) {
    const { setSelectedElement, setDetailsOpen } = useSchemaVisualizerStore();

    const handleFieldClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedElement({
            type: "field",
            tableName,
            fieldName: columnName,
        });
        setDetailsOpen(true);
    };

    return (
        <div
            onClick={handleFieldClick}
            className="flex items-center justify-between py-1 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer rounded px-2"
        >
            <div className="flex items-center gap-2">
                {isPrimaryKey && (
                    <Key className="w-4 h-4 text-amber-500" size={16} strokeWidth={2} />
                )}
                <ComponentIcon
                    dataType={dataType}
                    className="w-4 h-4 text-purple-500"
                    size={16}
                    strokeWidth={2}
                />
                <span className="text-gray-700 dark:text-gray-300 text-sm">
                    {columnName}
                </span>
            </div>
            <span className="text-gray-500 dark:text-gray-400 text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">
                {dataType}
            </span>
        </div>
    );
}

function SchemaNode({ data }: SchemaNodeProps) {
    const { setSelectedElement, setDetailsOpen } = useSchemaVisualizerStore();
    const { table } = data;

    const primaryKeyCols = Array.isArray(table.primaryKey)
        ? table.primaryKey
        : table.primaryKey
          ? [table.primaryKey]
          : [];
    const isPrimaryKey = (column: string) => primaryKeyCols.includes(column);

    const handleTableClick = () => {
        setSelectedElement({
            type: "table",
            tableName: table.table_name,
        });
        setDetailsOpen(true);
    };

    const handleRelationshipClick =
        (rel: SchemaRelationship, index: number) => (e: React.MouseEvent) => {
            e.stopPropagation();
            setSelectedElement({
                type: "relationship",
                tableName: table.table_name,
                relationshipIndex: index,
            });
            setDetailsOpen(true);
        };

    const relationshipsByType = relationshipTypes.reduce(
        (acc, { type }) => {
            acc[type] = table.relationships.filter((rel) => rel.relationshipType === type);
            return acc;
        },
        {} as Record<RelationshipType, SchemaRelationship[]>,
    );

    const renderRelationships = (
        relationships: SchemaRelationship[],
        title: string,
    ) => {
        if (!relationships || relationships.length === 0) return null;

        return (
            <div key={title} className="border-b border-border pb-3">
                <h5 className="text-gray-600 dark:text-gray-400 text-xs font-medium mb-2">
                    {title}
                </h5>
                <div className="space-y-1">
                    {relationships.map((rel, index) => {
                        const globalIndex = table.relationships.indexOf(rel);
                        return (
                            <div
                                key={`${rel.relatedTable}-${rel.column}-${index}`}
                                onClick={handleRelationshipClick(rel, globalIndex)}
                                className="flex items-center justify-between py-1 px-2 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer rounded"
                            >
                                <span className="text-gray-700 dark:text-gray-300 text-sm">
                                    {rel.column}
                                </span>
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`w-2 h-2 rounded-full ${
                                            rel.relationshipType === "foreignKey"
                                                ? "bg-blue-500 dark:bg-blue-400"
                                                : rel.relationshipType === "manyToMany"
                                                  ? "bg-green-500 dark:bg-green-400"
                                                  : "bg-purple-500 dark:bg-purple-400"
                                        }`}
                                    />
                                    <span className="text-gray-500 dark:text-gray-400 text-sm">
                                        {rel.relatedTable}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const sortedColumns = Object.values(table.columns).sort(
        (a, b) => a.ordinal_position - b.ordinal_position,
    );

    return (
        <>
            <Handle
                type="target"
                position={Position.Top}
                className="!bg-gray-400 dark:!bg-gray-500"
            />
            <div
                onClick={handleTableClick}
                className="rounded-lg bg-textured border-border min-w-[300px] max-w-[400px] overflow-hidden shadow-lg cursor-pointer hover:border-primary/50 transition-colors"
            >
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 px-4 py-3 border-b border-gray-200 dark:border-gray-600">
                    <div className="flex items-center justify-between">
                        <h3 className="text-gray-900 dark:text-white font-large">
                            {table.table_name}
                        </h3>
                        <span className="text-gray-700 dark:text-gray-200 text-sm px-2 py-1 bg-gray-100 dark:bg-gray-900/50 rounded">
                            {table.schemaType.toUpperCase()}
                        </span>
                    </div>
                </div>

                <div className="px-4 py-3 space-y-4">
                    <div className="border-b border-border pb-3">
                        <div className="flex items-center gap-2">
                            <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">
                                Primary Key
                            </span>
                            <span className="text-gray-700 dark:text-gray-300 text-sm">
                                {primaryKeyCols.length > 0
                                    ? primaryKeyCols.join(", ")
                                    : "—"}
                            </span>
                        </div>
                    </div>

                    <div className="border-b border-border pb-3">
                        <h4 className="text-gray-600 dark:text-gray-400 text-xs font-medium mb-2">
                            Fields
                        </h4>
                        <div className="space-y-1">
                            {sortedColumns.map((column) => (
                                <FieldRow
                                    key={column.column_name}
                                    columnName={column.column_name}
                                    dataType={column.data_type}
                                    isPrimaryKey={isPrimaryKey(column.column_name)}
                                    tableName={table.table_name}
                                />
                            ))}
                        </div>
                    </div>

                    <div>
                        {relationshipTypes.map(({ type, title }) =>
                            renderRelationships(relationshipsByType[type], title),
                        )}
                    </div>
                </div>
            </div>
            <Handle
                type="source"
                position={Position.Bottom}
                className="!bg-gray-400 dark:!bg-gray-500"
            />
        </>
    );
}

export default memo(SchemaNode);
