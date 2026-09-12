/**
 * Regression coverage for the two operator actions in SEO Operations.
 *
 * Production break caught here: the console used the user-owned scheduler
 * route, and the Evidence Workbench click stopped at a local error rather than
 * launching the already-durable server command.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const runSystemTaskNow = jest.fn();
const launch = jest.fn();
const useSeoCommandRun = jest.fn();
const fetchSeoTasks = jest.fn();
const fetchSeoSites = jest.fn();
const fetchEvidenceValues = jest.fn();

jest.mock("@/features/scheduling/service/schedulerClient", () => ({
  runSystemTaskNow: (...args: unknown[]) => runSystemTaskNow(...args),
}));

jest.mock("@/features/marketing/seo/durable-run/useSeoCommandRun", () => ({
  useSeoCommandRun: (options: unknown) => useSeoCommandRun(options),
}));

jest.mock("./service", () => ({
  fetchSeoTasks: (...args: unknown[]) => fetchSeoTasks(...args),
  fetchSeoSites: (...args: unknown[]) => fetchSeoSites(...args),
  fetchEvidenceValues: (...args: unknown[]) => fetchEvidenceValues(...args),
  fetchSeoMandates: jest.fn(),
  fetchSeoProvisions: jest.fn(),
}));

jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  NonEditableContextMenu: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/features/scheduling/components/shared/scheduling-menu-sections", () => ({
  useScheduledTaskMenuSection: () => ({
    resolveContextOnOpen: jest.fn(),
    getApplicationScope: jest.fn(),
    sections: [],
  }),
}));
jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: ({ data, columns }: { data: unknown[]; columns: Array<{ cell?: (row: unknown) => React.ReactNode }> }) => (
    <div>{data.map((row) => <div key={(row as { id: string }).id}>{columns.at(-1)?.cell?.(row)}</div>)}</div>
  ),
}));
jest.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode }) => <select value={value} onChange={(event) => onValueChange(event.target.value)}>{children}</select>,
  SelectContent: ({ children }: { children: React.ReactNode }) => children,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => children,
  SelectValue: () => <option value="">Pick a site</option>,
}));
jest.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: () => void }) => <input type="checkbox" checked={checked} onChange={onCheckedChange} />,
}));
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));
jest.mock("@/components/MarkdownStream", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

import { AutomationsPanel, WorkbenchPanel } from "./SeoOperationsClient";

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  jest.clearAllMocks();
  useSeoCommandRun.mockReturnValue({
    running: false,
    result: null,
    error: null,
    stage: null,
    waitMessage: null,
    retry: null,
    launch: (...args: unknown[]) => launch(...args),
  });
  fetchSeoTasks.mockResolvedValue([{ id: "a7c1e2d3-0000-4e5f-9a00-000000000438", title: "SEO — engine schedule dispatcher", enabled: true, kind: "tool", last_run_at: null, next_due_at: null }]);
  fetchSeoSites.mockResolvedValue([{ id: "site-allgreen", domain: "allgreenrecycling.com" }]);
  fetchEvidenceValues.mockResolvedValue([
    { name: "gsc_summary", kind: "object", lazy: false, description: "Search Console summary" },
    { name: "pages_summary", kind: "object", lazy: false, description: "Page inventory summary" },
    { name: "findings_open", kind: "object", lazy: false, description: "Open audit findings" },
  ]);
  runSystemTaskNow.mockResolvedValue({ run_id: "run-12345678" });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("queues an SEO system automation through the admin scheduler path", async () => {
  await act(async () => {
    root.render(<AutomationsPanel />);
    await Promise.resolve();
  });

  await act(async () => {
    (Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Run now") as HTMLButtonElement).click();
    await Promise.resolve();
  });

  expect(runSystemTaskNow).toHaveBeenCalledWith("a7c1e2d3-0000-4e5f-9a00-000000000438");
});

it("launches the durable workbench command with the selected evidence", async () => {
  await act(async () => {
    root.render(<WorkbenchPanel />);
    await Promise.resolve();
    await Promise.resolve();
  });

  await act(async () => {
    const select = container.querySelector("select") as HTMLSelectElement;
    const selectValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    )?.set;
    if (!selectValueSetter) throw new Error("Select value setter is unavailable");
    selectValueSetter.call(select, "site-allgreen");
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    const textareaValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    if (!textareaValueSetter) throw new Error("Textarea value setter is unavailable");
    textareaValueSetter.call(textarea, "Where does this site's organic traffic come from?");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await act(async () => {
    (Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Run the workbench") as HTMLButtonElement).click();
  });

  expect(launch).toHaveBeenCalledWith(
    {
      site_id: "site-allgreen",
      question: "Where does this site's organic traffic come from?",
      values: ["gsc_summary", "pages_summary", "findings_open"],
    },
    "allgreenrecycling.com",
  );
  expect(useSeoCommandRun).toHaveBeenCalledWith(
    expect.objectContaining({
      key: "evidence-workbench",
      path: "/seo/evidence-workbench",
      finalKind: "seo.workbench_completed",
      live: { label: "SEO Evidence Workbench" },
    }),
  );
});

it("shows the completed answer above the exact evidence sections", async () => {
  useSeoCommandRun.mockReturnValue({
    running: false,
    error: null,
    stage: null,
    waitMessage: null,
    retry: null,
    launch,
    result: {
      question: "Where does this site's organic traffic come from?",
      values_used: ["gsc_summary", "pages_summary"],
      evidence_sizes: { gsc_summary: 4, pages_summary: 12 },
      evidence: { gsc_summary: "Top channel: organic search\nBranded clicks: 82%" },
      answer: "Organic traffic is led by branded Google searches.",
      model_id: "model-1",
      agent_id: "agent-1",
      usage: { input_tokens: 42 },
    },
  });

  await act(async () => {
    root.render(<WorkbenchPanel />);
    await Promise.resolve();
  });

  const text = container.textContent ?? "";
  expect(text).toContain("Organic traffic is led by branded Google searches.");
  expect(text.indexOf("Answer")).toBeLessThan(text.indexOf("Values used"));
  expect(text).toContain("Evidence sizes");
  expect(text).toContain("Evidence");
  expect(text).toContain("Top channel: organic search\nBranded clicks: 82%");
  expect(text.indexOf("Organic traffic is led by branded Google searches.")).toBeLessThan(
    text.indexOf("Top channel: organic search"),
  );
});
