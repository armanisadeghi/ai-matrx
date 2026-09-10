import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";

import { fetchSitePipeline } from "./bridge";

jest.mock("@/lib/api/call-api", () => ({
  callApi: jest.fn((config: unknown) => config),
}));

const SITE_ID = "baa61391-286f-4143-81dc-226dfbc90358";
const ORGANIZATION_ID = "f9cb3e35-2a65-4f2a-8525-088d6551071c";

describe("fetchSitePipeline", () => {
  it("binds the viewed site's organization instead of the shell selection", async () => {
    const dispatch = jest.fn(async () => ({
      data: {
        site_id: SITE_ID,
        stages: [
          {
            key: "live",
            label: "Live site",
            state: "complete",
            done: 28,
            total: 28,
            detail: "28 of 28 planned pages are live.",
            missing: [],
          },
        ],
        pages_planned: 28,
        cms_linked: true,
        cms_site_id: "cms-site-1",
        cms_slug: "cosmeticinjectables-com",
      },
    })) as unknown as AppDispatch;

    const result = await fetchSitePipeline(dispatch, SITE_ID, ORGANIZATION_ID);

    expect(callApi).toHaveBeenCalledWith({
      path: "/content-plan/sites/{site_id}/pipeline",
      method: "GET",
      pathParams: { site_id: SITE_ID },
      scopeOverrides: { organization_id: ORGANIZATION_ID },
    });
    expect(result.stages).toEqual([
      expect.objectContaining({ key: "live", done: 28, total: 28 }),
    ]);
  });
});
