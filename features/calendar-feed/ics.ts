/**
 * THE .ics A CALENDAR SUBSCRIPTION SERVES (lane CAL-FEED-CHART).
 *
 * Pure: the rows `users.calendar_feed_read` answered (already read as the link's owner) in, an
 * RFC 5545 calendar out. All-day values (a date with no time) become VALUE=DATE events with an
 * exclusive end; timed values become UTC instants (a value with no offset is read in the link's
 * time zone), so every calendar app draws them at the right hour. Lines are folded at 75 octets,
 * text is escaped, and an event's UID is the record id, so a re-read updates rather than duplicates.
 */

export interface FeedField {
  key: string;
  label?: string | null;
  type?: string | null;
}

export interface FeedRead {
  status: "ok" | "gone";
  title?: string;
  table_id?: string;
  time_zone?: string;
  description_field?: string | null;
  date_field?: string | null;
  end_field?: string | null;
  view?: Record<string, unknown> | null;
  fields?: FeedField[];
  table?: { name?: string; title_field?: string | null } | null;
  rows?: Array<{ id: string; document: Record<string, unknown>; level?: unknown }>;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/;

export function escapeText(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545 §3.1: no line over 75 octets; continuation lines start with one space. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      out.push(cur);
      cur = " ";
      bytes = 1;
      limit = 75;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n");
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const utcStamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** The offset (ms) a zone has from UTC at an instant. */
function zoneOffsetMs(zone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(at.getTime() / 1000) * 1000;
}

export type Moment = { kind: "date"; y: number; m: number; d: number } | { kind: "instant"; at: Date };

/** A stored value as a moment: a bare date is all-day; a time with an offset is that instant; a time without one is the link's zone's wall clock. */
export function momentOf(raw: unknown, zone: string): Moment | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  const d = DATE_ONLY.exec(v);
  if (d) return { kind: "date", y: +d[1]!, m: +d[2]!, d: +d[3]! };
  const t = DATE_TIME.exec(v);
  if (!t) return null;
  const [, y, mo, da, h, mi, s, off] = t;
  const wall = Date.UTC(+y!, +mo! - 1, +da!, +h!, +mi!, +(s ?? 0));
  if (off) {
    if (off === "Z") return { kind: "instant", at: new Date(wall) };
    const sign = off.startsWith("-") ? -1 : 1;
    const digits = off.replace(/[^0-9]/g, "");
    const mins = +digits.slice(0, 2) * 60 + +digits.slice(2, 4);
    return { kind: "instant", at: new Date(wall - sign * mins * 60_000) };
  }
  let guess = new Date(wall - zoneOffsetMs(zone, new Date(wall)));
  guess = new Date(wall - zoneOffsetMs(zone, guess));
  return { kind: "instant", at: guess };
}

/** A date or range field's value: a string, or an object with a start and an end. */
function span(raw: unknown): { start: unknown; end: unknown } {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    return { start: o["start"] ?? o["from"] ?? o["date"], end: o["end"] ?? o["to"] };
  }
  return { start: raw, end: null };
}

const dateStr = (m: { y: number; m: number; d: number }) => `${m.y}${pad(m.m)}${pad(m.d)}`;
const addDay = (m: { y: number; m: number; d: number }, n: number) => {
  const t = new Date(Date.UTC(m.y, m.m - 1, m.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
};

function plain(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(plain).filter(Boolean).join(", ");
  return "";
}

export interface IcsOptions {
  /** Origin the record links point at, e.g. https://www.aimatrx.com */
  origin: string;
  now?: Date;
}

export function buildIcs(feed: FeedRead, opts: IcsOptions): string {
  const zone = feed.time_zone || "UTC";
  const view = feed.view ?? {};
  const str = (k: string) => (typeof view[k] === "string" && view[k] ? (view[k] as string) : null);
  const startKey = feed.date_field ?? str("date_field") ?? str("start_field");
  const endKey = feed.end_field ?? str("end_field");
  const titleKey = feed.table?.title_field ?? null;
  const stamp = utcStamp(opts.now ?? new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AI Matrx//Calendar subscription//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(feed.title || "Calendar")}`,
    `X-WR-TIMEZONE:${zone}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const row of feed.rows ?? []) {
    const doc = row.document ?? {};
    // A header-only stub of a record the owner may not open carries no values: it is not an event.
    if (!doc || (doc["exists"] === true && Object.keys(doc).length <= 3 && !startKey)) continue;
    if (!startKey) continue;
    const a = span(doc[startKey]);
    const start = momentOf(a.start, zone);
    if (!start) continue;
    let endRaw: unknown = a.end;
    if (endRaw == null && endKey) endRaw = span(doc[endKey]).start;
    const end = momentOf(endRaw, zone);
    const titleRaw = (titleKey && plain(doc[titleKey])) || plain(doc["title"]) || plain(doc["name"]) || "Untitled";
    lines.push("BEGIN:VEVENT", `UID:${row.id}@aimatrx.com`, `DTSTAMP:${stamp}`);
    if (start.kind === "date") {
      lines.push(`DTSTART;VALUE=DATE:${dateStr(start)}`);
      const last = end && end.kind === "date" ? end : start;
      lines.push(`DTEND;VALUE=DATE:${dateStr(addDay(last, 1))}`);
    } else {
      lines.push(`DTSTART:${utcStamp(start.at)}`);
      const e = end && end.kind === "instant" && end.at.getTime() > start.at.getTime() ? end.at : new Date(start.at.getTime() + 3_600_000);
      lines.push(`DTEND:${utcStamp(e)}`);
    }
    lines.push(`SUMMARY:${escapeText(titleRaw)}`);
    const descKey = feed.description_field;
    const desc = descKey ? plain(doc[descKey]) : "";
    if (desc) lines.push(`DESCRIPTION:${escapeText(desc)}`);
    if (feed.table_id) lines.push(`URL:${opts.origin}/data/${feed.table_id}/r/${row.id}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
