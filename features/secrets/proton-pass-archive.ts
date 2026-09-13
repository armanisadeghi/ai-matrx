import type { CsvImportLimits } from "./csv-import";
import { openBoundedZip } from "./bounded-zip";

export type ProtonPassArchive = {
  dataText: string;
  binaryNames: ReadonlySet<string>;
};

export async function readProtonPassArchive(
  file: Blob,
  limits: Pick<CsvImportLimits, "maxFileBytes" | "maxRecords">,
  signal?: AbortSignal,
): Promise<ProtonPassArchive> {
  let archive;
  try {
    archive = await openBoundedZip(file, limits, signal);
    let data;
    const binaryNames = new Set<string>();
    for (const entry of archive.entries) {
      if (
        entry.filename === "Proton Pass/" ||
        entry.filename === "Proton Pass/files/"
      ) {
        if (!entry.directory || entry.uncompressedSize !== 0)
          throw new Error("unsafe");
        continue;
      }
      if (entry.filename === "Proton Pass/data.json") {
        if (entry.directory || data) throw new Error("unsafe");
        data = entry;
        continue;
      }
      if (
        entry.filename === "Proton Pass/data.pgp" ||
        entry.filename.startsWith("Proton Pass/data.")
      )
        throw new Error("encrypted");
      if (
        !entry.directory &&
        entry.filename.startsWith("Proton Pass/files/") &&
        entry.filename.slice("Proton Pass/files/".length)
      ) {
        const name = entry.filename.slice("Proton Pass/files/".length);
        if (name.includes("/")) throw new Error("unsafe");
        binaryNames.add(name);
        continue;
      }
      throw new Error("unsafe");
    }
    if (!data) throw new Error("unsafe");
    for (const entry of archive.entries) {
      if (entry === data) continue;
      await archive.readRange(entry);
    }
    return { dataText: await archive.readText(data), binaryNames };
  } finally {
    await archive?.close();
  }
}
