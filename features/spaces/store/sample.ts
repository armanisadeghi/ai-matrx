// features/spaces/store/sample.ts — "Add the Traveling SMM™ OS sample": creates the acceptance Space and
// every sub-page through the store, so the sample is a real saved Space like any other.

import type { RichSpan, SpaceBlock, SpaceDoc, SpaceId, SpacesStore } from "../contract";
import { SEED_ROOT_ID, sampleClientsDatabase, sampleRings, seedSpaces } from "./seed";

export const SAMPLE_TITLE = "The Traveling SMM™ OS";

function remapSpans(spans: RichSpan[] | undefined, ids: Map<string, SpaceId>): RichSpan[] | undefined {
  return spans?.map((s) => {
    if (!s.link?.startsWith("/spaces/seed-")) return s;
    const real = ids.get(s.link.slice("/spaces/".length));
    return real ? { ...s, link: `/spaces/${real}` } : s;
  });
}

function remap(blocks: SpaceBlock[], ids: Map<string, SpaceId>): SpaceBlock[] {
  return blocks.map((b) => {
    const spaceId = b.props?.spaceId;
    const props = typeof spaceId === "string" && ids.has(spaceId) ? { ...b.props, spaceId: ids.get(spaceId) } : b.props;
    return { ...b, props, text: remapSpans(b.text, ids), children: b.children ? remap(b.children, ids) : undefined };
  });
}

/** The phase-1 sample held `slot` placeholders where the data blocks now sit; swap them in place. */
function upgradeSlots(blocks: SpaceBlock[]): { blocks: SpaceBlock[]; changed: boolean } {
  let changed = false;
  const walk = (list: SpaceBlock[]): SpaceBlock[] =>
    list.map((blk) => {
      const label = typeof blk.props?.label === "string" ? blk.props.label : "";
      if (blk.type === "slot" && label.startsWith("Charts:")) return ((changed = true), sampleRings());
      if (blk.type === "slot" && label.startsWith("Clients database:")) return ((changed = true), sampleClientsDatabase());
      return blk.children ? { ...blk, children: walk(blk.children) } : blk;
    });
  return { blocks: walk(blocks), changed };
}

/** Adds the sample once: when it is already in the tree, that copy is brought up to date and returned
 *  (no second "The Traveling SMM™ OS"). Otherwise creates it; `onProgress(done, total)` after each page. */
export async function addTravelingSmmSample(store: SpacesStore, onProgress?: (done: number, total: number) => void): Promise<SpaceDoc> {
  const existing = (await store.list()).find((s) => s.parentId === null && s.title === SAMPLE_TITLE && !s.isArchived);
  if (existing) {
    const doc = await store.get(existing.id);
    if (doc) {
      const up = upgradeSlots(doc.blocks);
      return up.changed ? store.save({ ...doc, blocks: up.blocks }, doc.version) : doc;
    }
  }
  const docs = seedSpaces();
  const rootSeed = docs.find((d) => d.id === SEED_ROOT_ID)!;
  const kids = docs.filter((d) => d.parentId === SEED_ROOT_ID);
  const total = docs.length;
  const ids = new Map<string, SpaceId>();

  const root = await store.create({ parentId: null, title: rootSeed.title });
  ids.set(rootSeed.id, root.id);
  onProgress?.(1, total);

  // Sub-pages are placed in order (each after the previous), so they are created one at a time.
  const made: SpaceDoc[] = [];
  let after: SpaceId | undefined;
  for (const kid of kids) {
    const doc = await store.create({ parentId: root.id, title: kid.title, afterId: after });
    ids.set(kid.id, doc.id);
    made.push(doc);
    after = doc.id;
    onProgress?.(made.length + 1, total);
  }

  // Content goes in once every id is known (the root and the Map page link to other pages).
  const fill = (fresh: SpaceDoc, from: SpaceDoc) =>
    store.save({ ...fresh, icon: from.icon, cover: from.cover, settings: from.settings, blocks: remap(from.blocks, ids) }, fresh.version);
  for (let i = 0; i < made.length; i += 6) {
    await Promise.all(made.slice(i, i + 6).map((doc, j) => fill(doc, kids[i + j])));
  }
  return fill(root, rootSeed);
}
