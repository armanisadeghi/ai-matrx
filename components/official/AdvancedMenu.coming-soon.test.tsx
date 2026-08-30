import { act } from "react";
import { createRoot } from "react-dom/client";
import { FileText } from "lucide-react";

import AdvancedMenu from "./AdvancedMenu";

jest.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

describe("AdvancedMenu disabled-state promise language", () => {
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
});
