import type { StudyMediaRow } from "../../types";
import { coerceTrustEnvelope, type TrustEnvelope } from "@/features/education/trust/types";
import {
  collectProblems,
  readCollectionList,
  repeatsProblem,
} from "@/features/surfaces/runtime/collection-write-targets";

type JsonRecord = Record<string, unknown>;

function record(value: unknown, at: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${at} must be an object.`);
  return value as JsonRecord;
}

function text(value: unknown, at: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${at} needs text.`);
  return value.trim();
}

function optionalText(value: unknown, at: string): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") throw new Error(`${at} must be text.`);
  return value.trim();
}

function rawField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const field = (value as JsonRecord)[key];
  return typeof field === "string" ? field : undefined;
}

export interface MindMapEnvelope extends JsonRecord {
  __kind: "diagram_spec";
  title: string;
  nodes: JsonRecord[];
  edges: JsonRecord[];
}

function parseNode(value: unknown, at: string, previous?: JsonRecord): JsonRecord {
  const raw = record(value, at);
  const id = text(raw.id, `${at}.id`);
  const label = text(raw.label, `${at}.label`);
  const next: JsonRecord = { ...previous, ...raw, __kind: "diagram_node", id, label };
  for (const key of ["description", "details"] as const) {
    if (key in raw) next[key] = optionalText(raw[key], `${at}.${key}`) ?? "";
  }
  return next;
}

function parseEdge(value: unknown, at: string, previous?: JsonRecord): JsonRecord {
  const raw = record(value, at);
  const id = text(raw.id, `${at}.id`);
  const source = text(raw.source, `${at}.source`);
  const target = text(raw.target, `${at}.target`);
  const next: JsonRecord = { ...previous, ...raw, __kind: "diagram_edge", id, source, target };
  if ("label" in raw) next.label = optionalText(raw.label, `${at}.label`) ?? "";
  return next;
}

function duplicate(values: readonly string[], what: string): void {
  const seen = new Set<string>();
  const repeated = values.filter((value) => (seen.has(value) ? true : (seen.add(value), false)));
  if (repeated.length) throw new Error(`${what} repeats ${[...new Set(repeated)].join(", ")}.`);
}

/** Validates a complete editable diagram while retaining every unedited envelope field. */
export function parseMindMap(value: unknown, at = "mind map"): MindMapEnvelope {
  const raw = record(value, at);
  const title = text(raw.title, `${at}.title`);
  if (!Array.isArray(raw.nodes)) throw new Error(`${at}.nodes must be an array.`);
  if (!Array.isArray(raw.edges)) throw new Error(`${at}.edges must be an array.`);
  const nodes = raw.nodes.map((node, index) => parseNode(node, `${at}.nodes[${index}]`));
  duplicate(nodes.map((node) => node.id as string), `${at}.nodes`);
  const ids = new Set(nodes.map((node) => node.id as string));
  const edges = raw.edges.map((edge, index) => parseEdge(edge, `${at}.edges[${index}]`));
  duplicate(edges.map((edge) => edge.id as string), `${at}.edges`);
  for (const edge of edges) {
    if (!ids.has(edge.source as string) || !ids.has(edge.target as string))
      throw new Error(`${at}.edges[${edges.indexOf(edge)}] must connect two nodes in this map.`);
  }
  return { ...raw, __kind: "diagram_spec", title, type: typeof raw.type === "string" ? raw.type : "mindmap", nodes, edges } as MindMapEnvelope;
}

export function blankMindMap(): MindMapEnvelope {
  return { __kind: "diagram_spec", title: "", type: "mindmap", nodes: [], edges: [] };
}

/** Existing citations stay visible as provenance, but edited graph claims are no
 * longer presented as the generator's fully grounded output. */
export function trustAfterMindMapEdit(value: unknown): TrustEnvelope | null {
  const trust = coerceTrustEnvelope({ trust: value });
  return trust ? { ...trust, confidence: "inferred" } : null;
}

function currentEnvelope(row: StudyMediaRow): MindMapEnvelope {
  return parseMindMap(row.ir_envelope, `mind map ${row.id}`);
}

function list(value: unknown, target: string): unknown[] {
  return readCollectionList(target, "mind_maps", value);
}

export function parseCreateMindMaps(value: unknown): MindMapEnvelope[] {
  const target = "create_mind_maps";
  return collectProblems(target, list(value, target), (item, index) => parseMindMap(item, `${target}[${index}]`), {
    listChecks: (items) => [repeatsProblem(target, items.map((item) => item.value?.title ?? rawField(item.raw, "title")), "title")],
  });
}

export interface MindMapUpdatePlan { id: string; version: number; map: MindMapEnvelope; changed: string[]; }

/** Partial agent updates merge collections by id, so untouched node/edge metadata survives. */
export function parseUpdateMindMaps(value: unknown, available: readonly StudyMediaRow[]): MindMapUpdatePlan[] {
  const target = "update_mind_maps";
  return collectProblems(target, list(value, target), (item, index) => {
    const raw = record(item, `${target}[${index}]`);
    const id = text(raw.id, `${target}[${index}].id`);
    const row = available.find((candidate) => candidate.id === id);
    if (!row) throw new Error(`${target}: ${id} is not an editable mind map on this page.`);
    const changed = Object.keys(raw).filter((key) => key !== "id");
    if (!changed.length) throw new Error(`${target}[${index}] needs at least one field to change.`);
    const allowed = ["title", "nodes", "edges"];
    const unknown = changed.filter((key) => !allowed.includes(key));
    if (unknown.length) throw new Error(`${target}[${index}] does not accept ${unknown.join(", ")}.`);
    const previous = currentEnvelope(row);
    const nodes = "nodes" in raw
      ? (() => {
          if (!Array.isArray(raw.nodes)) throw new Error(`${target}[${index}].nodes must be an array.`);
          const before = new Map(previous.nodes.map((node) => [node.id as string, node]));
          return raw.nodes.map((node, nodeIndex) => parseNode(node, `${target}[${index}].nodes[${nodeIndex}]`, before.get(text(record(node, `${target}[${index}].nodes[${nodeIndex}]`).id, `${target}[${index}].nodes[${nodeIndex}].id`))));
        })()
      : previous.nodes;
    const edges = "edges" in raw
      ? (() => {
          if (!Array.isArray(raw.edges)) throw new Error(`${target}[${index}].edges must be an array.`);
          const before = new Map(previous.edges.map((edge) => [edge.id as string, edge]));
          return raw.edges.map((edge, edgeIndex) => parseEdge(edge, `${target}[${index}].edges[${edgeIndex}]`, before.get(text(record(edge, `${target}[${index}].edges[${edgeIndex}]`).id, `${target}[${index}].edges[${edgeIndex}].id`))));
        })()
      : previous.edges;
    const map = parseMindMap({ ...previous, title: "title" in raw ? raw.title : previous.title, nodes, edges }, `${target}[${index}]`);
    return { id, version: row.version, map, changed };
  }, { listChecks: (items) => [repeatsProblem(target, items.map((item) => item.value?.id ?? rawField(item.raw, "id")), "id")] });
}

export function parseMindMapIds(value: unknown, target: string, available: readonly { id: string }[]): string[] {
  return collectProblems(target, list(value, target), (item, index) => {
    const id = text(typeof item === "string" ? item : record(item, `${target}[${index}]`).id, `${target}[${index}].id`);
    if (!available.some((row) => row.id === id)) throw new Error(`${id} is not an owned mind map on this page.`);
    return id;
  }, { listChecks: (items) => [repeatsProblem(target, items.map((item) => item.value ?? (typeof item.raw === "string" ? item.raw : rawField(item.raw, "id"))), "id")] });
}
