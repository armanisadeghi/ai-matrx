import { apiPost } from "@/lib/api/typed-client";
import { BackendApiError } from "@/lib/api/errors";
import { getFile } from "@/features/files/api/files";
import { apiFileRecordToCloudFile } from "@/features/files/redux/converters";
import { extname, joinPath, stemname } from "@/features/files/utils/path";
import type {
  CanonicalStorageImport,
  StorageBrowsePage,
  StorageBrowseProvider,
  StorageImportFailure,
  StorageImportProvider,
  StorageImportSelection,
} from "@/features/files/storage-sources/types";

export const STORAGE_BROWSE_PAGE_SIZE = 50;
const COLLISION_HASH_LENGTH = 8;

export function safeStorageBasename(name: string): string | null {
  const value = name.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!value || value === "." || value === ".." || /[\\/]/.test(value)) {
    return null;
  }
  return value;
}

export function validateStorageDestinationFolderPath(path: string): string | null {
  if (/[\\\u0000-\u001f\u007f]/.test(path)) {
    return "The destination folder path is invalid.";
  }
  const segments = path.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return "The destination folder path is invalid.";
  }
  if (path.length > 900) return "The destination folder path is too long.";
  return null;
}

export function storageDestinationPath(folderPath: string, name: string): string {
  const destinationError = validateStorageDestinationFolderPath(folderPath);
  if (destinationError) throw new Error(destinationError);
  const safeName = safeStorageBasename(name);
  if (!safeName) throw new Error("Choose a file name without slashes.");
  return joinPath(folderPath, safeName);
}

function stableShortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, COLLISION_HASH_LENGTH);
}

export function collisionRenameProposal(
  provider: StorageImportProvider,
  connectionId: string,
  selection: StorageImportSelection,
): string {
  const original = safeStorageBasename(selection.name) ?? "Imported file";
  const extension = extname(original);
  const suffix = stableShortHash(
    `${provider}\u0000${connectionId}\u0000${selection.sourceRef}`,
  );
  const stem = stemname(original) || "Imported file";
  return extension ? `${stem}-${suffix}.${extension}` : `${stem}-${suffix}`;
}

export async function browseStorageSource(args: {
  provider: StorageBrowseProvider;
  connectionId: string;
  folderRef?: string | null;
  cursor?: string | null;
  signal?: AbortSignal;
}): Promise<StorageBrowsePage> {
  const body = {
    provider: args.provider,
    connection_id: args.connectionId,
    folder_ref: args.folderRef ?? null,
    cursor: args.cursor ?? null,
    page_size: STORAGE_BROWSE_PAGE_SIZE,
  };
  const { data } = args.signal
    ? await apiPost("/storage-sources/browse", body, { signal: args.signal })
    : await apiPost("/storage-sources/browse", body);
  if (
    data.provider !== args.provider ||
    data.connection_id !== args.connectionId ||
    (data.folder_ref ?? null) !== (args.folderRef ?? null)
  ) {
    throw new Error("The storage provider returned a page for a different location.");
  }
  return data;
}

export async function importStorageSourceFile(args: {
  provider: StorageImportProvider;
  connectionId: string;
  selection: StorageImportSelection;
  destinationFolderPath?: string;
  signal?: AbortSignal;
}): Promise<CanonicalStorageImport> {
  const destinationName = args.selection.destinationName ?? args.selection.name;
  const filePath = storageDestinationPath(
    args.destinationFolderPath ?? "My Files/Imports",
    destinationName,
  );
  const body = {
    provider: args.provider,
    connection_id: args.connectionId,
    source_ref: args.selection.sourceRef,
    file_path: filePath,
    visibility: "personal" as const,
  };
  const { data } = args.signal
    ? await apiPost("/storage-sources/import", body, { signal: args.signal })
    : await apiPost("/storage-sources/import", body);
  const { data: canonicalRow } = await getFile(data.file_id);
  if (canonicalRow.id !== data.file_id) {
    throw new Error("Matrx Files returned a different file after the import.");
  }
  return {
    fileId: data.file_id,
    filePath: data.file_path,
    checksum: data.checksum ?? null,
    versionNumber: data.version_number,
    created: data.created,
    source: data.source,
    file: apiFileRecordToCloudFile(canonicalRow),
  };
}

export async function importStorageSourceFiles(args: {
  provider: StorageImportProvider;
  connectionId: string;
  selections: StorageImportSelection[];
  destinationFolderPath?: string;
  signal?: AbortSignal;
  shouldContinue?: () => boolean;
}): Promise<{
  files: CanonicalStorageImport[];
  failures: StorageImportFailure[];
}> {
  const files: CanonicalStorageImport[] = [];
  const failures: StorageImportFailure[] = [];
  for (const selection of args.selections) {
    if (args.shouldContinue && !args.shouldContinue()) break;
    try {
      files.push(await importStorageSourceFile({ ...args, selection }));
    } catch (error: unknown) {
      const collision = error instanceof BackendApiError && error.status === 409;
      failures.push({
        selection,
        error: error instanceof Error ? error.message : "Import failed.",
        ...(collision
          ? {
              collisionProposal: collisionRenameProposal(
                args.provider,
                args.connectionId,
                selection,
              ),
            }
          : {}),
      });
    }
  }
  return { files, failures };
}

export async function importGoogleDriveFile(
  connectionId: string,
  selected: { id: string; name: string },
  destinationFolderPath = "My Files/Imports",
): Promise<CanonicalStorageImport> {
  return importStorageSourceFile({
    provider: "google_drive",
    connectionId,
    selection: { sourceRef: selected.id, name: selected.name },
    destinationFolderPath,
  });
}

export async function importGoogleDriveFiles(
  connectionId: string,
  selected: Array<{ id: string; name: string }>,
  destinationFolderPath?: string,
) {
  const result = await importStorageSourceFiles({
    provider: "google_drive",
    connectionId,
    selections: selected.map((file) => ({ sourceRef: file.id, name: file.name })),
    destinationFolderPath,
  });
  return {
    files: result.files,
    failures: result.failures.map((failure) => ({
      name: failure.selection.name,
      error: failure.error,
    })),
  };
}
