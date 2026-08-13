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
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0) + days * 24;
  const minutes = Number(match[3] ?? 0);
  const seconds = Math.floor(Number(match[4] ?? 0));
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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
