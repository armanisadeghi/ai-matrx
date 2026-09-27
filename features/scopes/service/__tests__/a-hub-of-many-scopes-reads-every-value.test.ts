/**
 * @jest-environment jsdom
 */
/**
 * THE /scopes HUB READS EVERY CURRENT VALUE OF EVERY LISTED SCOPE (lane HANDOVER, 2026-09-27).
 *
 * The defect, live on admin@admin.com's /scopes: `listContextValuesForScopes` sent ONE request
 * with every listed scope id in the address (`?scope_id=in.(…600+ ids…)`). The gateway refused it
 * before PostgREST saw it, the browser reported it as a CORS failure (9 console errors), and the
 * hub's tables drew with no values. And one response is capped at 1000 rows, so a large hub lost
 * cells even when the address fit.
 *
 * Guard: 640 scopes with 3 current values each (1920 rows) → every request names at most 100 scopes,
 * and every row comes back.
 */
const USER = "a3c1d2e4-5f60-4718-9a2b-3c4d5e6f7081";

jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: () => USER,
  requireUserId: () => USER,
}));
jest.mock("@/utils/supabase/adminLane", () => ({ browserAdminLaneOpen: () => false }));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

const SCOPES = Array.from({ length: 640 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
const VALUES = SCOPES.flatMap((scopeId, i) =>
  [0, 1, 2].map((k) => ({
    id: `10000000-0000-4000-8000-${String(i * 3 + k).padStart(12, "0")}`,
    scope_id: scopeId,
    context_item_id: `20000000-0000-4000-8000-00000000000${k}`,
    is_current: true,
    value_text: `Patient ${i} note ${k}`,
  })),
);
const idsPerRequest: number[] = [];

/** A PostgREST-shaped builder: honours `.in()`, `.range()`, and caps a page at 1000 like the server. */
function table() {
  let ids: string[] = [];
  let range: [number, number] | null = null;
  const q: Record<string, unknown> = {};
  for (const m of ["select", "is", "order", "eq"]) q[m] = () => q;
  q.in = (_col: string, list: string[]) => {
    ids = list;
    idsPerRequest.push(list.length);
    return q;
  };
  q.range = (from: number, to: number) => {
    range = [from, to];
    return q;
  };
  q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
    if (ids.length > 100) {
      // What the gateway does with an address this long: no answer PostgREST ever saw.
      return Promise.resolve({ data: null, error: { message: "TypeError: Failed to fetch" }, count: null }).then(res, rej);
    }
    const wanted = new Set(ids);
    const rows = VALUES.filter((v) => wanted.has(v.scope_id));
    const [from, to] = range ?? [0, rows.length - 1];
    const page = rows.slice(from, Math.min(to, from + 999) + 1);
    return Promise.resolve({ data: page, error: null, count: rows.length }).then(res, rej);
  };
  return q;
}
jest.mock("@/utils/supabase/contextDb", () => ({ contextDb: () => ({ from: () => table() }) }));

// eslint-disable-next-line import/first
import { scopesService } from "../scopesService";

it("asks in batches of at most 100 scopes and brings back every current value", async () => {
  const answer = await scopesService.listContextValuesForScopes(SCOPES);
  expect(answer.ok).toBe(true);
  if (!answer.ok) return;
  expect(answer.data.values).toHaveLength(VALUES.length);
  expect(Math.max(...idsPerRequest)).toBeLessThanOrEqual(100);
});
