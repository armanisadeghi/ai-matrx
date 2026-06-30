"use client";
import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  NodeTypes,
  MarkerType,
  BackgroundVariant,
  Panel,
  MiniMap,
  ReactFlowProvider,
  Handle,
  Position,
  useReactFlow,
  useNodesInitialized,
  getNodesBounds,
  getViewportForBounds,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Network,
  Maximize2,
  Minimize2,
  Download,
  Layers,
  Settings,
  CheckCircle2,
  XCircle,
  GitBranch,
  Users,
  Database,
  Server,
  Globe,
  Cpu,
  HardDrive,
  RotateCcw,
  Square,
  Circle,
  Rainbow,
  Shuffle,
  Camera,
  ExternalLink,
  Printer,
  Clock,
  Table,
  ArrowRight,
} from "lucide-react";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import IconButton from "@/components/official/IconButton";
import {
  getLayoutedElements,
  getLayoutOptionsForDiagramType,
  getRadialLayout,
  getOrgChartLayout,
  getPedigreeLayout,
} from "./layout-utils";
import { getOrgChartRoleIcon, formatDiagramType } from "./ui-utils";
import type { DiagramData, DiagramNode } from "./parseDiagramJSON";
import {
  PrintOptionsDialog,
  usePrintOptions,
} from "@/lib/block-print/PrintOptionsDialog";
import { createDiagramPrinter } from "./diagram-printer";

// ─────────────────────────────────────────────────────────────────────────────
// Tailwind CSS 4 uses modern CSS color functions (oklch, lab, color(display-p3))
// that html2canvas cannot parse. It calls console.error for each one, which gets
// intercepted by AdminDebugContextCollector as false-positive errors.
//
// Fix: patch window.getComputedStyle during capture so html2canvas always
// receives safe hex values. Returns a restore function to call when done.
// ─────────────────────────────────────────────────────────────────────────────
const UNSAFE_COLOR_RE = /\b(oklch|oklab|lab|lch|color)\s*\(/i;

function safenColor(value: string, prop: string, isDark: boolean): string {
  if (!UNSAFE_COLOR_RE.test(value)) return value;
  const lp = prop.toLowerCase();
  if (lp.includes("background")) return isDark ? "#1f2937" : "#ffffff";
  if (lp === "color") return isDark ? "#f3f4f6" : "#111827";
  if (lp.includes("border") || lp.includes("outline"))
    return isDark ? "#4b5563" : "#d1d5db";
  if (lp === "fill" || lp === "stroke") return isDark ? "#9ca3af" : "#374151";
  return isDark ? "#6b7280" : "#6b7280";
}

function patchComputedStyleForCapture(isDark: boolean): () => void {
  const original = window.getComputedStyle.bind(window);
  window.getComputedStyle = function (elt: Element, pseudo?: string | null) {
    const computed = original(elt, pseudo);
    return new Proxy(computed, {
      get(target, prop: string | symbol) {
        const value = (target as unknown as Record<string | symbol, unknown>)[
          prop
        ];
        if (
          typeof prop === "string" &&
          typeof value === "string" &&
          value &&
          UNSAFE_COLOR_RE.test(value)
        ) {
          return safenColor(value, prop, isDark);
        }
        if (prop === "getPropertyValue") {
          return (p: string) => {
            const raw = target.getPropertyValue(p);
            return raw && UNSAFE_COLOR_RE.test(raw)
              ? safenColor(raw, p, isDark)
              : raw;
          };
        }
        if (typeof value === "function")
          return (value as CallableFunction).bind(target);
        return value;
      },
    });
  };
  return () => {
    window.getComputedStyle = original;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pedigree Node — square (male) / circle (female), affected shading, proband
// ─────────────────────────────────────────────────────────────────────────────
const PedigreeNode = ({
  data,
  selected,
}: {
  data: Record<string, unknown>;
  selected: boolean;
}) => {
  const gender = data.gender as string | undefined;
  const affected = data.affected as boolean | undefined;
  const deceased = data.deceased as boolean | undefined;
  const proband = data.proband as boolean | undefined;
  const birthYear = data.birthYear as string | undefined;
  const deathYear = data.deathYear as string | undefined;
  const description =
    typeof data.description === "string" ? data.description : undefined;

  const isCircle = gender === "female";
  const isUnknown = !gender || gender === "unknown";

  const shapeBase = "relative flex items-center justify-center transition-all";
  const size = "w-20 h-20";

  const fillColor = affected
    ? "bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900"
    : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100";

  const borderColor = proband
    ? "border-4 border-blue-500"
    : selected
      ? "border-4 border-blue-400"
      : "border-2 border-gray-600 dark:border-gray-400";

  const shapeClass = isCircle
    ? `rounded-full ${shapeBase} ${size} ${fillColor} ${borderColor}`
    : isUnknown
      ? `rotate-45 ${shapeBase} ${size} ${fillColor} border-2 border-gray-600 dark:border-gray-400`
      : `${shapeBase} ${size} ${fillColor} ${borderColor}`;

  return (
    <div className="flex flex-col items-center gap-1 p-1">
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="w-2 h-2 border border-gray-400 dark:border-gray-500 bg-white dark:bg-gray-700"
      />

      <div className={shapeClass} title={data.label as string}>
        {deceased && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/* Diagonal line for deceased */}
            <div className="absolute w-full h-px bg-gray-600 dark:bg-gray-400 rotate-45 origin-center" />
          </div>
        )}
        {proband && (
          <div className="absolute -bottom-1 -left-3 text-blue-500 text-xs font-bold">
            ↗
          </div>
        )}
        {isUnknown && (
          <div className="-rotate-45 text-xs font-semibold text-center leading-tight px-1">
            {data.label as string}
          </div>
        )}
        {!isUnknown && (
          <div className="text-xs font-semibold text-center leading-tight px-1 break-words max-w-full">
            {data.label as string}
          </div>
        )}
      </div>

      {/* Name and dates below the shape */}
      {(description || birthYear) && (
        <div className="text-center max-w-[120px]">
          {description && (
            <div className="text-xs text-gray-700 dark:text-gray-300 font-medium truncate">
              {description}
            </div>
          )}
          {(birthYear || deathYear) && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {birthYear && deathYear
                ? `${birthYear}–${deathYear}`
                : birthYear
                  ? `b. ${birthYear}`
                  : deathYear
                    ? `d. ${deathYear}`
                    : null}
            </div>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        className="w-2 h-2 border border-gray-400 dark:border-gray-500 bg-white dark:bg-gray-700"
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Timeline Node
// ─────────────────────────────────────────────────────────────────────────────
const TimelineNode = ({
  data,
  selected,
}: {
  data: Record<string, unknown>;
  selected: boolean;
}) => {
  const details =
    typeof data.details === "string" ? data.details : undefined;
  const description =
    typeof data.description === "string" ? data.description : undefined;

  return (
    <div
      className={`px-4 py-3 min-w-[140px] max-w-[200px] rounded-xl border-2 shadow-md transition-all bg-blue-50 dark:bg-blue-950/30 border-blue-400 dark:border-blue-600 text-blue-900 dark:text-blue-100 ${
        selected
          ? "shadow-xl scale-105 ring-2 ring-blue-400"
          : "hover:shadow-md"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="w-2 h-2 border border-blue-400 bg-white dark:bg-gray-800"
      />
      {details && (
        <div className="text-xs font-bold text-blue-500 dark:text-blue-400 mb-1">
          {details}
        </div>
      )}
      <div className="font-semibold text-sm">{data.label as string}</div>
      {description && (
        <div className="text-xs opacity-75 mt-1">{description}</div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="w-2 h-2 border border-blue-400 bg-white dark:bg-gray-800"
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ERD Node
// ─────────────────────────────────────────────────────────────────────────────
const ERDNode = ({
  data,
  selected,
}: {
  data: Record<string, unknown>;
  selected: boolean;
}) => {
  const attributes = data.attributes as string[] | undefined;
  return (
    <div
      className={`min-w-[160px] rounded-lg border-2 shadow-md overflow-hidden transition-all bg-white dark:bg-gray-800 border-purple-400 dark:border-purple-600 ${
        selected
          ? "shadow-xl scale-105 ring-2 ring-purple-400"
          : "hover:shadow-md"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="w-2 h-2 border border-purple-400 bg-white dark:bg-gray-800"
      />
      <div className="bg-purple-500 dark:bg-purple-700 px-3 py-2 text-white font-bold text-sm text-center">
        {data.label as string}
      </div>
      {attributes && attributes.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {attributes.map((attr, i) => (
            <div
              key={i}
              className="px-3 py-1 text-xs text-gray-700 dark:text-gray-300 font-mono"
            >
              {attr}
            </div>
          ))}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="w-2 h-2 border border-purple-400 bg-white dark:bg-gray-800"
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Generic Custom Node (flowchart, orgchart, network, system, process, etc.)
// ─────────────────────────────────────────────────────────────────────────────
const CustomNode = ({
  data,
  selected,
}: {
  data: Record<string, unknown>;
  selected: boolean;
}) => {
  const description =
    typeof data.description === "string" ? data.description : undefined;
  const details = typeof data.details === "string" ? data.details : undefined;

  const getNodeIcon = () => {
    if (data.diagramType === "orgchart") {
      return getOrgChartRoleIcon(
        data.label as string,
        data.description as string,
        data.details as string,
      );
    }
    switch (data.nodeType) {
      case "process":
        return <Settings className="h-4 w-4" />;
      case "decision":
        return <GitBranch className="h-4 w-4" />;
      case "data":
        return <Database className="h-4 w-4" />;
      case "start":
        return <CheckCircle2 className="h-4 w-4" />;
      case "end":
        return <XCircle className="h-4 w-4" />;
      case "user":
        return <Users className="h-4 w-4" />;
      case "system":
        return <Server className="h-4 w-4" />;
      case "api":
        return <Globe className="h-4 w-4" />;
      case "compute":
        return <Cpu className="h-4 w-4" />;
      case "storage":
        return <HardDrive className="h-4 w-4" />;
      case "event":
        return <Clock className="h-4 w-4" />;
      case "entity":
        return <Table className="h-4 w-4" />;
      case "gateway":
        return <ArrowRight className="h-4 w-4" />;
      default:
        return <Square className="h-4 w-4" />;
    }
  };

  const getNodeColor = () => {
    // Allow per-node color override via data.color
    if (data.color) return "";

    switch (data.nodeType) {
      case "start":
        return "bg-green-100 dark:bg-green-950/30 border-green-500 text-green-700 dark:text-green-300";
      case "end":
        return "bg-red-100 dark:bg-red-950/30 border-red-500 text-red-700 dark:text-red-300";
      case "decision":
        return "bg-orange-100 dark:bg-orange-950/30 border-orange-500 text-orange-700 dark:text-orange-300";
      case "process":
        return "bg-blue-100 dark:bg-blue-950/30 border-blue-500 text-blue-700 dark:text-blue-300";
      case "data":
        return "bg-purple-100 dark:bg-purple-950/30 border-purple-500 text-purple-700 dark:text-purple-300";
      case "user":
        return "bg-indigo-100 dark:bg-indigo-950/30 border-indigo-500 text-indigo-700 dark:text-indigo-300";
      case "system":
        return "bg-gray-100 dark:bg-gray-800 border-gray-500 text-gray-700 dark:text-gray-300";
      case "api":
        return "bg-teal-100 dark:bg-teal-950/30 border-teal-500 text-teal-700 dark:text-teal-300";
      case "compute":
        return "bg-yellow-100 dark:bg-yellow-950/30 border-yellow-500 text-yellow-700 dark:text-yellow-300";
      case "storage":
        return "bg-pink-100 dark:bg-pink-950/30 border-pink-500 text-pink-700 dark:text-pink-300";
      case "event":
        return "bg-cyan-100 dark:bg-cyan-950/30 border-cyan-500 text-cyan-700 dark:text-cyan-300";
      case "entity":
        return "bg-violet-100 dark:bg-violet-950/30 border-violet-500 text-violet-700 dark:text-violet-300";
      case "gateway":
        return "bg-amber-100 dark:bg-amber-950/30 border-amber-500 text-amber-700 dark:text-amber-300";
      default:
        return "bg-textured border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300";
    }
  };

  const isOrgChart = data.diagramType === "orgchart";
  const colorClass = getNodeColor();
  const inlineStyle = data.color
    ? {
        backgroundColor: `${data.color}20`,
        borderColor: data.color as string,
        color: data.color as string,
      }
    : undefined;

  return (
    <div
      className={`${isOrgChart ? "px-6 py-4 min-w-[200px]" : "px-4 py-3 min-w-[120px]"} rounded-lg border-2 shadow-lg transition-all ${colorClass} ${
        selected
          ? "shadow-xl scale-105 ring-2 ring-blue-400 dark:ring-blue-500"
          : "hover:shadow-md"
      }`}
      style={inlineStyle}
    >
      <Handle
        type="target"
        position={isOrgChart ? Position.Top : Position.Left}
        id="input"
        style={
          isOrgChart
            ? { left: "50%", transform: "translateX(-50%)", top: "-6px" }
            : {}
        }
        className="w-3 h-3 border-2 border-gray-400 dark:border-gray-500 bg-textured hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors"
      />

      {isOrgChart ? (
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            {getNodeIcon()}
            <div className="font-bold text-base">{data.label as string}</div>
          </div>
          {description && (
            <div className="text-sm font-medium opacity-90 mb-1">
              {description}
            </div>
          )}
          {details && (
            <div className="text-xs opacity-70 italic">{details}</div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-1">
            {getNodeIcon()}
            <div className="font-semibold text-sm">{data.label as string}</div>
          </div>
          {description && (
            <div className="text-xs opacity-80 mt-1">{description}</div>
          )}
          {details && (
            <div className="text-xs opacity-70 mt-1 italic">{details}</div>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={isOrgChart ? Position.Bottom : Position.Right}
        id="output"
        style={
          isOrgChart
            ? { left: "50%", transform: "translateX(-50%)", bottom: "-6px" }
            : {}
        }
        className="w-3 h-3 border-2 border-gray-400 dark:border-gray-500 bg-textured hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors"
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// NodeTypes registry — defined OUTSIDE render to prevent ReactFlow warning
// ─────────────────────────────────────────────────────────────────────────────
const nodeTypes: NodeTypes = {
  custom: CustomNode as NodeTypes[string],
  pedigree: PedigreeNode as NodeTypes[string],
  timeline: TimelineNode as NodeTypes[string],
  erd: ERDNode as NodeTypes[string],
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — convert DiagramData nodes/edges to ReactFlow format
// ─────────────────────────────────────────────────────────────────────────────
function getReactFlowNodeType(
  diagramType: string,
  nodeData: DiagramNode,
): string {
  if (diagramType === "pedigree") return "pedigree";
  if (diagramType === "timeline") return "timeline";
  if (diagramType === "erd") return "erd";
  return "custom";
}

function buildReactFlowNodes(diagram: DiagramData): Node[] {
  return diagram.nodes.map((node, index) => ({
    id: node.id,
    type: getReactFlowNodeType(diagram.type, node),
    position: node.position || {
      x: (index % 3) * 200 + 100,
      y: Math.floor(index / 3) * 150 + 100,
    },
    data: {
      label: node.label,
      nodeType: node.nodeType || node.type || "default",
      description: node.description,
      details: node.details,
      diagramType: diagram.type,
      // Pedigree fields
      gender: node.gender,
      affected: node.affected,
      deceased: node.deceased,
      proband: node.proband,
      birthYear: node.birthYear,
      deathYear: node.deathYear,
      generation: node.generation,
      // Extras
      color: node.color,
      attributes: node.metadata?.attributes as string[] | undefined,
    },
  }));
}

function buildReactFlowEdges(diagram: DiagramData): Edge[] {
  const nodeIds = new Set(diagram.nodes.map((n) => n.id));
  const isPedigree = diagram.type === "pedigree";
  const hideArrows = diagram.renderHints?.hideArrows;
  const showLabels = diagram.renderHints?.showEdgeLabels !== false;

  return diagram.edges
    .filter((edge) => {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        console.warn(`Diagram edge ${edge.id} references missing nodes`, edge);
        return false;
      }
      return true;
    })
    .map((edge) => {
      const isMarriage =
        edge.relationship === "marriage" || edge.relationship === "divorced";
      const isDivorced = edge.relationship === "divorced";
      const isConsanguineous = edge.relationship === "consanguineous";

      // Marriage edges: horizontal double line, no arrow
      const edgeStyle: React.CSSProperties = {
        stroke: edge.color || (isMarriage ? "#374151" : "#6b7280"),
        strokeWidth: isMarriage ? 3 : edge.strokeWidth || 2,
        strokeDasharray: isDivorced
          ? "6,3"
          : isConsanguineous
            ? "2,2"
            : edge.dashed
              ? "5,5"
              : "none",
      };

      const showArrow = !hideArrows && !isMarriage && edge.arrow !== false;

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: "output",
        targetHandle: "input",
        type: isPedigree && isMarriage ? "straight" : "default",
        animated: edge.animated || false,
        markerEnd: showArrow
          ? {
              type: MarkerType.ArrowClosed,
              width: isPedigree ? 14 : 20,
              height: isPedigree ? 14 : 20,
              color: edge.color || "#6b7280",
            }
          : undefined,
        style: edgeStyle,
        label: showLabels && !isPedigree ? edge.label : undefined,
        labelStyle: {
          fontSize: 12,
          fontWeight: 500,
          fill: edge.color || "#6b7280",
        },
        labelBgStyle: { fill: "#ffffff", fillOpacity: 0.8, rx: 4, ry: 4 },
      };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// DiagramFlow — inner component that uses ReactFlow hooks
// ─────────────────────────────────────────────────────────────────────────────
const DiagramFlow: React.FC<{
  diagram: DiagramData;
  showMiniMap: boolean;
  setShowMiniMap: (v: boolean) => void;
  backgroundVariant: BackgroundVariant;
  setBackgroundVariant: (v: BackgroundVariant) => void;
  onExportImage: () => void;
}> = ({
  diagram,
  showMiniMap,
  setShowMiniMap,
  backgroundVariant,
  setBackgroundVariant,
  onExportImage,
}) => {
  const { fitView, getNodes, getEdges } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const hasAutoLayoutApplied = useRef(false);
  const autoLayoutFrameRef = useRef<number | null>(null);

  const initialNodes = useMemo(() => buildReactFlowNodes(diagram), [diagram]);
  const initialEdges = useMemo(() => buildReactFlowEdges(diagram), [diagram]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  // ── Export with updated (non-deprecated) ReactFlow APIs ──
  const exportImage = useCallback(() => {
    const currentNodes = getNodes();
    if (!currentNodes.length) {
      onExportImage();
      return;
    }

    const nodesBounds = getNodesBounds(currentNodes);
    const imageWidth = 1200;
    const imageHeight = 800;

    const viewport = getViewportForBounds(
      nodesBounds,
      imageWidth,
      imageHeight,
      0.1,
      2,
      0.1,
    );

    const reactFlowEl = document.querySelector(
      ".react-flow",
    ) as HTMLElement | null;
    if (!reactFlowEl) {
      onExportImage();
      return;
    }

    const isDark =
      document.documentElement.classList.contains("dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    const bgColor = isDark ? "#111827" : "#ffffff";

    const exportContainer = document.createElement("div");
    exportContainer.style.cssText = `position:absolute;top:-9999px;left:-9999px;width:${imageWidth}px;height:${imageHeight}px;background:${bgColor}`;
    if (isDark) exportContainer.classList.add("dark");

    const cloned = reactFlowEl.cloneNode(true) as HTMLElement;
    if (isDark) cloned.classList.add("dark");
    cloned.style.cssText = `width:${imageWidth}px;height:${imageHeight}px;position:relative;overflow:hidden`;

    const clonedViewport = cloned.querySelector(
      ".react-flow__viewport",
    ) as HTMLElement | null;
    if (clonedViewport) {
      clonedViewport.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;
    }

    exportContainer.appendChild(cloned);
    document.body.appendChild(exportContainer);

    import("html2canvas")
      .then((mod) => {
        // Patch getComputedStyle so html2canvas never sees oklch/lab values
        const restore = patchComputedStyleForCapture(isDark);
        return mod
          .default(exportContainer, {
            backgroundColor: bgColor,
            scale: 2,
            useCORS: true,
            allowTaint: true,
            width: imageWidth,
            height: imageHeight,
            ignoreElements: (el) =>
              el.classList.contains("react-flow__controls") ||
              el.classList.contains("react-flow__minimap") ||
              el.classList.contains("react-flow__panel"),
          })
          .finally(restore);
      })
      .then((canvas) => {
        const a = document.createElement("a");
        a.download = `${diagram.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_diagram${isDark ? "_dark" : "_light"}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
      })
      .catch((err) => console.warn("Diagram export failed:", err))
      .finally(() => document.body.removeChild(exportContainer));
  }, [getNodes, diagram.title, onExportImage]);

  const fitViewAfterLayout = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitView({ duration: 800, padding: 0.2 });
      });
    });
  }, [fitView]);

  // ── Layout helpers ──
  const applyAutoLayout = useCallback(() => {
    const currentNodes = getNodes();
    const currentEdges = getEdges();
    if (currentNodes.length === 0) return;

    let result: { nodes: Node[]; edges?: Edge[] };

    if (diagram.type === "pedigree") {
      result = getPedigreeLayout(currentNodes, currentEdges);
    } else if (diagram.type === "orgchart") {
      const opts = getLayoutOptionsForDiagramType(
        diagram.type,
        diagram.nodes.length,
        diagram.layout?.direction,
      );
      result = getOrgChartLayout(currentNodes, currentEdges, opts);
      if (result.edges) setEdges(result.edges);
    } else {
      const opts = getLayoutOptionsForDiagramType(
        diagram.type,
        diagram.nodes.length,
        diagram.layout?.direction,
      );
      result = getLayoutedElements(currentNodes, currentEdges, opts);
    }

    setNodes(result.nodes);
    fitViewAfterLayout();
    hasAutoLayoutApplied.current = true;
  }, [
    getNodes,
    getEdges,
    diagram.type,
    diagram.nodes.length,
    diagram.layout?.direction,
    setNodes,
    setEdges,
    fitViewAfterLayout,
  ]);

  const applyRadialLayout = useCallback(() => {
    const { nodes: laid } = getRadialLayout(getNodes(), getEdges());
    setNodes(laid);
    fitViewAfterLayout();
    hasAutoLayoutApplied.current = true;
  }, [getNodes, getEdges, setNodes, fitViewAfterLayout]);

  const resetLayout = useCallback(() => {
    setNodes(buildReactFlowNodes(diagram));
    setEdges(buildReactFlowEdges(diagram));
    fitViewAfterLayout();
    hasAutoLayoutApplied.current = true;
  }, [diagram, setNodes, setEdges, fitViewAfterLayout]);

  // Re-run auto layout when diagram data changes.
  useEffect(() => {
    hasAutoLayoutApplied.current = false;
  }, [diagram]);

  // Wait for ReactFlow to measure nodes, then force the same auto layout as the toolbar button.
  useEffect(() => {
    if (!nodesInitialized || hasAutoLayoutApplied.current) return undefined;
    if (getNodes().length <= 1) return undefined;

    autoLayoutFrameRef.current = requestAnimationFrame(() => {
      autoLayoutFrameRef.current = requestAnimationFrame(() => {
        if (hasAutoLayoutApplied.current) return;
        applyAutoLayout();
      });
    });

    return () => {
      if (autoLayoutFrameRef.current !== null) {
        cancelAnimationFrame(autoLayoutFrameRef.current);
        autoLayoutFrameRef.current = null;
      }
    };
  }, [nodesInitialized, applyAutoLayout, getNodes, diagram]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      nodeTypes={nodeTypes}
      fitView={false}
      proOptions={{ hideAttribution: true }}
      className="bg-gray-50 dark:bg-gray-900"
    >
      <Background
        variant={backgroundVariant}
        gap={20}
        size={1}
        className="bg-gray-50 dark:bg-gray-900"
      />
      <Controls
        className="bg-textured border-border rounded-lg shadow-lg"
        showInteractive={false}
      />

      {showMiniMap && (
        <MiniMap
          className="bg-textured border-border rounded-lg shadow-lg"
          nodeColor={(node) => {
            switch (node.data.nodeType) {
              case "start":
                return "#10b981";
              case "end":
                return "#ef4444";
              case "decision":
                return "#f59e0b";
              case "process":
                return "#3b82f6";
              case "data":
                return "#8b5cf6";
              default:
                return "#6b7280";
            }
          }}
          maskColor="rgba(0,0,0,0.1)"
        />
      )}

      <Panel
        position="top-right"
        className="bg-textured rounded-lg shadow-lg border-border p-1"
      >
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              onClick={applyAutoLayout}
              className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 bg-blue-50 dark:bg-blue-950/20 rounded-lg transition-colors border border-blue-200 dark:border-blue-800"
              title="Auto Layout"
            >
              <Shuffle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </button>
            <button
              onClick={applyRadialLayout}
              className="p-2 hover:bg-purple-100 dark:hover:bg-purple-900/30 bg-purple-50 dark:bg-purple-950/20 rounded-lg transition-colors border border-purple-200 dark:border-purple-800"
              title="Radial Layout"
            >
              <Circle className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={resetLayout}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Reset Layout"
            >
              <RotateCcw className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </button>
            <button
              onClick={() =>
                setBackgroundVariant(
                  backgroundVariant === BackgroundVariant.Dots
                    ? BackgroundVariant.Lines
                    : BackgroundVariant.Dots,
                )
              }
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Toggle Background"
            >
              <Square className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => setShowMiniMap(!showMiniMap)}
              className={`p-2 rounded-lg transition-colors ${showMiniMap ? "bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50" : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"}`}
              title="Toggle Mini Map"
            >
              <Layers className="h-4 w-4" />
            </button>
            <button
              onClick={exportImage}
              className="p-2 hover:bg-green-100 dark:hover:bg-green-900/30 bg-green-50 dark:bg-green-950/20 rounded-lg transition-colors border border-green-200 dark:border-green-800"
              title="Export as Image"
            >
              <Camera className="h-4 w-4 text-green-600 dark:text-green-400" />
            </button>
          </div>
        </div>
      </Panel>
    </ReactFlow>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Legend data — all known node types
// ─────────────────────────────────────────────────────────────────────────────
const ALL_LEGEND_ITEMS = [
  {
    type: "start",
    label: "Start",
    color:
      "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800",
    icon: CheckCircle2,
  },
  {
    type: "process",
    label: "Process",
    color:
      "bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800",
    icon: Settings,
  },
  {
    type: "decision",
    label: "Decision",
    color:
      "bg-orange-100 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800",
    icon: GitBranch,
  },
  {
    type: "data",
    label: "Data",
    color:
      "bg-purple-100 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800",
    icon: Database,
  },
  {
    type: "end",
    label: "End",
    color:
      "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800",
    icon: XCircle,
  },
  {
    type: "user",
    label: "User",
    color:
      "bg-indigo-100 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800",
    icon: Users,
  },
  {
    type: "system",
    label: "System",
    color:
      "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-800",
    icon: Server,
  },
  {
    type: "api",
    label: "API",
    color:
      "bg-teal-100 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800",
    icon: Globe,
  },
  {
    type: "compute",
    label: "Compute",
    color:
      "bg-yellow-100 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800",
    icon: Cpu,
  },
  {
    type: "storage",
    label: "Storage",
    color:
      "bg-pink-100 dark:bg-pink-950/30 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800",
    icon: HardDrive,
  },
  {
    type: "event",
    label: "Event",
    color:
      "bg-cyan-100 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800",
    icon: Clock,
  },
  {
    type: "entity",
    label: "Entity",
    color:
      "bg-violet-100 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800",
    icon: Table,
  },
  {
    type: "gateway",
    label: "Gateway",
    color:
      "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
    icon: ArrowRight,
  },
  {
    type: "default",
    label: "Node",
    color:
      "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-800",
    icon: Square,
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Pedigree legend — always shown for pedigree diagrams
// ─────────────────────────────────────────────────────────────────────────────
const PedigreeLegend: React.FC = () => (
  <div className="bg-textured rounded-xl p-3 border-border shadow-sm">
    <div className="flex flex-wrap gap-3">
      {[
        {
          label: "Male",
          shape: "w-6 h-6 border-2 border-gray-600 bg-white dark:bg-gray-800",
        },
        {
          label: "Female",
          shape:
            "w-6 h-6 rounded-full border-2 border-gray-600 bg-white dark:bg-gray-800",
        },
        {
          label: "Affected",
          shape:
            "w-6 h-6 border-2 border-gray-600 bg-gray-800 dark:bg-gray-200",
        },
        {
          label: "Deceased",
          shape:
            "w-6 h-6 border-2 border-gray-600 bg-white dark:bg-gray-800 relative overflow-hidden",
        },
        {
          label: "Proband →",
          shape: "w-6 h-6 border-4 border-blue-500 bg-white dark:bg-gray-800",
        },
      ].map(({ label, shape }) => (
        <div key={label} className="flex items-center gap-2">
          <div className={shape} />
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {label}
          </span>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <div className="w-8 h-px border-t-2 border-dashed border-gray-500" />
        <span className="text-xs text-gray-600 dark:text-gray-400">
          Divorced
        </span>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// getDiagramIcon
// ─────────────────────────────────────────────────────────────────────────────
function getDiagramIcon(type: string): React.ReactNode {
  switch (type) {
    case "flowchart":
      return <GitBranch className="h-4 w-4" />;
    case "mindmap":
      return <Rainbow className="h-4 w-4" />;
    case "orgchart":
      return <Users className="h-4 w-4" />;
    case "network":
      return <Network className="h-4 w-4" />;
    case "system":
      return <Server className="h-4 w-4" />;
    case "process":
      return <Settings className="h-4 w-4" />;
    case "pedigree":
      return <Users className="h-4 w-4" />;
    case "timeline":
      return <Clock className="h-4 w-4" />;
    case "erd":
      return <Table className="h-4 w-4" />;
    case "sequence":
      return <ArrowRight className="h-4 w-4" />;
    default:
      return <Network className="h-4 w-4" />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────
interface InteractiveDiagramBlockProps {
  diagram: DiagramData;
  taskId?: string;
}

const InteractiveDiagramBlock: React.FC<InteractiveDiagramBlockProps> = ({
  diagram,
  taskId,
}) => {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [backgroundVariant, setBackgroundVariant] = useState<BackgroundVariant>(
    BackgroundVariant.Dots,
  );
  const { open: openCanvas } = useCanvas();
  const diagramContainerRef = useRef<HTMLDivElement>(null);

  // Build printer — stable unless diagram type or title changes
  const diagramPrinter = useMemo(
    () => createDiagramPrinter(() => diagramContainerRef.current, diagram),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [diagram.title, diagram.type],
  );

  const {
    open: printDialogOpen,
    setOpen: setPrintDialogOpen,
    triggerPrint,
  } = usePrintOptions(diagramPrinter, diagram);

  const exportDiagramJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify({ diagram }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${diagram.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [diagram]);

  // Fallback image export (used if DiagramFlow can't do it)
  const handleExportImage = useCallback(() => {
    const viewport = document.querySelector(
      ".react-flow__viewport",
    ) as HTMLElement | null;
    if (!viewport) return;

    const isDark =
      document.documentElement.classList.contains("dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    import("html2canvas")
      .then((mod) => {
        const restore = patchComputedStyleForCapture(isDark);
        return mod
          .default(viewport, {
            backgroundColor: isDark ? "#111827" : "#ffffff",
            scale: 2,
            useCORS: true,
          })
          .finally(restore);
      })
      .then((canvas) => {
        const a = document.createElement("a");
        a.download = `${diagram.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_diagram.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
      })
      .catch((err) => console.warn("Image export failed:", err));
  }, [diagram.title]);

  // ── Legend ──
  const renderLegend = () => {
    if (diagram.type === "orgchart") return null;
    if (diagram.type === "pedigree") return <PedigreeLegend />;
    if (diagram.renderHints?.showLegend === false) return null;

    const usedTypes = new Set(
      diagram.nodes.map((n) => n.nodeType || n.type || "default"),
    );
    const items = ALL_LEGEND_ITEMS.filter((item) => usedTypes.has(item.type));

    if (
      items.length === 0 ||
      (items.length === 1 && items[0].type === "default")
    )
      return null;

    return (
      <div className="bg-textured rounded-xl p-3 border-border shadow-sm">
        <div
          className={`grid gap-3 ${items.length <= 2 ? "grid-cols-2" : items.length <= 3 ? "grid-cols-3" : "grid-cols-2 md:grid-cols-5"}`}
        >
          {items.map(({ type, label, color, icon: Icon }) => (
            <div
              key={type}
              className={`flex items-center gap-1 p-1 rounded-lg ${color} text-xs font-medium`}
            >
              <Icon className="h-3 w-3" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const legend = renderLegend();

  return (
    <>
      {isFullScreen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setIsFullScreen(false)}
        />
      )}

      <div
        className={`w-full border border-border rounded-xl ${isFullScreen ? "fixed inset-0 z-50 flex items-center justify-center p-2" : "py-2"}`}
      >
        <div
          className={`max-w-6xl mx-auto w-full ${isFullScreen ? "bg-textured rounded-xl shadow-2xl h-full max-h-[95dvh] flex flex-col overflow-hidden border border-border" : ""}`}
        >
          {isFullScreen && (
            <div className="flex-shrink-0 px-3 py-2 border-b border-border flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
              <div className="flex items-center gap-2 min-w-0">
                <div className="text-blue-600 dark:text-blue-400 flex-shrink-0 [&_svg]:h-4 [&_svg]:w-4">
                  {getDiagramIcon(diagram.type)}
                </div>
                <h3 className="text-sm font-semibold text-foreground truncate">
                  {diagram.title}
                </h3>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <IconButton
                  icon={Printer}
                  tooltip="Print / Save as PDF"
                  onClick={triggerPrint}
                  size="sm"
                  className="bg-slate-500 dark:bg-slate-600 text-white hover:bg-slate-600 dark:hover:bg-slate-700"
                />
                <IconButton
                  icon={Download}
                  tooltip="Export as JSON"
                  onClick={exportDiagramJSON}
                  size="sm"
                  variant="outline"
                />
                <IconButton
                  icon={Minimize2}
                  tooltip="Exit full screen"
                  onClick={() => setIsFullScreen(false)}
                  size="sm"
                  variant="outline"
                />
              </div>
            </div>
          )}

          <div
            className={`${isFullScreen ? "flex-1 flex flex-col min-h-0 overflow-hidden p-2" : "p-2"}`}
          >
            {!isFullScreen && (
              <div className="bg-gradient-to-br from-blue-100 via-indigo-50 to-purple-100 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-purple-950/40 rounded-xl p-2 border border-blue-200 dark:border-blue-800/50 mb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <div className="p-2 bg-blue-500 dark:bg-blue-600 rounded-lg flex-shrink-0 text-white [&_svg]:h-4 [&_svg]:w-4">
                      {getDiagramIcon(diagram.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h1 className="text-sm font-bold text-foreground leading-tight line-clamp-2">
                        {diagram.title}
                      </h1>
                      {diagram.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {diagram.description}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 rounded-full text-[10px] font-medium">
                          {formatDiagramType(diagram.type)}
                        </span>
                        {diagram.layout?.direction && (
                          <span className="px-1.5 py-0.5 bg-muted text-muted-foreground rounded-full text-[10px]">
                            {diagram.layout.direction}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <IconButton
                      icon={Printer}
                      tooltip="Print / Save as PDF"
                      onClick={triggerPrint}
                      size="sm"
                      className="bg-slate-500 dark:bg-slate-600 text-white hover:bg-slate-600 dark:hover:bg-slate-700"
                    />
                    <IconButton
                      icon={ExternalLink}
                      tooltip="Open Canvas"
                      onClick={() =>
                        openCanvas({
                          type: "diagram",
                          data: diagram,
                          metadata: {
                            title: diagram.title,
                            sourceTaskId: taskId,
                          },
                        })
                      }
                      size="sm"
                      className="bg-purple-500 dark:bg-purple-600 text-white hover:bg-purple-600 dark:hover:bg-purple-700"
                    />
                    <IconButton
                      icon={Maximize2}
                      tooltip="Expand to full screen"
                      onClick={() => setIsFullScreen(true)}
                      size="sm"
                      className="bg-blue-500 dark:bg-blue-600 text-white hover:bg-blue-600 dark:hover:bg-blue-700"
                    />
                    <IconButton
                      icon={Download}
                      tooltip="Export as JSON"
                      onClick={exportDiagramJSON}
                      size="sm"
                      variant="outline"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ReactFlow Container */}
            <div
              ref={diagramContainerRef}
              className={`${isFullScreen ? "flex-1 min-h-0" : "h-[600px]"} bg-textured rounded-xl border border-border overflow-hidden`}
            >
              <ReactFlowProvider>
                <DiagramFlow
                  diagram={diagram}
                  showMiniMap={showMiniMap}
                  setShowMiniMap={setShowMiniMap}
                  backgroundVariant={backgroundVariant}
                  setBackgroundVariant={setBackgroundVariant}
                  onExportImage={handleExportImage}
                />
              </ReactFlowProvider>
            </div>

            {/* Legend */}
            {legend && (
              <div
                className={
                  isFullScreen
                    ? "flex-shrink-0 px-4 py-3 border-t border-border"
                    : "mt-4"
                }
              >
                {legend}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Print options dialog */}
      <PrintOptionsDialog
        printer={diagramPrinter}
        data={diagram}
        open={printDialogOpen}
        onOpenChange={setPrintDialogOpen}
      />
    </>
  );
};

export default InteractiveDiagramBlock;
