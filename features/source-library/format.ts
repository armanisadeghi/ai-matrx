/**
 * Pure formatting for the Media Source Catalog. No React, no I/O — so the
 * numbers on the metrics header, in a table cell, in a confirm dialog and in a
 * job panel are formatted by ONE function each and cannot disagree.
 */

/** 1275 → "21:15"; 8412 → "2:20:12". Null-safe: an unknown length says so. */
export function formatDuration(seconds: number | null | undefined): string {
    if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
    const total = Math.round(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Seconds → "394.98 hours" style, for totals a person reads as a scale. */
export function formatHours(seconds: number | null | undefined): string {
    if (seconds == null || !Number.isFinite(seconds)) return "—";
    const hours = seconds / 3600;
    if (hours < 1) return `${Math.round(seconds / 60)} min`;
    if (hours < 10) return `${hours.toFixed(1)} hrs`;
    return `${Math.round(hours).toLocaleString()} hrs`;
}

/** 21740112 → "21.7M". Compact, because a views column is scanned, not read. */
export function formatCompactNumber(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "—";
    if (Math.abs(value) < 1000) return String(value);
    return new Intl.NumberFormat(undefined, {
        notation: "compact",
        maximumFractionDigits: 1,
    }).format(value);
}

export { formatCount } from "@ai-matrx/kit/format";

/** USD, and never a bare "$0" where "Free" is the honest word. */
export function formatCost(amount: number, currency = "USD"): string {
    if (amount === 0) return "Free";
    const formatted = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        minimumFractionDigits: amount < 1 ? 2 : 2,
        maximumFractionDigits: 2,
    }).format(amount);
    return formatted;
}

/** Wall-clock estimate or elapsed time, in the words a person would say. */
export function formatElapsed(ms: number | null | undefined): string {
    if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
    const seconds = ms / 1000;
    if (seconds < 10) return `${seconds.toFixed(1)}s`;
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    if (m < 60) return `${m}m ${String(s).padStart(2, "0")}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

export function formatSecondsEstimate(seconds: number | null | undefined): string {
    if (seconds == null || !Number.isFinite(seconds)) return "—";
    return formatElapsed(seconds * 1000);
}

/** "2011 – 2026" or a single year; the span a catalogue covers, at a glance. */
export function formatDateRange(
    earliest: string | null,
    latest: string | null,
): string {
    if (!earliest || !latest) return "—";
    const a = new Date(earliest);
    const b = new Date(latest);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "—";
    const ay = a.getFullYear();
    const by = b.getFullYear();
    return ay === by ? String(ay) : `${ay} – ${by}`;
}

/** "2026-09" → "Sep 2026", for the cadence chart's axis and tooltips. */
export function formatMonthPeriod(period: string): string {
    const [y, m] = period.split("-");
    const year = Number(y);
    const month = Number(m);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return period;
    const date = new Date(Date.UTC(year, month - 1, 1));
    return date.toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    });
}

/**
 * Seconds → the `t=` fragment YouTube understands, so a transcript timestamp
 * opens the video AT that moment rather than at the start.
 */
export function youtubeUrlAtSecond(url: string, second: number): string {
    const whole = Math.max(0, Math.floor(second));
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}t=${whole}s`;
}

/** "1:02:11" for a transcript cue — always h:mm:ss above an hour. */
export function formatTimestamp(seconds: number): string {
    return formatDuration(seconds);
}

const MEDIA_KIND_LABELS: Record<string, string> = {
    long: "Long",
    short: "Short",
    live: "Live",
    unknown: "Unclassified",
};

export function mediaKindLabel(value: string): string {
    return MEDIA_KIND_LABELS[value] ?? value;
}

const TRANSCRIPT_STATUS_LABELS: Record<string, string> = {
    none: "Not transcribed",
    queued: "Queued",
    running: "Transcribing",
    ready: "Ready",
    failed: "Failed",
    skipped: "Skipped",
};

export function transcriptStatusLabel(value: string): string {
    return TRANSCRIPT_STATUS_LABELS[value] ?? value;
}

const SIGNAL_SENTENCES: Record<string, string> = {
    duration: "Classified by its length.",
    shorts_url: "YouTube itself serves this at /shorts, so it is a Short.",
    live_broadcast: "YouTube reports this as a live or upcoming broadcast.",
    unknown: "Nothing has classified this yet.",
};

/** WHICH signal decided — so a screen can say why, and a person can audit it. */
export function mediaKindSignalSentence(signal: string): string {
    return SIGNAL_SENTENCES[signal] ?? `Classified by ${signal}.`;
}
