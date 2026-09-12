import MasterworkLayout from "../layout";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

jest.mock("server-only", () => ({}));

jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

jest.mock("@/utils/supabase/getServerAuth", () => ({
  getServerAuth: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  redirect: jest.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
}));

const mockedHeaders = jest.mocked(headers);
const mockedGetServerAuth = jest.mocked(getServerAuth);
const mockedRedirect = jest.mocked(redirect);

const PRIVATE_MASTERWORK_ROUTES = [
  "/masterwork/all",
  "/masterwork/approaches",
  "/masterwork/new",
  "/masterwork/admin",
  "/masterwork/rulebook-123",
  "/masterwork/rulebook-123/conduct",
  "/masterwork/encore",
  "/masterwork/encore/released-123",
] as const;

describe("MasterworkLayout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(PRIVATE_MASTERWORK_ROUTES)(
    "stops a guest before the private %s workspace can mount and preserves its exact destination",
    async (pathname) => {
      const search = "?tab=activity&source=notification";
      mockedHeaders.mockResolvedValue(
        new Headers({
          "x-pathname": pathname,
          "x-search-params": search,
        }),
      );
      mockedGetServerAuth.mockResolvedValue({
        isAuthenticated: false,
        user: null,
      });

      const destination = `${pathname}${search}`;
      const login = `/login?redirectTo=${encodeURIComponent(destination)}`;

      await expect(
        MasterworkLayout({ children: <div>private Masterwork reader</div> }),
      ).rejects.toThrow(`redirect:${login}`);
      expect(mockedRedirect).toHaveBeenCalledWith(login);
    },
  );

  it("keeps the public Masterwork landing available to guests", async () => {
    mockedHeaders.mockResolvedValue(
      new Headers({ "x-pathname": "/masterwork" }),
    );
    const child = <div>public Masterwork landing</div>;

    await expect(MasterworkLayout({ children: child })).resolves.toBe(child);
    expect(mockedGetServerAuth).not.toHaveBeenCalled();
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("keeps the Vision Interview guest gate in control of its own routes", async () => {
    mockedHeaders.mockResolvedValue(
      new Headers({ "x-pathname": "/masterwork/vision-interview/session-123" }),
    );
    const child = <div>Vision Interview server guest gate</div>;

    await expect(MasterworkLayout({ children: child })).resolves.toBe(child);
    expect(mockedGetServerAuth).not.toHaveBeenCalled();
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("renders every private workspace child unchanged for an authenticated user", async () => {
    mockedHeaders.mockResolvedValue(
      new Headers({ "x-pathname": "/masterwork/encore/released-123" }),
    );
    mockedGetServerAuth.mockResolvedValue({
      isAuthenticated: true,
      user: {} as Awaited<ReturnType<typeof getServerAuth>>["user"],
    });
    const child = <div>private Masterwork reader</div>;

    await expect(MasterworkLayout({ children: child })).resolves.toBe(child);
    expect(mockedRedirect).not.toHaveBeenCalled();
  });
});
