// app/(core)/lists/[id]/__tests__/a-list-born-in-the-new-system-never-says-it-moved.test.tsx
//
// THE USE CASE (lane HANDOVER, 2026-09-27). The owner of Cedar Ridge Physical Therapy, an
// organization on the new system, presses New picklist and lands on /lists/<id>. The line over
// the page read "This list now lives in the new system … its organization switched its Data
// tables": false, the list was made a second earlier and never moved. RED on the page before the
// lane: the line was the moved sentence for every store list.
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

it("a list born in the new system says what the page is, never that it moved", () => {
  act(() => root.render(<StoreListPage listId="3cae19b9-09d0-473f-896c-c151fe3fb498" moved={false} />));
  const line = host.textContent ?? "";
  expect(line).not.toMatch(/now lives in the new system|switched its Data tables/);
  expect(line).toMatch(/pick list/i);
  expect(host.querySelector('a[href="/lists/v3"]')).not.toBeNull();
});

it("a list that moved with its organization's switch says so", () => {
  act(() => root.render(<StoreListPage listId="a1d011b4-a20f-4162-a0a5-f1251cf37c3b" moved />));
  expect(host.textContent ?? "").toMatch(/now lives in the new system/);
});
