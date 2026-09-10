/** @jest-environment node */

import {
  cmsContentBlockedResponse,
  validateContent,
  withCmsValidationHeader,
} from "./validateContent";

const ORGANIZATION_ID = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";

describe("CMS content validation client", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("returns the guard's blocking findings and builds the canonical 422", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          allowed: false,
          report: {
            html: {
              blocked: true,
              violations: [
                {
                  rule_id: "html.dangerous_url_scheme",
                  node_path: "/a",
                  excerpt: "javascript:alert(1)",
                  severity: "block",
                  fix_hint: "Replace the URL.",
                },
              ],
              warnings: [],
              excepted: [],
              profile: "cms_page_fragment:standard",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await validateContent({
      content: { html: '<a href="javascript:alert(1)">x</a>' },
      siteId: "site-1",
      pageId: "page-1",
      // The site's organization. Mandatory: every identified call to aidream
      // carries X-Organization-Id, and the fail-closed kernel refuses one that
      // does not before any networking happens. Omitting it here is what made
      // this call throw in production and skip every CMS write unvalidated.
      organizationId: ORGANIZATION_ID,
      accessToken: "jwt",
      baseUrl: "https://aidream.test",
    });

    expect(result).toMatchObject({
      allowed: false,
      skipped: false,
      findings: [
        {
          field: "html",
          rule_id: "html.dangerous_url_scheme",
          severity: "block",
        },
      ],
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://aidream.test/cms/validate",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer jwt",
          "Content-Type": "application/json",
          "X-Organization-Id": ORGANIZATION_ID,
        },
        // The organization rides in the HEADER only: aidream's
        // `CmsValidationRequest` is `extra="forbid"`, so a scope field merged
        // into this body would be refused with a 422.
        body: JSON.stringify({
          content: { html: '<a href="javascript:alert(1)">x</a>' },
          site_id: "site-1",
          page_id: "page-1",
        }),
      }),
    );
    const rejection = cmsContentBlockedResponse(result);
    expect(rejection?.status).toBe(422);
    await expect(rejection?.json()).resolves.toEqual({
      error: {
        code: "cms_content_blocked",
        findings: result.findings,
      },
    });
  });

  it("fails open loudly and marks the route response when aidream is down", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    jest
      .spyOn(global, "fetch")
      .mockRejectedValue(new Error("connection refused"));

    const result = await validateContent({
      content: { css: "body { color: red; }" },
      siteId: "site-1",
      organizationId: ORGANIZATION_ID,
      accessToken: "jwt",
      baseUrl: "https://aidream.test",
    });
    const response = withCmsValidationHeader(
      new Response(JSON.stringify({ success: true })),
      result,
    );

    expect(result).toEqual({ allowed: true, skipped: true, findings: [] });
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("SKIPPED"),
      expect.any(Error),
    );
    expect(response.headers.get("X-Cms-Validation")).toBe("skipped");
  });

  it("never blames aidream for a missing organization — and never calls it", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const fetchSpy = jest.spyOn(global, "fetch");

    const result = await validateContent({
      content: { html: "<p>hi</p>" },
      siteId: "site-1",
      organizationId: null,
      accessToken: "jwt",
      baseUrl: "https://aidream.test",
    });

    expect(result).toEqual({ allowed: true, skipped: true, findings: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
    const [message] = consoleError.mock.calls[0] ?? [];
    expect(message).toEqual(expect.stringContaining("SKIPPED"));
    expect(message).toEqual(expect.stringContaining("organization"));
    expect(message).not.toEqual(expect.stringContaining("unreachable"));
  });
});
