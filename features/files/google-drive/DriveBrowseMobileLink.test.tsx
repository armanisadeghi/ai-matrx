/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DriveBrowseMobileLink } from "./DriveBrowseMobileLink";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockCapabilities = jest.fn();

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("@/features/marketing/google/hooks", () => ({
  useGoogleCapabilities: () => mockCapabilities(),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mockCapabilities.mockReset();
});

afterEach(() => {
  root.unmount();
  container.remove();
});

it("adds the Drive route to the mobile Files root only for an eligible caller", async () => {
  mockCapabilities.mockReturnValue({
    data: [
      { key: "drive_browse", rollout_phase: "internal_test", eligible: true },
    ],
  });
  await act(async () => root.render(<DriveBrowseMobileLink />));
  expect(
    container.querySelector('a[href="/files/google-drive"]')?.textContent,
  ).toContain("Google Drive");

  mockCapabilities.mockReturnValue({
    data: [
      { key: "drive_browse", rollout_phase: "internal_test", eligible: false },
    ],
  });
  await act(async () => root.render(<DriveBrowseMobileLink />));
  expect(container.querySelector("a")).toBeNull();
});
