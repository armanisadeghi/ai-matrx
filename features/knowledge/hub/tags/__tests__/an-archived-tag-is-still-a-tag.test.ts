/**
 * References survive archive (v6 chair ruling): a record filed under a tag that was later archived still
 * carries that tag — its peek's Tags section names it, and its Filed under section leaves it to Tags.
 *
 * A tag is a row of `platform.tag`; an archive is its `deleted_at`. The break this catches: a reader that asks
 * only for live tags, so an archived tag's name leaves every row and peek (the 2026-10-03 defect on the scope
 * doors), or an id that is no tag at all being taken for one.
 *
 * `platform.tag` and the edges are stubbed with Cedar Ridge Physical Therapy's tags; the readers' own work —
 * which ids are tags, marking the archived ones, naming, de-duplicating — runs for real.
 */
const ORG = "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b";
const KNEE = "a0000000-0000-4000-8000-000000000001"; // live tag "post-op knee"
const CAP = "a0000000-0000-4000-8000-000000000002"; // archived tag "medicare cap 2025"
const LAKESIDE = "a0000000-0000-4000-8000-000000000003"; // not a tag (a project)
const NOTE_EVAL = "b0000000-0000-4000-8000-000000000001";
const NOTE_PLAN = "b0000000-0000-4000-8000-000000000002";
const NOTE_FRONT_DESK = "b0000000-0000-4000-8000-000000000003";

const TAGS = [
  { id: KNEE, name: "post-op knee", slug: "post-op-knee", organization_id: ORG, deleted_at: null },
  { id: CAP, name: "medicare cap 2025", slug: "medicare-cap-2025", organization_id: ORG, deleted_at: "2026-09-30T04:19:26Z" },
];
const EDGES = [
  { source_type: "note", source_id: NOTE_EVAL, target_id: KNEE },
  { source_type: "note", source_id: NOTE_EVAL, target_id: CAP },
  { source_type: "note", source_id: NOTE_PLAN, target_id: CAP },
];

function query(table: string) {
  const f: { source_type?: string; ids?: string[]; target_type?: string } = {};
  const q = {
    select: () => q,
    eq: (col: string, v: string) => {
      if (col === "source_type") f.source_type = v;
      if (col === "target_type") f.target_type = v;
      return q;
    },
    in: (col: string, v: string[]) => {
      if (col === "source_id" || col === "id") f.ids = v;
      return q;
    },
    is: () => q,
    limit: () => q,
    then: (res: (v: unknown) => unknown) => {
      if (table === "tag") return res({ data: TAGS.filter((t) => f.ids?.includes(t.id)), error: null });
      if (table === "associations" && f.target_type === "tag")
        return res({ data: EDGES.filter((e) => e.source_type === f.source_type && f.ids?.includes(e.source_id)), error: null });
      throw new Error(`unexpected read of ${table} (target_type ${f.target_type})`);
    },
  };
  return q;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: (s: string) =>
      s === "platform"
        ? { from: (t: string) => query(t) }
        : (() => {
            throw new Error(`the ${s} schema was read`);
          })(),
  },
}));
jest.mock("@/features/organizations/service", () => ({ getUserOrganizations: async () => [{ id: ORG }] }));

import { listTagsForItems, tagIdsAmong } from "@/features/knowledge/hub/tags/tagApi";

describe("an archived tag is still a tag", () => {
  it("tagIdsAmong counts an archived tag as a tag, and a non-tag id as none", async () => {
    const ids = await tagIdsAmong([KNEE, CAP, LAKESIDE]);
    expect([...ids].sort()).toEqual([KNEE, CAP].sort());
  });

  it("tagIdsAmong with only the archived tag still answers it", async () => {
    expect([...(await tagIdsAmong([LAKESIDE, CAP]))]).toEqual([CAP]);
  });

  it("listTagsForItems names the archived tag on every row that carries it, marked archived", async () => {
    const m = await listTagsForItems([
      { entity: "note", id: NOTE_EVAL },
      { entity: "note", id: NOTE_PLAN },
      { entity: "note", id: NOTE_FRONT_DESK },
    ]);
    expect(m.get(`note:${NOTE_EVAL}`)).toEqual([
      { tagId: KNEE, name: "post-op knee" },
      { tagId: CAP, name: "medicare cap 2025", archived: true },
    ]);
    expect(m.get(`note:${NOTE_PLAN}`)).toEqual([{ tagId: CAP, name: "medicare cap 2025", archived: true }]);
    expect(m.get(`note:${NOTE_FRONT_DESK}`)).toBeUndefined();
  });
});
