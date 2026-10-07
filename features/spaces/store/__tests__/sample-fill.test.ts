/**
 * Round 20 (Arman, his own account): Templates → The Traveling SMM™ OS "seemed to get set up" but the
 * first page was empty. The sample page shows in the sidebar the moment it is made; its sub-pages take
 * ~40 s; opening the page meanwhile wrote the editor's empty starting line (a new version), and the
 * page's content — written last, on the version it had when it was made — was refused. The page stayed
 * blank for good, and every later "Add the sample" / "Use template" found that blank page as THE sample
 * and copied it blank.
 *
 * The store here refuses a save on a stale version exactly as content.space_save does (PT409).
 */
jest.mock("../../data/agency-install", () => {
  const spec = jest.requireActual("../../data/agency-spec");
  const tokenByName = (name?: string) => {
    const t = spec.AGENCY_SPEC.tables.find((x: { name: string }) => x.name === name);
    return t && ["client", "nps_survey", "client_win", "task"].includes(t.token) ? t.token : null;
  };
  return {
    agencyTokenByName: tokenByName,
    viewOnInstalledKeys: (v: unknown) => v,
    fieldKey: (_t: unknown, k: string) => k,
  };
});

import type { SpaceBlock, SpaceDoc, SpaceId, SpaceSummary, SpacesStore } from "../../contract";
import type { AgencyTables } from "../../data/agency-install";
import { contentKey, isBlankBody } from "../../page/content-key";
import { addTravelingSmmSample, SAMPLE_TITLE, type SampleTargets } from "../sample";

const TABLES: AgencyTables = {
  client: { tableId: "t-client", name: "Clients", viewId: "v-client" },
  nps_survey: { tableId: "t-nps", name: "NPS Surveys", viewId: "v-nps" },
  client_win: { tableId: "t-win", name: "Client Wins", viewId: "v-win" },
  task: { tableId: "t-task", name: "Tasks", viewId: "v-task" },
};

const settings = { font: "default", smallText: false, fullWidth: false, locked: false } as SpaceDoc["settings"];

/** A store with the database's compare-and-swap: a save on a version that is no longer current is refused. */
function casStore(onCreate?: (n: number, store: SpacesStore) => Promise<void>) {
  const docs = new Map<SpaceId, SpaceDoc>();
  let seq = 0;
  let creates = 0;
  const store = {
    async list(): Promise<SpaceSummary[]> {
      return [...docs.values()].map((d) => ({ id: d.id, parentId: d.parentId, position: d.position, title: d.title, icon: d.icon, isArchived: d.isArchived, updatedAt: d.updatedAt }) as SpaceSummary);
    },
    async get(id: SpaceId) {
      const d = docs.get(id);
      return d ? structuredClone(d) : null;
    },
    async create(input: { parentId: SpaceId | null; title?: string }) {
      const id = `page-${++seq}`;
      const doc = { id, parentId: input.parentId, position: String(seq).padStart(4, "0"), title: input.title ?? "", icon: null, cover: null, settings, blocks: [], isArchived: false, createdAt: new Date(2026, 9, 6, 0, 0, seq).toISOString(), updatedAt: "", updatedBy: null, version: 1 } as unknown as SpaceDoc;
      docs.set(id, doc);
      if (input.parentId) await onCreate?.(++creates, store as unknown as SpacesStore);
      return structuredClone(doc);
    },
    async save(doc: SpaceDoc, expectedVersion: number) {
      const cur = docs.get(doc.id)!;
      if (cur.version !== expectedVersion) throw new Error(`This Space changed since it was opened (you had version ${expectedVersion}; it is now ${cur.version}).`);
      const next = { ...structuredClone(doc), version: cur.version + 1 };
      docs.set(doc.id, next);
      return structuredClone(next);
    },
  };
  return { store: store as unknown as SpacesStore, docs };
}

function targets(store: SpacesStore): SampleTargets {
  return {
    orgOf: async () => "org-fresh",
    writeOrg: async () => "org-fresh",
    install: async () => TABLES,
    createRoot: (_org, title) => store.create({ parentId: null, title }),
  };
}

const walk = (blocks: SpaceBlock[]): SpaceBlock[] => blocks.flatMap((b) => [b, ...walk(b.children ?? [])]);
const tableIds = (doc: SpaceDoc) => walk(doc.blocks).filter((b) => b.type === "database").map((b) => (b.props?.source as { tableId?: string } | undefined)?.tableId);
const pageLinks = (doc: SpaceDoc) => walk(doc.blocks).filter((b) => b.type === "page").map((b) => b.props?.spaceId as string);
const startingLine: SpaceBlock = { id: "starting-line", type: "text", text: [] } as unknown as SpaceBlock;

describe("the Traveling SMM™ OS sample is never left blank", () => {
  it("someone opens the sample page while its sub-pages are made: the page still ends with the rings and the client table", async () => {
    // The 3rd sub-page is being made when the person opens the page and the editor writes its starting line.
    const { store, docs } = casStore(async (n, s) => {
      if (n !== 3) return;
      const root = [...docs.values()].find((d) => d.parentId === null)!;
      await s.save({ ...root, blocks: [startingLine] }, root.version);
    });
    const root = await addTravelingSmmSample(store, targets(store));
    const stored = docs.get(root.id)!;
    expect(stored.title).toBe(SAMPLE_TITLE);
    expect(isBlankBody(stored.blocks)).toBe(false);
    // Three rings over the tasks / clients / wins tables plus the client grid — the installed tables.
    expect(tableIds(stored)).toEqual(expect.arrayContaining(["t-client", "t-task"]));
    // Every sub-page link points at a page that exists (no seed ids left behind).
    const links = pageLinks(stored);
    expect(links.length).toBeGreaterThan(10);
    for (const id of links) expect(docs.has(id)).toBe(true);
    // The person's empty starting line is not kept as content.
    expect(walk(stored.blocks).some((b) => b.id === "starting-line")).toBe(false);
  });

  it("the page shows the sample from the moment it appears, before its sub-pages exist", async () => {
    let seenAtFirstChild: SpaceDoc | null = null;
    const { store, docs } = casStore(async (n) => {
      if (n === 1) seenAtFirstChild = structuredClone([...docs.values()].find((d) => d.parentId === null)!);
    });
    await addTravelingSmmSample(store, targets(store));
    expect(seenAtFirstChild).not.toBeNull();
    expect(tableIds(seenAtFirstChild!)).toEqual(expect.arrayContaining(["t-client"]));
  });

  it("a blank sample page left by an earlier add is completed in place, never copied blank", async () => {
    const { store, docs } = casStore();
    // An earlier add stopped after making the page and two sub-pages; the page holds only its starting line.
    const blank = await store.create({ parentId: null, title: SAMPLE_TITLE });
    await store.save({ ...blank, blocks: [startingLine] }, blank.version);
    const kept = await store.create({ parentId: blank.id, title: "IMPLEMENTATION CHECKLIST" });
    await store.save({ ...kept, blocks: [{ id: "x", type: "text", text: [{ text: "Typed by the person" }] } as unknown as SpaceBlock] }, kept.version);
    const root = await addTravelingSmmSample(store, targets(store));
    expect(root.id).toBe(blank.id);
    const stored = docs.get(blank.id)!;
    expect(tableIds(stored)).toEqual(expect.arrayContaining(["t-client"]));
    const links = pageLinks(stored);
    expect(links).toContain(kept.id);
    for (const id of links) expect(docs.has(id)).toBe(true);
    // The existing sub-page keeps what the person wrote; no second checklist is made.
    expect(docs.get(kept.id)!.blocks[0].text?.[0]?.text).toBe("Typed by the person");
    expect([...docs.values()].filter((d) => d.title === "IMPLEMENTATION CHECKLIST")).toHaveLength(1);
  });

  it("opening a page stored with no blocks is not a change (the editor's starting line is never saved)", () => {
    const base = { title: "The Traveling SMM™ OS", icon: null, cover: null, settings };
    expect(contentKey({ ...base, blocks: [startingLine] })).toBe(contentKey({ ...base, blocks: [] }));
    expect(contentKey({ ...base, blocks: [{ id: "a", type: "text", text: [{ text: "hi" }] } as unknown as SpaceBlock] })).not.toBe(contentKey({ ...base, blocks: [] }));
  });
});
