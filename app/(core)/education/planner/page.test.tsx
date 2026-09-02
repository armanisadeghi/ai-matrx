const getServerAuthMock = jest.fn();
const redirectMock = jest.fn();

jest.mock("@/utils/supabase/getServerAuth", () => ({
  getServerAuth: (...args: unknown[]) => getServerAuthMock(...args),
}));
jest.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));
jest.mock(
  "@/features/education/study/planner/components/PlannerWorkspace",
  () => ({ PlannerWorkspace: () => null }),
);

import PlannerToolPage from "./page";

describe("education planner authentication boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("redirects a guest before the planner client loaders can mount", async () => {
    getServerAuthMock.mockResolvedValue({ isAuthenticated: false });

    await PlannerToolPage();

    expect(redirectMock).toHaveBeenCalledWith(
      "/login?redirectTo=%2Feducation%2Fplanner",
    );
  });

  it("renders the planner only for an authenticated request", async () => {
    getServerAuthMock.mockResolvedValue({ isAuthenticated: true });

    const result = await PlannerToolPage();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });
});
