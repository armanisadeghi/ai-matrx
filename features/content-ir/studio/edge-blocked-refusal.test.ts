/**
 * B-36 / DD-123 S5 — when the security filter IN FRONT of the database eats a
 * component save, the author is told so.
 *
 * WHY THIS EXISTS. `db.matrxserver.com` is behind Cloudflare, whose managed
 * WAF inspects the PATCH body. A component body IS source code, so it can trip
 * a SQL-injection / malformed-data rule and be answered with Cloudflare's own
 * HTML block page. supabase-js surfaces that page as an "error" whose
 * `message` is a whole HTML document, and `operationFailed` then wrapped it
 * into "We couldn't save this Shape's component code." — so the author was not
 * told the database never saw the save, not given the reference the block page
 * carries, and not told what to ask for.
 *
 * This is not hypothetical. Two live bodies — `study_notes_readout` and
 * `study_summary_readout` — are refused by that filter today even when written
 * back BYTE-FOR-BYTE UNCHANGED (measured 2026-09-12: the narrowest blocked
 * payload found by bisection is one statement out of their markdown parsers,
 * `const h = /^(#{1,6})\s+(.*)$/.exec(t);`). Nothing in the frontend can
 * unblock that — the fix is a WAF exception for this endpoint — but the
 * sentence the author reads is ours.
 *
 * The HTML below is the real response body, trimmed.
 *
 * PROVEN RED FIRST: with `edgeBlockedRefusal` not wired into the catch, the
 * first three assertions fail on the generic sentence.
 */
import { edgeBlockedRefusal } from "@/features/content-ir/studio/kind-component-code-service";

const CLOUDFLARE_BLOCK_PAGE = `<!DOCTYPE html>
<!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <![endif]-->
<head><title>Attention Required! | Cloudflare</title></head>
<body><h1 data-translate="block_headline">Sorry, you have been blocked</h1>
<h2 class="cf-subheadline"><span data-translate="unable_to_access">You are unable to access</span> supabase.co</h2>
<span class="cf-footer-item sm:block sm:mb-1">Cloudflare Ray ID: <strong class="font-semibold">a3a052880aa772d5</strong></span>
</body></html>`;

describe("a component save the edge blocked", () => {
  it("says the database never saw it, and names the reference to quote", () => {
    const sentence = edgeBlockedRefusal({ message: CLOUDFLARE_BLOCK_PAGE });
    expect(sentence).not.toBeNull();
    expect(sentence).toContain("blocked by the security filter");
    expect(sentence).toContain("never saved");
    expect(sentence).toContain("a3a052880aa772d5");
    expect(sentence).toContain("Ask AI Matrx");
    // It must not read as the author's fault, or as something they can retype
    // their way out of.
    expect(sentence).toContain("not your account");
  });

  it("still says what happened when the block page carries no reference", () => {
    const sentence = edgeBlockedRefusal({
      message: "<html><body>Sorry, you have been blocked</body></html>",
    });
    expect(sentence).toContain("blocked by the security filter");
    expect(sentence).not.toContain("Ray ID");
  });

  it("leaves an ordinary database error alone", () => {
    expect(
      edgeBlockedRefusal({
        message:
          'duplicate key value violates unique constraint "kind_component_pkey"',
      }),
    ).toBeNull();
    expect(edgeBlockedRefusal(null)).toBeNull();
    expect(edgeBlockedRefusal("a string")).toBeNull();
  });
});
