/**
 * THE SHEET AND THE GRID PAINT ONE TABLE THE SAME WAY (lane UI-FIX-18, VERIFIER-18 H3).
 *
 * THE USE CASE: the Birchwood Avenue Renovation's Rooms table, colored by Status with one rule,
 * "Status is On Hold → Red". The owner opens the Sheet and the default grid of the same table.
 * On production the Sheet painted *Complete* the same red as the On Hold alarm and tinted
 * Quoting, Planning and In Progress, while the grid and the cards painted Complete amber —
 * the two views disagreed about what a finished room looks like.
 *
 * THE SEAM: `sheet-colors.ts`. For a record-store table the Sheet's style is records-ui's
 * `resolveTableStyle` and its color-by lookup is records-ui's `colorFromTheValue`; rule
 * precedence is the design system's `resolveRowColor`, which records-ui's grid also calls.
 *
 * RED on the bytes before this lane: the Sheet's lookup was `colorForChoice` over the option
 * list's position in the palette — Complete (fifth option) came out red.
 */
import type { Field, TableDecorations } from "@ai-matrx/records";
import { colorFromTheValue, resolveTableStyle } from "@ai-matrx/records-ui";
import { resolveRowColor } from "@ai-matrx/design-system/data-table/table-style";
import { sheetChoiceColorLookup, sheetStyleFromDecorations } from "../sheet-colors";

const F_ROOM = "0b3e1c2d-4a5f-4e6d-8c7b-1a2b3c4d5e01";
const F_STATUS = "0b3e1c2d-4a5f-4e6d-8c7b-1a2b3c4d5e02";

const FIELDS = [
  { id: F_ROOM, key: "room_name", label: "Room", type: "text", config: {}, sort: 10 },
  { id: F_STATUS, key: "status", label: "Status", type: "text", config: {}, sort: 20 },
] as unknown as Field[];

// The Rooms decorations as the store answers them: addressed by Field id.
const DECORATIONS = {
  version: 1,
  colors: ["slate", "green", "amber", "red", "blue", "violet", "teal"],
  rule_ops: [],
  color_by: { field: F_STATUS, target: "row" },
  rules: [{ id: "on-hold", field: F_STATUS, op: "is", value: "On Hold", color: "red", target: "row" }],
  rows: {},
  columns: {},
  cells: {},
  stale: [],
} as unknown as TableDecorations;

// The option list the Sheet holds for Status, in the order the owner made it.
const STATUS_CHOICES = ["Planning", "Quoting", "In Progress", "On Hold", "Complete"].map((value) => ({ value }));

const ROOMS = [
  { id: "r-kitchen", data: { room_name: "Kitchen", status: "In Progress" } },
  { id: "r-bath", data: { room_name: "Primary bath", status: "Quoting" } },
  { id: "r-garage", data: { room_name: "Garage", status: "On Hold" } },
  { id: "r-deck", data: { room_name: "Backyard Deck", status: "Complete" } },
  { id: "r-office", data: { room_name: "Home office", status: "Planning" } },
];

describe("Birchwood Rooms · the Sheet paints every room the colour the grid does", () => {
  const gridStyle = resolveTableStyle(DECORATIONS, FIELDS, undefined);
  const sheetStyle = sheetStyleFromDecorations(DECORATIONS, FIELDS);
  const sheetLookup = sheetChoiceColorLookup(true, (field) => (field === "status" ? STATUS_CHOICES : undefined));

  it.each(ROOMS)("$data.room_name ($data.status)", (room) => {
    const grid = resolveRowColor(gridStyle, room, colorFromTheValue);
    const sheet = resolveRowColor(sheetStyle, room, sheetLookup);
    expect(sheet).toBe(grid);
  });

  it("the rule still wins: On Hold is red on both", () => {
    expect(resolveRowColor(sheetStyle, ROOMS[2]!, sheetLookup)).toBe("red");
  });

  it("a finished room is never painted with the alarm's red", () => {
    expect(resolveRowColor(sheetStyle, ROOMS[3]!, sheetLookup)).not.toBe("red");
  });

  it("a table on the older store keeps its own option colors", () => {
    const older = sheetChoiceColorLookup(false, () => [{ value: "Complete", color: "green" }]);
    expect(older("status", "Complete")).toBe("green");
  });
});
