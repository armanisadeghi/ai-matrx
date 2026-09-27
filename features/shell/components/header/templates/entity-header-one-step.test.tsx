/**
 * A RECORD'S OPTIONS ARE ONE STEP ON A PHONE (page-pass shared defects,
 * 2026-09-27). Inside the shell's ⋮ sheet, EntityModeHeader used to put its own
 * "More" button, which opened a SECOND sheet. On a phone (with the shell's
 * sheet host published) its modes and actions are rows directly in the host.
 *
 * PROVEN FAILING BEFORE PASSING: against the pre-fix header the host holds a
 * "More" button and no action row.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Pencil } from "lucide-react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/schedules/1",
}));
jest.mock("@/lib/navigation/useBackHref", () => ({ useBackHref: (h: string) => h }));
jest.mock("@/features/shell/components/header/PageHeader", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

class RO {
  observe() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const store = require("../phone-page-actions") as typeof import("../phone-page-actions");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TooltipProvider } = require("@/components/ui/tooltip") as typeof import("@/components/ui/tooltip");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { EntityModeHeader } = require("./EntityModeHeader") as typeof import("./EntityModeHeader");

let root: Root;
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

it("lists the record's actions directly in the shell sheet — no second 'More' sheet", () => {
  store.__resetPhonePageActionsForTest();
  const host = document.createElement("div");
  document.body.appendChild(host);
  store.setPhonePageActionsHost(host);
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => {
    root.render(
      <TooltipProvider>
        <EntityModeHeader
          backHref="/schedules"
          entityLabel="Nightly digest"
          actions={[{ label: "Rename", icon: Pencil, onPress: () => {} }]}
        />
      </TooltipProvider>,
    );
  });
  const buttons = [...host.querySelectorAll("button")].map((b) => b.textContent?.trim() || b.getAttribute("aria-label"));
  expect(buttons).toContain("Rename");
  expect(buttons).not.toContain("More");
});
