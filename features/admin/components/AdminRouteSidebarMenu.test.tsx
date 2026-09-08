/** @jest-environment jsdom */

import { act, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import AdminRouteSidebarMenu from "./AdminRouteSidebarMenu";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({
  usePathname: () => "/administration",
}));

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

describe("AdminRouteSidebarMenu collapse stability", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("preserves the same rows, icons, and open accordion across widths", () => {
    act(() => root.render(<AdminRouteSidebarMenu expanded />));

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
      Array.from(
        host.querySelectorAll(".shell-admin-domain-trigger"),
      ).every((summary) => summary.querySelector(".shell-nav-icon > svg")),
    ).toBe(true);

    act(() => aiDetails?.querySelector("summary")?.click());
    expect(aiDetails?.open).toBe(true);

    act(() => root.render(<AdminRouteSidebarMenu expanded={false} />));

    const rowsAfter = Array.from(
      host.querySelectorAll<HTMLElement>(".shell-nav-stable"),
    );
    const iconsAfter = Array.from(
      host.querySelectorAll<SVGElement>(".shell-nav-icon > svg"),
    );

    expect(rowsAfter).toHaveLength(rowsBefore.length);
    expect(iconsAfter).toHaveLength(iconsBefore.length);
    expect(rowsAfter.every((row, index) => row === rowsBefore[index])).toBe(
      true,
    );
    expect(iconsAfter.every((icon, index) => icon === iconsBefore[index])).toBe(
      true,
    );
    expect(aiDetails?.open).toBe(true);
  });
});
