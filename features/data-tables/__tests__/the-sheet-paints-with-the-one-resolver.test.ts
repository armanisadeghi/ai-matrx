/**
 * THE SHEET AND THE GRID PAINT ONE TABLE THE SAME WAY (lane UI-FIX-18, VERIFIER-18 H3).
 *
 * THE USE CASE: the Birchwood Avenue Renovation's Rooms table, colored by Status with one rule,
 * "Status is On Hold → Red". The owner opens the Sheet and the default grid of the same table.
 * On production the Sheet painted *Complete* the same red as the On Hold alarm and tinted
 * Quoting, Planning and In Progress, while the grid and the cards painted Complete amber —
 * the two views disagreed about what a finished room looks like.
 *
 * THE SEAM: `sheet-colors.ts`. For a record-store table the Sheet's color-by lookup is
 * records-ui's `colorFromTheValue`, the grid's own; rule
 * precedence is the design system's `resolveRowColor`, which records-ui's grid also calls.
 *
 * RED on the bytes before this lane: the Sheet's lookup was `colorForChoice` over the option
 * list's position in the palette — Complete (fifth option) came out red.
 */
import { colorFromTheValue } from "@ai-matrx/records-ui";
import { resolveRowColor, type TableStyle } from "@ai-matrx/design-system/data-table/table-style";
import { sheetChoiceColorLookup } from "../sheet-colors";

// The Rooms style as both screens hold it once the store's decorations are translated
// (Field ids → keys): color by Status, and one rule.
const STYLE: TableStyle = {
  version: 1,
  colorBy: { field: "status", target: "row" },
  rules: [{ id: "on-hold", field: "status", op: "is", value: "On Hold", color: "red", target: "row" }],
};

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
  const gridStyle = STYLE;
  const sheetStyle = STYLE;
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

/**
 * A CHOICE PAINTS THE ROW IN ITS OWN COLOUR (DATA-V2-BASICS-2 C1, walked on Harbor Dental's
 * "Insurance Plan Accounts", a table moved from /data). Colored by Status, the row of a plan whose
 * Status chip is GREEN ("Verified") was tinted pink, and "Maxed out" (a red chip) amber: the
 * Sheet hashed the word into a colour even though every option keeps the colour its owner gave
 * it. The records-ui grid's rule is the same one: the column's stored colour first, the hash only
 * for a value whose option keeps none.
 */
describe("Harbor Dental insurance plans · coloured by Status, a row wears its Status chip's colour", () => {
  const STATUS = [
    { value: "Verified", color: "green" },
    { value: "Pending verification", color: "amber" },
    { value: "Maxed out", color: "red" },
    { value: "Appeal", color: "violet" },
    { value: "Awaiting card" }, // an option its owner never painted
  ];
  const lookup = sheetChoiceColorLookup(true, (field) => (field === "status" ? STATUS : undefined));
  const style: TableStyle = { version: 1, colorBy: { field: "status", target: "row" } };
  const plan = (status: string) => ({ id: status, data: { account: "Aetna Dental Access", status } });

  it.each([
    ["Verified", "green"],
    ["Pending verification", "amber"],
    ["Maxed out", "red"],
    ["Appeal", "violet"],
  ])("%s paints %s", (status, color) => {
    expect(resolveRowColor(style, plan(status), lookup)).toBe(color);
  });

  it("the moved list's key spelling ('pending_verification') is the same choice", () => {
    expect(lookup("status", "pending_verification")).toBe("amber");
  });

  it("an option with no colour of its own still paints, the way the grid paints it", () => {
    expect(lookup("status", "Awaiting card")).toBe(colorFromTheValue("status", "Awaiting card"));
  });
});
