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

// The screen must not claim a shortcut failed to open when the address never
// named a shortcut. A hub tab deep-linked under `/shortcuts/` (the production
// report was `.../system-agents/shortcuts/categories`) is a WRONG ADDRESS.
it("says a non-id segment is a wrong address, not a broken shortcut", async () => {
  await act(async () => {
    root.render(<ShortcutDirectResolver shortcutId="categories" mode="admin" />);
  });

  const text = container.textContent ?? "";
  expect(text).toContain("categories");
  expect(text).toContain("is not a shortcut id");
  // The old, lying sentence — pinned as forbidden.
  expect(text).not.toMatch(/couldn'?t open this shortcut/i);
  // And no dead control: retrying the same wrong address can only fail.
  expect(text).not.toContain("Retry");
  expect(
    container.querySelector(
      'a[href="/administration/agents/system-agents/shortcuts/all"]',
    ),
  ).not.toBeNull();
});
