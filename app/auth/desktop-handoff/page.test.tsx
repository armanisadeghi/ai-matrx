import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
jest.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}));

import DesktopHandoffPage, { scrubDesktopHandoffUrl } from "./page";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState({}, "", "/auth/desktop-handoff?access_token=secret-access&refresh_token=secret-refresh&redirect=https://attacker.example");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("DesktopHandoffPage", () => {
  it("scrubs a token-bearing URL without rendering credentials or following its redirect", async () => {
    await act(async () => { root.render(<DesktopHandoffPage />); });

    expect(window.location.pathname).toBe("/auth/desktop-handoff");
    expect(window.location.search).toBe("");
    expect(container.textContent).not.toContain("secret-access");
    expect(container.textContent).not.toContain("secret-refresh");
    expect(container.textContent).toContain("sign in with your normal browser session");
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "/login?redirectTo=%2Fdemos%2Flocal-tools",
    );
  });

  it("does not redirect when there is no query string to scrub", () => {
    window.history.replaceState({}, "", "/auth/desktop-handoff");
    scrubDesktopHandoffUrl();
    expect(window.location.pathname).toBe("/auth/desktop-handoff");
  });
});
