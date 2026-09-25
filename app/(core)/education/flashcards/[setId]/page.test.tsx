const getServerAuthMock = jest.fn();
const redirectMock = jest.fn();
const detailViewMock = jest.fn();

jest.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));
jest.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ "x-pathname": "/education/flashcards/set-123", "x-search-params": "" }),
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

jest.mock("@/utils/supabase/getServerAuth", () => ({
  getServerAuth: () => getServerAuthMock(),
}));

jest.mock("@/features/flashcards/components/set-detail/SetDetailView", () => ({
  SetDetailView: (props: unknown) => {
    detailViewMock(props);
    return null;
  },
}));

import FlashcardSetPage from "./page";

describe("flashcard set detail auth boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redirectMock.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
  });

  it("redirects a guest before the client detail island can query PostgREST", async () => {
    getServerAuthMock.mockResolvedValue(SIGNED_OUT);

    await expect(
      FlashcardSetPage({ params: Promise.resolve({ setId: "set-123" }) }),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/login?redirectTo=%2Feducation%2Fflashcards%2Fset-123",
    );
    expect(detailViewMock).not.toHaveBeenCalled();
  });

  it("renders the client detail island for an authenticated request", async () => {
    getServerAuthMock.mockResolvedValue(SIGNED_IN);

    const result = await FlashcardSetPage({
      params: Promise.resolve({ setId: "set-123" }),
    });

    expect(result.props).toEqual({ setId: "set-123" });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("holds a person whose identity could not be verified on /auth/verifying, never /login", async () => {
    getServerAuthMock.mockResolvedValue(UNVERIFIED);

    await expect(
      FlashcardSetPage({ params: Promise.resolve({ setId: "set-123" }) }),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/auth/verifying?next=%2Feducation%2Fflashcards%2Fset-123",
    );
    expect(detailViewMock).not.toHaveBeenCalled();
  });
});
