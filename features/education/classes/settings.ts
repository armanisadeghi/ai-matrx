// features/education/classes/settings.ts
//
// Pure parse/serialize between a class scope's raw `settings` JSONB and the
// education-facing `ClassSettings` shape. No I/O — importable + testable. The
// scope system persists `settings` verbatim; this is the ONE place the class
// layer reads/writes its shape, so a schema change lives here, not per-callsite.

import type { Scope } from "@/features/agent-context/redux/scope/types";
import { CLASS_SETTINGS_KEYS, DEFAULT_ACCESS_MODE } from "./constants";
import type {
  AccessMode,
  ClassExamDate,
  ClassSettings,
  StudyClass,
} from "./types";

/** Coerce any value to a valid AccessMode, defaulting missing → 'closed'. */
export function parseAccessMode(v: unknown): AccessMode {
  return v === "open" || v === "closed" || v === "paid"
    ? v
    : DEFAULT_ACCESS_MODE;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

/** Parse exam dates defensively — a malformed row is dropped, never thrown. */
function parseExamDates(v: unknown): ClassExamDate[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((row): ClassExamDate | null => {
      const r = asRecord(row);
      const title = asString(r.title);
      const date = asString(r.date);
      if (!title || !date) return null;
      const id = asString(r.id) ?? `${date}-${title}`;
      return { id, title, date };
    })
    .filter((x): x is ClassExamDate => x !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Raw scope.settings JSONB → structured ClassSettings. */
export function parseClassSettings(raw: unknown): ClassSettings {
  const s = asRecord(raw);
  return {
    examDates: parseExamDates(s[CLASS_SETTINGS_KEYS.examDates]),
    teacher: asString(s[CLASS_SETTINGS_KEYS.teacher]),
    term: asString(s[CLASS_SETTINGS_KEYS.term]),
    period: asString(s[CLASS_SETTINGS_KEYS.period]),
    color: asString(s[CLASS_SETTINGS_KEYS.color]),
    archived: s[CLASS_SETTINGS_KEYS.archived] === true,
    accessMode: parseAccessMode(s[CLASS_SETTINGS_KEYS.accessMode]),
  };
}

/** Structured ClassSettings → JSONB payload for create_scope / update_scope. */
export function serializeClassSettings(
  settings: ClassSettings,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    [CLASS_SETTINGS_KEYS.examDates]: settings.examDates.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
    })),
  };
  if (settings.teacher) out[CLASS_SETTINGS_KEYS.teacher] = settings.teacher;
  if (settings.term) out[CLASS_SETTINGS_KEYS.term] = settings.term;
  if (settings.period) out[CLASS_SETTINGS_KEYS.period] = settings.period;
  if (settings.color) out[CLASS_SETTINGS_KEYS.color] = settings.color;
  if (settings.archived) out[CLASS_SETTINGS_KEYS.archived] = true;
  // access_mode is always persisted — update_scope replaces the whole settings
  // JSONB, so omitting it would silently drop the class's access mode.
  out[CLASS_SETTINGS_KEYS.accessMode] = settings.accessMode;
  return out;
}

/** Adapt a raw scope row into the education-facing StudyClass view. */
export function scopeToClass(scope: Scope): StudyClass {
  return {
    id: scope.id,
    slug: scope.slug ?? null,
    name: scope.name,
    description: scope.description ?? "",
    organizationId: scope.organization_id,
    settings: parseClassSettings(scope.settings),
    raw: scope,
  };
}

/** The next exam date on or after `today` (ISO), or null. */
export function nextExamDate(
  settings: ClassSettings,
  today: string,
): ClassExamDate | null {
  return settings.examDates.find((e) => e.date >= today) ?? null;
}

/** Whole-days until an ISO date from an ISO `today` (negative = past). */
export function daysUntil(isoDate: string, today: string): number {
  const a = Date.parse(`${isoDate}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((a - b) / 86_400_000);
}
