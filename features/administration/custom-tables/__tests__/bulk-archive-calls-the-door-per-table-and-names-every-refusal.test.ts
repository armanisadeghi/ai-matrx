// The admin Custom Tables bulk "Archive" (lane ONE-HOME, wave 6): every selected table goes through
// `custom.table_archive` itself — once per table, pass after pass until the door says done — and a
// table the door refuses is reported BY NAME with the door's own sentence while the others carry on.
// The door here is a recorder standing in for PostgREST; what it answers is the shape the live
// function returns (custom.table_archive → jsonb with archived / remaining / done).

import {
  ARCHIVE_CHUNK,
  archiveTables,
  protectionOf,
  type ArchiveTarget,
  type DoorAnswer,
  type CustomTableRow,
  type TableArchiveDoor,
} from "../archiveTables";

const ORG = "884d1ce8-0000-4000-8000-000000000001";
const parts: ArchiveTarget = { tableId: "t-parts", organizationId: ORG, name: "Rincon Plumbing — Parts Reorders" };
const trucks: ArchiveTarget = { tableId: "t-trucks", organizationId: ORG, name: "Rincon Plumbing — Truck Stock" };
const locked: ArchiveTarget = { tableId: "t-locked", organizationId: "other-org", name: "Harbor Dental — Recall List" };

function recordingDoor(script: Record<string, DoorAnswer[]>) {
  const calls: Parameters<TableArchiveDoor>[0][] = [];
  const door: TableArchiveDoor = async (args) => {
    calls.push(args);
    const queue = script[args.p_table_id];
    const next = queue?.shift();
    if (!next) throw new Error(`unexpected extra call for ${args.p_table_id}`);
    return next;
  };
  return { door, calls };
}

const pass = (id: string, archived: number, remaining: number, done: boolean): DoorAnswer => ({
  ok: true,
  data: { table_id: id, archived, remaining, done },
});

describe("bulk archive goes through custom.table_archive, table by table", () => {
  it("calls the door for every table, loops a big table until done, and names the refusal", async () => {
    const { door, calls } = recordingDoor({
      "t-parts": [pass("t-parts", 50, 20, false), pass("t-parts", 20, 0, true)],
      "t-locked": [{ ok: false, error: { code: "42501", message: "You do not have access to this table, so custom.table_archive may not write to it." } }],
      "t-trucks": [pass("t-trucks", 3, 0, true)],
    });

    const outcomes = await archiveTables([parts, locked, trucks], door);

    // Every table reached the door, each with its own organization, the door's pass size and the table included.
    expect(calls.map((c) => c.p_table_id)).toEqual(["t-parts", "t-parts", "t-locked", "t-trucks"]);
    expect(calls[2]).toEqual({ p_organization_id: "other-org", p_table_id: "t-locked", p_chunk: ARCHIVE_CHUNK, p_include_table: true });

    expect(outcomes).toEqual([
      { status: "archived", target: parts, records: 70 },
      {
        status: "refused",
        target: locked,
        records: 0,
        message: "You do not have access to this table, so custom.table_archive may not write to it.",
      },
      { status: "archived", target: trucks, records: 3 },
    ]);
  });

  it("reports a pass that moves nothing and does not finish, instead of looping or claiming success", async () => {
    const { door } = recordingDoor({
      "t-parts": [{ ok: true, data: { table_id: "t-parts", archived: 0, remaining: 4, done: false, message: "4 records left." } }],
    });
    const [outcome] = await archiveTables([parts], door);
    expect(outcome).toEqual({ status: "refused", target: parts, records: 0, message: "4 records left." });
  });

  // Break caught: treating a pass that archived only what is built on the table (archived 0,
  // built_on_archived > 0 — TABLE-ACTIONS 2026-10-03) as a stall, so a table with forms never finishes.
  it.each([
    { builtOn: 3, records: 2, firstBuiltOn: 0 },
    { builtOn: 1, records: 0, firstBuiltOn: 2 },
  ])("carries on through a pass that archived only $builtOn thing(s) built on the table", async ({ builtOn, records, firstBuiltOn }) => {
    const { door, calls } = recordingDoor({
      "t-parts": [
        { ok: true, data: { table_id: "t-parts", archived: records, built_on_archived: firstBuiltOn, remaining: 0, done: false, message: "records gone." } },
        { ok: true, data: { table_id: "t-parts", archived: 0, built_on_archived: builtOn, remaining: 0, done: false, message: "forms going." } },
        { ok: true, data: { table_id: "t-parts", archived: 0, built_on_archived: 0, remaining: 0, done: true, table_archived: true } },
      ],
    });
    const [outcome] = await archiveTables([parts], door);
    expect(outcome).toEqual({ status: "archived", target: parts, records });
    expect(calls).toHaveLength(3);
  });

  it("a door that throws is a refusal with its sentence, not a crash of the whole run", async () => {
    const door: TableArchiveDoor = async (args) => {
      if (args.p_table_id === "t-parts") throw new Error("Failed to fetch");
      return pass(args.p_table_id, 0, 0, true);
    };
    const outcomes = await archiveTables([parts, trucks], door);
    expect(outcomes.map((o) => o.status)).toEqual(["refused", "archived"]);
    expect(outcomes[0]).toMatchObject({ message: "Failed to fetch" });
  });
});

describe("tables the platform keeps are never offered", () => {
  const row = (over: Partial<CustomTableRow>): CustomTableRow => ({
    id: "x",
    name: "Records Lane Probe 1a2b3c4d",
    organizationId: "39c38960-d30c-4840-b0c1-c9960de95582",
    organizationName: "Matrx System",
    updatedAt: null,
    system: true,
    platformOwned: false,
    ...over,
  });

  it("probe debris is selectable; kept, code-named and Example seed tables are not", () => {
    expect(protectionOf(row({}))).toBeNull();
    expect(protectionOf(row({ platformOwned: true }))).toBe("kept");
    // Parity Floor: platform table that neither keeper signal marks, named by code.
    expect(protectionOf(row({ id: "11111111-0005-4000-8000-000000000003", name: "Parity Floor" }))).toBe("named-in-code");
    // admin's Workspace — Rincon Plumbing — Customers: the safety nets' fixture.
    expect(protectionOf(row({ id: "415c3e23-2f90-4c66-9040-b246fa1c4b36", system: false }))).toBe("named-in-code");
    expect(protectionOf(row({ id: "30374c26-f16d-4e78-ab12-01495f86b954", name: "Example: Project Tracker" }))).toBe("platform-example");
  });
});
