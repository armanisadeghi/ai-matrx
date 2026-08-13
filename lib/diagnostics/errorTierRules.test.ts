/**
 * Tier-classification regression coverage.
 *
 * Both cases below were captured RED in production on 2026-08-13 while the
 * code that produces them treats them as normal operation. A red row that the
 * producer already calls "fine" is not a harmless cosmetic issue: it is how a
 * real red — the `seo.v_site_keyword_performance` statement timeout sitting in
 * the same capture — gets lost in the noise.
 */
import type { CapturedError } from "@/lib/diagnostics/errorCaptureStore";
import { classifyTier } from "@/lib/diagnostics/errorTierRules";

function captured(over: Partial<CapturedError>): CapturedError {
  return {
    id: "t-1",
    source: "agent-stream-warning",
    firstAt: 0,
    lastAt: 0,
    count: 1,
    route: "/marketing/content-plan/site-1",
    url: "https://www.aimatrx.com/marketing/content-plan/site-1",
    operation: "unknown",
    message: "message",
    tier: "red",
    ...over,
  } as CapturedError;
}

describe("classifyTier", () => {
  it("downgrades a server stream warning that declares itself recoverable", () => {
    // The real payload: content-plan deepen warning that the page has no
    // keyword and the site has no keyword library. aidream emits this
    // deliberately rather than inventing a keyword — the run continued.
    const c = classifyTier(
      captured({
        source: "agent-stream-warning",
        relation: "content_plan_generator",
        code: "content_plan_generator",
        level: "medium",
        recoverable: true,
        message:
          "This page has no primary keyword and this site has no keyword library",
      }),
    );

    expect(c.tier).toBe("orange");
    expect(c.ruleId).toBe("stream-warning-recoverable");
  });

  it("leaves a NON-recoverable stream warning red", () => {
    const c = classifyTier(
      captured({
        source: "agent-stream-warning",
        relation: "something_bad",
        code: "something_bad",
        level: "high",
        recoverable: false,
      }),
    );

    expect(c.tier).toBe("red");
  });

  it("still reds a stream warning that ships no severity claim at all", () => {
    // Absence of a claim is not a claim of safety.
    const c = classifyTier(
      captured({ source: "agent-stream-warning", code: "mystery" }),
    );

    expect(c.tier).toBe("red");
  });

  it("downgrades the assists dedupe race the producer already treats as success", () => {
    const c = classifyTier(
      captured({
        source: "supabase-postgrest",
        schema: "platform",
        relation: "assists",
        operation: "insert",
        code: "23505",
        status: 409,
        message:
          'duplicate key value violates unique constraint "assists_dedupe_pending_key"',
      }),
    );

    expect(c.tier).toBe("yellow");
    expect(c.ruleId).toBe("assists-dedupe-race");
  });

  it("does NOT downgrade a duplicate-key on any other relation", () => {
    const c = classifyTier(
      captured({
        source: "supabase-postgrest",
        schema: "plan",
        relation: "node",
        operation: "insert",
        code: "23505",
        status: 409,
        message: "duplicate key value violates unique constraint",
      }),
    );

    expect(c.tier).toBe("red");
  });

  it("keeps a statement timeout on a read RED — the real defect in the same capture", () => {
    const c = classifyTier(
      captured({
        source: "supabase-postgrest",
        schema: "seo",
        relation: "v_site_keyword_performance",
        operation: "select",
        code: "57014",
        status: 500,
        message: "canceling statement due to statement timeout",
      }),
    );

    expect(c.tier).toBe("red");
  });
});
