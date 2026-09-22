import type { Entry } from "@zip.js/zip.js";

import type { CsvImportLimits } from "./csv-import";
import { openBoundedZip } from "./bounded-zip";

export type DashlaneCsvArchive = {
  credentialsText: string;
  omittedCsvCount: number;
};

function invalid(): never {
  throw new Error("The Dashlane archive is invalid.");
}

function isTopLevelCsv(entry: Entry): boolean {
  return (
    !entry.directory &&
    !entry.filename.includes("/") &&
    entry.filename.toLowerCase().endsWith(".csv")
  );
}

/**
 * Reads Dashlane's ZIP container without assuming the undocumented CSV schema.
 * Other Dashlane CSVs are range-validated before they are visibly omitted.
 */
export async function readDashlaneCsvArchive(
  file: Blob,
  limits: Pick<CsvImportLimits, "maxFileBytes" | "maxRecords">,
  signal?: AbortSignal,
): Promise<DashlaneCsvArchive> {
  let archive: Awaited<ReturnType<typeof openBoundedZip>> | undefined;
  let credentialsText: string | undefined;
  try {
    archive = await openBoundedZip(file, limits, signal);
    let credentials: Entry | undefined;
    let omittedCsvCount = 0;

    for (const entry of archive.entries) {
      if (!isTopLevelCsv(entry)) invalid();
      if (entry.filename.toLowerCase() === "credentials.csv") {
        if (credentials) invalid();
        credentials = entry;
      } else {
        omittedCsvCount += 1;
      }
    }
    if (!credentials) invalid();

    for (const entry of archive.entries) {
      if (entry === credentials) continue;
      await archive.readRange(entry);
    }
    archive.assertActive();
    credentialsText = await archive.readText(credentials);
    archive.assertActive();
    return { credentialsText, omittedCsvCount };
  } catch (error) {
    credentialsText = undefined;
    if (signal?.aborted) throw new Error("The Dashlane import was cancelled.");
    throw error;
  } finally {
    credentialsText = undefined;
    await archive?.close();
  }
}
