import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ImageIcon, Settings } from "lucide-react";
import { RouteModeNav } from "./RouteModeNav";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockUseIsMobile = jest.fn(() => true);

jest.mock("next/navigation", () => ({
  usePathname: () => "/images/manager",
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/components/navigation/AppLink", () => ({
  __esModule: true,
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@ai-matrx/design-system", () => ({
  BottomSheet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  BottomSheetBody: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  BottomSheetHeader: () => null,
}));

jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => mockUseIsMobile() }));
jest.mock("@/utils/navigation/should-open-in-new-tab", () => ({
  allowNativeNewTab: () => false,
}));
jest.mock("@/features/shell/components/header/NavItemTooltip", () => ({
  NavItemTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  NavTooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

describe("RouteModeNav mobile menu geometry", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockUseIsMobile.mockReturnValue(true);
    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      value: ResizeObserverMock,
    });
    document.head.insertAdjacentHTML(
      "beforeend",
      "<style data-route-mode-nav-test>.min-h-11{min-height:44px}</style>",
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.querySelector("[data-route-mode-nav-test]")?.remove();
  });

  it("keeps the collapsed mobile Switch view control at the 44px touch minimum", () => {
    act(() => {
      root.render(
        <RouteModeNav
          items={[
            { name: "Manager", href: "/images/manager", icon: ImageIcon },
            { name: "Studio", href: "/images/studio", icon: Settings },
          ]}
        />,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Switch view"]',
    );
    expect(trigger).not.toBeNull();
    expect(trigger?.classList.contains("min-h-11")).toBe(true);
    expect(Number.parseFloat(getComputedStyle(trigger!).minHeight)).toBeGreaterThanOrEqual(44);
  });
});
