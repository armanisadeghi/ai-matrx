/**
 * THE SERVER SEARCH JOINS BENEATH THE INSTANT HITS (DATA-HOME-3B's door, wired by lane DATA-HOME-3A).
 *
 * A Field label ("Furnace model") lives inside a table, not on its row, so only the server finds it.
 * The rules: the instant title hits answer at once and never move; what only the server found comes
 * beneath them with "Matched in field: …"; the server is asked 250 ms after the last keystroke; an
 * answer for text the box no longer holds announces nothing.
 */
import { createDataHomeService, type ServerMatches } from "../dataHomeService";
import { createDataHomeCorpus } from "../dataHomeCorpus";
import { matchedLine, ownerLabel } from "../dataHomeColumns";
import type { EntityListQuery, EntityListSort } from "@/lib/entity-list/types";
import type { DataHomeSearchAnswer } from "@/features/unified-data/hub/doors";
import { makeScope } from "@/lib/list-scope/types";
import { corpus as fixture } from "./fixtures";

const SORT: EntityListSort = { sort: "updated", direction: "desc", favoritesFirst: true, pageSize: 25 };
const q = (search: string): EntityListQuery => ({
  scope: makeScope("all"), orgId: null, search, deep: false, archived: "active", filters: {}, page: 1,
});

describe("the merge", () => {
  it("keeps the instant hits first and in order, and appends server-only hits beneath with where they matched", async () => {
    const rows = fixture();
    const recall = rows.find((r) => r.name === "Patient Recall List")!;
    const roof = rows.find((r) => r.name === "Roof Inspections")!;
    const matches: ServerMatches = new Map([
      [roof.id, { rank: 9, in: "field", field: "Furnace model" }],
      [recall.id, { rank: 3, in: "name", field: null }],
    ]);
    const requested: string[] = [];
    const s = createDataHomeService({
      load: async () => rows,
      isStarred: () => false,
      ownerLabel,
      server: { lookup: (text) => (text === "recall" ? matches : undefined), request: (text) => requested.push(text) },
    });
    const page = await s.fetchPage(q("recall"), SORT);
    expect(page.rows[0]!.name).toBe("Patient Recall List"); // the instant hit, first
    expect(page.rows[0]!.matched).toBeUndefined();
    const extra = page.rows.find((r) => r.id === roof.id)!;
    expect(page.rows.indexOf(extra)).toBeGreaterThan(0);
    expect(matchedLine(extra)).toBe("Matched in field: Furnace model");
    expect(page.total).toBe(page.rows.length);
    // THE COUNT IS THE LIST: the lane counts include what only the server found.
    const counts = await s.fetchCounts(q("recall"));
    expect(counts.byKind.all).toBe(page.total);
    // An unanswered text asks the server; a one-letter text never does.
    await s.fetchPage(q("furnace"), SORT);
    await s.fetchPage(q("f"), SORT);
    expect(requested).toEqual(["furnace"]);
  });

  it("Title only never asks the server (titles are in hand)", async () => {
    const requested: string[] = [];
    const s = createDataHomeService({
      load: async () => fixture(),
      isStarred: () => false,
      ownerLabel,
      server: { lookup: () => undefined, request: (t) => requested.push(t) },
    });
    await s.fetchPage({ ...q("furnace"), filters: { title_only: { kind: "boolean", value: true } } }, SORT);
    expect(requested).toEqual([]);
  });
});

describe("the server layer", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const answer = (search: string): DataHomeSearchAnswer => ({
    search,
    tables: [
      {
        table_id: "t1", table_name: "Service Calls", organization_id: "o1", organization_name: "Ironclad Mobile Mechanics",
        member: true, visibility: "internal", updated_at: null, mine: true, shared_with_me: false, platform_owned: false,
        kind: "table", match_rank: 4, matched_in: "field", matched_field: "Furnace model",
      },
    ],
    items: [],
    changed_by: [],
  });

  it("asks once, 250 ms after the last keystroke, and announces only the current text's answer", async () => {
    const asked: string[] = [];
    const corpus = createDataHomeCorpus({} as never, {} as never, {
      dataHomeSearch: async (_ds, search) => {
        asked.push(search);
        return { ok: true, data: answer(search) };
      },
    });
    let announced = 0;
    corpus.onAnswer(() => (announced += 1));
    corpus.server.request("fur", null);
    corpus.server.request("furn", null);
    corpus.server.request("furnace", null);
    jest.advanceTimersByTime(249);
    expect(asked).toEqual([]);
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(asked).toEqual(["furnace"]);
    expect(announced).toBe(1);
    expect(corpus.server.lookup("furnace", null)?.get("table:o1:t1")).toEqual({ rank: 4, in: "field", field: "Furnace model" });
  });

  it("keys a table of another kind (scope, list) by its own kind, as the row ids are", async () => {
    const corpus = createDataHomeCorpus({} as never, {} as never, {
      dataHomeSearch: async (_ds, search) => {
        const a = answer(search);
        return { ok: true, data: { ...a, tables: [{ ...a.tables[0]!, table_id: "t2", table_name: "Matter", kind: "scope" }] } };
      },
    });
    corpus.server.request("applicant phone", null);
    jest.advanceTimersByTime(250);
    await Promise.resolve();
    await Promise.resolve();
    expect(corpus.server.lookup("applicant phone", null)?.get("scope:o1:t2")).toEqual({ rank: 4, in: "field", field: "Furnace model" });
  });

  it("a slow answer for text the box has left is kept but announces nothing", async () => {
    let release: (() => void) | null = null;
    const corpus = createDataHomeCorpus({} as never, {} as never, {
      dataHomeSearch: (_ds, search) =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, data: answer(search) });
        }),
    });
    let announced = 0;
    corpus.onAnswer(() => (announced += 1));
    corpus.server.request("furnace", null);
    jest.advanceTimersByTime(250);
    corpus.server.request("furnace model", null); // the box moved on
    release!();
    await Promise.resolve();
    await Promise.resolve();
    expect(announced).toBe(0);
    expect(corpus.server.lookup("furnace", null)).toBeDefined();
  });
});
