import type { FieldMapV2 } from "../contract/fieldModel";
import { formatDate, nextField, readEnvelope, readMap, requiredUnits, screenPatch, shownValue } from "./model";
import { Autosaver } from "./autosave";

// One field of every kind on a two-page document, a second signer, and a radio group — the map the
// dev demo used before it was retired (esign-parity §17 step 5).
const ME = "signer-me";
const CLINIC = "signer-clinic";

function f(
  id: string,
  kind: FieldMapV2["fields"][number]["kind"],
  page: number,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<FieldMapV2["fields"][number]> = {},
): FieldMapV2["fields"][number] {
  return { id, kind, signer_id: ME, page, x, y, w, h, required: true, label: "", ...extra };
}

export const MOCK_FIELD_MAP: FieldMapV2 = {
  schema_version: 2,
  fields: [
    f("f-name", "full_name", 1, 0.215, 0.228, 0.31, 0.026, { label: "Full name" }),
    f("f-email", "email", 1, 0.18, 0.258, 0.35, 0.026, { label: "Email" }),
    f("f-company", "company", 1, 0.205, 0.288, 0.33, 0.026, { label: "Company", required: false }),
    f("f-dob", "date", 1, 0.235, 0.318, 0.24, 0.026, { label: "Date of birth", date_format: "MM/DD/YYYY" }),
    f("f-visits", "number", 1, 0.345, 0.348, 0.16, 0.026, {
      label: "Visits per year",
      number: { min: 0, max: 52, decimals: 0 },
      required: false,
    }),
    f("f-r-phone", "radio", 1, 0.286, 0.43, 0.022, 0.018, { label: "Phone", group_id: "g-contact", option_value: "Phone" }),
    f("f-r-email", "radio", 1, 0.383, 0.43, 0.022, 0.018, { label: "Email", group_id: "g-contact", option_value: "Email" }),
    f("f-r-text", "radio", 1, 0.473, 0.43, 0.022, 0.018, { label: "Text", group_id: "g-contact", option_value: "Text" }),
    f("f-remind", "checkbox", 1, 0.444, 0.46, 0.022, 0.018, { label: "Visit reminders", required: false }),
    f("f-location", "dropdown", 1, 0.28, 0.49, 0.3, 0.026, {
      label: "Preferred location",
      options: ["Downtown", "Riverside", "North Hills", "Telehealth"],
    }),
    f("f-notes", "text", 1, 0.118, 0.565, 0.6, 0.06, {
      label: "Notes for the care team",
      multiline: true,
      max_length: 500,
      placeholder: "Allergies, access needs, anything we should know",
      required: false,
    }),
    f("f-init-1", "initials", 1, 0.478, 0.678, 0.08, 0.032, { label: "Initials 1" }),
    f("f-privacy", "checkbox", 2, 0.37, 0.18, 0.022, 0.018, { label: "Privacy notice" }),
    f("f-sign", "signature", 2, 0.273, 0.226, 0.3, 0.045, { label: "Signature 1" }),
    f("f-date", "date_signed", 2, 0.6, 0.235, 0.16, 0.026, { label: "Date signed", date_format: "MM/DD/YY" }),
    f("f-init-2", "initials", 2, 0.19, 0.295, 0.08, 0.032, { label: "Initials 2" }),
    { ...f("c-sign", "signature", 2, 0.33, 0.377, 0.28, 0.045, { label: "Signature" }), signer_id: CLINIC },
    { ...f("c-date", "date_signed", 2, 0.6, 0.386, 0.16, 0.026, { label: "Date signed" }), signer_id: CLINIC },
  ],
  groups: [{ id: "g-contact", kind: "radio", signer_id: ME, label: "Preferred contact", required: true }],
};

const me = { id: "signer-me", full_name: "Jordan Avery Blake", email: "jordan@example.com", acts_for: ["signer-me"], color_index: 0, field_values: {} };

function envelope() {
  return readEnvelope({
    me,
    documents: [{ id: "d", name: "D", position: 0, content_hash: "", page_count: 2, mime_type: "application/pdf", field_map: MOCK_FIELD_MAP }],
  });
}

describe("readMap", () => {
  it("reads a v1 map as v2: every field required, labelled from its kind", () => {
    const { fields } = readMap({
      fields: [
        { id: "a", signer_id: "s", kind: "signature", page: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.05 },
        { id: "b", signer_id: "s", kind: "signature", page: 1, x: 0.1, y: 0.5, w: 0.2, h: 0.05 },
      ],
    });
    expect(fields.map((f) => [f.label, f.required])).toEqual([
      ["Signature 1", true],
      ["Signature 2", true],
    ]);
  });
});

describe("requiredUnits", () => {
  it("counts a radio group once, skips optional and prefilled-from-recipient fields", () => {
    const { fields, groups } = envelope();
    const { total, open } = requiredUnits(fields, groups, {}, me);
    // dob, contact group, location, initials 1, privacy, signature, initials 2 (name + email prefilled)
    expect(open.length).toBe(7);
    expect(total.length).toBe(9);
    const done = requiredUnits(fields, groups, { "f-r-text": true }, me);
    expect(done.open.some((u) => u.key === "group:g-contact")).toBe(false);
  });

  it("an emptied prefilled name field counts as open again", () => {
    const { fields, groups } = envelope();
    expect(requiredUnits(fields, groups, { "f-name": "" }, me).open.some((u) => u.key === "f-name")).toBe(true);
  });
});

describe("nextField", () => {
  it("moves in reading order to the next empty field and wraps", () => {
    const { fields } = envelope();
    expect(nextField(fields, null, {}, me)?.id).toBe("f-company");
    expect(nextField(fields, "f-init-2", {}, me)?.id).toBe("f-company");
  });
});

describe("screenPatch", () => {
  it("sends every field the signer fills, with the value on screen", () => {
    const { fields } = envelope();
    const patch = screenPatch(fields, { "f-dob": "1988-04-15" }, me, 7);
    expect(patch["f-name"]).toEqual({ v: "Jordan Avery Blake", seq: 7 });
    expect(patch["f-dob"]).toEqual({ v: "1988-04-15", seq: 7 });
    expect(patch["c-sign"]).toBeUndefined();
    expect(patch["f-date"]).toBeUndefined();
  });

  it("shows the sender's locked prefill over anything entered", () => {
    const field = { ...MOCK_FIELD_MAP.fields[0], read_only: true, prefill: "Locked" };
    expect(shownValue(field, { [field.id]: "typed" }, me)).toBe("Locked");
  });
});

describe("formatDate", () => {
  it("writes every contract format", () => {
    const d = { y: 2026, m: 10, d: 7 };
    expect(formatDate(d, "MM/DD/YY")).toBe("10/07/26");
    expect(formatDate(d, "MM/DD/YYYY")).toBe("10/07/2026");
    expect(formatDate(d, "DD/MM/YYYY")).toBe("07/10/2026");
    expect(formatDate(d, "MMM D, YYYY")).toBe("Oct 7, 2026");
    expect(formatDate(d, "D MMM YYYY")).toBe("7 Oct 2026");
    expect(formatDate(d, "YYYY-MM-DD")).toBe("2026-10-07");
  });
});

describe("Autosaver", () => {
  it("keeps one save in flight and sends edits made meanwhile in the next, newest per field", async () => {
    jest.useFakeTimers();
    const sent: Array<Record<string, { v: unknown; seq: number }>> = [];
    let release: (() => void) | null = null;
    const saver = new Autosaver({
      save: (patch) => {
        sent.push(patch);
        return new Promise((resolve) => {
          release = () => resolve({ values_saved_at: "now", current: {} });
        });
      },
      onAdopt: () => {},
      onState: () => {},
      onRefused: () => false,
    });
    saver.edit("a", "ab");
    jest.advanceTimersByTime(700);
    expect(sent.length).toBe(1);
    saver.edit("a", "abc");
    saver.edit("b", "x");
    jest.advanceTimersByTime(700);
    expect(sent.length).toBe(1); // single-flight: nothing new while the first save is out
    release!();
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(700);
    expect(sent.length).toBe(2);
    expect(sent[1].a.v).toBe("abc");
    expect(sent[1].b.v).toBe("x");
    expect(sent[1].a.seq).toBeGreaterThan(sent[0].a.seq);
    jest.useRealTimers();
  });
});
