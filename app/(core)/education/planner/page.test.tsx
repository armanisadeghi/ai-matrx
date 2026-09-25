const getServerAuthMock = jest.fn();
const redirectMock = jest.fn();

jest.mock("@/utils/supabase/getServerAuth", () => ({
  getServerAuth: (...args: unknown[]) => getServerAuthMock(...args),
}));
jest.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));
jest.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ "x-pathname": "/education/planner", "x-search-params": "" }),
}));

// The door's real answer (getServerAuth): a user, or none — and, separately,
// whether a verdict could be reached at all.
const SIGNED_IN = {
  user: { id: "5b1f3c2e-8a47-4d8e-9c1a-2f6e0b7d4a91", email: "admin@admin.com" },
  isAuthenticated: true,
  authUnavailable: false,
};
const SIGNED_OUT = { user: null, isAuthenticated: false, authUnavailable: false };
const UNVERIFIED = { user: null, isAuthenticated: false, authUnavailable: true };
jest.mock(
  "@/features/education/study/planner/components/PlannerWorkspace",
  () => ({ PlannerWorkspace: () => null }),
);

import PlannerToolPage from "./page";

describe("education planner authentication boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Next's redirect() never returns — it throws NEXT_REDIRECT.
    redirectMock.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
  });

  it("redirects a guest before the planner client loaders can mount", async () => {
    getServerAuthMock.mockResolvedValue(SIGNED_OUT);

    await expect(PlannerToolPage()).rejects.toThrow(
      "NEXT_REDIRECT:/login?redirectTo=%2Feducation%2Fplanner",
    );
  });

  it("renders the planner only for an authenticated request", async () => {
    getServerAuthMock.mockResolvedValue(SIGNED_IN);

    const result = await PlannerToolPage();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it("holds a person whose identity could not be verified on /auth/verifying, never /login", async () => {
    getServerAuthMock.mockResolvedValue(UNVERIFIED);

    await expect(PlannerToolPage()).rejects.toThrow(
      "NEXT_REDIRECT:/auth/verifying?next=%2Feducation%2Fplanner",
    );
    expect(redirectMock).not.toHaveBeenCalledWith(expect.stringContaining("/login"));
  });
});
