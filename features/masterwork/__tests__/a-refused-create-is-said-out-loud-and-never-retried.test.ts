// features/masterwork/__tests__/a-refused-create-is-said-out-loud-and-never-retried.test.ts
//
// A REFUSED CREATE IS SAID OUT LOUD, AND NEVER RETRIED BEHIND HER BACK.
//
// ## The defect this holds closed (cold walk 20, defect C — 2026-09-22)
//
// common-docs/projects/masterwork-methods-census/jobs-bar-2026-09-16/cold-walk-20
//
// The walk typed a Rulebook name that already existed. On the wire:
// `POST /rest/v1/rpc/rulebook_create` → **409**, the client retried, the retry
// → **200**, and a third Rulebook carrying the identical name appeared in her
// list. On screen: nothing. 4,311 characters of page holding no word about a
// conflict of any kind, and `/masterwork/all` then showing three rows reading
// `walk20-Zone Failure Verdict`, separable only by rule count.
//
// The client half of the cause was five lines of `createDraftRulebook`:
//
//     if (error?.code === "23505") {
//       slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
//       continue;                       // ← a 4xx caught, acted on, unsaid
//     }
//
// A server refusal reached the browser and the person was told nothing. The
// 23505 was a SLUG collision (`rulebook_slug_live_unique` is a global unique
// index and the slug is derived from the name she typed) — the door owns that
// now, so there is nothing left to retry. These three guards fail on the
// pre-fix function and pass on the shipped one:
//
//   1. ONE call. A refusal is never followed by a second attempt.
//   2. The refusal reaches the caller as the DOOR'S OWN SENTENCE, not as
//      "We couldn't create that Rulebook."
//   3. One intent carries one token, so the door can collapse a double press.

const rpc = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    schema: () => ({ from: () => ({}) }),
  },
}));
jest.mock("../understudy/refresh", () => ({ pokeUnderstudy: jest.fn() }));

import { createDraftRulebook } from "../service";

/** The row the door answers with, in the shape `_rulebook_json` returns. */
const doorRow = (over: Record<string, unknown> = {}) => ({
  id: "3f7f9d2a-1111-4111-8111-111111111111",
  name: "Zone failure verdict — HOA irrigation",
  slug: "zone-failure-verdict-hoa-irrigation",
  description: "",
  source: {},
  sections: { G: { label: "General" } },
  rules: [],
  status: "draft",
  organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
  visibility: "internal",
  metadata: {},
  version: 1,
  created: true,
  name_already_in_use: false,
  ...over,
});

const input = {
  name: "Zone failure verdict — HOA irrigation",
  description:
    "How I decide whether a dry or flooding zone needs a controller reprogram, a valve and solenoid repair, a drip retrofit, or a mainline replacement.",
  source: {},
  organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
};

beforeEach(() => {
  rpc.mockReset();
});

describe("a create that the door refuses", () => {
  it("is attempted exactly ONCE — the 409 the walk saw is never retried", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "rulebook_slug_live_unique"',
      },
    });

    await expect(createDraftRulebook(input)).rejects.toThrow();
    // The pre-fix loop called the door up to FIVE times, each retry with a
    // fresh random slug, and only the first refusal ever existed on the wire.
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("reaches the caller as the DOOR'S OWN SENTENCE, not a generic one", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message:
          "rulebook_create: 5dc930e9-bd65-44a1-8369-af773f6e1a5b is not an organization you can start a Rulebook in.",
      },
    });

    await expect(createDraftRulebook(input)).rejects.toThrow(
      "5dc930e9-bd65-44a1-8369-af773f6e1a5b is not an organization you can start a Rulebook in.",
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("still says something when the failure has no sentence of its own", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST301", message: "JWT expired" },
    });
    await expect(createDraftRulebook(input)).rejects.toThrow(
      "We couldn't create that Rulebook.",
    );
  });
});

describe("a create that the door accepts", () => {
  it("carries the caller's own intent id, so a double press collapses", async () => {
    rpc.mockResolvedValue({ data: doorRow(), error: null });

    await createDraftRulebook({ ...input, clientToken: "intent-1" });
    await createDraftRulebook({ ...input, clientToken: "intent-1" });

    expect(rpc).toHaveBeenCalledTimes(2);
    for (const call of rpc.mock.calls) {
      expect(call[0]).toBe("rulebook_create");
      expect(
        (call[1] as { p_metadata: { client_token: string } }).p_metadata
          .client_token,
      ).toBe("intent-1");
    }
  });

  it("mints an intent id when the caller brings none, and never repeats it", async () => {
    rpc.mockResolvedValue({ data: doorRow(), error: null });

    await createDraftRulebook(input);
    await createDraftRulebook(input);

    const tokens = rpc.mock.calls.map(
      (call) =>
        (call[1] as { p_metadata: { client_token: string } }).p_metadata
          .client_token,
    );
    expect(tokens[0]).toEqual(expect.any(String));
    expect(tokens[0]).not.toBe(tokens[1]);
  });

  it("surfaces the fact the screen needs in order to say a sentence", async () => {
    rpc.mockResolvedValue({
      data: doorRow({ name_already_in_use: true }),
      error: null,
    });
    const rulebook = await createDraftRulebook(input);
    // Never a refusal — Notion and Linear both allow a duplicate title. The
    // walk's complaint was the SILENCE, and this is what ends it.
    expect(rulebook.nameAlreadyInUse).toBe(true);
    expect(rulebook.created).toBe(true);
    expect(rulebook.name).toBe(input.name);
  });

  it("reports a replay as a replay, so a second press is not announced as a new Rulebook", async () => {
    rpc.mockResolvedValue({
      data: doorRow({ created: false }),
      error: null,
    });
    const rulebook = await createDraftRulebook({
      ...input,
      clientToken: "intent-2",
    });
    expect(rulebook.created).toBe(false);
  });
});
