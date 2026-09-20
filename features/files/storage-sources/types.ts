import type { components } from "@/types/python-generated/api-types";
import type { CloudFile } from "@/features/files/types";

export type StorageBrowseProvider =
  components["schemas"]["StorageBrowseRequest"]["provider"];
export type StorageImportProvider =
  components["schemas"]["StorageSourceImportRequest"]["provider"];
export type StorageBrowseItem = components["schemas"]["StorageBrowseItem"];
export type StorageBrowsePage = components["schemas"]["StorageBrowsePage"];
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

export interface StorageImportSelection {
  sourceRef: string;
  name: string;
  /** Provider MIME is retained only for re-validating an edited collision name. */
  mimeType?: string | null;
  destinationName?: string;
}

export interface StorageImportFailure {
  selection: StorageImportSelection;
  error: string;
  collisionProposal?: string;
}
