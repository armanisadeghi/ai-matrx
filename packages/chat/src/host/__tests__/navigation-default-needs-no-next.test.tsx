/**
 * The navigation seam with no Next host (slice P10): outside any <ChatProvider>
 * and with no configured host, package components route through the default
 * port — the path and query from `window.location`, links as plain anchors
 * (Next's routing hints dropped), push as a full page load.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { _resetChatHostForTests } from "../configure";
import { Link, usePathname, useRouter, useSearchParams } from "../navigation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

function Probe() {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const methods = ["push", "replace", "back", "forward", "refresh", "prefetch"] as const;
  return (
    <Link
      href="/notes/1"
      prefetch={false}
      className="door"
      data-router={methods.filter((m) => typeof router[m] === "function").join(",")}
    >
      {pathname}?{params.get("tab")}
    </Link>
  );
}

beforeEach(() => {
  _resetChatHostForTests();
  window.history.pushState({}, "", "/chat/abc?tab=files");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("reads the URL from window.location and renders a plain anchor", () => {
  act(() => root.render(<Probe />));
  const anchor = container.querySelector("a.door");
  expect(anchor?.getAttribute("href")).toBe("/notes/1");
  expect(anchor?.hasAttribute("prefetch")).toBe(false);
  expect(anchor?.textContent).toBe("/chat/abc?files");
});

it("follows back/forward (popstate)", () => {
  act(() => root.render(<Probe />));
  act(() => {
    window.history.pushState({}, "", "/chat/next?tab=notes");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(container.querySelector("a.door")?.textContent).toBe("/chat/next?notes");
});

it("gives a router with the app router's shape", () => {
  act(() => root.render(<Probe />));
  expect(container.querySelector("a.door")?.getAttribute("data-router")).toBe(
    "push,replace,back,forward,refresh,prefetch",
  );
});
