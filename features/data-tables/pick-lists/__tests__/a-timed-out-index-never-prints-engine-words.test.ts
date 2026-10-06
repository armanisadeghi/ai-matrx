/**
 * A timed-out pick-list index read reaches the screen through the one failure translator, never as
 * Postgres' own words ("canceling statement due to statement timeout") glued into a sentence —
 * found on /education/flashcards/new → Use existing → Tables, 2026-10-05.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { readPickListIndex, readPickListIndexOrThrow } from "../pick-list-index";

const TIMEOUT = { message: "canceling statement due to statement timeout", code: "57014", details: null, hint: null };

function clientAnswering(error: typeof TIMEOUT): SupabaseClient {
  const rpc = jest.fn().mockResolvedValue({ data: null, error });
  return { schema: () => ({ rpc }) } as unknown as SupabaseClient;
}

describe("pick-list index failure", () => {
  it("translates a timeout into the screen's sentence and keeps the store's error", async () => {
    const answered = await readPickListIndex(clientAnswering(TIMEOUT), { everywhere: true });
    expect(answered.ok).toBe(false);
    if (answered.ok) return;
    expect(answered.why).not.toMatch(/canceling statement/i);
    expect(answered.why).toMatch(/took too long/i);
    expect(answered.error.code).toBe("57014");
  });

  it("throws an error the shared display can classify (code kept, no engine words)", async () => {
    const thrown = await readPickListIndexOrThrow(clientAnswering(TIMEOUT), { everywhere: true }).catch((e) => e);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).not.toMatch(/canceling statement/i);
    expect((thrown as { code?: string }).code).toBe("57014");
  });
});
