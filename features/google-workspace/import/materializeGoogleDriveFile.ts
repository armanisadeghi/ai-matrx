import type { PickedGoogleDriveFile } from "@/lib/googlePicker";

const DRIVE_FILES_BASE = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_NATIVE_PREFIX = "application/vnd.google-apps.";

interface GoogleDriveMetadata {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  canDownload: boolean;
}

interface ExportTarget {
  mimeType: string;
  extension: string;
}

const EXPORT_TARGETS: Readonly<Record<string, ExportTarget>> = {
  "application/vnd.google-apps.document": {
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: ".docx",
  },
  "application/vnd.google-apps.spreadsheet": {
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: ".xlsx",
  },
  "application/vnd.google-apps.presentation": {
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    extension: ".pptx",
  },
  "application/vnd.google-apps.drawing": {
    mimeType: "application/pdf",
    extension: ".pdf",
  },
  "application/vnd.google-apps.script": {
    mimeType: "application/vnd.google-apps.script+json",
    extension: ".json",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Google Drive returned an invalid ${key}.`);
  }
  return value.trim();
}

function safeFileName(name: string): string {
  const sanitized = name
    .replace(/[\\/]/g, "-")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return sanitized || "Google Drive file";
}

function withExtension(name: string, extension: string): string {
  const safe = safeFileName(name);
  return safe.toLowerCase().endsWith(extension) ? safe : `${safe}${extension}`;
}

async function googleError(response: Response, fallback: string): Promise<Error> {
  let message = fallback;
  try {
    const payload: unknown = await response.json();
    if (isRecord(payload) && isRecord(payload.error)) {
      const providerMessage = payload.error.message;
      if (typeof providerMessage === "string" && providerMessage.trim()) {
        message = providerMessage.trim();
      }
    }
  } catch {
    // Google can return an HTML proxy error. The status-specific fallback is
    // safer to show than provider markup.
  }
  return new Error(message);
}

async function readMetadata(
  accessToken: string,
  fileId: string,
): Promise<GoogleDriveMetadata> {
  const fields = encodeURIComponent(
    "id,name,mimeType,modifiedTime,capabilities(canDownload)",
  );
  const response = await fetch(
    `${DRIVE_FILES_BASE}/${encodeURIComponent(fileId)}?fields=${fields}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    throw await googleError(
      response,
      "Google Drive could not open that selected file.",
    );
  }
  const payload: unknown = await response.json();
  if (!isRecord(payload)) {
    throw new Error("Google Drive returned invalid file metadata.");
  }
  const capabilities = isRecord(payload.capabilities)
    ? payload.capabilities
    : {};
  return {
    id: requiredString(payload, "id"),
    name: requiredString(payload, "name"),
    mimeType: requiredString(payload, "mimeType"),
    modifiedTime:
      typeof payload.modifiedTime === "string" ? payload.modifiedTime : null,
    canDownload: capabilities.canDownload === true,
  };
}

function unsupportedNativeMessage(mimeType: string): string {
  if (mimeType === "application/vnd.google-apps.form") {
    return "Google Forms cannot be exported as files. Choose a response Sheet or another Drive file instead.";
  }
  if (mimeType === "application/vnd.google-apps.vid") {
    return "Google Vids use a separate long-running export process and cannot be imported here yet.";
  }
  if (mimeType === "application/vnd.google-apps.folder") {
    return "Choose files inside that Google Drive folder instead of the folder itself.";
  }
  if (mimeType === "application/vnd.google-apps.shortcut") {
    return "Choose the original Google Drive file instead of its shortcut.";
  }
  return "That Google Workspace file type cannot be exported into Matrx Files.";
}

async function readContent(
  accessToken: string,
  metadata: GoogleDriveMetadata,
): Promise<{ blob: Blob; fileName: string }> {
  const exportTarget = EXPORT_TARGETS[metadata.mimeType];
  if (metadata.mimeType.startsWith(GOOGLE_NATIVE_PREFIX) && !exportTarget) {
    throw new Error(unsupportedNativeMessage(metadata.mimeType));
  }
  if (!metadata.canDownload) {
    throw new Error(
      `“${metadata.name}” does not allow downloading. Ask its owner to enable downloads or choose another file.`,
    );
  }

  const encodedId = encodeURIComponent(metadata.id);
  const url = exportTarget
    ? `${DRIVE_FILES_BASE}/${encodedId}/export?mimeType=${encodeURIComponent(exportTarget.mimeType)}`
    : `${DRIVE_FILES_BASE}/${encodedId}?alt=media`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const fallback = exportTarget
      ? `Google could not export “${metadata.name}”. Native Google exports are limited to 10 MB.`
      : `Google Drive could not download “${metadata.name}”.`;
    throw await googleError(response, fallback);
  }
  const sourceBlob = await response.blob();
  const mimeType = exportTarget?.mimeType || metadata.mimeType;
  const blob =
    sourceBlob.type === mimeType
      ? sourceBlob
      : sourceBlob.slice(0, sourceBlob.size, mimeType);
  return {
    blob,
    fileName: exportTarget
      ? withExtension(metadata.name, exportTarget.extension)
      : safeFileName(metadata.name),
  };
}

/**
 * Copy one Picker-selected Drive item into a browser File. The caller then
 * sends that File through the canonical Matrx upload pipeline, exactly like a
 * local selection or drop.
 */
export async function materializeGoogleDriveFile(
  accessToken: string,
  picked: PickedGoogleDriveFile,
): Promise<File> {
  const metadata = await readMetadata(accessToken, picked.id);
  if (metadata.id !== picked.id) {
    throw new Error("Google Drive returned a different file than the one selected.");
  }
  const { blob, fileName } = await readContent(accessToken, metadata);
  const modified = metadata.modifiedTime
    ? Date.parse(metadata.modifiedTime)
    : Number.NaN;
  return new File([blob], fileName, {
    type: blob.type || metadata.mimeType,
    lastModified: Number.isFinite(modified) ? modified : Date.now(),
  });
}

export async function materializeGoogleDriveFiles(
  accessToken: string,
  picked: readonly PickedGoogleDriveFile[],
): Promise<{ files: File[]; failures: Array<{ name: string; error: string }> }> {
  const files: File[] = [];
  const failures: Array<{ name: string; error: string }> = [];
  // Deliberately sequential: a multi-select can contain large blobs, and
  // fanning every Drive download into memory at once is hostile to the tab.
  for (const item of picked) {
    try {
      files.push(await materializeGoogleDriveFile(accessToken, item));
    } catch (error: unknown) {
      failures.push({
        name: item.name,
        error: error instanceof Error ? error.message : "Import failed.",
      });
    }
  }
  return { files, failures };
}
