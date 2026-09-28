/**
 * THE USE CASE (lane HANDOVER, 2026-09-27). Asked to add a room to Cedar Ridge Physical Therapy's
 * Treatment Rooms, the assistant first listed the organization's tables, and the line under
 * "Worked with records · table list" read "11 records." — it had counted tables. A count now names
 * what the verb counted.
 */
import { expect, it, jest } from "@jest/globals";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

import { RecordsInline } from "../RecordsInline";

function said(result: Record<string, unknown>): string {
  const entry = { callId: "c", toolName: "records", status: "completed", result, arguments: {}, events: [] };
  return renderToStaticMarkup(<RecordsInline entry={entry as never} />).replace(/<[^>]+>/g, "");
}

it("a table list counts tables, a search counts matches, a read counts records", () => {
  expect(said({ action: "table_list", count: 11, tables: [] })).toBe("11 tables.");
  expect(said({ action: "table_list", count: 1, tables: [] })).toBe("1 table.");
  expect(said({ action: "metadata_search", count: 3, matches: [] })).toBe("3 matches.");
  expect(said({ action: "record_read", count: 1, rows: [] })).toBe("1 record.");
});
