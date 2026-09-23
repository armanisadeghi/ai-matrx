/**
 * VERIFIER-16: a one-line file was "empty". Rincon Plumbing & Drain's office
 * manager starts a customer table from the one customer she has typed so far,
 * and from a header plus that customer.
 */
import Papa from "papaparse";
import { cleanGrid, firstRowLooksLikeHeader, tableFromGrid } from "../grid-import";

const grid = (csv: string) => cleanGrid(Papa.parse<string[]>(csv, { header: false, skipEmptyLines: true }).data);

describe("reading an imported file", () => {
  it("a single row with no header is ONE record, not an empty file", () => {
    const g = grid("Takeda Property Management,805-555-0142,2210 Ocean View Dr\n");
    expect(firstRowLooksLikeHeader(g)).toBe(false);
    const t = tableFromGrid(g, false);
    expect(t.columns).toEqual(["Column 1", "Column 2", "Column 3"]);
    expect(t.rows).toEqual([{ "Column 1": "Takeda Property Management", "Column 2": "805-555-0142", "Column 3": "2210 Ocean View Dr" }]);
  });

  it("a header plus one row is one record under those names, BOM and CRLF included", () => {
    const g = grid("﻿Customer,Phone,Address\r\nTakeda Property Management,805-555-0142,2210 Ocean View Dr\r\n");
    expect(firstRowLooksLikeHeader(g)).toBe(true);
    expect(tableFromGrid(g, true).rows).toEqual([
      { Customer: "Takeda Property Management", Phone: "805-555-0142", Address: "2210 Ocean View Dr" },
    ]);
  });

  it("flipping the guess loses no line: a header-only table, or the header as data", () => {
    const g = grid("Customer,Phone\nHarbor Street Dental,805-555-0199\n");
    expect(tableFromGrid(g, false).rows).toHaveLength(2);
    const headerOnly = tableFromGrid(grid("Customer,Phone\n"), true);
    expect(headerOnly).toEqual({ columns: ["Customer", "Phone"], rows: [] });
  });

  it("a value repeated below the first row means the first row is data", () => {
    const g = grid("Drain clearing,325\nDrain clearing,410\nWater heater,1840\n");
    expect(firstRowLooksLikeHeader(g)).toBe(false);
  });

  it("blank and duplicate names never collide", () => {
    expect(tableFromGrid([["Phone", "", "phone"], ["1", "2", "3"]], true).columns).toEqual(["Phone", "Column 2", "phone 2"]);
  });

  it("only truly blank content is empty", () => {
    expect(grid("\n , \n\n")).toEqual([]);
  });
});
