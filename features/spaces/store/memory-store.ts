// features/spaces/store/memory-store.ts — the in-memory SpacesStore (kind "memory").
//
// Lives for the browser tab: a reload starts again from the seed. The UI shows the "Sample data — not
// saved" marker whenever `kind === "memory"`. Every read and write deep-copies, so callers can never
// mutate the store by holding a reference (the same contract a database store gives).

import type { SpaceBlock, SpaceDoc, SpaceId, SpaceSummary, SpacesStore } from "../contract";
import { between, byPosition } from "./position";
import { seedSpaces } from "./seed";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function summary(doc: SpaceDoc): SpaceSummary {
  const { id, parentId, position, title, icon, isArchived, updatedAt } = doc;
  return clone({ id, parentId, position, title, icon, isArchived, updatedAt });
}

function freshIds(blocks: SpaceBlock[]): SpaceBlock[] {
  return blocks.map((b) => ({ ...b, id: crypto.randomUUID(), children: b.children ? freshIds(b.children) : undefined }));
}

/** A newer timestamp than `prev`, even when called twice in the same millisecond. */
function nextStamp(prev?: string): string {
  const now = Date.now();
  const last = prev ? Date.parse(prev) : 0;
  return new Date(Math.max(now, last + 1)).toISOString();
}

export class MemorySpacesStore implements SpacesStore {
  readonly kind = "memory" as const;
  private docs = new Map<SpaceId, SpaceDoc>();
  private listeners = new Set<() => void>();

  constructor(seed: SpaceDoc[]) {
    for (const doc of seed) this.docs.set(doc.id, clone(doc));
  }

  /** Not part of the contract: lets the in-tab UI refresh its tree after any write. */
  onAnyChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private siblings(parentId: SpaceId | null): SpaceDoc[] {
    return [...this.docs.values()].filter((d) => d.parentId === parentId && !d.isArchived).sort(byPosition);
  }

  private descendants(id: SpaceId): SpaceDoc[] {
    const out: SpaceDoc[] = [];
    for (const d of this.docs.values()) {
      if (d.parentId === id) out.push(d, ...this.descendants(d.id));
    }
    return out;
  }

  async list(options?: { includeArchived?: boolean }): Promise<SpaceSummary[]> {
    return [...this.docs.values()].filter((d) => options?.includeArchived || !d.isArchived).sort(byPosition).map(summary);
  }

  async get(id: SpaceId): Promise<SpaceDoc | null> {
    const doc = this.docs.get(id);
    return doc ? clone(doc) : null;
  }

  async create(input: { parentId: SpaceId | null; title?: string; blocks?: SpaceBlock[]; afterId?: SpaceId }): Promise<SpaceDoc> {
    const sibs = this.siblings(input.parentId);
    let position: string;
    if (input.afterId) {
      const i = sibs.findIndex((s) => s.id === input.afterId);
      position = between(sibs[i]?.position ?? null, sibs[i + 1]?.position ?? null);
    } else {
      position = between(sibs.at(-1)?.position ?? null, null);
    }
    const stamp = nextStamp();
    const doc: SpaceDoc = {
      id: crypto.randomUUID(),
      parentId: input.parentId,
      position,
      title: input.title ?? "",
      icon: null,
      cover: null,
      settings: { font: "default", smallText: false, fullWidth: false, locked: false },
      blocks: input.blocks ?? [],
      isArchived: false,
      createdAt: stamp,
      updatedAt: stamp,
      updatedBy: null,
      version: 1,
    };
    this.docs.set(doc.id, clone(doc));
    this.emit();
    return clone(doc);
  }

  async save(doc: SpaceDoc, expectedVersion: number): Promise<SpaceDoc> {
    const current = this.docs.get(doc.id);
    if (!current) throw new Error("This Space no longer exists.");
    if (current.version !== expectedVersion) throw new Error("This Space changed since it was opened.");
    const next: SpaceDoc = { ...clone(doc), version: current.version + 1, updatedAt: nextStamp(current.updatedAt) };
    this.docs.set(doc.id, next);
    this.emit();
    return clone(next);
  }

  async move(id: SpaceId, parentId: SpaceId | null, position: string): Promise<void> {
    const doc = this.docs.get(id);
    if (!doc) return;
    if (parentId === id || (parentId && this.descendants(id).some((d) => d.id === parentId))) {
      throw new Error("A Space cannot move inside itself.");
    }
    this.docs.set(id, { ...doc, parentId, position, updatedAt: nextStamp(doc.updatedAt), version: doc.version + 1 });
    this.emit();
  }

  async duplicate(id: SpaceId, options: { withChildren: boolean }): Promise<SpaceDoc> {
    const source = this.docs.get(id);
    if (!source) throw new Error("This Space no longer exists.");
    const sibs = this.siblings(source.parentId);
    const i = sibs.findIndex((s) => s.id === id);
    const copyOf = (doc: SpaceDoc, parentId: SpaceId | null, position: string): SpaceDoc => {
      const stamp = nextStamp();
      return { ...clone(doc), id: crypto.randomUUID(), parentId, position, blocks: freshIds(doc.blocks), createdAt: stamp, updatedAt: stamp, version: 1 };
    };
    const top = copyOf(source, source.parentId, between(source.position, sibs[i + 1]?.position ?? null));
    top.title = source.title ? `${source.title} (1)` : "";
    this.docs.set(top.id, top);
    if (options.withChildren) {
      const walk = (fromId: SpaceId, toId: SpaceId) => {
        for (const child of this.siblings(fromId)) {
          const c = copyOf(child, toId, child.position);
          this.docs.set(c.id, c);
          walk(child.id, c.id);
        }
      };
      walk(source.id, top.id);
    }
    this.emit();
    return clone(top);
  }

  async archive(id: SpaceId): Promise<void> {
    const doc = this.docs.get(id);
    if (!doc) return;
    this.docs.set(id, { ...doc, isArchived: true, updatedAt: nextStamp(doc.updatedAt), version: doc.version + 1 });
    this.emit();
  }

  async restore(id: SpaceId): Promise<void> {
    const doc = this.docs.get(id);
    if (!doc) return;
    // A restored Space whose parent is still in Trash comes back at the top level, as in Notion.
    const parent = doc.parentId ? this.docs.get(doc.parentId) : null;
    const parentId = parent && !parent.isArchived ? doc.parentId : null;
    this.docs.set(id, { ...doc, parentId, isArchived: false, updatedAt: nextStamp(doc.updatedAt), version: doc.version + 1 });
    this.emit();
  }

  subscribe(): () => void {
    return () => {};
  }
}

const KEY = "__matrxSpacesMemoryStore";

/** One store per tab, so the tree and every open Space agree across client navigations. Kept on
 *  globalThis so a Fast Refresh that re-evaluates this module does not wipe the tab's edits. */
export function getMemorySpacesStore(): MemorySpacesStore {
  const g = globalThis as typeof globalThis & { [KEY]?: MemorySpacesStore };
  g[KEY] ??= new MemorySpacesStore(seedSpaces());
  return g[KEY];
}
