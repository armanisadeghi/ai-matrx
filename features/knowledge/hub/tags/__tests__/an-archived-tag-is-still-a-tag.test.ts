/**
 * References survive archive (v6 chair ruling): a record filed under a tag whose scope was later
 * archived still carries that tag — its peek's Tags section names it, and its Filed under section
 * leaves it to Tags (the pre-flip path read the context tables with no `deleted_at` test).
 *
 * The defect (lane 9 flip, 2026-10-03): tagApi's three tag readers asked only
 * `custom.context_scopes`, which answers LIVE scopes only — so an archived tag scope was not
 * recognised as a tag (`tagScopeIdsAmong`) and its name left every row and peek
 * (`listTagsForItems`). The break this catches: the archived lookup dropped, or not paged past the
 * first 200 archived tags, or a non-tag archived scope taken for a tag.
 *
 * The store is the dependency (stubbed per door with Cedar Ridge Physical Therapy's tags); the tag
 * readers' own work — which ids the live door left unanswered, which types are tags, paging the
 * archive, naming, de-duplicating — runs for real.
 */
const ORG = "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b";
const T_TAG = "11111111-2222-4333-8444-555555555555";
const T_CLINIC = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const KNEE = "a0000000-0000-4000-8000-000000000001"; // live tag "post-op knee"
const CAP = "a0000000-0000-4000-8000-000000000002"; // archived tag "medicare cap 2025" (the 201st archived tag)
const LAKESIDE = "a0000000-0000-4000-8000-000000000003"; // live clinic location
const EASTGATE = "a0000000-0000-4000-8000-000000000004"; // archived clinic location
const NOTE_EVAL = "b0000000-0000-4000-8000-000000000001";
const NOTE_PLAN = "b0000000-0000-4000-8000-000000000002";
const NOTE_FRONT_DESK = "b0000000-0000-4000-8000-000000000003";

const typeRow = (id: string, slug: string, label: string) => ({
  id,
  organization_id: ORG,
  slug,
  label_singular: label,
  label_plural: `${label}s`,
});
const scopeRow = (id: string, type: string, name: string, slug: string, typeSlug: string) => ({
  id,
  scope_type_id: type,
  organization_id: ORG,
  name,
  slug,
  scope_type: { id: type, slug: typeSlug, label_singular: typeSlug, label_plural: typeSlug },
});
const LIVE = [
  scopeRow(KNEE, T_TAG, "post-op knee", "post-op-knee", "tag"),
  scopeRow(LAKESIDE, T_CLINIC, "Lakeside Clinic", "lakeside-clinic", "clinic_location"),
];
// 200 older archived tags fill the first page; the one this record carries is the 201st.
const ARCHIVED_TAGS = [
  ...Array.from({ length: 200 }, (_, i) => ({
    id: `c0000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    document: { name: `2024 plan of care ${i}`, slug: `2024-plan-of-care-${i}` },
  })),
  { id: CAP, document: { name: "medicare cap 2025", slug: "medicare-cap-2025" } },
];
const ARCHIVED_CLINICS = [{ id: EASTGATE, document: { name: "Eastgate Clinic", slug: "eastgate-clinic" } }];
const EDGES = [
  { source_type: "note", source_id: NOTE_EVAL, target_id: KNEE },
  { source_type: "note", source_id: NOTE_EVAL, target_id: CAP },
  { source_type: "note", source_id: NOTE_EVAL, target_id: LAKESIDE },
  { source_type: "note", source_id: NOTE_PLAN, target_id: CAP },
  { source_type: "note", source_id: NOTE_FRONT_DESK, target_id: EASTGATE },
];

function door(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "context_scopes": {
      const ids = args.p_scope_ids as string[];
      return LIVE.filter((s) => ids.includes(s.id));
    }
    case "context_tree_types":
      return { types: [typeRow(T_TAG, "tag", "Tag"), typeRow(T_CLINIC, "clinic_location", "Clinic location")] };
    case "read_records_archived": {
      if (args.p_organization_id !== ORG) return [];
      const all = args.p_table_id === T_TAG ? ARCHIVED_TAGS : args.p_table_id === T_CLINIC ? ARCHIVED_CLINICS : [];
      const off = Number(args.p_offset ?? 0);
      const lim = Math.min(Number(args.p_limit ?? 200), 200); // the door's own page ceiling
      return all.slice(off, off + lim).map((r) => ({ ...r, archived_at: "2026-09-30T04:19:26Z" }));
    }
    default:
      throw new Error(`unexpected door ${name}`);
  }
}

function associations() {
  const f: { source_type?: string; ids?: string[] } = {};
  const q = {
    select: () => q,
    eq: (col: string, v: string) => {
      if (col === "source_type") f.source_type = v;
      return q;
    },
    in: (col: string, v: string[]) => {
      if (col === "source_id") f.ids = v;
      return q;
    },
    is: () => q,
    limit: () => q,
    then: (res: (v: unknown) => unknown) =>
      res({ data: EDGES.filter((e) => e.source_type === f.source_type && f.ids?.includes(e.source_id)), error: null }),
  };
  return q;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: (s: string) =>
      s === "custom"
        ? { rpc: (n: string, a: Record<string, unknown>) => Promise.resolve({ data: door(n, a), error: null }) }
        : s === "platform"
          ? { from: (t: string) => (t === "associations" ? associations() : (() => { throw new Error(t); })()) }
          : (() => {
              throw new Error(`the ${s} schema was read`);
            })(),
  },
}));
jest.mock("@/features/organizations/service", () => ({ getUserOrganizations: async () => [{ id: ORG }] }));

import { listTagsForItems, tagScopeIdsAmong } from "@/features/knowledge/hub/tags/tagApi";

describe("an archived tag is still a tag", () => {
  it("tagScopeIdsAmong counts an archived tag scope as a tag, and an archived clinic as none", async () => {
    const ids = await tagScopeIdsAmong([KNEE, CAP, LAKESIDE, EASTGATE]);
    expect([...ids].sort()).toEqual([KNEE, CAP].sort());
  });

  it("tagScopeIdsAmong with only the archived tag still answers it", async () => {
    expect([...(await tagScopeIdsAmong([EASTGATE, CAP]))]).toEqual([CAP]);
  });

  it("listTagsForItems names the archived tag on every row that carries it, marked archived", async () => {
    const m = await listTagsForItems([
      { entity: "note", id: NOTE_EVAL },
      { entity: "note", id: NOTE_PLAN },
      { entity: "note", id: NOTE_FRONT_DESK },
    ]);
    expect(m.get(`note:${NOTE_EVAL}`)).toEqual([
      { scopeId: KNEE, name: "post-op knee" },
      { scopeId: CAP, name: "medicare cap 2025", archived: true },
    ]);
    expect(m.get(`note:${NOTE_PLAN}`)).toEqual([{ scopeId: CAP, name: "medicare cap 2025", archived: true }]);
    expect(m.get(`note:${NOTE_FRONT_DESK}`)).toBeUndefined();
  });
});
