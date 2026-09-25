/**
 * The page-capture registry (lane ALCHEMY-BUTTON): a page registers once, a
 * descendant adds its sections, the capture is read LIVE at click time with the
 * route, the address and the last requests from the one request ledger (failing
 * first, with the server's sentence), and the admin
 * debug context receives the same entries.
 */
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";

const publish = jest.fn();
jest.mock("next/navigation", () => ({ usePathname: () => "/administration/scopes-context/context-inspector" }));
jest.mock("@/hooks/useDebugContext", () => ({
  useDebugContext: () => ({ publish, publishKey: jest.fn(), isActive: true }),
}));
// The one request ledger the fetch tap feeds (no Redux store: `apiConfig.recentCalls` was never written).
import { clearRequestLedger, ledgerBegin, ledgerResponse, ledgerResponseBody } from "@/lib/diagnostics/stream-capture/request-ledger";
function seed(method: string, url: string, httpStatus: number, body: string | null, responseBody = "") {
  const id = ledgerBegin({ url, method, bodyText: body })!;
  ledgerResponse(id, { httpStatus, requestId: `rid-${httpStatus}` });
  if (responseBody) ledgerResponseBody(id, responseBody);
}

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
    clearRequestLedger();
    seed("POST", "https://server.app.matrxserver.com/ai/context/preview", 200, JSON.stringify({ organization_id: "o1", api_key: "sk-live" }));
    seed(
      "PATCH",
      "https://db.matrxserver.com/rest/v1/contacts?id=eq.7",
      403,
      JSON.stringify({ phone: "+1 555 0100" }),
      JSON.stringify({ code: "42501", message: 'new row violates row-level security policy for table "contacts"', hint: null }),
    );
    seed("GET", "https://db.matrxserver.com/rest/v1/contacts?select=*", 200, null);
    const el = document.createElement("div");
    const root = createRoot(el);
    act(() => root.render(<Page />));
    let c = getActivePageCapture()!;
    expect(c.title).toBe("Context inspector");
    expect(c.selection.Organization).toEqual({ id: "o1", name: "AI Matrx" });
    expect(c.sections.map((s) => s.id)).toEqual(["compare"]);
    expect(c.url).toContain("http");
    // Failing first (with the server's refusal sentence), then newest first; the compare call is there.
    expect(c.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "PATCH /rest/v1/contacts?id=eq.7",
      "GET /rest/v1/contacts?select=*",
      "POST /ai/context/preview",
    ]);
    expect(c.requests[0]).toMatchObject({
      status: "error",
      httpStatus: 403,
      client: "supabase-rest",
      errorSentence: 'new row violates row-level security policy for table "contacts"',
      requestBody: { phone: "+1 555 0100" },
    });
    expect(c.requests[2]).toMatchObject({ client: "aidream", httpStatus: 200, requestBody: { organization_id: "o1", api_key: "[redacted]" } });
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
