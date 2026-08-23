/**
 * The chip's door must actually open.
 *
 * Until 2026-08-23 the D-14 notification navigated to
 * `/?cloudBrowserHandoff={id}` and NOTHING in this repo read that parameter:
 * the tap landed on the marketing home page while a 30-minute window burned.
 * These pin the landing.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CLOUD_BROWSER_HANDOFF_PARAM } from "../constants";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const nav = {
  search: new URLSearchParams(),
  pathname: "/chat",
  replaced: [] as string[],
};
const dispatched: unknown[] = [];
const opened: unknown[] = [];
const adopted: unknown[] = [];
let hydratedRun: { id: string; profileId: string } | null = null;

jest.mock("next/navigation", () => ({
  useSearchParams: () => nav.search,
  usePathname: () => nav.pathname,
  useRouter: () => ({
    replace: (href: string) => nav.replaced.push(href),
  }),
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => (action: unknown) => {
    dispatched.push(action);
    return { unwrap: async () => undefined };
  },
  useAppStore: () => ({ getState: () => ({}) }),
}));

jest.mock("../redux/selectors", () => ({
  selectRun: () => hydratedRun,
}));

jest.mock("../redux/adoptRunFromStream", () => ({
  adoptCloudBrowserRunFromStream: (signal: unknown) => {
    adopted.push(signal);
    return { type: "cloudBrowser/adoptRunFromStream", payload: signal };
  },
}));

jest.mock("../hooks/useOpenCloudBrowserCanvas", () => ({
  useOpenCloudBrowserCanvas: () => (opts: unknown) => opened.push(opts),
}));

import { CloudBrowserHandoffDeepLink } from "./CloudBrowserHandoffDeepLink";

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(<CloudBrowserHandoffDeepLink />);
  });
  // Let the effect's async body settle.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return {
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

beforeEach(() => {
  nav.search = new URLSearchParams();
  nav.pathname = "/chat";
  nav.replaced = [];
  dispatched.length = 0;
  opened.length = 0;
  adopted.length = 0;
  hydratedRun = { id: "run_1", profileId: "prof_1" };
});

it("does nothing at all when the parameter is absent", async () => {
  const view = await mount();
  expect(adopted).toEqual([]);
  expect(opened).toEqual([]);
  await view.unmount();
});

it("hydrates the named handoff and opens the canvas on it", async () => {
  nav.search = new URLSearchParams({ [CLOUD_BROWSER_HANDOFF_PARAM]: "hoff_1" });

  const view = await mount();

  expect(adopted).toEqual([{ runId: null, handoffId: "hoff_1" }]);
  expect(opened).toEqual([
    { initialProfileId: "prof_1", runId: "run_1", conversationId: undefined },
  ]);
  await view.unmount();
});

it("carries the conversation from the path so takeover can steer the agent", async () => {
  nav.pathname = "/chat/conv_9";
  nav.search = new URLSearchParams({ [CLOUD_BROWSER_HANDOFF_PARAM]: "hoff_1" });

  const view = await mount();

  expect(opened).toEqual([
    { initialProfileId: "prof_1", runId: "run_1", conversationId: "conv_9" },
  ]);
  await view.unmount();
});

it("consumes the parameter so a refresh does not re-open the canvas", async () => {
  nav.search = new URLSearchParams({
    [CLOUD_BROWSER_HANDOFF_PARAM]: "hoff_1",
    tab: "audit",
  });

  const view = await mount();

  expect(nav.replaced).toEqual(["/chat?tab=audit"]);
  await view.unmount();
});

it("still opens the canvas when the handoff cannot be hydrated", async () => {
  hydratedRun = null;
  nav.search = new URLSearchParams({ [CLOUD_BROWSER_HANDOFF_PARAM]: "hoff_1" });

  const view = await mount();

  expect(opened).toEqual([
    { initialProfileId: undefined, runId: undefined, conversationId: undefined },
  ]);
  await view.unmount();
});
