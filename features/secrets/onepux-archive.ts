import type { CsvImportLimits } from "./csv-import";
import { openBoundedZip } from "./bounded-zip";

export type OnePuxArchive = {
  attributesText: string;
  dataText: string;
  binaryMemberCount: number;
};

function invalid(): never {
  throw new Error("The 1Password archive is invalid.");
}

/** Applies the 1PUX member grammar to shared bounded ZIP mechanics. */
export async function readOnePuxArchive(
  file: Blob,
  limits: Pick<CsvImportLimits, "maxFileBytes" | "maxRecords">,
  signal?: AbortSignal,
): Promise<OnePuxArchive> {
  let archive;
  try {
    archive = await openBoundedZip(file, limits, signal);
    let binaryMemberCount = 0;
    let hasAttributes = false;
    let hasData = false;
    for (const entry of archive.entries) {
      if (
        entry.filename === "files/" &&
        entry.directory &&
        entry.uncompressedSize === 0
      )
        continue;
      if (entry.directory) invalid();
      if (entry.filename === "export.attributes") {
        hasAttributes = true;
        continue;
      }
      if (entry.filename === "export.data") {
        hasData = true;
        continue;
      }
      if (
        entry.filename.startsWith("files/") &&
        entry.filename.slice(6) &&
        !entry.filename.slice(6).includes("/")
      ) {
        binaryMemberCount += 1;
        continue;
      }
      invalid();
    }
    if (!hasAttributes || !hasData) invalid();
    let attributesText: string | undefined;
    let dataText: string | undefined;
    for (const entry of archive.entries) {
      if (
        entry.filename !== "export.attributes" &&
        entry.filename !== "export.data"
      ) {
        await archive.readRange(entry);
        continue;
      }
      const text = await archive.readText(entry);
      if (entry.filename === "export.attributes") attributesText = text;
      else dataText = text;
    }
    if (!attributesText || !dataText) invalid();
    return { attributesText, dataText, binaryMemberCount };
  } catch (error) {
    if (signal?.aborted) throw new Error("The 1Password import was cancelled.");
    if (error instanceof Error && /size limit/.test(error.message))
      throw new Error(
        "The 1Password export exceeds this organization’s import size limit.",
      );
    throw error;
  } finally {
    await archive?.close();
  }
}
