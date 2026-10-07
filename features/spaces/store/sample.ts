// features/spaces/store/sample.ts — "Add the Traveling SMM™ OS sample": creates the acceptance Space and
// every sub-page through the store, so the sample is a real saved Space like any other.

import type { RichSpan, SpaceBlock, SpaceDoc, SpaceId, SpacesStore } from "../contract";
import { agencyTokenByName, viewOnInstalledKeys, type AgencyTables } from "../data/agency-install";
import type { SpaceDbView } from "../data/sources";
import { AGENCY_SAMPLE_ID } from "../data/agency-spec";
import { isBlankBody } from "../page/content-key";
import { b, RING_NAMES, SAMPLE_CLIENT_HIDDEN, SAMPLE_GAP_RULES, SAMPLE_CLIENT_SORTS, SAMPLE_COLUMNS, SAMPLE_COVER, SAMPLE_ICON, SAMPLE_LINK_LINES, SEED_ROOT_ID, sampleLinkLine, sampleClientsDatabase, sampleRings, seedSpaces } from "./seed";

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

const plain = (blk: SpaceBlock) => (blk.text ?? []).map((x) => x.text).join("");
const isEmptyLine = (blk: SpaceBlock) => blk.type === "text" && !blk.children?.length && plain(blk) === "";

/** Round 13: the plan column's gaps match the reference's empty lines (SAMPLE_GAP_RULES) — an older
 *  page with fewer is topped up after the same block; never shortened. */
function topUpGaps(list: SpaceBlock[]): { list: SpaceBlock[]; changed: boolean } {
  let changed = false;
  const out: SpaceBlock[] = [];
  for (let i = 0; i < list.length; i++) {
    out.push(list[i]);
    const rule = SAMPLE_GAP_RULES.find((r) => plain(list[i]).startsWith(r.anchor));
    if (!rule) continue;
    let n = 0;
    while (i + 1 + n < list.length && isEmptyLine(list[i + 1 + n])) n++;
    for (let k = n; k < rule.lines; k++) {
      out.push(b.text(""));
      changed = true;
    }
  }
  return { list: out, changed };
}

/** The phase-1 sample held `slot` placeholders where the data blocks now sit; swap them in place. */
function upgradeSlots(blocks: SpaceBlock[], tables: AgencyTables): { blocks: SpaceBlock[]; changed: boolean } {
  let changed = false;
  const walk = (all: SpaceBlock[]): SpaceBlock[] => {
    const gaps = topUpGaps(all);
    if (gaps.changed) changed = true;
    return gaps.list.map((blk): SpaceBlock | null => {
      const label = typeof blk.props?.label === "string" ? blk.props.label : "";
      if (blk.type === "slot" && label.startsWith("Charts:")) return ((changed = true), sampleRings(tables));
      if (blk.type === "slot" && label.startsWith("Clients database:")) return ((changed = true), sampleClientsDatabase(tables));
      // Round 11: a block over the in-memory preview reads the organization's installed tables instead.
      if (blk.type === "database" && blk.props?.sample === AGENCY_SAMPLE_ID) {
        const token = agencyTokenByName(typeof blk.props.title === "string" ? blk.props.title : undefined);
        if (token) {
          changed = true;
          const t = tables[token];
          const { sample: _sample, ...rest } = blk.props;
          blk = { ...blk, props: { ...rest, source: t.viewId ? { kind: "table", tableId: t.tableId, viewId: t.viewId } : { kind: "table", tableId: t.tableId } } };
        }
      }
      // Round 12: a block on an agency table in ANOTHER organization (an earlier add installed into the
      // active organization, not the page's) reads the tables installed beside the page instead.
      const src = blk.type === "database" ? (blk.props?.source as { kind?: string; tableId?: string } | undefined) : undefined;
      if (src?.kind === "table" && !blk.props?.sample) {
        const token = agencyTokenByName(typeof blk.props?.title === "string" ? blk.props.title : undefined);
        const t = token ? tables[token] : null;
        if (t && src.tableId !== t.tableId) {
          changed = true;
          blk = { ...blk, props: { ...blk.props, source: t.viewId ? { kind: "table", tableId: t.tableId, viewId: t.viewId } : { kind: "table", tableId: t.tableId } } };
        }
      }
      // Round 16: views name fields by the install's keys (an upgraded install renamed a converted column).
      if (blk.type === "database" && !blk.props?.sample && Array.isArray(blk.props?.views)) {
        const token = agencyTokenByName(typeof blk.props.title === "string" ? blk.props.title : undefined);
        const keys = token ? tables[token]?.keys : undefined;
        const vs = blk.props.views as SpaceDbView[];
        const moved = vs.map((v) => viewOnInstalledKeys(v, keys));
        if (moved.some((v, i) => v !== vs[i])) {
          changed = true;
          blk = { ...blk, props: { ...blk.props, views: moved } };
        }
      }
      // Round 11: a client grid already on the installed table hides its reverse links and sorts by start date.
      if (blk.type === "database" && !blk.props?.sample && blk.props?.title === "Clients") {
        const vs = blk.props.views as Array<{ layout?: string; hiddenFields?: string[] }> | undefined;
        if (vs?.some((v) => v.layout === "grid" && !v.hiddenFields?.includes("linked:nps_surveys"))) {
          changed = true;
          blk = { ...blk, props: { ...blk.props, views: vs.map((v) => (v.layout === "grid" ? viewOnInstalledKeys({ ...v, hiddenFields: SAMPLE_CLIENT_HIDDEN, sorts: SAMPLE_CLIENT_SORTS }, tables.client.keys) : v)) } };
        }
      }
      const views = blk.type === "database" ? (blk.props?.views as Array<{ hiddenFields?: string[] }> | undefined) : undefined;
      if (views?.[0]?.hiddenFields?.includes("surveys")) {
        changed = true;
        return { ...blk, props: { ...blk.props, views: views.map((v, i) => (i === 0 ? { ...v, hiddenFields: SAMPLE_CLIENT_HIDDEN } : v)) } };
      }
      // Round 4: ring view names in capitals, as the reference shows them.
      if (blk.type === "database" && Array.isArray(blk.props?.views)) {
        const views = blk.props.views as Array<{ name?: string; layout?: string }>;
        if (views.some((v) => v.layout === "chart" && v.name && RING_NAMES[v.name])) {
          changed = true;
          return { ...blk, props: { ...blk.props, views: views.map((v) => (v.layout === "chart" && v.name && RING_NAMES[v.name] ? { ...v, name: RING_NAMES[v.name] } : v)) } };
        }
      }
      // Round 4: the toggles under the plan are Notion toggle headings (H3), not bold toggle lines.
      const only = blk.text?.length === 1 ? blk.text[0] : null;
      if (blk.type === "toggle" && only?.bold) {
        changed = true;
        const { bold: _bold, ...plain } = only;
        return { ...blk, type: "heading", text: [plain], props: { ...blk.props, level: 3, toggleable: true }, children: blk.children ? walk(blk.children) : undefined };
      }
      // Round 9: a line holding only a code fence ("```") is stray markdown, never content.
      if (blk.type === "text" && !blk.children?.length && /^\s*`{3,}\s*$/.test((blk.text ?? []).map((x) => x.text).join(""))) {
        changed = true;
        return null;
      }
      // Round 4: the page's two columns at the reference's measured split.
      if (blk.type === "columnList" && blk.children?.length === 2 && blk.children[0].props?.width === 0.3) {
        changed = true;
        return { ...blk, children: blk.children.map((c, i) => ({ ...c, props: { ...c.props, width: SAMPLE_COLUMNS[i] }, children: c.children ? walk(c.children) : undefined })) };
      }
      return blk.children ? { ...blk, children: walk(blk.children) } : blk;
    }).filter((blk): blk is SpaceBlock => blk !== null);
  };
  return { blocks: walk(blocks), changed };
}

/** The phase-1 cover and icon (a CSS gradient, a palm glyph) become the bundled landscape and portrait. */
/** An older sample's link lines (another link after "Claude Skills - " / "Auto posting …") read as
 *  screenshot 3 writes them. */
export function upgradeLinkLines(blocks: SpaceBlock[]): { blocks: SpaceBlock[]; changed: boolean } {
  let changed = false;
  const walk = (all: SpaceBlock[]): SpaceBlock[] =>
    all.map((blk) => {
      const kids = blk.children?.length ? walk(blk.children) : blk.children;
      const spans = blk.type === "text" ? (blk.text ?? []) : [];
      const line = spans.length ? SAMPLE_LINK_LINES.find((l) => spans[0]?.text === l.lead) : undefined;
      if (line && (spans.length !== 2 || spans[1]?.link !== line.url || spans[1]?.text !== line.url)) {
        changed = true;
        return { ...blk, text: sampleLinkLine(line), ...(kids ? { children: kids } : {}) };
      }
      return kids === blk.children ? blk : { ...blk, children: kids };
    });
  const out = walk(blocks);
  return { blocks: changed ? out : blocks, changed };
}

function upgradeMedia(doc: SpaceDoc): Partial<SpaceDoc> | null {
  const oldCover = doc.cover && "url" in doc.cover && doc.cover.url === "gallery:gradient-sunset";
  const oldIcon = doc.icon && "icon" in doc.icon && doc.icon.icon === "TreePalm";
  if (!oldCover && !oldIcon) return null;
  return { ...(oldCover ? { cover: SAMPLE_COVER } : {}), ...(oldIcon ? { icon: SAMPLE_ICON } : {}) };
}

/** Where the sample's pieces are filed. The page and its tables always share one organization. */
export interface SampleTargets {
  /** The organization an existing page lives in (the sample page's own organization). */
  orgOf: (id: SpaceId) => Promise<string>;
  /** The organization to write a NEW sample into (the active one; asks when none is chosen). */
  writeOrg: () => Promise<string>;
  /** Makes (or finds) the agency's real tables — the full gallery install — in that organization. */
  install: (organizationId: string) => Promise<AgencyTables>;
  /** Creates the top-level sample page in that organization. */
  createRoot: (organizationId: string, title: string) => Promise<SpaceDoc>;
}

/** Adds the sample once: when it is already in the tree, that copy is brought up to date and returned
 *  (no second "The Traveling SMM™ OS"), with the tables installed into THAT page's organization.
 *  Otherwise the page and its tables are both made in the write organization; `onProgress(done, total)`
 *  after each page. The page's data blocks point at the installed tables. */
/**
 * The person's sample page: the FIRST top-level page made with the sample's title. "Use template" copies
 * carry the same title (Notion keeps it), so the oldest one is the sample — never a later copy, whose
 * organization would get a second install.
 */
export async function findSamplePage(store: SpacesStore): Promise<{ id: string } | null> {
  const named = (await store.list()).filter((s) => s.parentId === null && s.title === SAMPLE_TITLE && !s.isArchived);
  if (named.length <= 1) return named[0] ?? null;
  const docs = (await Promise.all(named.map((s) => store.get(s.id).catch(() => null)))).filter((d): d is SpaceDoc => Boolean(d));
  docs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return docs[0] ?? named[0];
}

/**
 * Writes `build(current)` over the page's CURRENT stored version (read fresh), retrying when someone
 * saved in between — never the version the page had when it was made. A sample page is visible (and
 * openable) while its sub-pages are made; a write made meanwhile must not leave it empty.
 */
async function saveOnCurrent(store: SpacesStore, id: SpaceId, build: (current: SpaceDoc) => SpaceDoc): Promise<SpaceDoc> {
  let last: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await store.get(id);
    if (!current) throw new Error("The sample page could not be read back.");
    try {
      return await store.save(build(current), current.version);
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("The sample page could not be saved.");
}

/** The seed's content over a page: a blank page takes it whole; a page someone already wrote in keeps
 *  what they wrote after it. */
function withSeed(current: SpaceDoc, from: SpaceDoc, ids: Map<string, SpaceId>): SpaceDoc {
  const theirs = isBlankBody(current.blocks) ? [] : current.blocks;
  return { ...current, icon: current.icon ?? from.icon, cover: current.cover ?? from.cover, settings: from.settings, blocks: [...remap(from.blocks, ids), ...theirs] };
}

/**
 * An earlier add that stopped before its content went in (closed tab, a refused save) left the sample
 * page blank. It is completed in place: its sub-pages are matched by title, the missing ones made, blank
 * ones filled, and the page's content written with the links pointing at them.
 */
async function completeBlankSample(store: SpacesStore, root: SpaceDoc, tables: AgencyTables): Promise<SpaceDoc> {
  const docs = seedSpaces(tables);
  const rootSeed = docs.find((d) => d.id === SEED_ROOT_ID)!;
  const kids = docs.filter((d) => d.parentId === SEED_ROOT_ID);
  const have = (await store.list()).filter((s) => s.parentId === root.id && !s.isArchived);
  const ids = new Map<string, SpaceId>([[rootSeed.id, root.id]]);
  let after: SpaceId | undefined = [...have].sort((a, b) => a.position.localeCompare(b.position)).at(-1)?.id;
  const toFill: Array<{ id: SpaceId; from: SpaceDoc }> = [];
  for (const kid of kids) {
    const found = have.find((h) => h.title === kid.title && ![...ids.values()].includes(h.id));
    if (found) {
      ids.set(kid.id, found.id);
      const doc = await store.get(found.id);
      if (doc && isBlankBody(doc.blocks)) toFill.push({ id: found.id, from: kid });
      continue;
    }
    const made = await store.create({ parentId: root.id, title: kid.title, afterId: after });
    ids.set(kid.id, made.id);
    toFill.push({ id: made.id, from: kid });
    after = made.id;
  }
  for (let i = 0; i < toFill.length; i += 6) {
    await Promise.all(toFill.slice(i, i + 6).map(({ id, from }) => saveOnCurrent(store, id, (cur) => withSeed(cur, from, ids))));
  }
  return saveOnCurrent(store, root.id, (cur) => withSeed(cur, rootSeed, ids));
}

/**
 * "Use template" copied the sample into another organization: the copy's data blocks are pointed at
 * the agency tables installed in THAT organization (installed there when missing), so the copy shows
 * its own organization's rows — never tables its members may not be able to open.
 */
export async function pointCopyAtItsTables(store: SpacesStore, copyId: SpaceId, tables: AgencyTables): Promise<void> {
  await saveOnCurrent(store, copyId, (cur) => ({ ...cur, blocks: upgradeSlots(cur.blocks, tables).blocks }));
}

export async function addTravelingSmmSample(
  store: SpacesStore,
  targets: SampleTargets,
  onProgress?: (done: number, total: number) => void,
): Promise<SpaceDoc> {
  const existing = await findSamplePage(store);
  if (existing) {
    const doc = await store.get(existing.id);
    if (doc) {
      const tables = await targets.install(await targets.orgOf(doc.id));
      if (isBlankBody(doc.blocks)) return completeBlankSample(store, doc, tables);
      const slots = upgradeSlots(doc.blocks, tables);
      const up = upgradeLinkLines(slots.blocks);
      const media = upgradeMedia(doc);
      return slots.changed || up.changed || media ? store.save({ ...doc, ...media, blocks: up.blocks }, doc.version) : doc;
    }
  }
  const organizationId = await targets.writeOrg();
  const tables = await targets.install(organizationId);
  const docs = seedSpaces(tables);
  const rootSeed = docs.find((d) => d.id === SEED_ROOT_ID)!;
  const kids = docs.filter((d) => d.parentId === SEED_ROOT_ID);
  const total = docs.length;
  const ids = new Map<string, SpaceId>();

  // The page shows in the sidebar the moment it is made, so its content (rings, client table, plan) goes
  // in at once — opening it while the sub-pages are made shows the sample, never a blank page. Its page
  // links are pointed at the sub-pages once they exist.
  const made0 = await targets.createRoot(organizationId, rootSeed.title);
  ids.set(rootSeed.id, made0.id);
  const root = await saveOnCurrent(store, made0.id, (cur) => withSeed(cur, rootSeed, ids));
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

  // Content goes in once every id is known (the root and the Map page link to other pages); each write
  // lands on the page's current version, so a page opened meanwhile is never left blank.
  for (let i = 0; i < made.length; i += 6) {
    await Promise.all(made.slice(i, i + 6).map((doc, j) => saveOnCurrent(store, doc.id, (cur) => withSeed(cur, kids[i + j], ids))));
  }
  // A page someone emptied meanwhile (an editor that wrote its starting line) gets the content again.
  return saveOnCurrent(store, root.id, (cur) => (isBlankBody(cur.blocks) ? withSeed(cur, rootSeed, ids) : { ...cur, blocks: remap(cur.blocks, ids) }));
}
