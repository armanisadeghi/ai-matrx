/**
 * A non-streaming AI endpoint refused by the usage gate (HTTP 402, the flat
 * envelope of USAGE-GATE.md § Contract — e.g. the CRM journalist beat) reads
 * as the gate's own sentence through the shared request + error path every
 * card uses (`parseHttpError` → `BackendApiError` → `extractErrorMessage`),
 * never "Something went wrong". Real parser, real extractor; only the
 * Response is built by hand from the body the server sent live 2026-10-05.
 */

import { parseHttpError } from "@/lib/api/errors";
import { extractErrorMessage } from "@/utils/errors";

const SENTENCE =
  "You've reached your AI usage limit for now. Upgrade your plan to keep going.";

const LIVE_402_BODY = {
  error: "usage_limit_reached",
  message: SENTENCE,
  fix_action: "upgrade_plan",
  required_tier: "personal-entry",
  plan_key: "free",
  state: "over",
  binding_period: "week",
  limit: 7500,
  used: 7600,
  resets_at: "2026-10-12T00:00:00+00:00",
  usage: {},
};

describe("a 402 usage refusal from a non-streaming endpoint", () => {
  it("surfaces the gate's sentence and code, not a generic failure", async () => {
    const response = {
      status: 402,
      text: async () => JSON.stringify(LIVE_402_BODY),
    } as unknown as Response;
    const err = await parseHttpError(response);
    expect(err.status).toBe(402);
    expect(err.code).toBe("usage_limit_reached");
    expect(err.userMessage).toBe(SENTENCE);
    const shown = extractErrorMessage(err);
    expect(shown).toContain(SENTENCE);
    expect(shown).not.toMatch(/something went wrong/i);
  });
});
