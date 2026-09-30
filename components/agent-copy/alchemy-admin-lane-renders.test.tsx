/**
 * THE APP-WIDE ALCHEMY HOST DOES NOT RE-RENDER ON EVERY NAVIGATION (lane DRILL-ADOPT,
 * VERIFY-DRILL-WAVE2 W2-6).
 *
 * The host needs to know when the admin section is entered or left (the organization Alchemy works in
 * flips between the platform tenant and the selected workspace). It used to call `usePathname()`
 * itself, so every navigation anywhere re-rendered the host that wraps the whole app. Now one leaf
 * (`AdminLaneWatcher`) follows the address and the host reads the lane through
 * `useAdminLaneOrganizationId`, which answers again only when the lane flips.
 *
 * The data: an admin moves between three admin pages, then to a user page and back.
 * Measured: renders of a host shaped like the old one (usePathname) vs the new one (the lane hook).
 * Break it names: the host reading the pathname again, or the watcher notifying on every navigation → red.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// Next's router re-renders exactly the components that read the pathname; this stand-in does the same
// (a navigation re-renders the subscribers of the address, and nothing else).
const address = { path: "/administration/usage", listeners: new Set<() => void>() };
jest.mock("next/navigation", () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import("react")>("react");
  return {
    usePathname: () =>
      useSyncExternalStore(
        (l: () => void) => {
          address.listeners.add(l);
          return () => address.listeners.delete(l);
        },
        () => address.path,
      ),
  };
});

import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { usePathname } from "next/navigation";

import { AdminLaneWatcher, onAdminLaneChange, useAdminLaneOrganizationId } from "./alchemy-organization";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const renders = { old: 0, current: 0 };
const seen: Array<string | null> = [];

function OldHost() {
  usePathname();
  renders.old += 1;
  return null;
}

function CurrentHost() {
  const lane = useAdminLaneOrganizationId();
  renders.current += 1;
  seen.push(lane);
  return null;
}

function App() {
  return (
    <>
      <OldHost />
      <CurrentHost />
      <AdminLaneWatcher />
    </>
  );
}

describe("the Alchemy host and the admin lane", () => {
  let host: HTMLDivElement;
  let root: Root;
  const navigate = (path: string) => {
    act(() => {
      window.history.pushState({}, "", path);
      address.path = path;
      for (const l of [...address.listeners]) l();
    });
  };

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    renders.old = 0;
    renders.current = 0;
    seen.length = 0;
    window.history.pushState({}, "", "/administration/usage");
    address.path = "/administration/usage";
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    window.history.pushState({}, "", "/");
  });

  it("re-renders the host only when the admin lane flips, never per navigation", () => {
    act(() => root.render(<App />));
    const start = { ...renders };

    // three navigations inside the admin section, then out, then back in
    const pages = ["/administration/knowledge/kg-cost", "/administration/automation/workflow-runs", "/administration/users", "/notes", "/administration/usage"];
    for (const page of pages) navigate(page);

    // MEASURED: a host reading the pathname renders once per navigation (5); the lane hook renders
    // only on the two flips (admin → /notes → admin).
    expect(renders.old - start.old).toBe(pages.length);
    expect(renders.current - start.current).toBe(2);
    expect(seen).toEqual([SYSTEM_ORGANIZATION_ID, null, SYSTEM_ORGANIZATION_ID]);
  });

  it("the watcher tells listeners only when the lane flips", () => {
    act(() => root.render(<AdminLaneWatcher />));
    const heard = jest.fn();
    const off = onAdminLaneChange(heard);
    navigate("/administration/knowledge/kg-cost");
    navigate("/administration/users");
    expect(heard).not.toHaveBeenCalled();
    navigate("/notes");
    expect(heard).toHaveBeenCalledTimes(1);
    off();
  });
});
