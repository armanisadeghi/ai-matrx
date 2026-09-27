/**
 * A RE-READ KEEPS THE ROWS ON SCREEN (DATA-V2-BASICS-2 C3). Harbor Dental's "Insurance Plan
 * Accounts" coloured by Status: every pick in Table colors blanked the 21 plans to five pulsing
 * bars for about a second, because the table's colour notice re-reads the page and the body drew
 * its skeleton whenever it was loading. The skeleton is for the first read only.
 */
import { sheetBodyState } from "../sheet-loading";

it("the first read, nothing held yet: the skeleton", () => {
  expect(sheetBodyState({ loading: true, rowsHeld: 0, filteringInProgress: false })).toBe("skeleton");
});

it("a re-read with 21 plans on screen: the plans stay, the body is re-reading", () => {
  expect(sheetBodyState({ loading: true, rowsHeld: 21, filteringInProgress: false })).toBe("rereading");
});

it("a column filter reading the whole table for the first time: the skeleton (the rows shown would be the unfiltered ones)", () => {
  expect(sheetBodyState({ loading: false, rowsHeld: 21, filteringInProgress: true })).toBe("skeleton");
});

it("done: the rows", () => {
  expect(sheetBodyState({ loading: false, rowsHeld: 21, filteringInProgress: false })).toBe("rows");
});
