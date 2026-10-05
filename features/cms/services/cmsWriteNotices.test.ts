/**
 * A CMS write's notices reach the person: "Writing check didn't run" arrives in the
 * route's JSON `notices`, and every CmsPageService write shows it as a toast — a
 * response header nobody reads is not enough.
 */

const warning = jest.fn();
jest.mock("@/lib/toast", () => ({ toast: { warning: (...a: unknown[]) => warning(...a) } }));

import { CmsApiError, CmsPageService, writingBlockOf } from "./cmsService";

afterEach(() => {
  jest.restoreAllMocks();
  warning.mockReset();
});

function answer(body: unknown, status = 200) {
  jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

it("shows a write's notices", async () => {
  answer({ success: true, page: { id: "page-1" }, notices: ["Writing check didn't run"] });
  await CmsPageService.publishDraft("page-1");
  expect(warning).toHaveBeenCalledWith("Writing check didn't run");
});

it("a writing block is a structured error the editor can show as a list", async () => {
  answer(
    {
      error: "Not published: 1 writing item to fix.",
      code: "cms_writing_check_blocked",
      must_fix: [{ field: "title", rule_id: "deslop-throat-clearing", match: "Here's the thing", fix_hint: "Cut it." }],
    },
    422,
  );
  const err = await CmsPageService.publishDraft("page-1").catch((e: unknown) => e);
  expect(err).toBeInstanceOf(CmsApiError);
  expect(writingBlockOf(err)).toEqual([
    { field: "title", rule_id: "deslop-throat-clearing", match: "Here's the thing", fix_hint: "Cut it." },
  ]);
  expect(writingBlockOf(new Error("other"))).toBeNull();
});
