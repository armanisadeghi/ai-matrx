import type { TranscriptHubItem } from "@/features/transcripts/types/hub";

export const KIND_META: Record<
  TranscriptHubItem["kind"],
  { label: string; accent: string }
> = {
  processor: { label: "Transcript", accent: "text-sky-500" },
  session: { label: "Session", accent: "text-violet-500" },
  cleanup: { label: "Cleanup", accent: "text-amber-500" },
  unsorted: { label: "Unsorted", accent: "text-rose-500" },
  recording: { label: "Recording", accent: "text-emerald-500" },
};

export function formatHubDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function hubItemDurationSeconds(item: TranscriptHubItem): number {
  if (item.kind === "processor") return item.durationSeconds ?? 0;
  if (item.kind === "unsorted" || item.kind === "recording") {
    return (item.durationMs ?? 0) / 1000;
  }
  return item.durationMs / 1000;
}

export function hubItemWordCount(item: TranscriptHubItem): number {
  return item.kind === "processor" ? (item.wordCount ?? 0) : 0;
}

export function primaryHubHref(item: TranscriptHubItem): string {
  switch (item.kind) {
    case "processor":
      return `/transcripts/processor?focus=${encodeURIComponent(item.id)}`;
    case "session":
      return `/transcripts/studio?session=${encodeURIComponent(item.id)}`;
    case "cleanup":
      return `/transcripts/cleanup?session=${encodeURIComponent(item.id)}`;
    case "unsorted":
      return "/transcripts/scribe/unsorted";
    case "recording":
      return `/transcripts/scribe/${encodeURIComponent(item.sessionId)}`;
  }
}

export function hubItemDetails(item: TranscriptHubItem): string {
  if (item.kind === "processor") {
    return [
      item.sourceType,
      item.isDraft ? "Draft" : null,
      item.folderName && item.folderName !== "Transcripts"
        ? item.folderName
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (item.kind === "unsorted") {
    return [
      `Capture #${item.segmentIndex + 1}`,
      item.sessionId ? "Detached" : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (item.kind === "recording") {
    return `Capture #${item.segmentIndex + 1}`;
  }
  return [
    item.status,
    item.recordingCount
      ? `${item.recordingCount} recording${item.recordingCount === 1 ? "" : "s"}`
      : null,
    item.charCount ? `${item.charCount.toLocaleString()} chars` : null,
    item.transcriptId ? "Linked" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
