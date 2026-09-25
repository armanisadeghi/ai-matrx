// features/rich-document/annotations/mentions.ts
//
// @-MENTIONS inside comment text. One stored grammar, readable as plain text
// by anything that does not understand it:
//
//   person  @[Dana Ruiz](user:9f1c…)       → notified through cmt_mention_notify
//   date    @[Tue, Sep 30](date:2026-09-30)
//   record  [[note:<uuid>|Title]]           → the RC-B8 wikilink grammar the
//                                             ONE renderer already resolves
//
// Records are NOT a new syntax: a record mention IS a wikilink, so every
// surface rendering comment text through <RichContent> opens it.

export type MentionToken =
  | { type: "text"; text: string }
  | { type: "person"; label: string; userId: string }
  | { type: "date"; label: string; iso: string };

const MENTION_RE = /@\[([^\]\n]{1,120})\]\((user|date):([^)\s]{1,64})\)/g;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function tokenizeMentions(body: string): MentionToken[] {
  const out: MentionToken[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    const [whole, label, kind, value] = m;
    const valid = kind === "user" ? UUID_RE.test(value) : ISO_RE.test(value);
    if (!valid) continue;
    const at = m.index ?? 0;
    if (at > last) out.push({ type: "text", text: body.slice(last, at) });
    out.push(
      kind === "user"
        ? { type: "person", label, userId: value }
        : { type: "date", label, iso: value },
    );
    last = at + whole.length;
  }
  if (last < body.length) out.push({ type: "text", text: body.slice(last) });
  return out;
}

/** Distinct people a comment mentions — who cmt_mention_notify tells. */
export function mentionedUserIds(body: string): string[] {
  const ids = new Set<string>();
  for (const t of tokenizeMentions(body)) if (t.type === "person") ids.add(t.userId);
  return [...ids];
}

export function personMention(label: string, userId: string): string {
  return `@[${label.replace(/[\]\n]/g, " ").trim()}](user:${userId})`;
}

export function dateMention(date: Date): string {
  const iso = toIsoDate(date);
  const label = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `@[${label}](date:${iso})`;
}

export function recordMention(token: string, id: string, title: string): string {
  return `[[${token}:${id}|${title.replace(/[\]|\n]/g, " ").trim()}]]`;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * The date a typed @-query names, or null. Understands: today, tomorrow,
 * yesterday, a weekday ("fri", "next friday"), "in 3 days", "next week",
 * an ISO date, and "sep 30" / "30 sep" (this year, or next if past).
 */
export function parseDateQuery(query: string, now: Date = new Date()): Date | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const plus = (n: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
  if (q === "today") return base;
  if (q === "tomorrow" || q === "tmr") return plus(1);
  if (q === "yesterday") return plus(-1);
  if (q === "next week") return plus(7);
  const inDays = /^in (\d{1,3}) days?$/.exec(q);
  if (inDays) return plus(Number(inDays[1]));
  if (ISO_RE.test(q)) {
    const d = new Date(`${q}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const wd = /^(next )?([a-z]{3,9})$/.exec(q);
  if (wd) {
    const idx = WEEKDAYS.findIndex((w) => w.startsWith(wd[2]) && wd[2].length >= 3);
    if (idx >= 0) {
      // A bare weekday is the coming one (1–7 days ahead); "next" is the one after.
      let delta = (idx - base.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      if (wd[1]) delta += 7;
      return plus(delta);
    }
  }
  const md = /^([a-z]{3,9})\s+(\d{1,2})$/.exec(q) ?? /^(\d{1,2})\s+([a-z]{3,9})$/.exec(q);
  if (md) {
    const [monthText, dayText] = /^\d/.test(md[1]) ? [md[2], md[1]] : [md[1], md[2]];
    const month = MONTHS.findIndex((m) => monthText.startsWith(m));
    const day = Number(dayText);
    if (month >= 0 && day >= 1 && day <= 31) {
      let d = new Date(base.getFullYear(), month, day);
      if (d.getMonth() !== month) return null;
      if (d < base) d = new Date(base.getFullYear() + 1, month, day);
      return d;
    }
  }
  return null;
}
