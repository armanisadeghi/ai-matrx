// The seam between a meeting's stored panel key and the host app's registry (Meet MD-15):
// the key the 360 review schedules with must be a registered panel, or the call shows no panel.
jest.mock("next/dynamic", () => () => function Panel() { return null; });
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@ai-matrx/meet", () => ({ createMeetRepository: () => ({}), asOrganizationId: (v: string) => v, asUserId: (v: string) => v }));

import { MEET_APP_PANELS } from "./registry";
import { REVIEW_360_PANEL_KEY } from "@/features/employee-performance-reviews/review-360/ReviewMeetingActions";

describe("Meet app panels registered by this app", () => {
  it("registers the panel the 360 review meeting carries", () => {
    expect(Object.keys(MEET_APP_PANELS)).toContain(REVIEW_360_PANEL_KEY);
    expect(MEET_APP_PANELS[REVIEW_360_PANEL_KEY]?.title).toBe("360 review");
  });
});
