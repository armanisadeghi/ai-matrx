/**
 * @jest-environment node
 *
 * (Node's Blob has text() and Node has Web Crypto; jsdom has neither.)
 */
/**
 * A SCOPE VALUE THAT WAS NOT READ WHOLE SAYS SO ON THE CELL (lane 9 SCOPES-ON-THE-STORE, D1 follow-up).
 *
 * Use case: Castellano & Reyes' workers' compensation matter; its official QME report (~140,000
 * characters) is kept as a file and the cell holds the first 1000. When the adapter cannot hand the
 * whole text it hands the first words plus a sentence — and the cell must carry `value_incomplete`
 * so every editor knows saving it back would cut the real report (the write guard's own test is
 * redux/thunks/__tests__/a-value-not-read-whole-is-never-saved-back.test.ts).
 *
 * The breaks: a fallback cell without the marker (today's adapter); a whole read wrongly marked;
 * and with no Web Crypto in the runtime, the SHA-256 check silently skipped so a forged file of the
 * right length is handed as the report. The door and the download are stubbed; the adapter is real.
 */
import { createHash } from "node:crypto";

const REPORT = Array.from(
  { length: 900 },
  (_, i) =>
    `Page ${i + 1}. Panel QME Dr. Miriam Okafor, orthopedic surgery: the applicant's lumbar spine shows ` +
    `L4-L5 disc protrusion; whole person impairment ${8 + (i % 7)}% under the AMA Guides, 5th edition.`,
).join("\n");
const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
const MATTER = "2645730c-97a9-4080-9471-2546d0ce2b66";
const ITEM = "054c12b6-fac9-45b3-a022-5cedc24ed2b2";
const FILE_REPORT = "ebad7d37-bde9-5f14-b96f-0e43f2e1fe40";
const FILE_FORGED = "7a2c9e41-3b5d-4f6a-8c1e-2d3f4a5b6c7d";
const FILE_GONE = "0d4f6a2e-1111-4c3b-8e5f-9a8b7c6d5e4f";
const FORGED = REPORT.replace("Okafor", "Okafar"); // same length, different text
const FILES: Record<string, string> = { [FILE_REPORT]: REPORT, [FILE_FORGED]: FORGED };

function pointer(fileId: string | null, extra: Record<string, unknown> = {}) {
  return {
    kind: "whole_value_in_file",
    ...(fileId ? { file_id: fileId } : { pending: true }),
    bytes: Buffer.byteLength(REPORT, "utf8"),
    chars: [...REPORT].length,
    sha256: sha(REPORT),
    shown_chars: 1000,
    ...extra,
  };
}
function row(whole: Record<string, unknown>) {
  return {
    scope_id: MATTER, context_item_id: ITEM, key: "official_qme_report", value: REPORT.slice(0, 1000),
    field: { type: "text", multi: false }, version: 4, set_at: "2026-09-25T09:12:24Z",
    source_type: "manual", value_id: null, whole_value: whole,
  };
}

let ROWS: ReturnType<typeof row>[] = [];
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({ rpc: () => Promise.resolve({ data: ROWS, error: null }) }),
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

async function cellOf(whole: Record<string, unknown>) {
  ROWS = [row(whole)];
  const answer = await readContextValues([MATTER]);
  if (!answer.ok) throw new Error(`refused: ${JSON.stringify(answer)}`);
  return answer.data[0];
}

describe("a cell that holds only the start of its value", () => {
  it.each([
    ["the file is gone", FILE_GONE, FILE_GONE],
    ["the file is still being saved", null, null],
    ["the file is not the text the cell points at", FILE_FORGED, FILE_FORGED],
  ])("carries value_incomplete when %s", async (_why, fileId, namedFile) => {
    const cell = await cellOf(pointer(fileId));
    expect(cell.value_text).not.toBe(REPORT);
    expect(cell.value_incomplete).toEqual({ head: REPORT.slice(0, 1000), chars: [...REPORT].length, file_id: namedFile });
  });

  it("carries no marker when the file was read whole", async () => {
    const cell = await cellOf(pointer(FILE_REPORT));
    expect(cell.value_text).toBe(REPORT);
    expect(cell.value_incomplete ?? null).toBeNull();
  });
});

describe("a runtime without Web Crypto", () => {
  const realCrypto = globalThis.crypto;
  beforeEach(() => Object.defineProperty(globalThis, "crypto", { value: { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) }, configurable: true }));
  afterEach(() => Object.defineProperty(globalThis, "crypto", { value: realCrypto, configurable: true }));

  it("never hands a file it could not check as the whole value, and says so", async () => {
    const cell = await cellOf(pointer(FILE_FORGED));
    expect(cell.value_text).not.toBe(FORGED);
    expect(cell.value_text).toContain(`kept as file ${FILE_FORGED}`);
    expect(cell.value_text).toContain("cannot check");
    expect(cell.value_incomplete?.file_id).toBe(FILE_FORGED);
  });
});
