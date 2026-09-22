/**
 * THE MASTERWORKS LIST TELLS TWO RULEBOOKS WITH ONE NAME APART — a forcing
 * function over the screen cold walk 21 actually read.
 *
 * Defect D of that walk: `/masterwork/all` showed three rows all reading
 * `walk21-Repaint or Recoat Verdict`, "separable only by their goal sentence
 * and their age". Allowing the duplicate name is the ruling; the list saying
 * which is which is the other half of allowing it.
 *
 * Proven failing before the fix: both render cases printed the name three
 * times with no distinguishing line anywhere in the output.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { MasterworkBrowseRows } from "../components/MasterworkBrowseRows";
import { MasterworkBrowseCards } from "../components/MasterworkBrowseCards";
import type { RulebookListRow } from "../../types";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));
jest.mock("@/components/official/item/ItemMenu", () => ({
  ItemMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@ai-matrx/design-system", () => ({
  ArchivedDisclosure: () => null,
}));
jest.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const NAME = "walk21-Repaint or Recoat Verdict";

/** Three Rulebooks a residential repainting contractor really would make. */
function rulebook(
  id: string,
  createdAt: string,
  description: string,
): RulebookListRow {
  return {
    id,
    name: NAME,
    slug: `walk21-repaint-or-recoat-verdict-${id}`,
    description,
    source: {},
    sources: { state: "read", total: 0, partial: false, groups: [] },
    version: 1,
    status: "draft",
    visibility: "private",
    rule_count: 0,
    created_by: "expert",
    organization_id: "org",
    created_at: createdAt,
    updated_at: createdAt,
  } as unknown as RulebookListRow;
}

const ROWS = [
  rulebook("a", "2026-09-19T16:02:00.000Z", "When to repaint and when to recoat"),
  rulebook("b", "2026-09-21T11:20:00.000Z", "When to repaint and when to recoat"),
  rulebook("c", "2026-09-22T09:41:00.000Z", "When to repaint and when to recoat"),
];

const NOOP_MENU = () => () => ({ items: [] }) as never;
const HREF = (row: RulebookListRow) => `/masterwork/${row.id}`;

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

function render(node: React.ReactElement): string {
  act(() => root.render(node));
  return host.textContent ?? "";
}

/**
 * Every line the list prints for one row, minus the parts all three share, is
 * what a person has to tell them apart with. This asserts the far simpler
 * thing the walk was asking for: something on the page separates them.
 */
function distinguishingLines(text: string): string[] {
  return (
    text.match(
      /Started [A-Z][a-z]{2} \d{1,2}, \d{4}(?: at \d{1,2}:\d{2}\s?[AP]M)?/g,
    ) ?? []
  );
}

describe("three Rulebooks carrying one name", () => {
  it("the ROWS view gives each of them its own line", () => {
    const text = render(
      <MasterworkBrowseRows
        rows={ROWS}
        density="comfortable"
        menuFor={NOOP_MENU}
        hrefFor={HREF}
        masterworksBy={{}}
        archivedBy={{}}
      />,
    );
    const lines = distinguishingLines(text);
    expect(lines).toHaveLength(3);
    expect(new Set(lines).size).toBe(3);
  });

  it("the CARDS view gives each of them its own line", () => {
    const text = render(
      <MasterworkBrowseCards
        rows={ROWS}
        density="comfortable"
        menuFor={NOOP_MENU}
        hrefFor={HREF}
        masterworksBy={{}}
        archivedBy={{}}
      />,
    );
    const lines = distinguishingLines(text);
    expect(lines).toHaveLength(3);
    expect(new Set(lines).size).toBe(3);
  });

  it("a list of uniquely-named Rulebooks gains no noise", () => {
    const unique = ROWS.map((row, index) => ({
      ...row,
      name: `${NAME} ${index}`,
    }));
    const text = render(
      <MasterworkBrowseRows
        rows={unique}
        density="comfortable"
        menuFor={NOOP_MENU}
        hrefFor={HREF}
        masterworksBy={{}}
        archivedBy={{}}
      />,
    );
    expect(distinguishingLines(text)).toHaveLength(0);
  });
});

describe("the table view cannot see its neighbours, so it shows Created", () => {
  it("the Created column is no longer hidden by default", async () => {
    const { RULEBOOK_COLUMNS } = await import("../columns");
    const created = RULEBOOK_COLUMNS.find((c) => c.id === "created_at");
    expect(created).toBeDefined();
    expect(created?.defaultHidden).toBeFalsy();
  });
});
