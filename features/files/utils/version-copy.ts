/**
 * version-copy — pure builders for the file version-history Copy /
 * Copy-for-AI pair and its JSON/CSV export (agent-copy doctrine: shaping
 * lives in pure builders, never inline at the callsite).
 *
 * Shared by the per-row pairs and the whole-list copy in
 * `FileVersionsList` so the row and the list can never drift.
 *
 * Version rows carry no URL today, but `restoreVersion` is documented as
 * pointing at a version's storage uri, so every agent shape here still goes
 * through `mediaSafe` — if that field ever reaches the client the payload
 * stays compliant instead of silently starting to leak.
 */

import type { CloudFileVersion } from "@/features/files/types";
import { formatFileSize } from "@/features/files/utils/format";
import { mediaSafe } from "@/lib/media/agent-payload";

/** One version as the row renders it. */
export function versionRowSummary(
  version: CloudFileVersion,
  isCurrent: boolean,
): string {
  const parts = [
    `v${version.versionNumber ?? "?"}`,
    version.createdAt,
    version.fileSize != null ? formatFileSize(version.fileSize) : null,
    isCurrent ? "current" : null,
    version.changeSummary || null,
  ].filter(Boolean);
  return parts.join(" · ");
}

/** The whole list, newest first, as the user reads it. */
export function versionsHumanSummary(
  fileName: string,
  versions: CloudFileVersion[],
  currentVersion: number | null,
): string {
  const header = `Versions (${versions.length}) — ${fileName}`;
  const rows = versions.map((version) =>
    versionRowSummary(version, version.versionNumber === currentVersion),
  );
  return [header, ...rows].join("\n");
}

/** Flat rows for CSV export — one object per version, scalar values only. */
export function versionsExportRows(
  versions: CloudFileVersion[],
  currentVersion: number | null,
): Array<Record<string, unknown>> {
  return versions.map((version) => ({
    version: version.versionNumber,
    is_current: version.versionNumber === currentVersion,
    created_at: version.createdAt,
    created_by: version.createdBy ?? "",
    size_bytes: version.fileSize ?? "",
    checksum: version.checksum ?? "",
    change_summary: version.changeSummary ?? "",
  }));
}

/** Agent-safe data for one version row. */
export function versionAgentData(
  version: CloudFileVersion,
  isCurrent: boolean,
): Record<string, unknown> {
  return {
    is_current: isCurrent,
    version: mediaSafe(version),
  };
}

/** Agent-safe data for the whole version list. */
export function versionsAgentData(input: {
  fileId: string;
  fileName: string;
  versions: CloudFileVersion[];
  currentVersion: number | null;
}): Record<string, unknown> {
  return {
    file_id: input.fileId,
    file_name: input.fileName,
    current_version: input.currentVersion,
    version_count: input.versions.length,
    versions: input.versions.map((version) =>
      versionAgentData(version, version.versionNumber === input.currentVersion),
    ),
  };
}
