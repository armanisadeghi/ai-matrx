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
 * and every row comes back. Since lane SCOPES-READS-WEB the values come from the record store's
 * `custom.context_values` door, which refuses more than 200 scopes a call.
 */
const USER = "a3c1d2e4-5f60-4718-9a2b-3c4d5e6f7081";

jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: () => USER,
  requireUserId: () => USER,
}));
jest.mock("@/utils/supabase/adminLane", () => ({ browserAdminLaneOpen: () => false }));
const SCOPES = Array.from({ length: 640 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
const VALUES = SCOPES.flatMap((scopeId, i) =>
  [0, 1, 2].map((k) => ({
    scope_id: scopeId,
    context_item_id: `20000000-0000-4000-8000-00000000000${k}`,
    key: `note_${k}`,
    value: `Patient ${i} note ${k}`,
    field: { type: "text", multi: false },
    version: 1,
    set_at: "2026-09-29T00:00:00Z",
    source_type: "manual",
    value_id: `10000000-0000-4000-8000-${String(i * 3 + k).padStart(12, "0")}`,
  })),
);
const idsPerRequest: number[] = [];

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: (name: string) => {
      if (name !== "custom") throw new Error(`the ${name} schema was read`);
      return {
        rpc: (door: string, args: { p_scope_ids: string[] }) => {
          if (door !== "context_values") throw new Error(`unexpected door ${door}`);
          idsPerRequest.push(args.p_scope_ids.length);
          if (args.p_scope_ids.length > 200) {
            return Promise.resolve({ data: null, error: { code: "22023", message: "custom.context_values answers at most 200 scopes a call" } });
          }
          const wanted = new Set(args.p_scope_ids);
          return Promise.resolve({ data: VALUES.filter((v) => wanted.has(v.scope_id)), error: null });
        },
      };
    },
  },
}));

// eslint-disable-next-line import/first
import { scopesService } from "../scopesService";

it("asks in batches of at most 100 scopes and brings back every current value", async () => {
  const answer = await scopesService.listContextValuesForScopes(SCOPES);
  expect(answer.ok).toBe(true);
  if (!answer.ok) return;
  expect(answer.data.values).toHaveLength(VALUES.length);
  expect(Math.max(...idsPerRequest)).toBeLessThanOrEqual(100);
});
