import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { OrganizationSelectionCancelled } from "@/lib/organization/organization-gate";

jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}));

import { CreateFolderDialog } from "./CreateFolderDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("CreateFolderDialog organization cancellation", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
  afterEach(() => { act(() => root.unmount()); host.remove(); });

  it("retains the typed name and stays open after a cancelled confirmation", async () => {
    const onOpenChange = jest.fn();
    const onConfirm = jest.fn().mockRejectedValue(new OrganizationSelectionCancelled());
    await act(async () => { root.render(<CreateFolderDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} />); });
    const input = host.querySelector("input") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "Team notes");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => { (host.querySelector("form") as HTMLFormElement).requestSubmit(); });
    expect(onConfirm).toHaveBeenCalledWith("Team notes");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect((host.querySelector("input") as HTMLInputElement).value).toBe("Team notes");
    expect((host.querySelector("button[type=submit]") as HTMLButtonElement).disabled).toBe(false);
  });
});
