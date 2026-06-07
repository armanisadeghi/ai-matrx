// features/administration/schema-visualizer/utils.ts
// Builds React Flow nodes/edges from the standalone SchemaOverview.

import type { CSSProperties } from "react";
import { Position } from "reactflow";
import type {
  SchemaOverview,
  SchemaTable,
  StandaloneSchemaEdge,
  StandaloneSchemaNode,
} from "./types-standalone";

const calculateNodeHeight = (table: SchemaTable) => {
  const baseHeight = 150; // Header + padding
  const fieldsHeight = Object.keys(table.columns).length * 35;
  const relationshipsHeight = table.relationships.length * 35;
  return baseHeight + fieldsHeight + relationshipsHeight;
};

export function createNodesAndEdges(
  overview: SchemaOverview | undefined | null,
) {
  const nodes: StandaloneSchemaNode[] = [];
  const edges: StandaloneSchemaEdge[] = [];

  if (!overview || !overview.tables) {
    return { nodes, edges };
  }

  const tables = overview.tables;
  const tableNames = Object.keys(tables);
  const numColumns = Math.max(1, Math.ceil(Math.sqrt(tableNames.length)));
  const horizontalSpacing = 500;
  const minVerticalSpacing = 100;
  const horizontalStagger = 80;

  const columnHeights = new Array(numColumns).fill(0);

  tableNames.forEach((tableName, index) => {
    const table = tables[tableName];
    const column = index % numColumns;
    const nodeHeight = calculateNodeHeight(table);

    const xBase = column * horizontalSpacing;
    const xStagger = column % 2 === 0 ? 0 : horizontalStagger;
    const xPos = xBase + xStagger;
    const yPos = columnHeights[column];

    nodes.push({
      id: tableName,
      type: "schemaNode",
      position: { x: xPos, y: yPos },
      data: {
        label: tableName,
        table,
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    });

    columnHeights[column] = yPos + nodeHeight + minVerticalSpacing;
  });

  tableNames.forEach((tableName) => {
    const table = tables[tableName];
    if (!Array.isArray(table.relationships)) return;

    table.relationships.forEach((rel, relIndex) => {
      const edgeId = `${tableName}-${rel.relatedTable}-${relIndex}`;
      let edgeStyle: CSSProperties = {};

      switch (rel.relationshipType) {
        case "foreignKey":
          edgeStyle = { stroke: "#3b82f6" };
          break;
        case "manyToMany":
          edgeStyle = { stroke: "#22c55e" };
          break;
        case "inverseForeignKey":
          edgeStyle = { stroke: "#a855f7" };
          break;
      }

      edges.push({
        id: edgeId,
        source: tableName,
        target: rel.relatedTable,
        animated: true,
        style: edgeStyle,
        label: rel.relationshipType,
      });
    });
  });

  return { nodes, edges };
}
