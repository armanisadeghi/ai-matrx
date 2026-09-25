/**
 * LANE URL-STATE (2026-09-24) — a query write never navigates, and Next's
 * `useSearchParams` always agrees with the address bar afterwards.
 *
 * One case per caller SHAPE the lane moved onto lib/url-state/addressWithoutNavigating:
 *
 *   A. `router.replace(\`${pathname}?…\`)`     — useSurfacesAdminSelection (and /data-v2's ?view=)
 *   B. `router.push(\`${pathname}?…\`)`        — useSourceFilters
 *   C. `history.*State(window.history.state…)` — files' navigateFilesFolderPath (chat, code
 *      workspace, org manage had the same bytes)
 *   D. `@ai-matrx/kit/url-state` commitUrlParams — the kit writes history.state too; the
 *      UrlStateDoor injects the door
 *   E. a literal own-route path (`/tasks?task=…`) — replaceAddressOrNavigate
 *
 * Next is modelled faithfully (./nextHistoryModel): its history patch skips any state carrying
 * `__NA`, and `useSearchParams` moves only through that patch. Every router call is a navigation
 * (a `?_rsc=` server round trip in the real app).
 *
 * RED on the previous bytes (run 2026-09-24, callers restored from HEAD): A and B each recorded
 * one navigation and the model's search params never changed; C left useSearchParams on the old
 * folder while the bar moved; D the same for the kit. E's helper did not exist.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () =>
  jest.requireActual("./nextHistoryModel").nextNavigationModel,
);

import {
  installNextHistoryModel,
  navigations,
  recordingRouter,
  routerPathname,
  routerSearch,
  uninstallNextHistoryModel,
} from "./nextHistoryModel";
import { useSurfacesAdminSelection } from "@/features/surfaces/admin/useSurfacesAdminSelection";
import { useSourceFilters } from "@/features/research/hooks/useSourceFilters";
import { navigateFilesFolderPath } from "@/features/files/utils/url-state";
import { commitUrlParams, setUrlStateRouter } from "@ai-matrx/kit/url-state";
import { replaceAddressOrNavigate } from "@/lib/url-state/addressWithoutNavigating";

function renderHook<T>(hook: () => T): { current: () => T; root: Root; el: HTMLElement } {
  let value: T;
  function Probe() {
    value = hook();
    return null;
  }
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(<Probe />));
  return { current: () => value, root, el };
}

afterEach(() => {
  uninstallNextHistoryModel();
  setUrlStateRouter(null);
  document.body.innerHTML = "";
});

describe("a query write never navigates, and useSearchParams follows it", () => {
  it("A — router.replace to the same pathname: selecting a surface", () => {
    installNextHistoryModel("/agents/agt_research/surfaces?binding=bnd_old");
    const hook = renderHook(() => useSurfacesAdminSelection());

    act(() => hook.current().selectSurface("chat-composer"));

    expect(navigations).toEqual([]);
    expect(routerPathname()).toBe("/agents/agt_research/surfaces");
    expect(routerSearch().get("surface")).toBe("chat-composer");
    expect(routerSearch().has("binding")).toBe(false);
    expect(hook.current().surfaceName).toBe("chat-composer");
    expect(window.location.search).toBe("?surface=chat-composer");
    act(() => hook.root.unmount());
  });

  it("B — router.push to the same pathname: filtering a topic's sources, and Back undoes it", () => {
    installNextHistoryModel("/research/topics/tp_ev_batteries/sources");
    const lengthBefore = window.history.length;
    const hook = renderHook(() => useSourceFilters());

    act(() => hook.current().setFilters({ hostname: "energy.gov" }));

    expect(navigations).toEqual([]);
    expect(routerSearch().get("hostname")).toBe("energy.gov");
    expect(hook.current().filters.hostname).toBe("energy.gov");
    expect(window.history.length).toBe(lengthBefore + 1); // a push, not a replace
    act(() => hook.root.unmount());
  });

  it("C — a history write that used to carry window.history.state: opening a folder on /files/all", () => {
    installNextHistoryModel("/files/all/Contracts?view=list");

    navigateFilesFolderPath("Contracts/2026 Renewals", recordingRouter);

    expect(navigations).toEqual([]);
    expect(window.location.pathname).toBe("/files/all/Contracts/2026%20Renewals");
    // Next's hooks agree with the bar — the `__NA` state used to leave them on /Contracts.
    expect(routerPathname()).toBe("/files/all/Contracts/2026%20Renewals");
    expect(routerSearch().get("view")).toBe("list");
  });

  it("D — @ai-matrx/kit commitUrlParams goes through the door once UrlStateDoor is mounted", async () => {
    installNextHistoryModel("/exports?kind=pdf");
    await import("@/lib/url-state/UrlStateDoor").then((m) => m.installUrlStateDoor());

    commitUrlParams({ kind: "docx", page: "2" }, "push");

    expect(navigations).toEqual([]);
    expect(routerSearch().get("kind")).toBe("docx");
    expect(routerSearch().get("page")).toBe("2");
  });

  it("E — a literal own-route path is query state on that page and a navigation anywhere else", () => {
    installNextHistoryModel("/tasks?project=prj_launch");
    replaceAddressOrNavigate(recordingRouter, "/tasks?project=prj_launch&task=tsk_pricing_page");
    expect(navigations).toEqual([]);
    expect(routerSearch().get("task")).toBe("tsk_pricing_page");

    installNextHistoryModel("/dashboard");
    replaceAddressOrNavigate(recordingRouter, "/tasks?task=tsk_pricing_page", { scroll: false });
    expect(navigations).toEqual(["replace /tasks?task=tsk_pricing_page"]);
    expect(routerPathname()).toBe("/dashboard");
  });
});
