/** @jest-environment jsdom */
// The Generate button runs `seo_report save` through useToolAction; when the
// server refuses (today: chat.artifact row security), the button stays and the
// real reason shows in short layout text.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const run = jest.fn();
jest.mock("@ai-matrx/chat/action-requests/hooks/useToolAction", () => ({
  useToolAction: (tool: string) => {
    if (tool !== "seo_report") throw new Error(`unexpected tool ${tool}`);
    return { run, running: false, last: null, approvalDialog: null };
  },
}));

import { GenerateSeoReportButton } from "../GenerateSeoReportButton";
import { ROW_SECURITY_SHORT } from "../generate-outcome";
import type { SeoReportDraft } from "../types";

const draft: SeoReportDraft = {
  title: "Example search report — Sep 5 – Oct 2, 2026",
  markdown: "## Summary\n\nx\n\n## Findings\n\n- y\n",
  report_kind: "search-console",
  period: "2026-09-05..2026-10-02",
  site_id: "site-1",
};

let root: Root;
let host: HTMLDivElement;

function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
  });
}

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  run.mockReset();
});

function button(): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll("button")).find((b) => /Generate report/.test(b.textContent ?? ""));
  if (!found) throw new Error("the Generate report button is gone");
  return found as HTMLButtonElement;
}

it("sends the draft as a save through the screen-run door", async () => {
  run.mockResolvedValue({ status: "error", error: { error_type: "x", message: "Nope.", suggested_action: null } });
  mount(<GenerateSeoReportButton draft={draft} unavailableReason="unused" />);
  await act(async () => {
    button().click();
  });
  expect(run).toHaveBeenCalledWith({ action: "save", ...draft });
});

it("a row-security refusal keeps the button and shows the short reason", async () => {
  run.mockResolvedValue({
    status: "error",
    error: {
      error_type: "validation",
      message:
        'The report could not be saved: the database refused the write for this account (new row violates row-level security policy for table "artifact" [SQLSTATE 42501]). Nothing was saved.',
      suggested_action: "Save it from a conversation in the organization the report is for; or ask.",
    },
  });
  mount(<GenerateSeoReportButton draft={draft} unavailableReason="unused" />);
  await act(async () => {
    button().click();
  });
  const status = host.querySelector('[role="status"]');
  expect(status?.textContent).toContain(ROW_SECURITY_SHORT);
  expect(button().disabled).toBe(false);
});

it("with nothing to save the button is shown, disabled, and says why", () => {
  mount(<GenerateSeoReportButton draft={null} unavailableReason="No Search Console data for this site in the last 28 days." />);
  expect(button().disabled).toBe(true);
  expect(button().getAttribute("title")).toBe("No Search Console data for this site in the last 28 days.");
  expect(run).not.toHaveBeenCalled();
});

it("a saved report links to the viewer and names the version", async () => {
  run.mockResolvedValue({
    status: "ok",
    callId: "c",
    output: {
      __kind: "seo.tool_envelope",
      status: "ok",
      cost: { class: "free" },
      data: { report_id: "r1", version: 3, replaced_earlier_version: true, title: "t", link: "/artifacts/r1" },
    },
  });
  mount(<GenerateSeoReportButton draft={draft} unavailableReason="unused" />);
  await act(async () => {
    button().click();
  });
  const status = host.querySelector('[role="status"]');
  expect(status?.textContent).toContain("Saved as version 3");
  expect(status?.querySelector("a")?.getAttribute("href")).toBe("/artifacts/r1");
});
