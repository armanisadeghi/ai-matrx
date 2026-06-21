import type { TranscriptHubItem } from "@/features/transcripts/types/hub";

export type ReferenceRecordGroup = {
  referenceType: string;
  records: ReadonlyArray<{ id: string; label?: string }>;
};

/** Map visible hub rows to homogeneous RecordRef bulk-copy groups. */
export function hubItemsToReferenceGroups(
  items: ReadonlyArray<TranscriptHubItem>,
): ReferenceRecordGroup[] {
  const transcripts = items
    .filter((item) => item.kind === "processor")
    .map((item) => ({ id: item.id, label: item.title }));

  const sessions = items
    .filter((item) => item.kind === "session" || item.kind === "cleanup")
    .map((item) => ({ id: item.id, label: item.title }));

  const groups: ReferenceRecordGroup[] = [];
  if (transcripts.length > 0) {
    groups.push({ referenceType: "transcript", records: transcripts });
  }
  if (sessions.length > 0) {
    groups.push({ referenceType: "transcript_session", records: sessions });
  }
  return groups;
}

export function referenceGroupCount(
  groups: ReadonlyArray<ReferenceRecordGroup>,
): number {
  return groups.reduce((sum, g) => sum + g.records.length, 0);
}
