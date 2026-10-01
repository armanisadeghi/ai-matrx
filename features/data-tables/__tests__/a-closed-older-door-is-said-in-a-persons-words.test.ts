/**
 * A CLOSED OLDER DOOR IS SAID IN A PERSON'S WORDS (lane POST-PRESS-SENTENCES, 2026-10-01).
 *
 * The final switch's press revokes EXECUTE on the 23 older data-table write doors from every
 * browser. Safety net B (C04/W6, B8) saw what a signed-in caller then gets: PostgREST's raw
 * `42501 permission denied for function add_data_row_to_user_table`. The planted 42501 here is
 * that exact answer, for EVERY door the press closes — read from the press's own campaign file,
 * so the list here and the press can never differ.
 *
 * RED before this lane: `refused()` passed `error.message` through, so `upsertCell` answered the
 * raw "permission denied for function udt_upsert_cell".
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { movedDoorRefusal, olderDoorError, MovedTableError } from "../moved-door-refusal";
import { upsertCell, archiveTable } from "../service";

const TABLE = "4a7c2e10-8f5b-4d0e-9b61-2c3d4e5f6a71";
const CAMPAIGN = join(
  __dirname,
  "../../../migrations/campaign/finalswitch_one_press_switches_every_organization_and_one_undo_reverses_it.sql",
);

function pressedDoors(): string[] {
  const sql = readFileSync(CAMPAIGN, "utf8");
  const block = sql.split("-- OLD-WRITE-DOORS-BEGIN")[1].split("-- OLD-WRITE-DOORS-END")[0];
  return [...block.matchAll(/'public\.([a-z_]+)\(/g)].map((m) => m[1]);
}

const closed = (door: string) => ({ code: "42501", message: `permission denied for function ${door}` });
const RAW = /permission denied|42501|function [a-z_]+/i;

describe("a closed older door", () => {
  beforeEach(() => rpc.mockReset());

  it("reads the press's list (23 doors)", () => {
    expect(pressedDoors()).toHaveLength(23);
  });

  it.each(pressedDoors())("%s → the moved sentence, never the raw permission error", (door) => {
    const said = movedDoorRefusal(closed(door), TABLE);
    expect(said).not.toBeNull();
    expect(said!.message).not.toMatch(RAW);
    expect(said!.message).toMatch(/new system/);
    if (!door.startsWith("create_")) expect(said!.message).toContain(`/data/${TABLE}`);
  });

  it("leaves a 42501 from any other function alone", () => {
    expect(movedDoorRefusal(closed("record_write"), TABLE)).toBeNull();
    expect(movedDoorRefusal({ code: "42501", message: "permission denied for table udt_datasets" }, TABLE)).toBeNull();
    expect(movedDoorRefusal({ code: "23514", message: "permission denied for function udt_upsert_cell" }, TABLE)).toBeNull();
  });

  it("the service door answers the sentence with the table's address (upsertCell)", async () => {
    rpc.mockResolvedValue({ data: null, error: closed("udt_upsert_cell") });
    const got = await upsertCell({ tableId: TABLE, rowId: "r1", fieldName: "status", value: "Open" } as never);
    expect(got.success).toBe(false);
    if (got.success) return;
    expect(got.error).not.toMatch(RAW);
    expect(got.error).toContain(`/data/${TABLE}`);
    expect(got.refusal?.message).toBe(got.error);
  });

  it("the service door answers the sentence with the table's address (archiveTable)", async () => {
    rpc.mockResolvedValue({ data: null, error: closed("delete_user_table") });
    const got = await archiveTable(TABLE);
    expect(got.success).toBe(false);
    if (!got.success) expect(got.error).toContain(`/data/${TABLE}`);
  });

  it("a thrown one carries only the sentence", () => {
    const e = olderDoorError(closed("update_user_table_metadata"), TABLE);
    expect(e).toBeInstanceOf(MovedTableError);
    expect((e as Error).message).not.toMatch(RAW);
    const other = { code: "42501", message: "permission denied for function record_write" };
    expect(olderDoorError(other, TABLE)).toBe(other);
  });
});
