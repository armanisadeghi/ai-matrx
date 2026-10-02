/**
 * @jest-environment node
 *
 * (Node's Blob has text() and Node has Web Crypto; jsdom has neither.)
 */
/**
 * A LONG SCOPE VALUE READS WHOLE ON THE STORE PATH (lane 9 SCOPES-ON-THE-STORE, sublane D1, 2026-10-02).
 *
 * The use case: Castellano & Reyes, LLP keeps a workers' compensation matter as a scope; its official
 * QME report is a ~140,000-character text. The record store keeps a value over 100,000 bytes as a
 * file and the cell holds its first 1000 characters; `custom.context_values` names that file beside
 * the row (`whole_value`). The old scope table held the whole report, so the matter page showed it.
 *
 * The break each case names: the adapter hands the screen the 1000-character head as if it were the
 * report (the defect: with the store read switch on, the matter page would show a fraction of the
 * report and nothing saying so); reads the wrong file; accepts a file whose content is not the text
 * the cell points at; or swallows a failed read. The door (Supabase) and the download (the files API)
 * are the network, stubbed with what they answer; the adapter, the mapping and the checks are real.
 */
import { createHash } from "node:crypto";

const REPORT = Array.from(
  { length: 900 },
  (_, i) =>
    `Page ${i + 1}. Panel QME Dr. Miriam Okafor, orthopedic surgery: the applicant's lumbar spine shows ` +
    `L4-L5 disc protrusion; whole person impairment ${8 + (i % 7)}% under the AMA Guides, 5th edition.`,
).join("\n");
const CHRONOLOGY = Array.from(
  { length: 700 },
  (_, i) => `2024-${String((i % 12) + 1).padStart(2, "0")}-14 — Kaiser Permanente Fontana, visit ${i + 1}: modified duty, no lifting over ${10 + (i % 15)} lb.`,
).join("\n");
const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
const MATTER = "2645730c-97a9-4080-9471-2546d0ce2b66";
const FILE_REPORT = "ebad7d37-bde9-5f14-b96f-0e43f2e1fe40";
const FILE_CHRONO = "6f1d2c3b-4a5e-5f60-8172-93a4b5c6d7e8";
const FILE_GONE = "0d4f6a2e-1111-4c3b-8e5f-9a8b7c6d5e4f";

const FILES: Record<string, string> = { [FILE_REPORT]: REPORT, [FILE_CHRONO]: CHRONOLOGY };

function pointer(text: string, fileId: string, overrides: Record<string, unknown> = {}) {
  return {
    kind: "whole_value_in_file",
    file_id: fileId,
    file_record: "a35cffb2-b5da-4305-8c02-58e9fa84f0d5",
    bytes: Buffer.byteLength(text, "utf8"),
    chars: [...text].length,
    sha256: sha(text),
    shown_chars: 1000,
    mime: "text/plain; charset=utf-8",
    ...overrides,
  };
}
function row(key: string, itemId: string, value: string, whole?: Record<string, unknown>) {
  return {
    scope_id: MATTER,
    context_item_id: itemId,
    key,
    value,
    field: { type: "text", multi: false },
    version: 4,
    set_at: "2026-09-25T09:12:24Z",
    source_type: "manual",
    value_id: null,
    ...(whole ? { whole_value: whole } : {}),
  };
}

let ROWS: ReturnType<typeof row>[] = [];
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: (name: string) => {
      if (name !== "custom") throw new Error(`the ${name} schema was read`);
      return {
        rpc: (door: string) => {
          if (door !== "context_values") throw new Error(`unexpected door ${door}`);
          return Promise.resolve({ data: ROWS, error: null });
        },
      };
    },
  },
}));
jest.mock("@/features/files/api/files", () => ({ downloadFile: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { downloadFile } = require("@/features/files/api/files") as { downloadFile: jest.Mock };

// eslint-disable-next-line import/first
import { readContextValues } from "../storeScopeReads";

beforeEach(() => {
  downloadFile.mockReset();
  downloadFile.mockImplementation(async (fileId: string) => {
    const text = FILES[fileId];
    if (text === undefined) throw new Error("404 Not Found: file is not there to read");
    return { blob: new Blob([new TextEncoder().encode(text)]), filename: `${fileId}.txt`, meta: {} };
  });
});

async function valuesOf(rows: ReturnType<typeof row>[]) {
  ROWS = rows;
  const answer = await readContextValues([MATTER]);
  if (!answer.ok) throw new Error(`refused: ${JSON.stringify(answer)}`);
  return new Map(answer.data.map((v) => [v.context_item_id, v.value_text]));
}

describe("a value kept as a file", () => {
  it.each([
    ["official_qme_report", "054c12b6-fac9-45b3-a022-5cedc24ed2b2", REPORT, FILE_REPORT],
    ["body_parts_in_records", "6ecdd61e-1477-4216-8933-780ad46cc93f", CHRONOLOGY, FILE_CHRONO],
  ])("reads %s whole from its file, never its first 1000 characters", async (key, itemId, text, fileId) => {
    const got = await valuesOf([row(key, itemId, text.slice(0, 1000), pointer(text, fileId))]);
    expect(got.get(itemId)).toBe(text);
    expect(downloadFile).toHaveBeenCalledWith(fileId);
  });

  it("reads one file once for two cells that name it", async () => {
    await valuesOf([
      row("official_qme_report", "054c12b6-fac9-45b3-a022-5cedc24ed2b2", REPORT.slice(0, 1000), pointer(REPORT, FILE_REPORT)),
      row("qme_report_copy", "d2e57968-c1b2-4ac1-99bb-955c338ebdcf", REPORT.slice(0, 1000), pointer(REPORT, FILE_REPORT)),
    ]);
    expect(downloadFile).toHaveBeenCalledTimes(1);
  });

  it("names the file and the reason when the file cannot be read, never the head alone", async () => {
    const got = await valuesOf([
      row("official_qme_report", "054c12b6-fac9-45b3-a022-5cedc24ed2b2", REPORT.slice(0, 1000), pointer(REPORT, FILE_GONE)),
    ]);
    const shown = got.get("054c12b6-fac9-45b3-a022-5cedc24ed2b2")!;
    expect(shown.startsWith(REPORT.slice(0, 1000))).toBe(true);
    expect(shown).toContain(`kept as file ${FILE_GONE}`);
    expect(shown).toContain("404 Not Found");
  });

  it("refuses a file whose content is not the text the cell points at", async () => {
    // the chronology's file, under a pointer that names the report's size and hash
    const got = await valuesOf([
      row("official_qme_report", "054c12b6-fac9-45b3-a022-5cedc24ed2b2", REPORT.slice(0, 1000),
        pointer(REPORT, FILE_CHRONO)),
    ]);
    const shown = got.get("054c12b6-fac9-45b3-a022-5cedc24ed2b2")!;
    expect(shown).not.toBe(CHRONOLOGY);
    expect(shown).toContain(`kept as file ${FILE_CHRONO}`);
  });

  it("refuses a file of the right length whose SHA-256 differs", async () => {
    const forged = REPORT.replace("Okafor", "Okafar"); // same length, different text
    FILES[FILE_GONE] = forged;
    try {
      const got = await valuesOf([
        row("official_qme_report", "054c12b6-fac9-45b3-a022-5cedc24ed2b2", REPORT.slice(0, 1000), pointer(REPORT, FILE_GONE)),
      ]);
      expect(got.get("054c12b6-fac9-45b3-a022-5cedc24ed2b2")).toContain("is not the text the cell points at");
    } finally {
      delete FILES[FILE_GONE];
    }
  });

  it("says a text still waiting for its file is still being saved", async () => {
    const got = await valuesOf([
      row("treating_facility", "ef904586-d5e2-4ea0-87d1-760c78bf5ba1", CHRONOLOGY.slice(0, 1000),
        { kind: "whole_value_in_file", pending: true, chars: [...CHRONOLOGY].length, sha256: sha(CHRONOLOGY) }),
    ]);
    const shown = got.get("ef904586-d5e2-4ea0-87d1-760c78bf5ba1")!;
    expect(shown.startsWith(CHRONOLOGY.slice(0, 1000))).toBe(true);
    expect(shown).toContain("still being saved");
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it("keeps a text the door already answered whole, and a value held whole in its cell, untouched", async () => {
    const discrepancy = "QME discrepancy analysis: the panel report rates 12% WPI; the treating physician's PR-4 rates 7%.";
    const got = await valuesOf([
      row("treating_facility", "ef904586-d5e2-4ea0-87d1-760c78bf5ba1", CHRONOLOGY,
        { kind: "whole_value_in_file", pending: true, in_value: true, chars: [...CHRONOLOGY].length }),
      row("qme_discrepancy_analysis", "b56e062d-3a24-471a-b18e-37c31a33b374", discrepancy),
    ]);
    expect(got.get("ef904586-d5e2-4ea0-87d1-760c78bf5ba1")).toBe(CHRONOLOGY);
    expect(got.get("b56e062d-3a24-471a-b18e-37c31a33b374")).toBe(discrepancy);
    expect(downloadFile).not.toHaveBeenCalled();
  });
});
