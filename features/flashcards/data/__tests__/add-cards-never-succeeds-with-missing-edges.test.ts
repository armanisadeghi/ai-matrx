/**
 * GUARD (2026-10-09): `addCards` NEVER reports success while an edge write failed.
 *
 * Live defect, 2026-09-26: a 140-card deck save inserted all 140 fc_card rows but only 71 got
 * their `fc_card -> fc_set` member edge — 140 concurrent single `assoc_add` calls, the failures
 * only console.error'd, the save reported success. 69 cards were orphans no list could show.
 *
 * The contract proved here: edges are written through the bulk door (`linkEdges`), and when any
 * edge is not written the save FAILS and the just-inserted cards are taken back (soft-deleted).
 */

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: jest.fn(), rpc: jest.fn() },
}));
jest.mock("@/features/scopes/service/associationsService", () => ({
  // Both doors refuse every edge: whichever one addCards uses, the edges are NOT written.
  associationsService: {
    add: jest.fn(async () => ({
      ok: false,
      error: { code: "internal", message: "edge refused" },
    })),
  },
  associationsHelpers: {
    linkEdges: jest.fn(async (edges: unknown[]) => ({
      ok: false,
      error: { code: "internal", message: `${edges.length}/${edges.length} association edge(s) failed` },
    })),
  },
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: jest.fn(async (explicit?: string) => explicit ?? "org-1"),
}));

import { supabase } from "@/utils/supabase/client";
import { associationsHelpers } from "@/features/scopes/service/associationsService";
import { fcService } from "../fcService";

function install() {
  const archived: { ids: string[]; patch: Record<string, unknown> }[] = [];
  const chain: Record<string, jest.Mock> = {};
  for (const m of ["from", "select", "eq", "is"]) chain[m] = jest.fn(() => chain);
  chain.maybeSingle = jest.fn(async () => ({ data: { organization_id: "org-1" }, error: null }));
  chain.insert = jest.fn((rows: Array<Record<string, unknown>>) => ({
    select: async () => ({
      data: rows.map((r, i) => ({ id: `card-${i}`, ...r })),
      error: null,
    }),
  }));
  chain.update = jest.fn((patch: Record<string, unknown>) => {
    const u: Record<string, jest.Mock> = {};
    u.in = jest.fn((_col: string, ids: string[]) => {
      archived.push({ ids, patch });
      return u;
    });
    u.is = jest.fn(() => u);
    u.select = jest.fn(async () => ({ data: [], error: null }));
    return u;
  });
  (supabase.schema as jest.Mock).mockReturnValue(chain);
  return archived;
}

const deck = Array.from({ length: 140 }, (_, i) => ({
  front: `Which structure carries branch ${i} of the nerve?`,
  back: `Branch ${i}`,
}));

afterEach(() => jest.clearAllMocks());

describe("fcService.addCards with failing edge writes", () => {
  it("fails the save and takes the inserted cards back — never success with missing edges", async () => {
    const archived = install();
    const res = await fcService.addCards("set-1", deck);
    expect(res.error).not.toBeNull();
    expect(res.data).toBeNull();
    expect(res.error).toContain("edge(s) failed");
    // every one of the 140 inserted cards is soft-deleted, so no orphan remains
    expect(archived).toHaveLength(1);
    expect(archived[0].ids).toHaveLength(140);
    expect(archived[0].patch).toHaveProperty("deleted_at");
  });

  it("writes all 140 member edges through ONE bulk call, in order", async () => {
    install();
    await fcService.addCards("set-1", deck, { startPosition: 10 });
    const calls = (associationsHelpers.linkEdges as jest.Mock).mock.calls;
    expect(calls).toHaveLength(1);
    const edges = calls[0][0] as Array<{ position: number; role: string; target: { id: string } }>;
    expect(edges).toHaveLength(140);
    expect(edges[0].position).toBe(10);
    expect(edges[139].position).toBe(149);
    expect(edges.every((e) => e.target.id === "set-1")).toBe(true);
  });

  it("succeeds when every edge is written", async () => {
    install();
    (associationsHelpers.linkEdges as jest.Mock).mockResolvedValueOnce({ ok: true, data: { ids: [] } });
    const res = await fcService.addCards("set-1", deck.slice(0, 3));
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(3);
  });
});
