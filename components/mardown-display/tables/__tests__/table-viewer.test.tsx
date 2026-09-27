/**
 * A TABLE SHOWS ONLY WHAT WORKS FOR ITS VIEWER, AND READS ON A PHONE
 * (page-pass 2026-09-27, an AI result on /p/<slug>).
 *
 * Signed out, the action row offered eight unlabeled icons including saves and
 * Edit that answered 401 / "permission denied"; on a phone every cell was
 * truncated and paged sideways. The use case: a café owner's AI-built
 * comparison of three espresso grinders, opened from a shared link.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let mockSignedIn = false;
let mockMobile = false;
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({ userAuth: { id: mockSignedIn ? "u-1" : null } }),
  useAppDispatch: () => jest.fn(),
}));
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => mockMobile }));
jest.mock("@/components/rich-content/RichContent", () => ({
  RichContent: ({ source }: { source: string }) => <span>{source}</span>,
}));
jest.mock("../../specimen/SpecimenContext", () => ({ useSpecimenMode: () => false }));
jest.mock("../../blocks/chart/TableChart", () => ({
  ChartThisButton: () => <button aria-label="Chart this">Chart this</button>,
  TableChartPanel: () => null,
}));
jest.mock("../SaveTableModal", () => ({ __esModule: true, default: () => null }));
jest.mock("@/hooks/useToastManager", () => ({
  useToastManager: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

import MarkdownTable from "../MarkdownTable";
import { phoneStackCellProps, plainHeaderLabel } from "../table-viewer";

const GRINDERS = {
  headers: ["Grinder", "**Burr** size", "Price"],
  rows: [
    ["Mazzer Mini", "64 mm flat", "$1,050"],
    ["Eureka Mignon Specialita", "55 mm flat", "$649"],
    ["Niche Zero", "63 mm conical", "$699"],
  ],
  normalizedData: [
    { Grinder: "Mazzer Mini", "Burr size": "64 mm flat", Price: "$1,050" },
  ],
};

function render(): string {
  return renderToStaticMarkup(<MarkdownTable data={GRINDERS} content="| Grinder |" />);
}

describe("the table's action row", () => {
  it("offers a signed-out visitor no write — no Save to, no Edit", () => {
    mockSignedIn = false;
    mockMobile = false;
    const html = render();
    expect(html).not.toContain("Save to");
    expect(html).not.toContain(">Edit<");
    expect(html).not.toContain("Workbook");
    expect(html).not.toContain("Google Sheet");
    expect(html).toContain("Chart this");
  });

  it("groups a signed-in person's writes behind one labelled Save to, and keeps Edit", () => {
    mockSignedIn = true;
    mockMobile = false;
    const html = render();
    expect(html).toContain("Save to");
    expect(html).toContain("Edit");
    // Workbook / Google Sheet are menu items now, not separate icons in the row.
    expect(html).not.toContain(">Workbook<");
  });
});

describe("a table on a phone", () => {
  it("reflows into the phone-stack card list with every cell whole and labelled", () => {
    mockSignedIn = false;
    mockMobile = true;
    const html = render();
    expect(html).toContain("phone-stack");
    expect(html).not.toContain("text-ellipsis");
    expect(html).toContain('data-phone="lead"');
    expect(html).toContain('data-label="Burr size"');
  });
});

describe("phone-card labels", () => {
  it("read a header's markdown as plain words", () => {
    expect(plainHeaderLabel("**Burr** size")).toBe("Burr size");
    expect(plainHeaderLabel("[Price](https://example.com)")).toBe("Price");
    expect(phoneStackCellProps(["A", "B"], 0)).toEqual({ "data-phone": "lead" });
    expect(phoneStackCellProps(["A", "`B`"], 1)).toEqual({ "data-label": "B" });
  });
});
