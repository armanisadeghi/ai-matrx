/**
 * Access ladder T-40: one table row, seen from outside its organization (public page, Anyone
 * link, person share). The database decides which fields leave the store; these tests hold the
 * web side to drawing exactly what it was handed, with dates worded from the stored string (so
 * the server render and the browser never disagree), and to the lens being registered.
 */
import { renderToStaticMarkup } from "react-dom/server";
import {
  readSharedRecord,
  readSharedRecordChildren,
  wordDateValue,
  wordFieldValue,
} from "@/features/sharing/lenses/record-fields";
import { RecordFieldsView } from "@/features/sharing/lenses/record-fields-view";
import { resolveShareLens } from "@/features/sharing/lenses/registry";
import { resolveShareLensMeta } from "@/features/sharing/lenses/metadata";
import type { ResolvedShareToken } from "@/utils/permissions/shareLinks";

// The shape public.record_public_view / platform.share_link_children return (taken from a
// clone run on a real Appointments row: its Confidential label and complaint were not in it).
const projection = {
  id: "f9806297-1bd0-4142-8d3f-7048835f5437",
  table: { name: "Appointments", label_singular: "Appointment" },
  title: "Appointment",
  fields: [
    { key: "visit_type", type: "list", unit: null, label: "Visit type", value: "Follow-up", format: null },
    { key: "slot", type: "range", unit: null, label: "Visit time", value: "2026-10-05T10:40:00-04:00", format: "datetime" },
    { key: "status", type: "list", unit: null, label: "Status", value: "Confirmed", format: null },
    { key: "copay", type: "range", unit: "USD", label: "Copay", value: 25, format: null },
  ],
  updated_at: "2026-10-03T11:08:18.810284+00:00",
};

describe("a table row seen from outside its organization", () => {
  it("reads the projection and words each value from what was stored", () => {
    const record = readSharedRecord(projection)!;
    expect(record.title).toBe("Appointment");
    expect(record.labelSingular).toBe("Appointment");
    expect(record.fields.map((f) => wordFieldValue(f))).toEqual([
      "Follow-up",
      "Oct 5, 2026, 10:40 AM",
      "Confirmed",
      "25 USD",
    ]);
  });

  it("words a date-only value with no clock time and no zone shift", () => {
    expect(wordDateValue("2026-01-01")).toBe("Jan 1, 2026");
    expect(wordDateValue("2026-10-05T00:05:00Z")).toBe("Oct 5, 2026, 12:05 AM");
    expect(wordDateValue("not a date")).toBeNull();
  });

  it("draws exactly the fields it was handed, server-rendered", () => {
    const html = renderToStaticMarkup(<RecordFieldsView record={readSharedRecord(projection)!} heading />);
    expect(html).toContain("Visit type");
    expect(html).toContain("Oct 5, 2026, 10:40 AM");
    expect(html).not.toContain("Delgado");
    expect(html).not.toContain("chief_complaint");
  });

  it("an Anyone link to a row renders through its own lens and names it by its title", () => {
    const result = {
      success: true,
      resourceType: "record",
      resourceId: projection.id,
      resource: { id: projection.id },
      children: { kind: "record_fields", record: projection },
    } as unknown as ResolvedShareToken;
    expect(readSharedRecordChildren(result.children)?.id).toBe(projection.id);
    const html = renderToStaticMarkup(<>{resolveShareLens("record")({ result, token: "t" })}</>);
    expect(html).toContain('data-shared-record="f9806297-1bd0-4142-8d3f-7048835f5437"');
    expect(html).toContain("Visit time");
    expect(resolveShareLensMeta(result).title).toBe("Appointment");
  });

  it("says so in place when a link carries no row", () => {
    const result = { success: true, resourceType: "record", children: null } as unknown as ResolvedShareToken;
    const html = renderToStaticMarkup(<>{resolveShareLens("record")({ result, token: "t" })}</>);
    expect(html).toContain("nothing to show here");
  });
});
