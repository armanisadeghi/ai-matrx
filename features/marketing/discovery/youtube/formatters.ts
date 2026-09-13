import { formatDurationSeconds } from "@ai-matrx/kit/format";
import { formatCompact } from "@/features/research/components/results/resultsShared";

const ISO_DURATION =
  /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

export function formatYouTubeCount(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : formatCompact(value);
}

export function formatYouTubeDuration(
  value: string | null | undefined,
): string {
  if (!value) return "—";
  const match = value.match(ISO_DURATION);
  if (!match) return value;
  // ISO-8601 → total seconds; the clock voice is the kit's. Days fold into
  // hours (`P1DT1H1S` → `25:00:01`), exactly as YouTube renders them.
  const totalSeconds =
    Number(match[1] ?? 0) * 86_400 +
    Number(match[2] ?? 0) * 3_600 +
    Number(match[3] ?? 0) * 60 +
    Math.floor(Number(match[4] ?? 0));
  return formatDurationSeconds(totalSeconds, { style: "clock" });
}

export function formatYouTubeDate(value: string | null | undefined): string {
  if (!value) return "No Date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No Date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function youTubeEngagementRate(
  likes: number | null | undefined,
  comments: number | null | undefined,
  views: number | null | undefined,
): number | null {
  if (!views || views <= 0) return null;
  return (((likes ?? 0) + (comments ?? 0)) / views) * 100;
}
