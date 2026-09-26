/**
 * @jest-environment jsdom
 */
/*
 * "Save Content" with no workspace chosen used to do nothing: the transport
 * threw OrganizationContextError into an unhandled rejection and the dialog
 * sat there. It must ask for a workspace first and say out loud when nothing
 * was added.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockPaste = jest.fn();
jest.mock("../../../hooks/useResearchApi", () => ({
  useResearchApi: () => ({ pasteContent: mockPaste }),
}));
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("@/components/ui/dialog", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return { Dialog: Pass, DialogContent: Pass, DialogHeader: Pass, DialogTitle: Pass };
});
jest.mock("@/components/ui/select", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return { Select: Pass, SelectContent: Pass, SelectItem: Pass, SelectTrigger: Pass, SelectValue: Pass };
});
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea aria-label="paste" {...p} />
  ),
}));
const mockEnsureOrgId = jest.fn();
jest.mock("@/lib/organizations/personalOrg", () => ({
  ensureOrgId: (...a: unknown[]) => mockEnsureOrgId(...a),
}));
const mockToastError = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: { error: (...a: unknown[]) => mockToastError(...a), success: jest.fn() },
}));

import { PasteContentModal } from "../PasteContentModal";

function contextError() {
  const e = new Error("Select an organization before sending this request.");
  e.name = "OrganizationContextError";
  return e;
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mockToastError.mockReset();
  mockEnsureOrgId.mockReset();
  mockPaste.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function typeAndSave(onSaved: () => void) {
  await act(async () => {
    root.render(
      <PasteContentModal
        open
        onOpenChange={() => {}}
        topicId="t1"
        sourceId="s1"
        onSaved={onSaved}
      />,
    );
  });
  const area = host.querySelector("textarea") as HTMLTextAreaElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(area, "some text");
    area.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const save = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === "Save Content",
  ) as HTMLButtonElement;
  await act(async () => {
    save.click();
    await new Promise((r) => setTimeout(r, 0));
  });
  return save;
}

it("says 'Nothing was added: choose a workspace first' instead of failing silently", async () => {
  mockEnsureOrgId.mockRejectedValue(contextError());
  mockPaste.mockRejectedValue(contextError());
  const onSaved = jest.fn();
  const save = await typeAndSave(onSaved);
  expect(mockToastError).toHaveBeenCalledWith(
    "Nothing was added: choose a workspace first",
  );
  expect(onSaved).not.toHaveBeenCalled();
  expect(save.disabled).toBe(false);
});

it("asks for the workspace before saving, then saves", async () => {
  mockEnsureOrgId.mockResolvedValue("org1");
  mockPaste.mockResolvedValue({});
  const onSaved = jest.fn();
  await typeAndSave(onSaved);
  expect(mockEnsureOrgId).toHaveBeenCalled();
  expect(mockPaste).toHaveBeenCalledWith("t1", "s1", {
    content: "some text",
    content_type: "plain_text",
  });
  expect(onSaved).toHaveBeenCalled();
});
