/** @jest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SelectedFormResponsesReview } from "./SelectedFormResponsesReview";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockPick = jest.fn();
const mockPreview = jest.fn();
const mockOpen = jest.fn();
const mockClose = jest.fn();
jest.mock("./formPicker", () => ({ pickGoogleFormForConnection: (...args: unknown[]) => mockPick(...args) }));
jest.mock("./service", () => ({ previewSelectedFormResponses: (...args: unknown[]) => mockPreview(...args) }));
jest.mock("@/features/overlays/openers/saveToTable", () => ({ useOpenSaveToTable: () => mockOpen }));
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: async (organizationId: string) => organizationId }));

const first = {
  status: "next_page_available",
  respondent_data_present: true,
  provenance: { form_id: "form-1", form_title: "Survey", connection_id: "account-1", account_label: "person@example.com", organization_id: "org-1" },
  responses: [{ response_id: "r1", submitted_at: "2026-09-26T12:00:00Z", answers: [{ question_id: "q1", question_label: "Rating", values: ["Good"], file_upload_count: 0 }] }],
  next_page_token: "next",
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mockPick.mockReset(); mockPreview.mockReset(); mockOpen.mockReset(); mockClose.mockReset();
  mockOpen.mockReturnValue({ instanceId: "overlay-1", close: mockClose });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

async function render(connectionId = "account-1") {
  await act(async () => root.render(<SelectedFormResponsesReview key={connectionId} connectionId={connectionId} accountLabel="person@example.com" organizationId="org-1" />));
}
async function press(label: string) {
  const button = [...host.querySelectorAll("button")].find((node) => node.textContent?.includes(label));
  expect(button).toBeDefined();
  await act(async () => button?.click());
}

it("keeps the current Form on Picker cancel; preview and next page require separate clicks", async () => {
  mockPick.mockResolvedValueOnce({ id: "form-1", name: "Survey", connection_id: "account-1" }).mockResolvedValueOnce(null);
  mockPreview.mockResolvedValueOnce(first).mockResolvedValueOnce({ ...first, status: "ready", responses: [], next_page_token: null });
  await render();
  await press("Choose Form");
  expect(host.textContent).toContain("Survey");
  await press("Choose Form");
  expect(host.textContent).toContain("Survey");
  expect(mockPreview).not.toHaveBeenCalled();
  await press("Preview responses");
  expect(mockPreview).toHaveBeenCalledWith({ organization_id: "org-1", connection_id: "account-1", form_id: "form-1" });
  expect((host.querySelector("input[type=checkbox]") as HTMLInputElement).checked).toBe(false);
  expect(mockPreview).toHaveBeenCalledTimes(1);
  await press("Next page");
  expect(mockPreview).toHaveBeenLastCalledWith({ organization_id: "org-1", connection_id: "account-1", form_id: "form-1", page_token: "next" });
  expect(host.querySelector("input[type=checkbox]")).toBeNull();
});

it("saves only checked rows and shows the table door after the actual callback", async () => {
  mockPick.mockResolvedValue({ id: "form-1", name: "Survey", connection_id: "account-1" });
  mockPreview.mockResolvedValue(first);
  await render(); await press("Choose Form"); await press("Preview responses");
  expect([...host.querySelectorAll("button")].find((node) => node.textContent?.includes("Save selected"))?.hasAttribute("disabled")).toBe(true);
  await act(async () => { (host.querySelector("input[type=checkbox]") as HTMLInputElement).click(); });
  await press("Save selected rows");
  expect(mockOpen).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", grid: expect.objectContaining({ rows: [["Google Forms", "person@example.com", "account-1", "Survey", "form-1", "r1", "2026-09-26T12:00:00Z", "Good"]] }) }));
  expect(host.querySelector('a[href="/data/table-1"]')).toBeNull();
  await act(async () => mockOpen.mock.calls[0][0].onSaved({ type: "saved", tableId: "table-1", tableName: "Survey", how: "new" }));
  expect(host.querySelector('a[href="/data/table-1"]')).not.toBeNull();
});

it("drops a pending old-account result and closes its save overlay", async () => {
  let resolvePreview: (value: unknown) => void = () => undefined;
  mockPick.mockResolvedValue({ id: "form-1", name: "Survey", connection_id: "account-1" });
  mockPreview.mockImplementation(() => new Promise((resolve) => { resolvePreview = resolve; }));
  await render(); await press("Choose Form");
  await press("Preview responses");
  await render("account-2");
  await act(async () => resolvePreview(first));
  expect(host.textContent).not.toContain("r1");
  expect(host.textContent).not.toContain("Survey");
});

it("closes a save overlay on account change and ignores its late receipt", async () => {
  mockPick.mockResolvedValue({ id: "form-1", name: "Survey", connection_id: "account-1" });
  mockPreview.mockResolvedValue(first);
  await render(); await press("Choose Form"); await press("Preview responses");
  await act(async () => { (host.querySelector("input[type=checkbox]") as HTMLInputElement).click(); });
  await press("Save selected rows");
  const onSaved = mockOpen.mock.calls[0][0].onSaved;
  await render("account-2");
  expect(mockClose).toHaveBeenCalledTimes(1);
  await act(async () => onSaved({ type: "saved", tableId: "old-table", tableName: "Old", how: "new" }));
  expect(host.querySelector('a[href="/data/old-table"]')).toBeNull();
});

it("shows a retry control on failure and never treats it as a saved page", async () => {
  mockPick.mockResolvedValue({ id: "form-1", name: "Survey", connection_id: "account-1" });
  mockPreview.mockRejectedValue(new Error("Unable to reach Forms"));
  await render(); await press("Choose Form"); await press("Preview responses");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Unable to reach Forms");
  expect(host.querySelector("input[type=checkbox]")).toBeNull();
  await press("Retry");
  expect(mockPreview).toHaveBeenCalledTimes(2);
});

it("retries a failed Form choice instead of reading the previously selected Form", async () => {
  mockPick.mockResolvedValueOnce({ id: "form-1", name: "Survey", connection_id: "account-1" })
    .mockRejectedValueOnce(new Error("Picker unavailable"))
    .mockResolvedValueOnce({ id: "form-2", name: "Follow-up", connection_id: "account-1" });
  await render(); await press("Choose Form"); await press("Choose Form");
  expect(host.textContent).toContain("Survey");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Picker unavailable");
  await press("Retry");
  expect(mockPick).toHaveBeenCalledTimes(3);
  expect(mockPreview).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Follow-up");
});

it("opens the chosen Form at Google's fixed origin and explains preview versus saved rows", async () => {
  mockPick.mockResolvedValue({ id: "form-1", name: "Survey", connection_id: "account-1" });
  mockPreview.mockResolvedValue(first);
  await render(); await press("Choose Form");
  const link = [...host.querySelectorAll("a")].find((node) => node.textContent?.includes("Open in Google Forms"));
  expect(link?.getAttribute("href")).toBe("https://docs.google.com/forms/d/form-1/edit");
  expect(link?.getAttribute("target")).toBe("_blank");
  expect(link?.getAttribute("rel")).toContain("noreferrer");
  expect(host.textContent).toContain("Preview is temporary");
  expect(host.textContent).toContain("Only selected rows are saved to a table");
  expect(host.textContent).toContain("Preview does not send responses to an AI model");
  await press("Preview responses");
  expect(host.textContent).toContain("Respondent data present");
});

it("retries the failed response page with its original page token", async () => {
  mockPick.mockResolvedValue({ id: "form-1", name: "Survey", connection_id: "account-1" });
  mockPreview.mockResolvedValueOnce(first).mockRejectedValueOnce(new Error("Page unavailable")).mockResolvedValueOnce(first);
  await render(); await press("Choose Form"); await press("Preview responses"); await press("Next page");
  await press("Retry");
  expect(mockPreview).toHaveBeenCalledTimes(3);
  expect(mockPreview).toHaveBeenLastCalledWith({ organization_id: "org-1", connection_id: "account-1", form_id: "form-1", page_token: "next" });
});
