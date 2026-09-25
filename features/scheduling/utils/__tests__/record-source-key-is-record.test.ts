/**
 * A RECORD-STORE TABLE'S CHANGES ARE `record:<table id>` EVENTS (lane SOURCE-KEY).
 * Harbor Point Plumbing's "Service calls" table: a new schedule on it is saved under
 * `record:<id>`; one saved by an older client under `custom_record:<id>` is read as the same
 * table and re-saved under the new key; the older store's `user_table_row` is left alone.
 */
import { isRecordSourceKey, recordSourceKey, recordSourceTable, toRecordSourceKey } from "../recordSourceKey";
import { humanizeTrigger } from "../triggerHumanize";

const SERVICE_CALLS = "dbc7cd48-7b46-4402-ac9d-e459a95f4598";

it("writes record:<table id>", () => {
  expect(recordSourceKey(SERVICE_CALLS)).toBe(`record:${SERVICE_CALLS}`);
});

it("reads both keys, and nothing else, as a record-store table", () => {
  expect(recordSourceTable(`record:${SERVICE_CALLS}`)).toBe(SERVICE_CALLS);
  expect(recordSourceTable(`custom_record:${SERVICE_CALLS}`)).toBe(SERVICE_CALLS);
  expect(isRecordSourceKey("user_table_row")).toBe(false);
  expect(isRecordSourceKey("record:Service calls")).toBe(false);
  expect(isRecordSourceKey(undefined)).toBe(false);
});

it("turns an older client's key into the new one and leaves every other key alone", () => {
  expect(toRecordSourceKey(`custom_record:${SERVICE_CALLS}`)).toBe(`record:${SERVICE_CALLS}`);
  expect(toRecordSourceKey(`record:${SERVICE_CALLS}`)).toBe(`record:${SERVICE_CALLS}`);
  expect(toRecordSourceKey("user_table_row")).toBe("user_table_row");
});

it("a schedule list says the same sentence for either key", () => {
  for (const entity_type of [`record:${SERVICE_CALLS}`, `custom_record:${SERVICE_CALLS}`]) {
    expect(humanizeTrigger("event", { entity_type, actions: ["record.updated"], changed_fields: ["status"] })).toBe(
      "When a table row changes (status)",
    );
  }
});
