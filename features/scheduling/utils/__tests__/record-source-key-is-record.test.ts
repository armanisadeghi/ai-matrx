/**
 * A RECORD-STORE TABLE'S CHANGES ARE `record:<table id>` EVENTS (lane SOURCE-KEY, closed
 * 2026-09-25). Harbor Point Plumbing's "Service calls" table: a schedule on it is saved under
 * `record:<id>`. The retired `custom_record:<id>` key is no longer recognized at all — the store
 * refuses it on write (23514) and no live row carries it, so the client's last acceptance of it
 * (this file) is retired too; the older store's `user_table_row` is left alone.
 */
import { isRecordSourceKey, recordSourceKey, recordSourceTable, toRecordSourceKey } from "../recordSourceKey";
import { humanizeTrigger } from "../triggerHumanize";

const SERVICE_CALLS = "dbc7cd48-7b46-4402-ac9d-e459a95f4598";

it("writes record:<table id>", () => {
  expect(recordSourceKey(SERVICE_CALLS)).toBe(`record:${SERVICE_CALLS}`);
});

it("reads record:<table id>, and nothing else, as a record-store table", () => {
  expect(recordSourceTable(`record:${SERVICE_CALLS}`)).toBe(SERVICE_CALLS);
  expect(recordSourceTable(`custom_record:${SERVICE_CALLS}`)).toBe(null);
  expect(isRecordSourceKey("user_table_row")).toBe(false);
  expect(isRecordSourceKey("record:Service calls")).toBe(false);
  expect(isRecordSourceKey(undefined)).toBe(false);
});

it("passes every key through unchanged — the retired custom_record: key is no longer rewritten", () => {
  expect(toRecordSourceKey(`record:${SERVICE_CALLS}`)).toBe(`record:${SERVICE_CALLS}`);
  expect(toRecordSourceKey(`custom_record:${SERVICE_CALLS}`)).toBe(`custom_record:${SERVICE_CALLS}`);
  expect(toRecordSourceKey("user_table_row")).toBe("user_table_row");
});

it("a schedule list humanizes the live key", () => {
  expect(
    humanizeTrigger("event", {
      entity_type: `record:${SERVICE_CALLS}`,
      actions: ["record.updated"],
      changed_fields: ["status"],
    }),
  ).toBe("When a table row changes (status)");
});
