// app/(core)/lists/[id]/__tests__/a-list-page-says-what-it-is-and-never-that-it-moved.test.tsx
//
// THE USE CASE (lane HANDOVER, 2026-09-27; OLD-READERS-REMOVAL, 2026-10-01). The owner of Cedar Ridge
// Physical Therapy presses New picklist and lands on /lists/<id>. Every list lives in the record
// store, so the line over the page says what the page is, never that the list moved, and leads back
// to the Picklists page at /lists.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
jest.mock("@/app/(core)/data-v2/[tableId]/LivesInTheNewSystem", () => ({
  LivesInTheNewSystem: ({ children }: { children: React.ReactNode }) => <p data-testid="line">{children}</p>,
}));

// eslint-disable-next-line import/first
import { StoreListPage } from "../StoreListPage";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("a list's page says what it is, never that it moved, and leads back to /lists", () => {
  act(() => root.render(<StoreListPage listId="3cae19b9-09d0-473f-896c-c151fe3fb498" />));
  const line = host.textContent ?? "";
  expect(line).not.toMatch(/now lives in the new system|switched its Data tables|moved/);
  expect(line).toMatch(/pick list/i);
  expect(host.querySelector('a[href="/lists"]')).not.toBeNull();
});
