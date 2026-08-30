const getServerAuthMock = jest.fn();
const redirectMock = jest.fn();
const detailViewMock = jest.fn();

jest.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

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
    getServerAuthMock.mockResolvedValue({ isAuthenticated: false });

    await expect(
      FlashcardSetPage({ params: Promise.resolve({ setId: "set-123" }) }),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/login?redirectTo=%2Feducation%2Fflashcards%2Fset-123",
    );
    expect(detailViewMock).not.toHaveBeenCalled();
  });

  it("renders the client detail island for an authenticated request", async () => {
    getServerAuthMock.mockResolvedValue({ isAuthenticated: true });

    const result = await FlashcardSetPage({
      params: Promise.resolve({ setId: "set-123" }),
    });

    expect(result.props).toEqual({ setId: "set-123" });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
