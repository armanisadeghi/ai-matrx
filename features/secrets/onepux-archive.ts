import { BlobReader, ZipReader } from "@zip.js/zip.js";

import type { CsvImportLimits } from "./csv-import";

export type OnePuxArchive = { attributesText: string; dataText: string; binaryMemberCount: number };

const safe = (value: number) => Number.isSafeInteger(value) && value >= 0;

function boundedText(limit: number, used: { value: number }) {
  let size = 0; const parts: Uint8Array[] = [];
  return { writable: new WritableStream<Uint8Array>({ write(chunk) { if (used.value > limit - chunk.byteLength) throw new Error("The 1Password export exceeds this organization’s import size limit."); used.value += chunk.byteLength; size += chunk.byteLength; parts.push(chunk); } }), text: () => { const bytes = new Uint8Array(size); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; } return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } };
}

export async function readOnePuxArchive(file: Blob, limits: CsvImportLimits, signal?: AbortSignal): Promise<OnePuxArchive> {
  if (file.size > limits.maxFileBytes) throw new Error("The 1Password export exceeds this organization’s import size limit.");
  const reader = new ZipReader(new BlobReader(file), { strictness: "strict", filenameValidation: "strict", checkAmbiguity: true });
  try {
    if (signal?.aborted) throw new Error("The 1Password import was cancelled.");
    const entries = await reader.getEntries();
    if (reader.warnings?.length || entries.length > limits.maxRecords) throw new Error("The 1Password archive is unsafe.");
    let declared = 0; let attributesText: string | undefined; let dataText: string | undefined; let binaryMemberCount = 0; const names = new Set<string>(); const actual = { value: 0 };
    for (const entry of entries) {
      const unixType = (entry.externalFileAttributes >>> 16) & 0o170000;
      if (signal?.aborted || names.has(entry.filename) || entry.filename.includes("\\") || entry.filename.includes("\0") || !safe(entry.compressedSize) || !safe(entry.uncompressedSize) || !safe(entry.offset) || declared > limits.maxFileBytes - entry.uncompressedSize || entry.encrypted || (!entry.directory && unixType !== 0 && unixType !== 0o100000)) throw new Error("The 1Password archive is unsafe.");
      names.add(entry.filename); declared += entry.uncompressedSize;
      await entry.getData(new WritableStream(), { checkOverlappingEntryOnly: true, signal });
      if (entry.filename === "export.attributes" || entry.filename === "export.data") {
        if (entry.directory) throw new Error("The 1Password archive is invalid.");
        const output = boundedText(limits.maxFileBytes, actual);
        const options = signal ? { checkCrc32: true, signal } : { checkCrc32: true };
        await entry.getData(output, options);
        const text = await output.text();
        if (entry.filename === "export.attributes") attributesText = text; else dataText = text;
      } else if (entry.filename === "files/" && entry.directory && entry.uncompressedSize === 0) continue;
      else if (entry.filename.startsWith("files/") && !entry.directory && entry.filename.slice(6) && !entry.filename.slice(6).includes("/")) binaryMemberCount += 1;
      else throw new Error("The 1Password archive is invalid.");
    }
    if (!attributesText || !dataText) throw new Error("The 1Password archive is missing export data.");
    return { attributesText, dataText, binaryMemberCount };
  } finally { await reader.close(); }
}
