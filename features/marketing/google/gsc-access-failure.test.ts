/*
  The Search Console ingestion banner's "Google access is broken" verdict, proven
  against the exact failure sentences the server wrote in production
  (seo.collection_run.error, 2026-08-23 .. 2026-09-21). A reconnect state that
  renders as an ordinary failure leaves the organization with no remedy, and the
  platform alarm used to count it as OUR defect instead.
*/

import { classifyGscAccessFailure } from "@/features/marketing/google/gsc-property";

describe("classifyGscAccessFailure", () => {
  it.each([
    "connection d33d88c0 has no live discovered search_console_property resource 'sc-domain:example.com' — it was never discovered under this connection, was removed, or the connection needs re-authentication",
    "Google connection 608fe2e7 does not exist or was disconnected, and no other live connection for the same Google account is available — reconnect the Google account at /marketing/connections/google",
    "GSC Search Analytics retries exhausted: GSC token refresh failed: HTTP 400 invalid_grant",
  ])("names a reconnect for %s", (text) => {
    expect(classifyGscAccessFailure(text)).not.toBeNull();
  });

  it.each([
    "Query timed out during execute_query",
    "GSC token refresh failed: 401 invalid_client",
    "GSC could not resolve 1 page URL(s) to canonical in-scope web pages",
  ])("keeps a platform failure ordinary: %s", (text) => {
    expect(classifyGscAccessFailure(text)).toBeNull();
  });
});
