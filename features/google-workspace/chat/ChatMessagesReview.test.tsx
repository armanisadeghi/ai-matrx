/** @jest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChatMessagesReview } from "./ChatMessagesReview";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const preview = jest.fn();
jest.mock("./service", () => ({
  ...jest.requireActual("./service"),
  previewChatMessages: (...args: unknown[]) => preview(...args),
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: async (organizationId: string) => organizationId,
}));

const connection = {
  id: "personal-connection", owner_type: "user", owner_user_id: "reviewer",
  health: "connected", scopes: [GOOGLE_SCOPE.chatMessagesReadonly],
  account_email: "reviewer@harborclinic.org",
} as GoogleConnectionSummary;
const result = {
  account_label: "reviewer@harborclinic.org", connection_id: connection.id,
  space_resource_name: "spaces/clinic-intake", start_time: "2026-10-01T09:00:00Z",
  end_time: "2026-10-01T10:00:00Z", page_size: 2, order_by: "createTime ASC",
  omitted_system_messages: true, continuation: "signed-next", messages: [{
    resource_name: "spaces/clinic-intake/messages/shift-handoff", content_state: "text_with_other_content",
    text: "Intake queue handed off",
  }],
};

describe("ChatMessagesReview", () => {
  let host: HTMLDivElement;
  let root: Root;
  const render = (account: GoogleConnectionSummary | null = connection, org = "org-clinic") =>
    act(() => root.render(<ChatMessagesReview key={`${account?.id}:${org}`} connection={account} actorId="reviewer" organizationId={org} />));
  const field = (label: string) => {
    const node = Array.from(host.querySelectorAll("label")).find((item) => item.textContent?.includes(label))?.querySelector("input,select");
    if (!(node instanceof HTMLInputElement || node instanceof HTMLSelectElement)) throw new Error(`Missing ${label}`);
    return node;
  };
  const change = (label: string, value: string) => act(() => {
    const node = field(label);
    const setter = Object.getOwnPropertyDescriptor(
      node instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype,
      "value",
    )?.set;
    setter?.call(node, value);
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const click = async (name: string) => {
    const button = Array.from(host.querySelectorAll("button")).find((item) => item.textContent === name);
    if (!button) throw new Error(`Missing ${name}`);
    await act(async () => { button.click(); await Promise.resolve(); });
  };
  const fill = () => {
    change("Space resource name", "spaces/clinic-intake");
    change("Page size", "2");
    change("Start time", "2026-10-01T09:00:00Z");
    change("End time", "2026-10-01T10:00:00Z");
    change("Order", "createTime ASC");
  };
  beforeEach(() => {
    preview.mockReset();
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); });

  it("waits for a deliberate read with all query fields", async () => {
    render();
    expect(preview).not.toHaveBeenCalled();
    fill();
    expect(preview).not.toHaveBeenCalled();
    preview.mockResolvedValue(result);
    await click("Read one page");
    expect(preview).toHaveBeenCalledWith({
      connection_id: connection.id, space_resource_name: result.space_resource_name,
      start_time: result.start_time, end_time: result.end_time,
      page_size: 2, order_by: "createTime ASC",
    }, "org-clinic");
    expect(host.textContent).toContain("Intake queue handed off");
    expect(host.textContent).toContain("Other content omitted.");
    expect(host.textContent).toContain("System messages and other content omitted");
  });

  it("uses exact continuation and exact failed request on retry", async () => {
    render(); fill(); preview.mockResolvedValueOnce(result).mockRejectedValueOnce(new Error("Page unavailable")).mockResolvedValueOnce({ ...result, continuation: null, messages: [] });
    await click("Read one page");
    await click("Next page");
    expect(host.textContent).toContain("Page unavailable");
    expect(host.textContent).not.toContain("Intake queue handed off");
    await click("Retry");
    expect(preview.mock.calls[1]).toEqual(preview.mock.calls[2]);
    expect(preview.mock.calls[2][0].continuation).toBe("signed-next");
    expect(host.textContent).toContain("No messages in this page.");
  });

  it("drops a pending answer after query and organization changes", async () => {
    let resolve!: (value: typeof result) => void;
    preview.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    render(); fill(); await click("Read one page");
    change("Space resource name", "spaces/other-room");
    render(connection, "org-other");
    await act(async () => resolve(result));
    expect(host.textContent).not.toContain("Intake queue handed off");
    expect(host.textContent).not.toContain("Next page");
  });

  it("drops a pending answer after the account changes", async () => {
    let resolve!: (value: typeof result) => void;
    preview.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    render(); fill(); await click("Read one page");
    render({ ...connection, id: "another-personal-connection" });
    await act(async () => resolve(result));
    expect(host.textContent).not.toContain("Intake queue handed off");
    expect(preview).toHaveBeenCalledTimes(1);
  });

  it("ignores a pending answer after unmount", async () => {
    let resolve!: (value: typeof result) => void;
    preview.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    render(); fill(); await click("Read one page");
    act(() => root.unmount());
    await act(async () => resolve(result));
    expect(host.textContent).toBe("");
    root = createRoot(host);
  });

  it("shows permission state without calling the preview", async () => {
    render({ ...connection, scopes: [] });
    expect(host.textContent).toContain("needs connected Google Chat message permission");
    expect(host.querySelector("input")).toBeNull();
    expect(preview).not.toHaveBeenCalled();
  });

  it("shows non-text content and errors without inventing a message body", async () => {
    render(); fill();
    preview.mockResolvedValueOnce({ ...result, continuation: null, messages: [{ resource_name: "spaces/clinic-intake/messages/photo", content_state: "other_content" }] })
      .mockRejectedValueOnce(new Error("Request failed"));
    await click("Read one page");
    expect(host.textContent).toContain("Other content omitted.");
    expect(host.textContent).not.toContain("Intake queue handed off");
    await click("Read one page");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Request failed");
    expect(host.textContent).not.toContain("No messages in this page.");
  });
});
