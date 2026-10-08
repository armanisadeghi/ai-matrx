import { MOCK_FIELD_MAP } from "./mocks/mockDoor";
import { formatDate, nextField, readEnvelope, readMap, requiredUnits, screenPatch, shownValue } from "./model";
import { Autosaver } from "./autosave";

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
