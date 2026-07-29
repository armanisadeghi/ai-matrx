/**
 * IrTree — the immutable, structurally-shared view of a parsed region.
 *
 * Consumes KindStreamEvents and maintains one node per kind-resolved path.
 * Node values are STABILIZED: compound children that are themselves kind
 * nodes are substituted by their current tree value, so an update to
 * cards[7] produces new identities for root → cards → cards[7] ONLY;
 * cards[0..6] keep referential identity and memoized components bail out.
 *
 * Parser frame values are NEVER exposed — everything handed out is rebuilt
 * copy-on-write, so it is safe to freeze (Redux dev-mode immutability) and
 * safe to hold across renders.
 *
 * Both the live ParseSession and the one-shot normalizer build their
 * CanonicalBlockIR from this tree — one assembly path, structurally
 * identical output for stream and static input.
 */

import { JSON_DISCRIMINATOR } from "./discriminator";
import {
  IR_VERSION,
  irPathKey,
  type CanonicalBlockIR,
  type IrKindState,
  type IrPath,
  type IrResidue,
  type IrStructuredNode,
} from "./ir-types";
import type { KindStreamEvent } from "./kind-parser";

export interface IrTreeNode {
  kind: string;
  kindState: IrKindState;
  path: IrPath;
  pathKey: string;
  /** Stabilized immutable snapshot value (schema fields + __kind only). */
  value: Record<string, unknown>;
  residue: IrResidue | null;
  complete: boolean;
  /** Bumps on every update to this node (incl. child propagation). */
  version: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * THE NO-REGRESSION LAW: a value already shown to a user is never taken away.
 *
 * A degrade (raw_object) or a late completion carries the parser's plain view
 * of a node, which can be POORER than the snapshot the tree already holds —
 * `{}` in the worst case, when a root object closes and its schema was never
 * satisfied. Overwriting with it blanks a fully-rendered block mid-stream.
 * Incoming keys win; prior keys the incoming lacks survive.
 *
 * Returns the merged value plus whether prior fields had to be rescued —
 * a rescue means a real defect upstream and is reported on the envelope as a
 * `degrade_data_rescued` notice, never silently absorbed.
 */
function mergeWithoutLoss(
  prior: unknown,
  incoming: unknown,
): { value: unknown; rescued: string[] } {
  if (!isRecord(prior)) return { value: incoming, rescued: [] };
  if (!isRecord(incoming)) {
    // A real array/scalar is a genuine shape change, not a blanking; only
    // nothing-at-all loses to what we already have.
    if (incoming !== null && incoming !== undefined) {
      return { value: incoming, rescued: [] };
    }
    return { value: prior, rescued: Object.keys(prior) };
  }
  const rescued = Object.keys(prior).filter((key) => !(key in incoming));
  if (rescued.length === 0) return { value: incoming, rescued };
  return { value: { ...prior, ...incoming }, rescued };
}

export class IrTree {
  private readonly nodes = new Map<string, IrTreeNode>();
  private readonly rawPaths = new Map<string, string>(); // pathKey → reason
  private readonly dirty = new Set<string>();

  /**
   * KIND PRESERVATION (streaming db/cloud kinds): pathKey → identified kind
   * for nodes whose kind is KNOWN (kind_identified / pending_schema) but that
   * have no snapshot node yet because the schema is still cold-fetching.
   * Without this, the envelope reports `kind: ""` for the whole pending
   * window and the render seam can only show raw JSON.
   */
  private readonly identifiedKinds = new Map<string, string>();
  /** pathKeys currently waiting on a schema cold fetch. */
  private readonly pendingSchemaPaths = new Set<string>();
  /**
   * Early top-level scalar fields (title, loading_message, …) captured for
   * identified-but-schema-pending nodes — the loading-component fuel. Scalars
   * only (no live parser references can escape through here). Superseded the
   * moment a real snapshot node exists.
   */
  private readonly earlyFields = new Map<string, Record<string, unknown>>();
  /**
   * pathKey → identified kind preserved through a SCHEMA-AVAILABILITY raw
   * fallback (parser stamped `kind` on the raw_object event). Structural raws
   * (missing __kind, duplicate key, validation failure) never land here.
   */
  private readonly rawKinds = new Map<string, string>();

  private regionStatus: "streaming" | "complete" | "error" = "streaming";
  private errorReason: string | null = null;
  private rootRawValue: Record<string, unknown> | null = null;
  /** Notices for degrades that tried to erase already-published data. */
  private readonly rescueNotices: NonNullable<IrResidue["notices"]> = [];
  private completedKind = "";

  get status(): "streaming" | "complete" | "error" {
    return this.regionStatus;
  }

  applyEvent(event: KindStreamEvent): void {
    switch (event.type) {
      case "kind_identified": {
        this.identifiedKinds.set(irPathKey(event.path), event.kind);
        this.dirty.add(irPathKey(event.path));
        return;
      }
      case "pending_schema": {
        const pathKey = irPathKey(event.path);
        this.identifiedKinds.set(pathKey, event.kind);
        this.pendingSchemaPaths.add(pathKey);
        this.dirty.add(pathKey);
        return;
      }
      case "field": {
        // Only meaningful pre-schema: an identified node with NO snapshot yet
        // accumulates its early scalar values for the loading component.
        const parentKey = irPathKey(event.path.slice(0, -1));
        if (this.nodes.has(parentKey)) return;
        if (!this.identifiedKinds.has(parentKey)) return;
        const v = event.value;
        if (v !== null && typeof v === "object") return; // scalars only
        const bucket = this.earlyFields.get(parentKey) ?? {};
        bucket[event.key] = v;
        this.earlyFields.set(parentKey, bucket);
        this.dirty.add(parentKey);
        return;
      }
      case "block_snapshot": {
        const pathKey = irPathKey(event.path);
        this.pendingSchemaPaths.delete(pathKey);
        this.earlyFields.delete(pathKey);
        this.upsertNode(event.path, {
          kind: event.kind,
          value: event.value,
          residue: event.residue,
          complete: event.complete,
        });
        return;
      }
      case "raw_object": {
        const pathKey = irPathKey(event.path);
        this.pendingSchemaPaths.delete(pathKey);
        this.earlyFields.delete(pathKey);
        if (event.kind) this.rawKinds.set(pathKey, event.kind);
        this.markRaw(event.path, event.reason, event.value);
        return;
      }
      case "complete": {
        this.regionStatus = this.errorReason ? "error" : "complete";
        this.completedKind = event.kind;
        if (this.rawPaths.has("") && isRecord(event.value)) {
          // The completion value is the parser's full view of the region — it
          // fills a raw root, and merges with (never regresses) one a mid-
          // stream degrade already wrote.
          const merged = mergeWithoutLoss(this.rootRawValue, event.value);
          this.recordRescue("", "complete", merged.rescued);
          if (isRecord(merged.value)) this.rootRawValue = merged.value;
        }
        this.dirty.add("");
        return;
      }
      case "error": {
        this.errorReason = event.reason;
        this.regionStatus = "error";
        this.dirty.add("");
        return;
      }
      default:
        return;
    }
  }

  getNode(pathKey: string): IrTreeNode | null {
    return this.nodes.get(pathKey) ?? null;
  }

  listNodes(): IrTreeNode[] {
    return [...this.nodes.values()];
  }

  isRawPath(pathKey: string): boolean {
    return this.rawPaths.has(pathKey);
  }

  /** Dirty pathKeys since the last drain — the flush/notify unit. */
  drainDirty(): string[] {
    const drained = [...this.dirty];
    this.dirty.clear();
    return drained;
  }

  hasDirty(): boolean {
    return this.dirty.size > 0;
  }

  // -------------------------------------------------------------------------

  private upsertNode(
    path: IrPath,
    payload: {
      kind: string;
      value: Record<string, unknown>;
      residue: IrResidue | null;
      complete: boolean;
    },
  ): void {
    const pathKey = irPathKey(path);
    if (this.rawPaths.has(pathKey)) return;

    const stabilized = this.stabilizeValue(
      payload.value,
      path,
      pathKey,
    ) as Record<string, unknown>;

    const prior = this.nodes.get(pathKey);
    const node: IrTreeNode = {
      kind: payload.kind,
      kindState: payload.complete ? "resolved" : (prior?.kindState ?? "resolved"),
      path,
      pathKey,
      value: stabilized,
      residue: payload.residue,
      complete: payload.complete,
      version: (prior?.version ?? 0) + 1,
    };
    this.nodes.set(pathKey, node);
    this.dirty.add(pathKey);

    this.propagateToAncestors(path, node.value);
  }

  /**
   * Substitute kind-node children with their current tree values so sibling
   * identities are stable; deep-copy everything else so no live parser
   * reference ever escapes.
   */
  private stabilizeValue(
    value: unknown,
    path: IrPath,
    applyingPathKey: string,
  ): unknown {
    if (Array.isArray(value)) {
      return value.map((item, index) =>
        this.stabilizeValue(item, [...path, index], applyingPathKey),
      );
    }
    if (isRecord(value)) {
      const pathKey = irPathKey(path);
      if (pathKey !== applyingPathKey) {
        const childNode = this.nodes.get(pathKey);
        if (childNode) return childNode.value;
      }
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value)) {
        out[key] = this.stabilizeValue(child, [...path, key], applyingPathKey);
      }
      return out;
    }
    return value;
  }

  /**
   * COW spine rebuild: replace the child's slot in each ancestor kind-node's
   * value, shallow-copying only the containers along the way. Siblings keep
   * identity; every ancestor gets a new value identity + version bump.
   */
  private propagateToAncestors(childPath: IrPath, childValue: unknown): void {
    let currentPath = childPath;
    let currentValue: unknown = childValue;

    while (currentPath.length > 0) {
      const ancestor = this.findNearestAncestorNode(currentPath);
      if (!ancestor) return;

      const relative = currentPath.slice(ancestor.path.length);
      const rebuilt = this.cloneAlong(ancestor.value, relative, currentValue);
      if (rebuilt === ancestor.value) return;

      const updated: IrTreeNode = {
        ...ancestor,
        value: rebuilt as Record<string, unknown>,
        version: ancestor.version + 1,
      };
      this.nodes.set(ancestor.pathKey, updated);
      this.dirty.add(ancestor.pathKey);

      currentPath = ancestor.path;
      currentValue = updated.value;
    }
  }

  private findNearestAncestorNode(path: IrPath): IrTreeNode | null {
    for (let len = path.length - 1; len >= 0; len--) {
      const node = this.nodes.get(irPathKey(path.slice(0, len)));
      if (node) return node;
    }
    return null;
  }

  private cloneAlong(
    container: unknown,
    relative: IrPath,
    leaf: unknown,
  ): unknown {
    if (relative.length === 0) return leaf;

    const [head, ...rest] = relative;

    if (Array.isArray(container)) {
      const index = typeof head === "number" ? head : Number(head);
      const copy = container.slice();
      // Growing the array (a child that hasn't hit the parent snapshot yet).
      while (copy.length <= index) copy.push(undefined);
      copy[index] = this.cloneAlong(container[index], rest, leaf);
      return copy;
    }

    if (isRecord(container)) {
      const key = String(head);
      return {
        ...container,
        [key]: this.cloneAlong(container[key], rest, leaf),
      };
    }

    // The slot's container hasn't arrived in the ancestor value yet — build it.
    const built: unknown =
      typeof head === "number"
        ? this.cloneAlong([], relative, leaf)
        : this.cloneAlong({}, relative, leaf);
    return built;
  }

  private markRaw(path: IrPath, reason: string, value: unknown): void {
    const pathKey = irPathKey(path);
    // NO REGRESSION: the degrade must not blank the snapshot this node already
    // published. Its plain data still belongs to its ancestors — zero loss.
    const prior =
      path.length === 0
        ? (this.nodes.get("")?.value ?? this.rootRawValue)
        : this.nodes.get(pathKey)?.value;
    const merged = mergeWithoutLoss(prior, value);
    this.recordRescue(pathKey, reason, merged.rescued);

    this.rawPaths.set(pathKey, reason);
    this.nodes.delete(pathKey);
    this.dirty.add(pathKey);

    if (path.length === 0) {
      if (isRecord(merged.value)) this.rootRawValue = merged.value;
      return;
    }

    this.propagateToAncestors(path, merged.value);
  }

  /**
   * A rescue means a degrade tried to erase data a user could already see —
   * an upstream defect. It rides the envelope as a notice so it surfaces in the
   * Error Inspector instead of being silently absorbed (`core/` is a pure
   * kernel: no console, no capture — the notice IS the alarm).
   */
  private recordRescue(pathKey: string, reason: string, rescued: string[]): void {
    if (rescued.length === 0) return;
    this.rescueNotices.push({
      code: "degrade_data_rescued",
      message: `degrade (${reason}) at path "${pathKey || "<root>"}" would have dropped: ${rescued.join(", ")}`,
    });
  }

  /**
   * Assemble the canonical envelope. ONE code path for stream + one-shot.
   * Callers supply the fingerprint (one-shot hashes the source; live sessions
   * keep an incremental hasher so no per-flush re-hash happens).
   */
  buildEnvelope(fingerprint: string): CanonicalBlockIR {
    const rootNode = this.nodes.get("");
    const rootRawReason = this.rawPaths.get("") ?? null;

    const notices: NonNullable<IrResidue["notices"]> = [];
    if (this.errorReason) {
      notices.push({ code: "parse_error", message: this.errorReason });
    }
    if (rootRawReason) {
      notices.push({ code: "raw_fallback", message: rootRawReason });
    }
    notices.push(...this.rescueNotices);

    const baseResidue = rootNode?.residue ?? null;
    let residue = baseResidue;
    if (notices.length > 0) {
      residue = {
        extra: baseResidue?.extra ?? null,
        optionalMissing: baseResidue?.optionalMissing ?? null,
        notices: [...(baseResidue?.notices ?? []), ...notices],
      };
    }

    const isRaw = rootRawReason !== null;

    // KIND PRESERVATION: a root that degraded raw purely because its schema
    // never arrived (rawKinds) keeps its identified kind — the render seam
    // routes it to the generic viewer / db component instead of raw JSON, and
    // a late schema/component arrival can upgrade it via repaint. Structural
    // raws (no entry in rawKinds) stay kind-less exactly as before. While
    // STREAMING with a known-but-cold kind (no node yet), the identified kind
    // + early scalar fields surface so the loading layer can render.
    const identifiedKind = this.identifiedKinds.get("") ?? "";
    const rootKind = isRaw
      ? (this.rawKinds.get("") ?? "")
      : (rootNode?.kind ?? (this.completedKind || identifiedKind));

    const root: IrStructuredNode = {
      role: "structured",
      kind: rootKind,
      kindState: isRaw
        ? "raw"
        : rootNode
          ? rootNode.kindState
          : this.pendingSchemaPaths.has("")
            ? "pending_schema"
            : this.regionStatus === "streaming"
              ? identifiedKind
                ? "pending_schema"
                : "pending_kind"
              : "raw",
      discriminator: JSON_DISCRIMINATOR,
      path: [],
      status: this.regionStatus,
      value:
        rootNode?.value ??
        this.rootRawValue ??
        // Copy: the early-fields bucket keeps mutating as fields arrive; the
        // envelope must be freezable (Redux dev-mode immutability).
        (this.earlyFields.has("") ? { ...this.earlyFields.get("") } : {}),
      residue,
    };

    const nodeIndex: NonNullable<CanonicalBlockIR["nodeIndex"]> = {};
    for (const node of this.nodes.values()) {
      if (node.pathKey === "") continue;
      nodeIndex[node.pathKey] = {
        kind: node.kind,
        kindState: node.kindState,
        status: node.complete ? "complete" : "streaming",
        ...(node.residue ? { residue: node.residue } : {}),
      };
    }
    for (const [pathKey] of this.rawPaths) {
      if (pathKey === "") continue;
      nodeIndex[pathKey] = { kind: "", kindState: "raw", status: "complete" };
    }

    return {
      v: IR_VERSION,
      engine: "fe-kind-parser",
      fingerprint,
      root,
      ...(Object.keys(nodeIndex).length > 0 ? { nodeIndex } : {}),
    };
  }
}
