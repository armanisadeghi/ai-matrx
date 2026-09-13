import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js";

import { parseOnePuxData } from "./onepux";

self.onmessage = async (event: MessageEvent<{ file: File; limits: Parameters<typeof parseOnePuxData>[1] }>) => {
  const reader = new ZipReader(new BlobReader(event.data.file), { strictness: "strict", filenameValidation: "strict", checkAmbiguity: true });
  try {
    const entries = await reader.getEntries();
    if (reader.warnings?.length || entries.length > event.data.limits.maxRecords) throw new Error("The 1Password archive has an unsafe entry layout.");
    const names = new Set<string>();
    let attributes: string | null = null;
    let data: string | null = null;
    let binaryMembers = 0;
    for (const entry of entries) {
      if (names.has(entry.filename) || entry.filename.includes("\\") || entry.filename.includes("\0")) throw new Error("The 1Password archive has an unsafe entry name.");
      names.add(entry.filename);
      if (entry.filename === "export.attributes" || entry.filename === "export.data") {
        if (entry.directory) throw new Error("The 1Password archive structure is invalid.");
        const text = await entry.getData(new TextWriter(), { checkCrc32: true, checkOverlappingEntryOnly: true });
        if (entry.filename === "export.attributes") attributes = text;
        else data = text;
      } else if (entry.filename === "files/" && entry.directory && entry.uncompressedSize === 0) {
        continue;
      } else if (entry.filename.startsWith("files/") && !entry.directory && !entry.filename.slice(6).includes("/")) {
        binaryMembers += 1;
      } else throw new Error("The 1Password archive has an unsupported entry.");
    }
    if (!attributes || !data) throw new Error("The 1Password archive is missing export data.");
    const attributesRoot = JSON.parse(attributes) as { version?: number; description?: string; createdAt?: number };
    const createdAt = attributesRoot.createdAt;
    if (attributesRoot.version !== 3 || attributesRoot.description !== "1Password Unencrypted Export" || !Number.isSafeInteger(createdAt) || createdAt === undefined || createdAt < 0) throw new Error("This is not a supported unencrypted 1Password v3 export.");
    self.postMessage({ ok: true, records: parseOnePuxData(attributes, data, event.data.limits), binaryMembers });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : "The 1Password archive could not be read." });
  } finally { await reader.close(); }
};
