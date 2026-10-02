/**
 * THE CAPTURE BUTTON BUILDS NOTHING IN RENDER (sec_8f1a9be1…, the final switch page froze 4.1 s).
 *
 * `PageCaptureButton` re-renders on every page-capture registry change (a contribution's signature
 * moves on every poll and progress line). It used to build and normalize the WHOLE capture in
 * render — every section's value walked into plain JSON — to read three things: the kind, the
 * title and which sections load at copy time. Now render reads only those; the capture is built
 * when a person uses the menu.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

jest.mock("next/navigation", () => ({ usePathname: () => "/administration/database/final-switch" }));
jest.mock("@/hooks/useDebugContext", () => ({
  useDebugContext: () => ({ publish: jest.fn(), publishKey: jest.fn(), isActive: false }),
}));
type MenuProps = { label: string; json: () => unknown };
let menu: MenuProps | null = null;
jest.mock("@/components/agent-copy/CopyButtons", () => ({
  CopyButtons: (props: MenuProps) => {
    menu = props;
    return null;
  },
}));

import { usePageCapture, usePageCaptureContribution } from "./usePageCapture";
import { PageCaptureButton } from "./PageCaptureButton";
import { adminPageCapture } from "./pageCapture";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let reads = 0;
/** A section value that counts every time something walks into it. */
function countedValue() {
  const value: Record<string, unknown> = {};
  Object.defineProperty(value, "organizations", {
    enumerable: true,
    get() {
      reads += 1;
      return [{ name: "Harbor Dental Group" }];
    },
  });
  return value;
}

function Rows({ tick }: { tick: number }) {
  usePageCaptureContribution(
    "final-switch",
    () => [
      { id: "orgs", title: "Every organization", role: "data", value: countedValue() },
      { id: "all", title: "All organizations", role: "data", value: "read at copy time", load: async () => [] },
    ],
    String(tick),
  );
  return null;
}
function Page({ tick }: { tick: number }) {
  usePageCapture(() => adminPageCapture({ title: "Final switch", route: "", sections: [] }));
  return (
    <>
      <Rows tick={tick} />
      <PageCaptureButton />
    </>
  );
}

it("renders the menu without walking any section value; using it builds the capture", () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  reads = 0;
  act(() => root.render(<Page tick={0} />));
  for (let tick = 1; tick <= 5; tick++) act(() => root.render(<Page tick={tick} />));
  expect(menu).not.toBeNull();
  expect(menu!.label).toBe("Final switch");
  expect(reads).toBe(0);
  menu!.json();
  expect(reads).toBeGreaterThan(0);
  act(() => root.unmount());
});
