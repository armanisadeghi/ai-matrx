import { BlobReader, ZipReader, type Entry } from "@zip.js/zip.js";

import type { CsvImportLimits } from "./csv-import";

export type OnePuxArchive = {
  attributesText: string;
  dataText: string;
  binaryMemberCount: number;
};
const safe = (value: number) => Number.isSafeInteger(value) && value >= 0;
const unsafeName = (name: string) => /[\\\0-\x1F\x7F-\x9F]/.test(name);
const cancelled = (signal?: AbortSignal) => signal?.aborted === true;
function stopIfCancelled(signal?: AbortSignal) {
  if (cancelled(signal)) throw new Error("The 1Password import was cancelled.");
}
function boundedText(limit: number, used: { value: number }) {
  let size = 0;
  const parts: Uint8Array[] = [];
  return {
    writable: new WritableStream<Uint8Array>({
      write(chunk) {
        if (used.value > limit - chunk.byteLength)
          throw new Error(
            "The 1Password export exceeds this organization’s import size limit.",
          );
        used.value += chunk.byteLength;
        size += chunk.byteLength;
        parts.push(chunk);
      },
    }),
    text: () => {
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const part of parts) {
        bytes.set(part, offset);
        offset += part.byteLength;
      }
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    },
  };
}
/** zip.js 2.14.1 installs getData on runtime directory entries, while its .d.ts omits it. */
async function validateDirectoryRange(
  entry: Entry,
  signal?: AbortSignal,
): Promise<void> {
  if (!("getData" in entry) || typeof entry.getData !== "function")
    throw new Error("The 1Password archive is unsafe.");
  await entry.getData(new WritableStream<Uint8Array>(), {
    checkOverlappingEntryOnly: true,
    signal,
  });
}
function warnings(reader: ZipReader<Blob>, entry: Entry) {
  return Boolean(reader.warnings?.length || entry.warnings?.length);
}

export async function readOnePuxArchive(
  file: Blob,
  limits: Pick<CsvImportLimits, "maxFileBytes" | "maxRecords">,
  signal?: AbortSignal,
): Promise<OnePuxArchive> {
  if (file.size > limits.maxFileBytes)
    throw new Error(
      "The 1Password export exceeds this organization’s import size limit.",
    );
  const reader = new ZipReader(new BlobReader(file), {
    strictness: "strict",
    filenameValidation: "strict",
    checkAmbiguity: true,
  });
  try {
    stopIfCancelled(signal);
    const entries = await reader.getEntries();
    if (reader.warnings?.length || entries.length > limits.maxRecords)
      throw new Error("The 1Password archive is unsafe.");
    let declared = 0;
    let binaryMemberCount = 0;
    const names = new Set<string>();
    for (const entry of entries) {
      const unixType = (entry.externalFileAttributes >>> 16) & 0o170000;
      if (
        names.has(entry.filename) ||
        unsafeName(entry.filename) ||
        !safe(entry.compressedSize) ||
        !safe(entry.uncompressedSize) ||
        !safe(entry.offset) ||
        declared > limits.maxFileBytes - entry.uncompressedSize ||
        entry.encrypted ||
        (entry.directory
          ? unixType !== 0 && unixType !== 0o040000
          : unixType !== 0 && unixType !== 0o100000)
      )
        throw new Error("The 1Password archive is unsafe.");
      names.add(entry.filename);
      declared += entry.uncompressedSize;
      if (
        entry.filename === "files/" &&
        entry.directory &&
        entry.uncompressedSize === 0
      )
        continue;
      if (entry.directory) throw new Error("The 1Password archive is invalid.");
      if (
        entry.filename === "export.attributes" ||
        entry.filename === "export.data"
      )
        continue;
      if (
        entry.filename.startsWith("files/") &&
        entry.filename.slice(6) &&
        !entry.filename.slice(6).includes("/")
      ) {
        binaryMemberCount += 1;
        continue;
      }
      throw new Error("The 1Password archive is invalid.");
    }
    const used = { value: declared };
    let attributesText: string | undefined;
    let dataText: string | undefined;
    for (const entry of entries) {
      stopIfCancelled(signal);
      if (entry.directory) await validateDirectoryRange(entry, signal);
      else
        await entry.getData(new WritableStream<Uint8Array>(), {
          checkOverlappingEntryOnly: true,
          signal,
        });
      stopIfCancelled(signal);
      if (warnings(reader, entry))
        throw new Error("The 1Password archive is unsafe.");
      if (
        entry.filename !== "export.attributes" &&
        entry.filename !== "export.data"
      )
        continue;
      if (entry.directory) throw new Error("The 1Password archive is unsafe.");
      const output = boundedText(limits.maxFileBytes, used);
      try {
        await entry.getData(output, { checkCrc32: true, signal });
      } catch (error) {
        if (used.value >= limits.maxFileBytes)
          throw new Error(
            "The 1Password export exceeds this organization’s import size limit.",
          );
        throw error;
      }
      stopIfCancelled(signal);
      if (warnings(reader, entry))
        throw new Error("The 1Password archive is unsafe.");
      const text = output.text();
      if (entry.filename === "export.attributes") attributesText = text;
      else dataText = text;
    }
    if (!attributesText || !dataText)
      throw new Error("The 1Password archive is missing export data.");
    return { attributesText, dataText, binaryMemberCount };
  } catch (error) {
    if (cancelled(signal))
      throw new Error("The 1Password import was cancelled.");
    throw error;
  } finally {
    await reader.close();
  }
}
