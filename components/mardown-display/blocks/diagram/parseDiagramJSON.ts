import {
  DEFAULT_DIAGRAM_RENDER_HINTS,
  DIAGRAM_BACKGROUNDS,
  DIAGRAM_BORDER_STYLES,
  DIAGRAM_EDGE_MARKERS,
  DIAGRAM_NODE_SHAPES,
  inferDiagramNodeVisuals,
  type DiagramBackground,
  type DiagramBorderStyle,
  type DiagramEdgeMarker,
  type DiagramNodeShape,
} from "./diagram-visual-defaults";

export interface DiagramNode {
  id: string;
  label: string;
  type?: string;
  nodeType?: string;
  description?: string;
  details?: string;
  position?: { x: number; y: number };
  /** True when this item is a visual section that contains other boxes. */
  isGroup?: boolean;
  /** Parent section id. Positions are relative to the section when present. */
  parentId?: string;
  /** Persisted size. Ordinary boxes gain these values after a manual resize. */
  width?: number;
  height?: number;
  /** Border treatment for a visual section. */
  groupStyle?: "solid" | "dashed" | "dotted";
  // Pedigree-specific fields
  gender?: "male" | "female" | "unknown";
  affected?: boolean;
  deceased?: boolean;
  proband?: boolean;
  birthYear?: string;
  deathYear?: string;
  generation?: number;
  // Generic metadata bag for future diagram types
  metadata?: Record<string, unknown>;
  // Visual overrides
  color?: string;
  icon?: string;
  shape?: DiagramNodeShape;
  borderStyle?: DiagramBorderStyle;
  textAlign?: "left" | "center";
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
  color?: string;
  dashed?: boolean;
  /** Richer replacement for `dashed`; legacy diagrams may still use either. */
  lineStyle?: "solid" | "dashed" | "dotted";
  strokeWidth?: number;
  // Semantic relationship type (used for rendering decisions)
  relationship?:
    | "parent"
    | "child"
    | "marriage"
    | "divorced"
    | "adopted"
    | "biological"
    | "consanguineous"
    | string;
  // Whether to show an arrowhead
  arrow?: boolean;
  /** Marker placement. Supersedes `arrow` while preserving it for legacy data. */
  marker?: DiagramEdgeMarker;
  animated?: boolean;
}

export interface DiagramData {
  title: string;
  description?: string;
  // Open union — supports built-ins plus any custom type
  type:
    | "flowchart"
    | "mindmap"
    | "orgchart"
    | "network"
    | "system"
    | "process"
    | "pedigree"
    | "timeline"
    | "erd"
    | "sequence"
    | string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  layout?: {
    direction?: "TB" | "LR" | "BT" | "RL";
    spacing?: number;
    algorithm?: "dagre" | "radial" | "pedigree";
  };
  // Optional render hints — diagram-level toggles
  renderHints?: {
    showLegend?: boolean;
    showEdgeLabels?: boolean;
    compactNodes?: boolean;
    hideArrows?: boolean;
    background?: DiagramBackground;
    showMiniMap?: boolean;
    snapToGrid?: boolean;
    showControls?: boolean;
  };
}

function isOneOf<const T extends readonly string[]>(
  value: unknown,
  values: T,
): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

/** Make every renderer-chosen visual decision explicit in the document. */
export function materializeDiagramDefaults(diagram: DiagramData): DiagramData {
  const type = diagram.type || "flowchart";
  const nodes = diagram.nodes.map((node, index) => {
    const nodeType = node.nodeType || node.type || "default";
    const inferred = inferDiagramNodeVisuals({
      diagramType: type,
      nodeType,
      label: node.label,
      description: node.description,
      details: node.details,
      isGroup: node.isGroup,
    });
    const isGroup = node.isGroup === true;
    return {
      ...node,
      nodeType,
      position: node.position ?? generateDefaultPosition(index, type),
      isGroup,
      ...(isGroup
        ? {
            width: node.width ?? 420,
            height: node.height ?? 260,
            groupStyle: node.groupStyle ?? "dashed",
          }
        : {}),
      color: node.color || inferred.color,
      icon: node.icon || inferred.icon,
      shape: node.shape ?? inferred.shape,
      borderStyle: node.borderStyle ?? inferred.borderStyle,
      textAlign: node.textAlign ?? inferred.textAlign,
    } satisfies DiagramNode;
  });

  const edges = (diagram.edges ?? []).map((edge, index) => {
    const isMarriage =
      edge.relationship === "marriage" || edge.relationship === "divorced";
    const marker =
      edge.marker ?? (edge.arrow === false || isMarriage ? "none" : "end");
    return {
      ...edge,
      id: edge.id || `edge_${edge.source}_to_${edge.target}_${index}`,
      type: !edge.type || edge.type === "default" ? "bezier" : edge.type,
      color: edge.color || "gray",
      lineStyle: edge.lineStyle ?? (edge.dashed ? "dashed" : "solid"),
      dashed: edge.lineStyle === "dashed" || edge.dashed === true,
      strokeWidth: edge.strokeWidth ?? 2,
      marker,
      arrow: marker !== "none",
      animated: edge.animated === true,
    } satisfies DiagramEdge;
  });

  return {
    ...diagram,
    type,
    nodes,
    edges,
    layout: {
      direction: diagram.layout?.direction ?? "TB",
      spacing: diagram.layout?.spacing ?? 100,
      algorithm:
        diagram.layout?.algorithm ??
        (type === "pedigree" ? "pedigree" : "dagre"),
    },
    renderHints: {
      ...DEFAULT_DIAGRAM_RENDER_HINTS,
      ...diagram.renderHints,
    },
  };
}

/**
 * Parses JSON content into structured diagram data.
 *
 * Supported input formats:
 * - { "diagram": { ... } }          — wrapped format
 * - { "title": ..., "nodes": ... }  — direct format
 * - JSON inside markdown code fences
 *
 * Edge fields accept both from/to AND source/target.
 * All new fields (gender, affected, generation, relationship, etc.) are passed through.
 */
export function parseDiagramJSON(content: string): DiagramData {
  try {
    let jsonContent = content.trim();

    // Strip markdown code fence if present
    const codeBlockMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonContent = codeBlockMatch[1].trim();
    }

    const parsed = JSON.parse(jsonContent);
    const diagramData = parsed.diagram || parsed;

    if (!diagramData) throw new Error("No diagram data found in JSON");
    if (
      !diagramData.title ||
      !diagramData.nodes ||
      !Array.isArray(diagramData.nodes)
    ) {
      throw new Error("Missing required fields: title or nodes array");
    }

    const processedNodes: DiagramNode[] = diagramData.nodes.map(
      (node: Record<string, unknown>, index: number) => {
        if (!node.id || !node.label) {
          throw new Error(`Node ${index} missing required id or label`);
        }

        return {
          id: node.id as string,
          label: node.label as string,
          type: node.type as string | undefined,
          nodeType: (node.nodeType || node.type || "default") as string,
          description: node.description as string | undefined,
          details: node.details as string | undefined,
          position:
            (node.position as { x: number; y: number } | undefined) ||
            generateDefaultPosition(index, diagramData.type || "flowchart"),
          isGroup: node.isGroup === true,
          parentId:
            typeof node.parentId === "string" ? node.parentId : undefined,
          width: typeof node.width === "number" ? node.width : undefined,
          height: typeof node.height === "number" ? node.height : undefined,
          groupStyle: isOneOf(node.groupStyle, DIAGRAM_BORDER_STYLES)
            ? node.groupStyle
            : undefined,
          // Pedigree fields
          gender: node.gender as DiagramNode["gender"],
          affected: node.affected as boolean | undefined,
          deceased: node.deceased as boolean | undefined,
          proband: node.proband as boolean | undefined,
          birthYear: node.birthYear as string | undefined,
          deathYear: node.deathYear as string | undefined,
          generation: node.generation as number | undefined,
          // Generic
          metadata: node.metadata as Record<string, unknown> | undefined,
          color: node.color as string | undefined,
          icon: node.icon as string | undefined,
          shape: isOneOf(node.shape, DIAGRAM_NODE_SHAPES)
            ? node.shape
            : undefined,
          borderStyle: isOneOf(node.borderStyle, DIAGRAM_BORDER_STYLES)
            ? node.borderStyle
            : undefined,
          textAlign:
            node.textAlign === "left" || node.textAlign === "center"
              ? node.textAlign
              : undefined,
        };
      },
    );

    const processedEdges: DiagramEdge[] = (diagramData.edges || []).map(
      (edge: Record<string, unknown>, index: number) => {
        const source = (edge.source || edge.from) as string | undefined;
        const target = (edge.target || edge.to) as string | undefined;

        if (!source || !target) {
          throw new Error(
            `Edge ${index} missing required source/from or target/to field`,
          );
        }

        const id =
          (edge.id as string) || `edge_${source}_to_${target}_${index}`;

        return {
          id,
          source,
          target,
          label: edge.label as string | undefined,
          type: (edge.type || "default") as string,
          color: edge.color as string | undefined,
          dashed: (edge.dashed as boolean) || false,
          lineStyle:
            edge.lineStyle === "solid" ||
            edge.lineStyle === "dashed" ||
            edge.lineStyle === "dotted"
              ? edge.lineStyle
              : undefined,
          strokeWidth: (edge.strokeWidth as number) || 2,
          relationship: edge.relationship as string | undefined,
          arrow: edge.arrow as boolean | undefined,
          marker: isOneOf(edge.marker, DIAGRAM_EDGE_MARKERS)
            ? edge.marker
            : undefined,
          animated: edge.animated as boolean | undefined,
        };
      },
    );

    return materializeDiagramDefaults({
      title: diagramData.title as string,
      description: diagramData.description as string | undefined,
      type: (diagramData.type || "flowchart") as string,
      nodes: processedNodes,
      edges: processedEdges,
      layout: (diagramData.layout as DiagramData["layout"]) || {
        direction: "TB",
        spacing: 100,
      },
      renderHints:
        diagramData.renderHints && typeof diagramData.renderHints === "object"
          ? {
              ...(diagramData.renderHints as DiagramData["renderHints"]),
              ...(isOneOf(
                (diagramData.renderHints as Record<string, unknown>).background,
                DIAGRAM_BACKGROUNDS,
              )
                ? {
                    background: (
                      diagramData.renderHints as Record<string, unknown>
                    ).background as DiagramBackground,
                  }
                : {}),
            }
          : undefined,
    });
  } catch (error) {
    console.error("Error parsing diagram JSON:", error);
    throw new Error(
      `Failed to parse diagram JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

function generateDefaultPosition(
  index: number,
  diagramType: string,
): { x: number; y: number } {
  switch (diagramType) {
    case "flowchart":
    case "process":
      return { x: 250, y: index * 120 + 50 };
    case "orgchart":
    case "pedigree": {
      const level = Math.floor(index / 3);
      const position = index % 3;
      return { x: position * 200 + 100, y: level * 200 + 50 };
    }
    case "mindmap": {
      const angle = (index * 2 * Math.PI) / 8;
      const radius = 200 + Math.floor(index / 8) * 100;
      return {
        x: 300 + radius * Math.cos(angle),
        y: 300 + radius * Math.sin(angle),
      };
    }
    case "timeline":
      return { x: index * 200 + 100, y: 200 };
    case "network": {
      const cols = 4;
      const row = Math.floor(index / cols);
      const col = index % cols;
      return { x: col * 180 + 100 + (row % 2) * 90, y: row * 140 + 80 };
    }
    case "system": {
      const gridCols = 3;
      const gridRow = Math.floor(index / gridCols);
      const gridCol = index % gridCols;
      return { x: gridCol * 220 + 120, y: gridRow * 160 + 100 };
    }
    default:
      return {
        x: (index % 3) * 200 + 100,
        y: Math.floor(index / 3) * 150 + 100,
      };
  }
}

export function validateDiagram(diagram: DiagramData): boolean {
  if (!diagram.title || !diagram.nodes || !Array.isArray(diagram.nodes))
    return false;
  const nodeIds = new Set<string>();
  for (const node of diagram.nodes) {
    if (!node.id || !node.label) return false;
    if (nodeIds.has(node.id)) return false;
    nodeIds.add(node.id);
  }
  const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
  for (const node of diagram.nodes) {
    if (!node.parentId) continue;
    const parent = byId.get(node.parentId);
    if (!parent?.isGroup || parent.id === node.id) return false;
    const seen = new Set([node.id]);
    let ancestor: DiagramNode | undefined = parent;
    while (ancestor) {
      if (seen.has(ancestor.id)) return false;
      seen.add(ancestor.id);
      ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
    }
  }
  if (diagram.edges) {
    const edgeIds = new Set<string>();
    for (const edge of diagram.edges) {
      if (!edge.source || !edge.target) return false;
      if (edgeIds.has(edge.id)) return false;
      edgeIds.add(edge.id);
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return false;
    }
  }
  return true;
}

export function diagramToJSON(diagram: DiagramData): string {
  return JSON.stringify({ diagram }, null, 2);
}

export function parseDiagramContent(content: string): DiagramData {
  try {
    return parseDiagramJSON(content);
  } catch {
    return materializeDiagramDefaults({
      title: "Simple Diagram",
      description: "Generated from content",
      type: "flowchart",
      nodes: [
        {
          id: "node1",
          label: "Start",
          nodeType: "start",
          position: { x: 250, y: 50 },
        },
        {
          id: "node2",
          label: "Process",
          nodeType: "process",
          position: { x: 250, y: 170 },
        },
        {
          id: "node3",
          label: "End",
          nodeType: "end",
          position: { x: 250, y: 290 },
        },
      ],
      edges: [
        { id: "edge1", source: "node1", target: "node2" },
        { id: "edge2", source: "node2", target: "node3" },
      ],
    });
  }
}
