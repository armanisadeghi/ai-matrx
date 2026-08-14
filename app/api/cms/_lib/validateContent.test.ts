/** @jest-environment node */

import {
  cmsContentBlockedResponse,
  validateContent,
  withCmsValidationHeader,
} from "./validateContent";

const originalAidreamUrl = process.env.AIDREAM_API_URL;

describe("CMS content validation client", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    process.env.AIDREAM_API_URL = "https://aidream.test";
  });

  afterAll(() => {
    process.env.AIDREAM_API_URL = originalAidreamUrl;
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
      accessToken: "jwt",
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
        },
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
      accessToken: "jwt",
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
});
