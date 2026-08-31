import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ShortcutDirectResolver } from "./ShortcutDirectResolver";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const shortcutTableMock = jest.fn();
const replaceMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
jest.mock("@/lib/supabase/shortcutStorage", () => ({
  shortcutTable: (...args: unknown[]) => shortcutTableMock(...args),
}));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  shortcutTableMock.mockReset();
  replaceMock.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("rejects reserved and malformed route segments before querying the UUID column", async () => {
  await act(async () => {
    root.render(<ShortcutDirectResolver shortcutId="new" mode="user" />);
  });

  expect(shortcutTableMock).not.toHaveBeenCalled();
  expect(replaceMock).not.toHaveBeenCalled();
  expect(container.textContent).toContain("shortcut");
  expect(container.querySelector('a[href="/agents/shortcuts/all"]')).not.toBeNull();
});
