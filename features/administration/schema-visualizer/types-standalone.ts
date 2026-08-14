// features/administration/schema-visualizer/types-standalone.ts
// Standalone types for the schema visualizer — no dependency on the entity system.
// Data is sourced from `/api/schema-overview`, which queries Postgres directly.

import type { Node as ReactFlowNode, Edge as ReactFlowEdge } from "reactflow";

export interface SchemaColumn {
    column_name: string;
    data_type: string;
    is_nullable: boolean;
    column_default: string | null;
    ordinal_position: number;
}

export interface SchemaRelationship {
    relationshipType: "foreignKey" | "inverseForeignKey" | "manyToMany";
    column: string;
    relatedTable: string;
    relatedColumn: string;
    junctionTable: string | null;
}

export interface SchemaTable {
    /** Exact `schema.table` identity used by every visualizer key. */
    table_name: string;
    table_type: "BASE TABLE" | "VIEW";
    schemaType: "table" | "view" | "dynamic" | "other";
    columns: Record<string, SchemaColumn>;
    relationships: SchemaRelationship[];
    primaryKey: string | string[];
}

export interface SchemaOverview {
    tables: Record<string, SchemaTable>;
    lastUpdated: string;
}

export type SelectedElementType = "table" | "field" | "relationship" | null;

export interface SelectedElement {
    type: SelectedElementType;
    tableName: string;
    fieldName?: string;
    relationshipIndex?: number;
}

export interface SchemaNodeData {
    label: string;
    table: SchemaTable;
}

export type StandaloneSchemaNode = ReactFlowNode<SchemaNodeData>;
export type StandaloneSchemaEdge = ReactFlowEdge;
