/**
 * Trigger Points — the flat, stable, enumerable namespace of named moments in a
 * workflow run (design ruling R2, common-docs/systems/workflow-runtime-ui/PLAN.md).
 *
 * The start of a node and the traversal of an edge are the same kind of thing:
 * a NAMED moment anything can bind behavior to (`appearOn`, `pageChangeOn`,
 * `actionEnabledOn`, `hideOn`, agent bindings, ...). Trigger points are derived
 * from the DEFINITION, so the full vocabulary exists before the first run and
 * the builder can render it as a dropdown; they are resolved against live run
 * state with `hasTriggerFired`.
 *
 * Edge traversal is DERIVED client-side (the engine emits no edge events):
 * an edge has been traversed when its source node has settled and its target
 * node has left `idle`.
 *
 * Pure module — no React, no Redux, no side effects.
 */

/** Structural shape of a matrx-graph (ReactFlow-shaped) workflow definition. */
export interface WorkflowDefinitionLike {
  nodes: Array<{
    id: string;
    type?: string;
    data?: { spec_type?: string; label?: string; [k: string]: unknown };
  }>;
  edges: Array<{ id: string; source: string; target: string; [k: string]: unknown }>;
}

/** e.g. "run:completed", "node:<nodeId>:started", "edge:<edgeId>:traversed", "mark:<name>" */
export type TriggerPointId = string;

export interface TriggerPoint {
  id: TriggerPointId;
  kind: "run" | "node" | "edge" | "deliverable" | "mark";
  label: string;
  nodeId?: string;
  edgeId?: string;
}

export type RunTriggerEvent = "started" | "completed" | "failed" | "paused" | "interrupted";
export type NodeTriggerEvent = "started" | "completed" | "failed";

const RUN_EVENTS: readonly RunTriggerEvent[] = [
  "started",
  "completed",
  "failed",
  "paused",
  "interrupted",
];

const NODE_EVENTS: readonly NodeTriggerEvent[] = ["started", "completed", "failed"];

const RUN_LABELS: Record<RunTriggerEvent, string> = {
  started: "When the run starts",
  completed: "When the run completes",
  failed: "When the run fails",
  paused: "When the run pauses",
  interrupted: "When the run is interrupted",
};

const NODE_LABEL_VERBS: Record<NodeTriggerEvent, string> = {
  started: "starts",
  completed: "completes",
  failed: "fails",
};

/** Human-readable display name for a node: data.label, else data.spec_type, else id. */
function nodeDisplayName(node: WorkflowDefinitionLike["nodes"][number]): string {
  const label = node.data?.label;
  if (typeof label === "string" && label.length > 0) return label;
  const specType = node.data?.spec_type;
  if (typeof specType === "string" && specType.length > 0) return specType;
  return node.id;
}

/**
 * Derive the complete, ordered trigger-point vocabulary from a definition.
 * Order: run points, then nodes in definition order (started/completed/failed
 * each), then edges in definition order, then deliverable:ready.
 */
export function deriveTriggerPoints(definition: WorkflowDefinitionLike): TriggerPoint[] {
  const points: TriggerPoint[] = [];

  for (const event of RUN_EVENTS) {
    points.push({ id: `run:${event}`, kind: "run", label: RUN_LABELS[event] });
  }

  for (const node of definition.nodes) {
    const name = nodeDisplayName(node);
    for (const event of NODE_EVENTS) {
      points.push({
        id: `node:${node.id}:${event}`,
        kind: "node",
        label: `When '${name}' ${NODE_LABEL_VERBS[event]}`,
        nodeId: node.id,
      });
    }
  }

  const nodesById = new Map(definition.nodes.map((n) => [n.id, n]));
  for (const edge of definition.edges) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    const sourceName = source ? nodeDisplayName(source) : edge.source;
    const targetName = target ? nodeDisplayName(target) : edge.target;
    points.push({
      id: `edge:${edge.id}:traversed`,
      kind: "edge",
      label: `When '${sourceName}' hands off to '${targetName}'`,
      edgeId: edge.id,
    });
  }

  points.push({
    id: "deliverable:ready",
    kind: "deliverable",
    label: "When the deliverable is ready",
  });

  return points;
}

/** Aggregate per-node phase, as the run-state selectors report it. */
export type NodeTriggerPhase =
  | "idle"
  | "waiting"
  | "running"
  | "settled"
  | "failed"
  | "skipped"
  | "retrying";

export interface TriggerResolutionState {
  /** WorkflowRunStatus, or null when no run exists yet. */
  runStatus: string | null;
  /** Aggregate phase by nodeId. Absent nodeId reads as "idle". */
  nodePhases: Record<string, NodeTriggerPhase>;
  /** Author-defined marks already fired (mark:<name> points). */
  marks: ReadonlySet<string>;
  /** Config: which node's settle means deliverable:ready (null = run completion only). */
  deliverableNodeId: string | null;
}

export type ParsedTriggerPoint =
  | { kind: "run"; event: RunTriggerEvent }
  | { kind: "node"; nodeId: string; event: NodeTriggerEvent }
  | { kind: "edge"; edgeId: string; event: "traversed" }
  | { kind: "deliverable"; event: "ready" }
  | { kind: "mark"; name: string };

function isRunEvent(s: string): s is RunTriggerEvent {
  return (RUN_EVENTS as readonly string[]).includes(s);
}

function isNodeEvent(s: string): s is NodeTriggerEvent {
  return (NODE_EVENTS as readonly string[]).includes(s);
}

/**
 * Parse a trigger-point id into its discriminated form, or null for anything
 * malformed/unknown. Node/edge ids may themselves contain ":" — the event is
 * always the LAST segment, the entity id is everything between.
 */
export function parseTriggerPointId(id: TriggerPointId): ParsedTriggerPoint | null {
  if (id === "deliverable:ready") return { kind: "deliverable", event: "ready" };

  if (id.startsWith("run:")) {
    const event = id.slice("run:".length);
    return isRunEvent(event) ? { kind: "run", event } : null;
  }

  if (id.startsWith("mark:")) {
    const name = id.slice("mark:".length);
    return name.length > 0 ? { kind: "mark", name } : null;
  }

  if (id.startsWith("node:")) {
    const rest = id.slice("node:".length);
    const lastColon = rest.lastIndexOf(":");
    if (lastColon <= 0) return null;
    const nodeId = rest.slice(0, lastColon);
    const event = rest.slice(lastColon + 1);
    return isNodeEvent(event) ? { kind: "node", nodeId, event } : null;
  }

  if (id.startsWith("edge:")) {
    const rest = id.slice("edge:".length);
    const lastColon = rest.lastIndexOf(":");
    if (lastColon <= 0) return null;
    const edgeId = rest.slice(0, lastColon);
    const event = rest.slice(lastColon + 1);
    return event === "traversed" ? { kind: "edge", edgeId, event: "traversed" } : null;
  }

  return null;
}

function phaseOf(state: TriggerResolutionState, nodeId: string): NodeTriggerPhase {
  return state.nodePhases[nodeId] ?? "idle";
}

/** A node "has started" once it is (or was) actively worked. */
const STARTED_PHASES: ReadonlySet<NodeTriggerPhase> = new Set([
  "running",
  "settled",
  "failed",
  "retrying",
]);

/**
 * Resolve whether a trigger point has fired for the given run state.
 * Unknown or malformed ids resolve to false — never throw.
 *
 * Rules are LITERAL: run:completed does not cascade into node/edge points.
 * Edge traversal is derived: source settled AND target not idle.
 */
export function hasTriggerFired(
  id: TriggerPointId,
  def: WorkflowDefinitionLike,
  state: TriggerResolutionState,
): boolean {
  const parsed = parseTriggerPointId(id);
  if (parsed === null) return false;

  switch (parsed.kind) {
    case "run": {
      if (state.runStatus === null) return false;
      if (parsed.event === "started") {
        // The run has started once it holds any post-pending status.
        return state.runStatus !== "pending";
      }
      return state.runStatus === parsed.event;
    }
    case "node": {
      const phase = phaseOf(state, parsed.nodeId);
      if (parsed.event === "started") return STARTED_PHASES.has(phase);
      if (parsed.event === "completed") return phase === "settled";
      return phase === "failed";
    }
    case "edge": {
      const edge = def.edges.find((e) => e.id === parsed.edgeId);
      if (!edge) return false;
      return (
        phaseOf(state, edge.source) === "settled" && phaseOf(state, edge.target) !== "idle"
      );
    }
    case "deliverable": {
      if (state.runStatus === "completed") return true;
      if (state.deliverableNodeId === null) return false;
      return phaseOf(state, state.deliverableNodeId) === "settled";
    }
    case "mark":
      return state.marks.has(parsed.name);
  }
}
