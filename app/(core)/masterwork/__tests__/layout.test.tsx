import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
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

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Render what the layout resolved to, and report what the route actually got.
 *
 * These cases used to assert `resolves.toBe(child)` — element identity — which
 * says "the layout adds nothing", not "the route still works". It broke the
 * day the route root grew its touch floor (b051ebfa3a): `.matrx-touch-targets
 * contents`, the ONE coarse-pointer hit-area utility, deliberately placed at
 * the route root so every Masterwork page and every lane written later
 * inherits a 44px floor. Wrapping is the layout's business; what a page must
 * never lose is being rendered, and being rendered UNDER that floor — so that
 * is what is asserted. The class is the floor's only observable in jsdom, and
 * a page rendered outside it is the regression this catches.
 */
async function renderLayout(children: ReactNode): Promise<{
  text: string;
  insideTouchFloor: string | null;
}> {
  const element = await MasterworkLayout({ children });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  const result = {
    text: container.textContent ?? "",
    insideTouchFloor:
      container.querySelector(".matrx-touch-targets")?.textContent ?? null,
  };
  act(() => root.unmount());
  container.remove();
  return result;
}

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
    const rendered = await renderLayout(<div>public Masterwork landing</div>);

    expect(rendered.text).toContain("public Masterwork landing");
    expect(rendered.insideTouchFloor).toContain("public Masterwork landing");
    expect(mockedGetServerAuth).not.toHaveBeenCalled();
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("keeps the Vision Interview guest gate in control of its own routes", async () => {
    mockedHeaders.mockResolvedValue(
      new Headers({ "x-pathname": "/masterwork/vision-interview/session-123" }),
    );
    const rendered = await renderLayout(
      <div>Vision Interview server guest gate</div>,
    );

    expect(rendered.text).toContain("Vision Interview server guest gate");
    expect(rendered.insideTouchFloor).toContain(
      "Vision Interview server guest gate",
    );
    expect(mockedGetServerAuth).not.toHaveBeenCalled();
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("renders every private workspace child, under the touch floor, for an authenticated user", async () => {
    mockedHeaders.mockResolvedValue(
      new Headers({ "x-pathname": "/masterwork/encore/released-123" }),
    );
    mockedGetServerAuth.mockResolvedValue({
      isAuthenticated: true,
      user: {} as Awaited<ReturnType<typeof getServerAuth>>["user"],
    });
    const rendered = await renderLayout(<div>private Masterwork reader</div>);

    expect(rendered.text).toContain("private Masterwork reader");
    expect(rendered.insideTouchFloor).toContain("private Masterwork reader");
    expect(mockedRedirect).not.toHaveBeenCalled();
  });
});
