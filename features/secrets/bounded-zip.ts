import { BlobReader, ZipReader, type Entry } from "@zip.js/zip.js";

import type { CsvImportLimits } from "./csv-import";

export type BoundedZip = {
  entries: readonly Entry[];
  readRange: (entry: Entry) => Promise<void>;
  readText: (entry: Entry) => Promise<string>;
  assertActive: () => void;
  close: () => Promise<void>;
};

const safe = (value: number) => Number.isSafeInteger(value) && value >= 0;
const unsafeName = (name: string) => /[\\\0-\x1F\x7F-\x9F]/.test(name);

function stopIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("The archive import was cancelled.");
}

function hasWarnings(reader: ZipReader<Blob>, entry: Entry): boolean {
  return Boolean(reader.warnings?.length || entry.warnings?.length);
}

function boundedText(limit: number, used: { value: number }) {
  let size = 0;
  const parts: Uint8Array[] = [];
  return {
    writable: new WritableStream<Uint8Array>({
      write(chunk) {
        if (used.value > limit - chunk.byteLength)
          throw new Error("The archive exceeds the organization size limit.");
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

/** zip.js provides directory getData at runtime while omitting it from its Entry type. */
async function directoryRange(
  entry: Entry,
  signal?: AbortSignal,
): Promise<void> {
  if (!("getData" in entry) || typeof entry.getData !== "function")
    throw new Error("The archive is unsafe.");
  await entry.getData(new WritableStream<Uint8Array>(), {
    checkOverlappingEntryOnly: true,
    signal,
  });
}

/**
 * Opens a ZIP under vendor-neutral structural limits. Callers retain ownership of
 * their member grammar and may only read an entry through this object.
 */
export async function openBoundedZip(
  file: Blob,
  limits: Pick<CsvImportLimits, "maxFileBytes" | "maxRecords">,
  signal?: AbortSignal,
): Promise<BoundedZip> {
  if (file.size > limits.maxFileBytes)
    throw new Error("The archive exceeds the organization size limit.");
  const reader = new ZipReader(new BlobReader(file), {
    strictness: "strict",
    filenameValidation: "strict",
    checkAmbiguity: true,
  });
  try {
    stopIfCancelled(signal);
    const entries = await reader.getEntries();
    if (reader.warnings?.length || entries.length > limits.maxRecords)
      throw new Error("The archive is unsafe.");
    const names = new Set<string>();
    let declared = 0;
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
        throw new Error("The archive is unsafe.");
      names.add(entry.filename);
      declared += entry.uncompressedSize;
    }
    const used = { value: declared };
    const ownedEntries = new Set(entries);
    const ensureOwnedAndSafe = (entry: Entry) => {
      if (!ownedEntries.has(entry) || hasWarnings(reader, entry))
        throw new Error("The archive is unsafe.");
    };
    const readRange = async (entry: Entry) => {
      ensureOwnedAndSafe(entry);
      stopIfCancelled(signal);
      if (entry.directory) await directoryRange(entry, signal);
      else
        await entry.getData(new WritableStream<Uint8Array>(), {
          checkOverlappingEntryOnly: true,
          signal,
        });
      stopIfCancelled(signal);
      ensureOwnedAndSafe(entry);
    };
    return {
      entries: Object.freeze([...entries]),
      assertActive: () => stopIfCancelled(signal),
      readRange,
      readText: async (entry) => {
        ensureOwnedAndSafe(entry);
        if (entry.directory) throw new Error("The archive is unsafe.");
        await readRange(entry);
        const output = boundedText(limits.maxFileBytes, used);
        try {
          await entry.getData(output.writable, { checkCrc32: true, signal });
        } catch (error) {
          if (used.value >= limits.maxFileBytes)
            throw new Error("The archive exceeds the organization size limit.");
          throw error;
        }
        stopIfCancelled(signal);
        ensureOwnedAndSafe(entry);
        return output.text();
      },
      close: () => reader.close(),
    };
  } catch (error) {
    await reader.close();
    if (signal?.aborted) throw new Error("The archive import was cancelled.");
    throw error;
  }
}
