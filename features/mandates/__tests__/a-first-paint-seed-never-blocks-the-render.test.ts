/** @jest-environment node */
/**
 * 🚨 AN OPTIONAL READ WITH NO DEADLINE IS A REQUIRED READ.
 *
 * On 2026-09-21 production `/staff` answered **504 GATEWAY_TIMEOUT** on six
 * consecutive signed-in loads while the database was in a relation-lock storm.
 * The page's own header says the read that hung is optional — "the door's own
 * answer is the one that counts" — and a read that THROWS was indeed caught and
 * degraded to `agentId: null`. A read that HANGS was not: PostgREST's PGRST002
 * schema-cache retry ran past Vercel's 15-second function cap and took the
 * whole page down with it.
 *
 * Seven Server Components paint a first-paint seed this way (`/staff`,
 * `/chat/new`, `/chat/talk`, `/chat/voice`, `/chat/[conversationId]`,
 * `/work/new`, the chat demos). Every one of them had the same shape, so the
 * guard is on the shared seam — `resolveMandateSeed` — and not on `/staff`.
 *
 * WHAT WOULD MAKE THIS GO RED AGAIN: awaiting `resolveMandateServer` directly
 * from a page, or raising `MANDATE_SEED_DEADLINE_MS` above the platform's
 * function cap. Both are the defect, not a variation of it.
 *
 * The positive control is the second test: with a read that answers, the seed
 * carries the real Holder, so a deadline that swallowed every answer would fail
 * here rather than pass quietly.
 */

jest.mock("server-only", () => ({}));

const resolveMandateServer = jest.fn();

jest.mock("@/features/mandates/service.server", () => {
  const actual = jest.requireActual("@/features/mandates/service.server");
  return { ...actual, resolveMandateServer };
});

import {
  MANDATE_SEED_DEADLINE_MS,
  resolveMandateSeed,
} from "@/features/mandates/seed.server";

const MANDATE_KEY = "personal_staff.front_line";

describe("a first-paint seed never blocks the render", () => {
  afterEach(() => {
    jest.useRealTimers();
    resolveMandateServer.mockReset();
  });

  it("gives up on a read that never answers, and says why", async () => {
    // A read that NEVER settles — the lock storm, exactly.
    resolveMandateServer.mockImplementation(
      () => new Promise(() => {}) as Promise<never>,
    );

    const started = Date.now();
    const seed = await resolveMandateSeed(MANDATE_KEY);
    const elapsed = Date.now() - started;

    expect(seed.agentId).toBeNull();
    // NOTHING FAILS SILENTLY: the page has a sentence to show.
    expect(seed.unavailable).toMatch(/could not be read|took too long/i);
    // The whole point: the render was released, and well inside the cap.
    expect(elapsed).toBeLessThan(MANDATE_SEED_DEADLINE_MS + 1_500);
  }, 15_000);

  it("the deadline is under the platform's own function cap", () => {
    // Vercel's Node function cap on this plan is 15 s. A seed deadline at or
    // above it cannot prevent the 504 it exists to prevent.
    expect(MANDATE_SEED_DEADLINE_MS).toBeLessThan(15_000);
  });

  it("POSITIVE CONTROL — a read that answers still seeds the page", async () => {
    resolveMandateServer.mockResolvedValue({ agentId: "agent-1" });

    const seed = await resolveMandateSeed(MANDATE_KEY);

    expect(seed.agentId).toBe("agent-1");
    expect(seed.unavailable).toBeNull();
  });

  it("a read that THROWS degrades with the server's own reason", async () => {
    resolveMandateServer.mockRejectedValue(
      Object.assign(new Error("permission denied for table definition"), {
        code: "42501",
      }),
    );

    const seed = await resolveMandateSeed(MANDATE_KEY);

    expect(seed.agentId).toBeNull();
    expect(seed.unavailable).toContain("permission denied for table definition");
  });
});
