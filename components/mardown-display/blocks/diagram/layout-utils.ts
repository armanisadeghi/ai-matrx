import dagre from "dagre";
// eslint-disable-next-line no-restricted-syntax -- imported only by InteractiveDiagramBlock, which every consumer loads via React.lazy/next/dynamic; React Flow stays STATIC in-gate per the code-splitting skill (rule 3).
import { Node, Edge, Position, MarkerType } from "reactflow";

export interface LayoutOptions {
  direction?: "TB" | "LR" | "BT" | "RL";
  nodeWidth?: number;
  nodeHeight?: number;
  rankSep?: number;
  nodeSep?: number;
}

/**
 * Applies automatic layout to ReactFlow nodes and edges using Dagre
 */
export const getLayoutedElements = (
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {},
) => {
  const {
    direction = "TB",
    nodeWidth = 200,
    nodeHeight = 100,
    rankSep = 100,
    nodeSep = 80,
  } = options;

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({
    rankdir: direction,
    ranksep: rankSep,
    nodesep: nodeSep,
    marginx: 20,
    marginy: 20,
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: getTargetPosition(direction),
      sourcePosition: getSourcePosition(direction),
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
      data: { ...node.data },
    };
  });

  return { nodes: layoutedNodes, edges };
};

const getTargetPosition = (direction: string): Position => {
  switch (direction) {
    case "TB":
      return Position.Top;
    case "BT":
      return Position.Bottom;
    case "LR":
      return Position.Left;
    case "RL":
      return Position.Right;
    default:
      return Position.Top;
  }
};

const getSourcePosition = (direction: string): Position => {
  switch (direction) {
    case "TB":
      return Position.Bottom;
    case "BT":
      return Position.Top;
    case "LR":
      return Position.Right;
    case "RL":
      return Position.Left;
    default:
      return Position.Bottom;
  }
};

export const getLayoutOptionsForDiagramType = (
  diagramType: string,
  nodeCount: number,
  preferredDirection?: "TB" | "LR" | "BT" | "RL",
): LayoutOptions => {
  const baseOptions: LayoutOptions = {
    nodeWidth: 200,
    nodeHeight: 100,
    rankSep: 100,
    nodeSep: 80,
  };

  // If caller explicitly specifies direction, respect it
  const dir = preferredDirection;

  switch (diagramType) {
    case "flowchart":
    case "process":
      return {
        ...baseOptions,
        direction: dir ?? "TB",
        rankSep: 120,
        nodeSep: 100,
      };

    case "orgchart":
      return {
        ...baseOptions,
        direction: dir ?? "TB",
        rankSep: 200,
        nodeSep: 150,
        nodeWidth: 220,
        nodeHeight: 120,
      };

    case "pedigree":
      return {
        ...baseOptions,
        direction: dir ?? "TB",
        rankSep: 180,
        nodeSep: 120,
        nodeWidth: 120,
        nodeHeight: 120,
      };

    case "mindmap":
      return {
        ...baseOptions,
        direction: dir ?? (nodeCount > 10 ? "LR" : "TB"),
        rankSep: 80,
        nodeSep: 60,
      };

    case "network":
    case "system":
      return {
        ...baseOptions,
        direction: dir ?? "LR",
        rankSep: 150,
        nodeSep: 100,
      };

    case "timeline":
      return {
        ...baseOptions,
        direction: dir ?? "LR",
        rankSep: 60,
        nodeSep: 40,
        nodeWidth: 160,
        nodeHeight: 80,
      };

    case "erd":
      return {
        ...baseOptions,
        direction: dir ?? "LR",
        rankSep: 160,
        nodeSep: 120,
        nodeWidth: 200,
        nodeHeight: 140,
      };

    case "sequence":
      return {
        ...baseOptions,
        direction: dir ?? "LR",
        rankSep: 120,
        nodeSep: 100,
      };

    default:
      return {
        ...baseOptions,
        direction: dir ?? "TB",
      };
  }
};

/**
 * Radial layout — places highest-connected node at center, others in ring(s)
 */
export const getRadialLayout = (
  nodes: Node[],
  edges: Edge[],
  centerNodeId?: string,
): { nodes: Node[]; edges: Edge[] } => {
  if (nodes.length === 0) return { nodes, edges };

  const foundCenterNode = centerNodeId
    ? nodes.find((n) => n.id === centerNodeId)
    : findCenterNode(nodes, edges);

  const centerNode = foundCenterNode ?? nodes[0];

  const centerX = 400;
  const centerY = 300;
  const radius = 220;
  const angleStep = (2 * Math.PI) / (nodes.length - 1);

  const layoutedNodes = nodes.map((node, index) => {
    if (node.id === centerNode.id) {
      return { ...node, position: { x: centerX, y: centerY } };
    }
    const adjustedIndex =
      index > nodes.findIndex((n) => n.id === centerNode.id)
        ? index - 1
        : index;
    const angle = adjustedIndex * angleStep;
    return {
      ...node,
      position: {
        x: centerX + radius * Math.cos(angle) - 100,
        y: centerY + radius * Math.sin(angle) - 50,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

const findCenterNode = (nodes: Node[], edges: Edge[]): Node | undefined => {
  const connectionCounts = new Map<string, number>();
  nodes.forEach((node) => connectionCounts.set(node.id, 0));
  edges.forEach((edge) => {
    connectionCounts.set(
      edge.source,
      (connectionCounts.get(edge.source) || 0) + 1,
    );
    connectionCounts.set(
      edge.target,
      (connectionCounts.get(edge.target) || 0) + 1,
    );
  });

  let maxConnections = 0;
  let centerNodeId = "";
  connectionCounts.forEach((count, nodeId) => {
    if (count > maxConnections) {
      maxConnections = count;
      centerNodeId = nodeId;
    }
  });

  return nodes.find((node) => node.id === centerNodeId);
};

/**
 * Org chart layout — Dagre TB with clean edges
 */
export const getOrgChartLayout = (
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {},
): { nodes: Node[]; edges: Edge[] } => {
  const {
    direction = "TB",
    nodeWidth = 220,
    nodeHeight = 120,
    rankSep = 200,
    nodeSep = 150,
  } = options;

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    ranksep: rankSep,
    nodesep: nodeSep,
    marginx: 40,
    marginy: 40,
    align: "UL",
  });

  nodes.forEach((node) =>
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight }),
  );
  edges.forEach((edge) => dagreGraph.setEdge(edge.source, edge.target));

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
      data: { ...node.data, diagramType: "orgchart" },
    };
  });

  const cleanedEdges = edges.map((edge) => ({
    ...edge,
    label: undefined,
    labelStyle: undefined,
    labelBgStyle: undefined,
    style: {
      ...edge.style,
      stroke: "#6b7280",
      strokeWidth: 2,
      strokeDasharray: "none",
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
      color: "#6b7280",
    },
  }));

  return { nodes: layoutedNodes, edges: cleanedEdges };
};

/**
 * Pedigree layout — generation-aware vertical spacing
 * Nodes with the same `generation` value are placed on the same horizontal band.
 */
export const getPedigreeLayout = (
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } => {
  // Group nodes by generation (from node data)
  const generationMap = new Map<number, Node[]>();

  nodes.forEach((node) => {
    const gen: number =
      typeof node.data.generation === "number" ? node.data.generation : 0;
    const genNodes = generationMap.get(gen);
    if (genNodes) {
      genNodes.push(node);
    } else {
      generationMap.set(gen, [node]);
    }
  });

  // If no generation data, fall back to dagre TB
  if (generationMap.size <= 1) {
    return getLayoutedElements(nodes, edges, {
      direction: "TB",
      nodeWidth: 120,
      nodeHeight: 120,
      rankSep: 180,
      nodeSep: 120,
    });
  }

  const GENERATION_HEIGHT = 220;
  const NODE_WIDTH = 130;
  const NODE_SPACING = 60;

  const generations = Array.from(generationMap.keys()).sort((a, b) => a - b);
  const maxNodesInGen = Math.max(
    ...generations.map((g) => generationMap.get(g)?.length ?? 0),
  );
  const totalWidth = maxNodesInGen * (NODE_WIDTH + NODE_SPACING);

  const layoutedNodes = nodes.map((node) => {
    const gen: number =
      typeof node.data.generation === "number" ? node.data.generation : 0;
    const genNodes = generationMap.get(gen) ?? [];
    const indexInGen = genNodes.findIndex((n) => n.id === node.id);
    const genWidth = genNodes.length * (NODE_WIDTH + NODE_SPACING);
    const xOffset = (totalWidth - genWidth) / 2;

    return {
      ...node,
      position: {
        x: xOffset + indexInGen * (NODE_WIDTH + NODE_SPACING),
        y: generations.indexOf(gen) * GENERATION_HEIGHT + 50,
      },
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
    };
  });

  return { nodes: layoutedNodes, edges };
};
