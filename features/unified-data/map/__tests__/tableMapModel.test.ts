import { buildTableMap, layoutMap, KEY_COLUMNS, type MapTableInput } from "../tableMapModel";
import type { TableMapFieldRow } from "@/features/unified-data/hub/doors";

const HARBOR = "11111111-1111-4111-8111-111111111111";
const ROOFING = "22222222-2222-4222-8222-222222222222";

const t = (id: string, name: string, org = HARBOR, orgName = "Harbor Dental Group"): MapTableInput => ({
  tableId: id,
  name,
  href: `/data/${id}`,
  organizationId: org,
  organizationName: orgName,
});
const col = (table: string, key: string, sort: number): TableMapFieldRow => ({
  table_id: table,
  field_key: key,
  field_label: key[0]!.toUpperCase() + key.slice(1),
  field_type: "text",
  relation_target: null,
  inverse_key: null,
  field_sort: sort,
  is_link: false,
});
const link = (table: string, key: string, target: string, inverse: string | null = null): TableMapFieldRow => ({
  ...col(table, key, 99),
  field_type: "relation",
  relation_target: target,
  inverse_key: inverse,
  is_link: true,
});

describe("the tables map model", () => {
  it("draws one line for a two-way link declared on both ends, and one per one-way link", () => {
    const map = buildTableMap(
      [t("patients", "Patients"), t("visits", "Visits"), t("staff", "Staff")],
      [
        link("visits", "patient", "patients", "visits"),
        link("patients", "visits", "visits", "patient"),
        link("visits", "dentist", "staff"),
      ],
    );
    expect(map.links).toHaveLength(2);
    expect(map.links.filter((l) => l.twoWay)).toHaveLength(1);
    expect(map.links.find((l) => l.label === "Dentist")).toMatchObject({ from: "visits", to: "staff", twoWay: false });
  });

  it("never draws a line to a table that is not on the map, and counts it on the card instead", () => {
    const map = buildTableMap([t("patients", "Patients")], [link("patients", "insurer", "carriers-elsewhere")]);
    expect(map.links).toHaveLength(0);
    expect(map.groups[0]!.cards[0]!.linksOffMap).toBe(1);
  });

  it("shows only the first key columns, in the table's own order, and not the link columns", () => {
    const fields = ["d", "a", "c", "b", "e"].map((k, i) => col("patients", k, i));
    const map = buildTableMap([t("patients", "Patients")], [...fields, link("patients", "visits", "patients")]);
    const card = map.groups[0]!.cards[0]!;
    expect(card.keyColumns).toEqual(["D", "A", "C"]);
    expect(card.keyColumns).toHaveLength(KEY_COLUMNS);
  });

  it("groups by organization, organizations and cards in name order", () => {
    const map = buildTableMap(
      [t("b", "Jobs", ROOFING, "Titanium Roofing"), t("a", "Patients"), t("c", "Appointments")],
      [],
    );
    expect(map.groups.map((g) => g.organizationName)).toEqual(["Harbor Dental Group", "Titanium Roofing"]);
    expect(map.groups[0]!.cards.map((c) => c.name)).toEqual(["Appointments", "Patients"]);
  });

  it("lays out every card at a distinct fixed position, so nothing moves when counts arrive", () => {
    const map = buildTableMap(["a", "b", "c", "d", "e"].map((id) => t(id, id)), []);
    const { positions } = layoutMap(map);
    const spots = [...positions.values()].map((p) => `${p.x},${p.y}`);
    expect(new Set(spots).size).toBe(5);
    expect(layoutMap(map).positions).toEqual(positions);
  });
});

describe("a table reached two ways is one card (DATA-DEFECTS-1)", () => {
  it("keeps one card, one position and one line for a table the list gave twice", () => {
    const map = buildTableMap(
      [t("patients", "Patients"), t("visits", "Visits"), t("patients", "Patients", ROOFING, "Roofing Co")],
      [link("visits", "patient", "patients"), link("visits", "patient", "patients"), col("patients", "name", 1), col("patients", "name", 1)],
    );
    const ids = map.groups.flatMap((g) => g.cards.map((c) => c.id));
    expect(ids.sort()).toEqual(["patients", "visits"]);
    expect(map.links.map((l) => l.id)).toEqual(["visits:patient"]);
    expect(map.groups.flatMap((g) => g.cards).find((c) => c.id === "patients")?.keyColumns).toEqual(["Name"]);
    const keys = [...layoutMap(map).positions.keys()];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
