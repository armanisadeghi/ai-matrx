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

import { fingerprintText } from "./fingerprint";
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

export class IrTree {
  private readonly nodes = new Map<string, IrTreeNode>();
  private readonly rawPaths = new Map<string, string>(); // pathKey → reason
  private readonly dirty = new Set<string>();

  private regionStatus: "streaming" | "complete" | "error" = "streaming";
  private errorReason: string | null = null;
  private rootRawValue: Record<string, unknown> | null = null;
  private completedKind = "";

  get status(): "streaming" | "complete" | "error" {
    return this.regionStatus;
  }

  applyEvent(event: KindStreamEvent): void {
    switch (event.type) {
      case "block_snapshot": {
        this.upsertNode(event.path, {
          kind: event.kind,
          value: event.value,
          residue: event.residue,
          complete: event.complete,
        });
        return;
      }
      case "raw_object": {
        this.markRaw(event.path, event.reason, event.value);
        return;
      }
      case "complete": {
        this.regionStatus = this.errorReason ? "error" : "complete";
        this.completedKind = event.kind;
        if (
          this.rawPaths.has("") &&
          isRecord(event.value) &&
          this.rootRawValue === null
        ) {
          this.rootRawValue = event.value;
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
    this.rawPaths.set(pathKey, reason);
    this.nodes.delete(pathKey);
    this.dirty.add(pathKey);

    if (path.length === 0) {
      if (isRecord(value)) this.rootRawValue = value;
      return;
    }

    // The raw child's plain data still belongs to its ancestors — zero loss.
    this.propagateToAncestors(path, value);
  }

  /** Assemble the canonical envelope. ONE code path for stream + one-shot. */
  buildEnvelope(source: string): CanonicalBlockIR {
    const rootNode = this.nodes.get("");
    const rootRawReason = this.rawPaths.get("") ?? null;

    const notices: NonNullable<IrResidue["notices"]> = [];
    if (this.errorReason) {
      notices.push({ code: "parse_error", message: this.errorReason });
    }
    if (rootRawReason) {
      notices.push({ code: "raw_fallback", message: rootRawReason });
    }

    const baseResidue = rootNode?.residue ?? null;
    let residue = baseResidue;
    if (notices.length > 0) {
      residue = {
        extra: baseResidue?.extra ?? null,
        optionalMissing: baseResidue?.optionalMissing ?? null,
        notices: [...(baseResidue?.notices ?? []), ...notices],
      };
    }

    const isRaw = rootRawReason !== null || (!rootNode && !this.errorReason);

    const root: IrStructuredNode = {
      role: "structured",
      kind: isRaw ? "" : (rootNode?.kind ?? this.completedKind),
      kindState: isRaw ? "raw" : rootNode ? rootNode.kindState : "raw",
      discriminator: JSON_DISCRIMINATOR,
      path: [],
      status: this.regionStatus === "streaming" ? "error" : this.regionStatus,
      value: rootNode?.value ?? this.rootRawValue ?? {},
      residue,
    };

    const nodeIndex: NonNullable<CanonicalBlockIR["nodeIndex"]> = {};
    for (const node of this.nodes.values()) {
      if (node.pathKey === "") continue;
      if (!node.complete) continue;
      nodeIndex[node.pathKey] = {
        kind: node.kind,
        kindState: node.kindState,
        status: "complete",
      };
    }
    for (const [pathKey] of this.rawPaths) {
      if (pathKey === "") continue;
      nodeIndex[pathKey] = { kind: "", kindState: "raw", status: "complete" };
    }

    return {
      v: IR_VERSION,
      engine: "fe-kind-parser",
      fingerprint: fingerprintText(source),
      root,
      ...(Object.keys(nodeIndex).length > 0 ? { nodeIndex } : {}),
    };
  }
}
