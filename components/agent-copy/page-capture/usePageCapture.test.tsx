/**
 * The page-capture registry (lane ALCHEMY-BUTTON): a page registers once, a
 * descendant adds its sections, the capture is read LIVE at click time with the
 * route, the address and the requests made since the page opened, and the admin
 * debug context receives the same entries.
 */
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";

const publish = jest.fn();
jest.mock("next/navigation", () => ({ usePathname: () => "/administration/scopes-context/context-inspector" }));
jest.mock("@/hooks/useDebugContext", () => ({
  useDebugContext: () => ({ publish, publishKey: jest.fn(), isActive: true }),
}));
const calls = [
  { id: "1", method: "POST", path: "/ai/context/preview", baseUrl: "", status: "success", httpStatus: 200, durationMs: 812, requestId: "r-new", timestamp: Date.now() + 60_000 },
  { id: "0", method: "GET", path: "/before-the-page", baseUrl: "", status: "success", timestamp: 0 },
];
jest.mock("@/lib/redux/hooks", () => ({
  useAppStore: () => ({ getState: () => ({ apiConfig: { recentCalls: calls } }) }),
}));

import { usePageCapture, usePageCaptureContribution, getActivePageCapture } from "./usePageCapture";
import { adminPageCapture } from "./pageCapture";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let setPick: (v: string) => void = () => {};
function Child({ answer }: { answer: string }) {
  usePageCaptureContribution("compare", () => [{ id: "compare", title: "Compare", role: "data", value: answer }], answer);
  return null;
}
function Page() {
  const [pick, set] = useState("AI Matrx");
  setPick = set;
  usePageCapture(() =>
    adminPageCapture({ title: "Context inspector", route: "", selection: { Organization: { id: "o1", name: pick } }, sections: [] }),
  );
  return <Child answer={`answer for ${pick}`} />;
}

describe("usePageCapture", () => {
  it("registers, merges the descendant, reads live, and publishes to the debug context", () => {
    expect(getActivePageCapture()).toBeNull();
    const el = document.createElement("div");
    const root = createRoot(el);
    act(() => root.render(<Page />));
    let c = getActivePageCapture()!;
    expect(c.title).toBe("Context inspector");
    expect(c.selection.Organization).toEqual({ id: "o1", name: "AI Matrx" });
    expect(c.sections.map((s) => s.id)).toEqual(["compare"]);
    expect(c.url).toContain("http");
    // Only the requests made since the page opened.
    expect(c.requests.map((r) => r.path)).toEqual(["/ai/context/preview"]);
    expect(c.requests[0]).toMatchObject({ durationMs: 812, requestId: "r-new", httpStatus: 200 });
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ Page: "Context inspector", Organization: "AI Matrx (o1)" }));

    act(() => setPick("Titanium"));
    c = getActivePageCapture()!;
    expect(c.selection.Organization).toEqual({ id: "o1", name: "Titanium" });
    expect(c.sections[0].value).toBe("answer for Titanium");
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ Organization: "Titanium (o1)", Compare: "answer for Titanium" }));

    act(() => root.unmount());
    expect(getActivePageCapture()).toBeNull();
  });
});
