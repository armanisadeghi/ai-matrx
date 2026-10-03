/**
 * A ROUTE MENU THAT FAILS TO LOAD NEVER STRANDS THE DRAWER. The phone drawer
 * opens a Large Route on its own menu and shows a skeleton while the menu's
 * chunk loads. A chunk that failed (deploy skew, a dropped connection) left
 * the skeleton forever, with the switch disabled — no way back to the main
 * menu, and nothing said. Now: the failure is captured, the drawer shows the
 * main menu, the switch works, and the area's view says the menu didn't load
 * with a Retry.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const captureError = jest.fn();
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: (input: unknown) => captureError(input),
}));
jest.mock("next/navigation", () => ({ usePathname: () => "/chat/abc" }));

const importFn = jest.fn();
jest.mock("@/features/shell/constants/route-menu-registry", () => ({
  routeMenuDefaultView: (entry: { defaultView?: string } | null) =>
    entry ? (entry.defaultView ?? "route") : "main",
  routeMenuRegistry: [
    {
      pathPattern: /^\/chat(?:\/|$)/,
      iconName: "MessageSquare",
      label: "Chat",
      importFn: () => importFn(),
    },
  ],
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Slot = (require("./MobileRouteMenuSlot") as typeof import("./MobileRouteMenuSlot")).default;

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

it("falls back to the main menu, keeps the switch usable, and says what happened", async () => {
  importFn.mockImplementationOnce(() => Promise.reject(new Error("Loading chunk 123 failed")));
  importFn.mockImplementationOnce(() =>
    Promise.resolve({ default: () => <div data-testid="chat-menu">Chat menu</div> }),
  );

  const sheet = document.createElement("div");
  sheet.className = "shell-mobile-sheet";
  const nav = document.createElement("div");
  nav.className = "shell-mobile-route-nav";
  sheet.appendChild(nav);
  const host = document.createElement("div");
  sheet.appendChild(host);
  document.body.appendChild(sheet);
  const root = createRoot(host);
  act(() => root.render(<Slot />));
  await flush();
  await flush();

  expect(captureError).toHaveBeenCalledTimes(1);
  expect(captureError.mock.calls[0][0]).toMatchObject({ source: "shell-navigation" });
  expect(sheet.dataset.sidebarView).toBe("main");
  const switchButton = host.querySelector<HTMLButtonElement>(".shell-mobile-switch")!;
  expect(switchButton.dataset.visible).toBe("true");
  expect(switchButton.disabled).toBe(false);
  expect(nav.querySelector(".animate-pulse")).toBeNull();

  act(() => switchButton.click());
  expect(sheet.dataset.sidebarView).toBe("route");
  expect(nav.textContent).toContain("didn't load");

  const retry = Array.from(nav.querySelectorAll("button")).find((b) => b.textContent === "Retry")!;
  act(() => retry.click());
  await flush();
  await flush();
  expect(nav.querySelector('[data-testid="chat-menu"]')).not.toBeNull();
  expect(nav.textContent).not.toContain("didn't load");

  act(() => root.unmount());
  sheet.remove();
});
