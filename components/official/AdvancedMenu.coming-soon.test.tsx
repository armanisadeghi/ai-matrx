import { render, screen } from "@testing-library/react";
import { FileText } from "lucide-react";

import AdvancedMenu from "./AdvancedMenu";

jest.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

describe("AdvancedMenu disabled-state promise language", () => {
  it("renders a generic disabled item as unavailable, not as a roadmap promise", () => {
    render(
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

    const item = screen.getByRole("button", { name: /share unavailable/i });
    expect((item as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/^soon$/i)).toBeNull();
  });
});
