import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@/utils/supabase/pg-error";

export const FILE_RESOURCE_FAMILY_SCHEMA_VERSION = 2;

export interface FileFamilyRepresentation {
  key: string;
  label: string;
  category: string;
  count: number;
  promotable: boolean;
  fetch_tool: string;
}

export interface FileResourceFamilyInventory {
  schema_version: number;
  resource_type: "file";
  requested_file_id: string;
  root_file_id: string | null;
  files: ReadonlyArray<Record<string, unknown>>;
  processed_documents: ReadonlyArray<Record<string, unknown>>;
  representations: FileFamilyRepresentation[];
  capabilities: string[];
  counts: Record<string, number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseRepresentation(value: unknown): FileFamilyRepresentation | null {
  if (!isRecord(value)) return null;
  if (typeof value.key !== "string" || typeof value.label !== "string") {
    return null;
  }
  return {
    key: value.key,
    label: value.label,
    category: typeof value.category === "string" ? value.category : "other",
    count: typeof value.count === "number" ? value.count : 0,
    promotable: value.promotable === true,
    fetch_tool: typeof value.fetch_tool === "string" ? value.fetch_tool : "context",
  };
}

export function parseFileResourceFamilyInventory(
  value: unknown,
): FileResourceFamilyInventory {
  if (!isRecord(value) || value.resource_type !== "file") {
    throw new Error("The file-family RPC returned an invalid resource envelope.");
  }
  const representations = Array.isArray(value.representations)
    ? value.representations
        .map(parseRepresentation)
        .filter((item): item is FileFamilyRepresentation => item !== null)
    : [];
  const counts = isRecord(value.counts)
    ? Object.fromEntries(
        Object.entries(value.counts).filter(
          (entry): entry is [string, number] => typeof entry[1] === "number",
        ),
      )
    : {};
  const schemaVersion =
    typeof value.schema_version === "number" ? value.schema_version : 1;
  if (schemaVersion < 1 || schemaVersion > FILE_RESOURCE_FAMILY_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported file-family schema version ${schemaVersion}; this client supports versions 1-${FILE_RESOURCE_FAMILY_SCHEMA_VERSION}.`,
    );
  }
  return {
    schema_version: schemaVersion,
    resource_type: "file",
    requested_file_id:
      typeof value.requested_file_id === "string" ? value.requested_file_id : "",
    root_file_id: typeof value.root_file_id === "string" ? value.root_file_id : null,
    files: Array.isArray(value.files)
      ? value.files.filter((item): item is Record<string, unknown> => isRecord(item))
      : [],
    processed_documents: Array.isArray(value.processed_documents)
      ? value.processed_documents.filter(
          (item): item is Record<string, unknown> => isRecord(item),
        )
      : [],
    representations,
    capabilities: Array.isArray(value.capabilities)
      ? value.capabilities.filter((item): item is string => typeof item === "string")
      : [],
    counts,
  };
}

export async function getFileResourceFamily(
  fileId: string,
): Promise<FileResourceFamilyInventory> {
  const { data, error } = await supabase.rpc("get_file_resource_family", {
    p_file_id: fileId,
  });
  if (error) throw pgErrorToError(error);
  return parseFileResourceFamilyInventory(data);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeFileResourceId(value: unknown): string | null {
  let candidate: unknown = value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    candidate = record.file_id ?? record.fileId ?? record.resource_id;
  }
  if (typeof candidate !== "string") return null;
  const normalized = candidate.trim();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}
