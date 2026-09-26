/**
 * @jest-environment node
 *
 * (A browser's Blob has text(); jsdom's does not, and Node's is the standard one.)
 */
/**
 * A value kept as a file opens on the file's own page and its whole text is read through the
 * files API as the person (BIG-VALUES-TAILS). The break each case names: a host that points the
 * cell at the wrong route, reads the wrong file, cuts or re-encodes the text, or swallows a failed
 * read (the export would then pass the first words off as the value).
 *
 * The use case: a heating contractor's research table whose "Knowledge search results" cell holds
 * a 600 KB search transcript kept as a file. The download itself is the files API — the network,
 * stubbed with the bytes a real file holds; the module's own decoding and error sentence are real.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hrefForFile, readFileText } from "../recordsFiles";

jest.mock("@/features/files/api/files", () => ({ downloadFile: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { downloadFile } = require("@/features/files/api/files") as { downloadFile: jest.Mock };

const FILES: Record<string, string> = {
  "3f1c9a52-7d4e-4b8a-9e21-5c6d7e8f9a01":
    "Knowledge Text Results:\n<result_item> url: https://www.energy.gov/energysaver/heat-pump-systems " +
    "title: Heat Pump Systems — air-source units cut heating electricity about 50% </result_item>",
  "b27e4d10-8a3f-4c5b-a6d7-0e9f1a2b3c4d":
    "Cold-climate field monitoring: seasonal COP 2.1–2.9 down to −15 °F; auxiliary heat staged last.",
};

beforeEach(() => {
  downloadFile.mockReset();
  downloadFile.mockImplementation(async (fileId: string) => {
    const text = FILES[fileId];
    if (text === undefined) throw new Error("404 Not Found: file is not there to read");
    return { blob: new Blob([new TextEncoder().encode(text)]), filename: `${fileId}.txt`, meta: {} };
  });
});

describe("a value kept as a file", () => {
  it.each(Object.keys(FILES))("opens on the single-file page for file %s", (fileId) => {
    expect(hrefForFile({ fileId })).toBe(`/files/f/${fileId}`);
  });

  it.each(Object.entries(FILES))("reads the whole text of file %s, byte for byte", async (fileId, text) => {
    await expect(readFileText({ fileId })).resolves.toBe(text);
    expect(downloadFile).toHaveBeenCalledWith(fileId);
  });

  it("refuses by name when the file cannot be read, never answering with words", async () => {
    await expect(readFileText({ fileId: "0d4f6a2e-1111-4c3b-8e5f-9a8b7c6d5e4f" })).rejects.toThrow(
      /whole text is in file 0d4f6a2e-1111-4c3b-8e5f-9a8b7c6d5e4f, and it could not be read: 404 Not Found/,
    );
  });
});

describe("the table page binds the file ports", () => {
  // The break: the module exists but the table page's RecordsMount host never spreads it, so
  // the cell says "in a file" with no way to open it and the export has no way to read it.
  // The page binds the ONE shared host (one-grid merge, step 7), and that binding spreads them —
  // so every record-store table (window, overlay, artifact, quick sheet, picker) gets them too.
  const page = readFileSync(join(process.cwd(), "app/(core)/data-v2/[tableId]/page.tsx"), "utf8");
  const binding = readFileSync(
    join(process.cwd(), "features/data-tables/records-ui-host/recordsUiHost.tsx"),
    "utf8",
  );
  it("the page's RecordsMount takes its host from the one binding", () => {
    expect(page).toMatch(/<RecordsMount[\s\S]*?host=\{recordsUiHostFor\(/);
  });
  it("the binding imports the one files module", () => {
    expect(binding).toMatch(/import \{ RECORDS_FILES \} from "@\/features\/unified-data\/recordsFiles";/);
  });
  it("the binding spreads both ports into the host", () => {
    const host = binding.slice(binding.indexOf("export function recordsUiHostFor"), binding.indexOf("export function useRecordsUiPorts"));
    expect(host).toContain("...RECORDS_FILES,");
  });
});
