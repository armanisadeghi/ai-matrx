/** @jest-environment jsdom */

import { act, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import AdminRouteSidebarMenu from "./AdminRouteSidebarMenu";
import { getAdminNavigationLocations } from "../constants/admin-navigation";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let pathnameMock = "/administration";
jest.mock("next/navigation", () => ({ usePathname: () => pathnameMock }));

jest.mock("@/components/navigation/AppLink", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("@ai-matrx/icons", () => ({
  IconResolver: ({ iconName }: { iconName: string }) => (
    <svg data-icon-name={iconName} />
  ),
}));

describe("AdminRouteSidebarMenu", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    pathnameMock = "/administration";
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function render(expanded = true): void {
    act(() => root.render(<AdminRouteSidebarMenu expanded={expanded} />));
  }

  it("preserves the same rows, icons, and open accordion across widths", () => {
    render();

    const rowsBefore = Array.from(
      host.querySelectorAll<HTMLElement>(".shell-nav-stable"),
    );
    const iconsBefore = Array.from(
      host.querySelectorAll<SVGElement>(".shell-nav-icon > svg"),
    );
    const aiDetails = Array.from(
      host.querySelectorAll<HTMLDetailsElement>(".shell-admin-domain"),
    ).find((details) => details.textContent?.includes("AI"));

    expect(rowsBefore.length).toBeGreaterThan(2);
    expect(iconsBefore).toHaveLength(rowsBefore.length);
    expect(aiDetails).toBeDefined();
    expect(
      Array.from(host.querySelectorAll(".shell-admin-domain-trigger")).every(
        (summary) => summary.querySelector(".shell-nav-icon > svg"),
      ),
    ).toBe(true);

    act(() => aiDetails?.querySelector("summary")?.click());
    expect(aiDetails?.open).toBe(true);

    render(false);

    const rowsAfter = Array.from(
      host.querySelectorAll<HTMLElement>(".shell-nav-stable"),
    );
    const iconsAfter = Array.from(
      host.querySelectorAll<SVGElement>(".shell-nav-icon > svg"),
    );

    expect(rowsAfter).toHaveLength(rowsBefore.length);
    expect(iconsAfter).toHaveLength(iconsBefore.length);
    expect(rowsAfter.every((row, index) => row === rowsBefore[index])).toBe(true);
    expect(iconsAfter.every((icon, index) => icon === iconsBefore[index])).toBe(true);
    expect(aiDetails?.open).toBe(true);
  });

  it("links every registry destination exactly once", () => {
    render();
    const hrefs = Array.from(host.querySelectorAll("a[href]")).map(
      (anchor) => anchor.getAttribute("href") ?? "",
    );
    const missing = getAdminNavigationLocations()
      .map(({ destination }) => destination.link)
      .filter((link) => !hrefs.includes(link));

    expect(missing).toEqual([]);
    expect(hrefs.filter((href, index) => hrefs.indexOf(href) !== index)).toEqual([]);
  });

  it("renders only one active transition pill for a destination", () => {
    pathnameMock =
      getAdminNavigationLocations()[0]?.destination.link ?? "/administration";
    render();
    expect(host.querySelectorAll(".shell-active-pill")).toHaveLength(1);
  });
});
