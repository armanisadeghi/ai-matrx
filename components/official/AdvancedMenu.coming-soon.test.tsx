import { act } from "react";
import { createRoot } from "react-dom/client";
import { FileText } from "lucide-react";

import AdvancedMenu, { buildRootItems, type MenuItem } from "./AdvancedMenu";
import { OrganizationSelectionCancelled } from "@/lib/organization/organization-gate";

jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));
const { toast } = jest.requireMock("@/components/ui/use-toast") as {
  toast: jest.Mock;
};

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

jest.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

describe("AdvancedMenu disabled-state promise language", () => {
  it("keeps the menu open and silent when organization selection is cancelled", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onClose = jest.fn();
    const action = jest
      .fn()
      .mockRejectedValue(new OrganizationSelectionCancelled());

    await act(async () => {
      root.render(
        <AdvancedMenu
          isOpen
          onClose={onClose}
          showBackdrop={false}
          position="center"
          items={[{ key: "save", icon: FileText, label: "Save", action }]}
        />,
      );
    });
    await act(async () => {
      (document.body.querySelector("button") as HTMLButtonElement).click();
    });

    expect(action).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Save");
    await act(async () => root.unmount());
    container.remove();
  });

  it("still reports success and closes after a successful action", async () => {
    jest.useFakeTimers();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onClose = jest.fn();
    await act(async () => {
      root.render(
        <AdvancedMenu
          isOpen
          onClose={onClose}
          showBackdrop={false}
          position="center"
          items={[
            {
              key: "save",
              icon: FileText,
              label: "Save",
              action: jest.fn().mockResolvedValue(undefined),
            },
          ]}
        />,
      );
    });
    await act(async () => {
      (document.body.querySelector("button") as HTMLButtonElement).click();
    });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Success" }),
    );
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  it("renders a generic disabled item as unavailable, not as a roadmap promise", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AdvancedMenu
          isOpen
          onClose={jest.fn()}
          showBackdrop={false}
          position="center"
          items={[
            {
              key: "share",
              icon: FileText,
              label: "Share",
              action: jest.fn(),
              disabled: true,
            },
          ]}
        />,
      );
    });

    const item = document.body.querySelector("button");
    expect(item).not.toBeNull();
    expect(item?.textContent).toMatch(/share\s*unavailable/i);
    expect(item?.disabled).toBe(true);
    expect(document.body.textContent).not.toMatch(/\bsoon\b/i);

    await act(async () => root.unmount());
    container.remove();
  });

  it("omits submenu triggers that have no visible destination", () => {
    const items: MenuItem[] = [
      {
        key: "save-as",
        icon: FileText,
        label: "Save as",
        action: jest.fn(),
        children: [
          {
            key: "hidden-pdf",
            icon: FileText,
            label: "PDF",
            action: jest.fn(),
            hidden: true,
          },
        ],
      },
    ];

    expect(buildRootItems(items, true, true)).toEqual([]);
  });

  it("resolves an open submenu from current items instead of a stale snapshot", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const parent = (childLabel: string): MenuItem => ({
      key: "save-as",
      icon: FileText,
      label: "Save as",
      action: jest.fn(),
      children: [
        {
          key: "format",
          icon: FileText,
          label: childLabel,
          action: jest.fn(),
        },
      ],
    });

    await act(async () => {
      root.render(
        <AdvancedMenu
          isOpen
          onClose={jest.fn()}
          showBackdrop={false}
          position="center"
          items={[parent("PDF document")]}
        />,
      );
    });
    await act(async () => {
      const trigger = Array.from(document.body.querySelectorAll("button")).find(
        (button) => /Save as/i.test(button.textContent ?? ""),
      );
      trigger?.click();
    });
    expect(document.body.textContent).toContain("PDF document");

    await act(async () => {
      root.render(
        <AdvancedMenu
          isOpen
          onClose={jest.fn()}
          showBackdrop={false}
          position="center"
          items={[parent("Markdown document")]}
        />,
      );
    });

    expect(document.body.textContent).toContain("Markdown document");
    expect(document.body.textContent).not.toContain("PDF document");

    await act(async () => root.unmount());
    container.remove();
  });
});
