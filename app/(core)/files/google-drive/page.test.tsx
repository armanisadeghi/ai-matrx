/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import GoogleDriveFilesPage from "./page";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockSessionVerdict = jest.fn();
const mockRedirect = jest.fn();

jest.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));
jest.mock("@/utils/supabase/sessionVerdict", () => ({
  getSessionVerdict: () => mockSessionVerdict(),
}));
jest.mock("@/features/shell/components/header/RouteHeader", () => ({
  __esModule: true,
  default: ({ left }: { left: React.ReactNode }) => (
    <header data-route-header>{left}</header>
  ),
}));
jest.mock("@/ai-matrx/tap-target/buttons", () => ({
  ChevronLeftTapButton: ({
    href,
    ariaLabel,
  }: {
    href: string;
    ariaLabel: string;
  }) => (
    <a href={href} aria-label={ariaLabel}>
      Back
    </a>
  ),
}));
jest.mock("@/features/files/google-drive/GoogleDriveLibrary", () => ({
  GoogleDriveLibrary: () => <main>Drive library</main>,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mockSessionVerdict.mockReset();
  mockRedirect.mockReset();
});

afterEach(() => {
  root.unmount();
  container.remove();
});

it("keeps the restricted route under the core header with a Files back path", async () => {
  mockSessionVerdict.mockResolvedValue({ isAuthenticated: true });
  await act(async () => root.render(await GoogleDriveFilesPage()));
  expect(container.querySelector("[data-route-header]")?.textContent).toContain(
    "Google Drive",
  );
  expect(
    container.querySelector('a[aria-label="Back to Files"]'),
  ).toHaveAttribute("href", "/files");
  expect(mockRedirect).not.toHaveBeenCalled();
});
