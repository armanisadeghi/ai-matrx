import { apiPost } from "@/lib/api/typed-client";
import { getFile } from "@/features/files/api/files";
import { apiFileRecordToCloudFile } from "@/features/files/redux/converters";
import type { CloudFile } from "@/features/files/types";
import type { components } from "@/types/python-generated/api-types";

export type StorageSourceProvenance =
  components["schemas"]["ExternalSourceMetadata"];

export interface CanonicalStorageImport {
  fileId: string;
  filePath: string;
  checksum: string | null;
  versionNumber: number;
  created: boolean;
  source: StorageSourceProvenance;
  /** Authoritative post-import row used by Files and chat. */
  file: CloudFile;
}

function safeSelectedName(name: string): string {
  return (
    name
      .replace(/[\\/]/g, "-")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim() || "Google Drive file"
  );
}

export async function importGoogleDriveFile(
  connectionId: string,
  selected: { id: string; name: string },
  destinationFolderPath = "My Files/Imports",
): Promise<CanonicalStorageImport> {
  const fileName = safeSelectedName(selected.name);
  const folderPath = destinationFolderPath.replace(/^\/+|\/+$/g, "");
  const filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
  const { data } = await apiPost("/storage-sources/import", {
    provider: "google_drive",
    connection_id: connectionId,
    source_ref: selected.id,
    file_path: filePath,
    visibility: "personal",
  });
  const { data: canonicalRow } = await getFile(data.file_id);
  if (canonicalRow.id !== data.file_id) {
    throw new Error(
      "Matrx Files returned a different file after the Google Drive import.",
    );
  }
  const file = apiFileRecordToCloudFile(canonicalRow);

  return {
    fileId: data.file_id,
    filePath: data.file_path,
    checksum: data.checksum ?? null,
    versionNumber: data.version_number,
    created: data.created,
    source: data.source,
    file,
  };
}

export async function importGoogleDriveFiles(
  connectionId: string,
  selected: Array<{ id: string; name: string }>,
  destinationFolderPath?: string,
): Promise<{
  files: CanonicalStorageImport[];
  failures: Array<{ name: string; error: string }>;
}> {
  const files: CanonicalStorageImport[] = [];
  const failures: Array<{ name: string; error: string }> = [];
  for (const file of selected) {
    try {
      files.push(
        await importGoogleDriveFile(
          connectionId,
          file,
          destinationFolderPath,
        ),
      );
    } catch (error: unknown) {
      failures.push({
        name: file.name,
        error: error instanceof Error ? error.message : "Import failed.",
      });
    }
  }
  return { files, failures };
}
