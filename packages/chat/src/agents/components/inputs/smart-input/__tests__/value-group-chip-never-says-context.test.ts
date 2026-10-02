/**
 * The composer's value-group chip shows the group's REAL name or no text at
 * all — never a generic "Context" (Arman, 2026-10-01).
 */
jest.mock("../../../../../surfaces/utils/surface-display", () => ({
  getSurfaceDisplayLabel: (name: string) =>
    ({ notes: "Notes", generic: "Context", page: "Page context", items: "Context items" })[name] ?? name,
}));

import { valueGroupName } from "../ConversationContextChip";

it("a real page name is the label", () => {
  expect(valueGroupName("notes")).toBe("Notes");
});

it("no page, or only a generic word, is no label", () => {
  expect(valueGroupName(null)).toBe("");
  expect(valueGroupName("generic")).toBe("");
  expect(valueGroupName("page")).toBe("");
  expect(valueGroupName("items")).toBe("");
});
