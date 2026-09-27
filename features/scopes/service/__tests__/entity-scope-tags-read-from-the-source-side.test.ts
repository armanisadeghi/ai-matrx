/**
 * @jest-environment jsdom
 */
/**
 * `scopesService.listEntityScopeTags` (the notes sidebar's "by scope" grouping
 * and the notes assist sweep) reads an entity type's tags from the SOURCE side.
 *
 * The defect (2026-09-27): every /notes/<id> load answered
 * `rpc/assoc_for_targets` HTTP 500 — Postgres 57014, statement timeout. The
 * read asked `assoc_for_targets('scope', <every visible scope>)` for every edge
 * INTO every scope from every source type (3,491 scopes, ~6,500 edges, 19 s for
 * admin@admin.com) only to keep the 27 note edges; and "every visible scope"
 * was a bare select capped at 1000 rows, so a tag on a scope past row 1000 was
 * silently dropped.
 *
 * Guard: (1) never the target-side read; (2) the given notes' outgoing scope
 * edges; (3) display rows for exactly the scopes hit, so a tag on any scope —
 * however many scopes exist — carries its name.
 */
const USER = "a3c1d2e4-5f60-4718-9a2b-3c4d5e6f7081";
const NOTE_A = "5d1f0c1e-2a3b-4c5d-9e8f-7a6b5c4d3e2f";
const NOTE_B = "6e2a1d2f-3b4c-4d6e-8f9a-8b7c6d5e4f3a";
const SCOPE_INTAKE = "00000000-0000-4000-8000-000000002295";
const SCOPE_REMOVED = "00000000-0000-4000-8000-000000009999";

jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: () => USER,
  requireUserId: () => USER,
}));
jest.mock("@/utils/supabase/adminLane", () => ({ browserAdminLaneOpen: () => false }));

const scopeIdsAsked: string[][] = [];
jest.mock("@/utils/supabase/contextDb", () => ({
  contextDb: () => ({
    from: () => {
      let ids: string[] | null = null;
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.is = () => q;
      q.in = (_col: string, v: string[]) => {
        ids = v;
        scopeIdsAsked.push(v);
        return q;
      };
      q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
        const live = [
          { id: SCOPE_INTAKE, name: "Patient intake", scope_type: { id: "t", label_singular: "Workflow" } },
        ];
        const data = ids ? live.filter((s) => ids!.includes(s.id)) : live;
        return Promise.resolve({ data, error: null }).then(res, rej);
      };
      return q;
    },
  }),
}));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

const listForTargets = jest.fn(async (..._args: unknown[]) => ({ ok: true, data: { edges: [] } }));
const listForSources = jest.fn(async (_type: string, _ids: string[], _target?: string) => ({
  ok: true,
  data: {
    edges: [
      { sourceType: "note", sourceId: NOTE_A, targetType: "scope", targetId: SCOPE_INTAKE },
      { sourceType: "note", sourceId: NOTE_B, targetType: "scope", targetId: SCOPE_REMOVED },
    ],
  },
}));
jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: {
    listForTargets: (...a: unknown[]) => listForTargets(...a),
    listForSources: (type: string, ids: string[], target?: string) => listForSources(type, ids, target),
  },
}));

import { scopesService } from "@/features/scopes/service/scopesService";

it("reads the notes' outgoing scope edges, never every edge into every scope", async () => {
  const res = await scopesService.listEntityScopeTags("note", [NOTE_A, NOTE_B]);
  expect(res.ok).toBe(true);
  expect(listForTargets).not.toHaveBeenCalled();
  expect(listForSources).toHaveBeenCalledTimes(1);
  const [sourceType, ids, targetType] = listForSources.mock.calls[0];
  expect(sourceType).toBe("note");
  expect([...ids].sort()).toEqual([NOTE_A, NOTE_B].sort());
  expect(targetType).toBe("scope");
});

it("names every tag from the scopes actually hit, and drops a tag whose scope is gone", async () => {
  scopeIdsAsked.length = 0;
  const res = await scopesService.listEntityScopeTags("note", [NOTE_A, NOTE_B]);
  if (!res.ok) throw new Error(res.error.message);
  expect(scopeIdsAsked).toEqual([[SCOPE_INTAKE, SCOPE_REMOVED]]);
  expect(res.data.tags).toEqual([
    { entity_id: NOTE_A, scope_id: SCOPE_INTAKE, scope_name: "Patient intake", scope_type: "Workflow" },
  ]);
});

it("asks nothing when there are no notes", async () => {
  listForSources.mockClear();
  const res = await scopesService.listEntityScopeTags("note", []);
  expect(res).toEqual({ ok: true, data: { tags: [] } });
  expect(listForSources).not.toHaveBeenCalled();
});
