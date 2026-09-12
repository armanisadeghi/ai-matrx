import RulebookLayout from "../layout";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { redirect } from "next/navigation";

jest.mock("@/utils/supabase/getServerAuth", () => ({
  getServerAuth: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  redirect: jest.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
}));

const mockedGetServerAuth = jest.mocked(getServerAuth);
const mockedRedirect = jest.mocked(redirect);

describe("RulebookLayout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("redirects a guest before any private Rulebook child can mount", async () => {
    mockedGetServerAuth.mockResolvedValue({ isAuthenticated: false, user: null });

    await expect(
      RulebookLayout({ children: <div>private rulebook reader</div> }),
    ).rejects.toThrow("redirect:/login?redirectTo=%2Fmasterwork");

    expect(mockedRedirect).toHaveBeenCalledWith(
      "/login?redirectTo=%2Fmasterwork",
    );
  });

  it("renders the child unchanged for an authenticated user", async () => {
    mockedGetServerAuth.mockResolvedValue({
      isAuthenticated: true,
      user: {} as Awaited<ReturnType<typeof getServerAuth>>["user"],
    });
    const child = <div>private rulebook reader</div>;

    await expect(RulebookLayout({ children: child })).resolves.toBe(child);
    expect(mockedRedirect).not.toHaveBeenCalled();
  });
});
