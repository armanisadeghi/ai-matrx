/**
 * The format registry. ONE table — add a row here and every consumer (data
 * tables, scope context items, anything that adopts `FieldFormatId`) gets it.
 *
 * Every `format()` returns `null` rather than throwing or returning "" when the
 * value does not fit — that is what triggers THE FALLBACK LAW in `format.ts`.
 */
import type {
  FieldFormatDef,
  FieldFormatId,
  FieldFormatOptions,
  FieldBaseType,
} from "./types";

// ─── shared helpers ──────────────────────────────────────────────────────────

/** Coerce to a finite number, or null. Accepts numeric strings ("1,234", "$5"). */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[,\s$€£¥%]/g, "");
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toList(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        /* fall through to comma split */
      }
    }
    if (trimmed === "") return [];
    return trimmed.split(",").map((s) => s.trim());
  }
  return null;
}

function groupedNumber(n: number, options: FieldFormatOptions): string {
  return new Intl.NumberFormat(undefined, {
    useGrouping: options.useGrouping !== false,
    ...(options.precision != null
      ? {
          minimumFractionDigits: options.precision,
          maximumFractionDigits: options.precision,
        }
      : { maximumFractionDigits: 10 }),
  }).format(n);
}

function affix(text: string, options: FieldFormatOptions): string {
  return `${options.prefix ?? ""}${text}${options.suffix ?? ""}`;
}

const DURATION_TO_SECONDS: Record<
  NonNullable<FieldFormatOptions["durationUnit"]>,
  number
> = { milliseconds: 0.001, seconds: 1, minutes: 60, hours: 3600 };

function formatDuration(totalSeconds: number): string {
  const negative = totalSeconds < 0;
  let s = Math.abs(Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const parts =
    h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  return negative ? `-${parts}` : parts;
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

function formatBytes(bytes: number): string {
  const negative = bytes < 0;
  let n = Math.abs(bytes);
  let unit = 0;
  while (n >= 1024 && unit < BYTE_UNITS.length - 1) {
    n /= 1024;
    unit += 1;
  }
  const text = `${unit === 0 ? n : n.toFixed(n < 10 ? 1 : 0)} ${BYTE_UNITS[unit]}`;
  return negative ? `-${text}` : text;
}

const RELATIVE_STEPS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, "second"],
  [3600, "minute"],
  [86400, "hour"],
  [604800, "day"],
  [2629800, "week"],
  [31557600, "month"],
  [Number.POSITIVE_INFINITY, "year"],
];

const RELATIVE_DIVISORS: Record<string, number> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 2629800,
  year: 31557600,
};

function formatRelative(date: Date): string {
  const deltaSeconds = (date.getTime() - Date.now()) / 1000;
  const abs = Math.abs(deltaSeconds);
  const step = RELATIVE_STEPS.find(([limit]) => abs < limit);
  const unit = step ? step[1] : "year";
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  return rtf.format(
    Math.round(deltaSeconds / RELATIVE_DIVISORS[unit as string]),
    unit,
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Explicit scheme, OR a host with a real dot-TLD. No whitespace either way. */
const URL_RE =
  /^(?:[a-z][a-z0-9+.-]*:\/\/\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[:/?#]\S*)?)$/i;
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

// ─── the registry ────────────────────────────────────────────────────────────

const DEFS: FieldFormatDef[] = [
  // ── Text ──────────────────────────────────────────────────────────────────
  {
    id: "text",
    label: "Text",
    description: "Plain single-line text",
    group: "Text",
    base: "string",
    editor: "text",
    // Deliberately no optionKeys — plain text is the default for every string
    // column, and giving it prefix/suffix controls puts an options row under
    // every column in the settings dialog for a setting almost nobody wants.
    format: (v, o) => {
      const t = toText(v);
      return t === null ? null : affix(t, o);
    },
    parse: (raw) => (raw === "" || raw == null ? null : String(raw)),
  },
  {
    id: "long_text",
    label: "Long text",
    description: "Multi-line text, edited in a larger box",
    group: "Text",
    base: "string",
    editor: "textarea",
    format: (v) => toText(v),
    parse: (raw) => (raw === "" || raw == null ? null : String(raw)),
  },
  {
    id: "markdown",
    label: "Markdown",
    description: "Rich text written as Markdown",
    group: "Text",
    base: "string",
    editor: "textarea",
    rich: true,
    format: (v) => toText(v),
    parse: (raw) => (raw === "" || raw == null ? null : String(raw)),
  },
  {
    id: "email",
    label: "Email",
    description: "Email address — click to compose",
    group: "Text",
    base: "string",
    editor: "email",
    rich: true,
    format: (v) => {
      const t = toText(v)?.trim();
      if (!t) return null;
      return EMAIL_RE.test(t) ? t : null;
    },
    parse: (raw) => (raw === "" || raw == null ? null : String(raw).trim()),
  },
  {
    id: "url",
    label: "Link",
    description: "Web address — click to open",
    group: "Text",
    base: "string",
    editor: "url",
    rich: true,
    format: (v) => {
      const t = toText(v)?.trim();
      if (!t) return null;
      // `new URL()` alone is uselessly permissive here: `https://Beijing` and
      // even `https://Washington, D.C.` parse successfully, so every text value
      // would render as a broken link instead of flagging as a mismatch.
      // Require no whitespace, and either an explicit scheme or a real
      // dot-TLD host. Bare domains stay accepted; https is added on click.
      if (/\s/.test(t)) return null;
      if (!URL_RE.test(t)) return null;
      try {
        new URL(t.includes("://") ? t : `https://${t}`);
        return t;
      } catch {
        return null;
      }
    },
    parse: (raw) => (raw === "" || raw == null ? null : String(raw).trim()),
  },
  {
    id: "phone",
    label: "Phone",
    description: "Phone number — click to call",
    group: "Text",
    base: "string",
    editor: "tel",
    rich: true,
    format: (v) => {
      const t = toText(v)?.trim();
      if (!t) return null;
      // Must contain at least 7 digits to be a plausible phone number.
      return (t.match(/\d/g) ?? []).length >= 7 ? t : null;
    },
    parse: (raw) => (raw === "" || raw == null ? null : String(raw).trim()),
  },
  {
    id: "color",
    label: "Color",
    description: "Hex color with a swatch",
    group: "Text",
    base: "string",
    editor: "color",
    rich: true,
    format: (v) => {
      const t = toText(v)?.trim();
      if (!t) return null;
      return HEX_RE.test(t) ? t.toLowerCase() : null;
    },
    parse: (raw) => (raw === "" || raw == null ? null : String(raw).trim()),
  },

  // ── Numbers ───────────────────────────────────────────────────────────────
  {
    id: "number",
    label: "Number",
    description: "Plain number",
    group: "Numbers",
    base: "number",
    alsoAccepts: ["integer"],
    editor: "number",
    numericAlign: true,
    optionKeys: ["useGrouping", "precision", "prefix", "suffix"],
    format: (v, o) => {
      const n = toNumber(v);
      return n === null ? null : affix(groupedNumber(n, o), o);
    },
    parse: (raw) => toNumber(raw),
  },
  {
    id: "decimal",
    label: "Decimal",
    description: "Number with fixed decimal places",
    group: "Numbers",
    base: "number",
    alsoAccepts: ["integer"],
    editor: "number",
    numericAlign: true,
    optionKeys: ["precision", "useGrouping", "prefix", "suffix"],
    format: (v, o) => {
      const n = toNumber(v);
      if (n === null) return null;
      return affix(groupedNumber(n, { ...o, precision: o.precision ?? 2 }), o);
    },
    parse: (raw) => toNumber(raw),
  },
  {
    id: "currency",
    label: "Currency",
    description: "Money — stored as a plain number, shown with a symbol",
    group: "Numbers",
    base: "number",
    alsoAccepts: ["integer"],
    editor: "number",
    numericAlign: true,
    optionKeys: ["currency", "precision"],
    format: (v, o) => {
      const n = toNumber(v);
      if (n === null) return null;
      const currency = (o.currency || "USD").toUpperCase();
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency,
          ...(o.precision != null
            ? {
                minimumFractionDigits: o.precision,
                maximumFractionDigits: o.precision,
              }
            : {}),
        }).format(n);
      } catch {
        // Unknown/invalid ISO code — still show the money, never blank it.
        return `${groupedNumber(n, { precision: o.precision ?? 2 })} ${currency}`;
      }
    },
    parse: (raw) => toNumber(raw),
  },
  {
    id: "percent",
    label: "Percent",
    description: "Percentage — stored as a plain number",
    group: "Numbers",
    base: "number",
    alsoAccepts: ["integer"],
    editor: "number",
    numericAlign: true,
    optionKeys: ["percentScale", "precision"],
    format: (v, o) => {
      const n = toNumber(v);
      if (n === null) return null;
      const shown = o.percentScale === "fraction" ? n * 100 : n;
      return `${groupedNumber(shown, { precision: o.precision })}%`;
    },
    parse: (raw) => toNumber(raw),
  },
  {
    id: "duration",
    label: "Duration",
    description: "Length of time, shown as h:mm:ss",
    group: "Numbers",
    base: "number",
    alsoAccepts: ["integer"],
    editor: "number",
    numericAlign: true,
    optionKeys: ["durationUnit"],
    format: (v, o) => {
      const n = toNumber(v);
      if (n === null) return null;
      return formatDuration(n * DURATION_TO_SECONDS[o.durationUnit ?? "seconds"]);
    },
    parse: (raw) => toNumber(raw),
  },
  {
    id: "integer",
    label: "Whole number",
    description: "Integer with no decimal part",
    group: "Numbers",
    base: "integer",
    alsoAccepts: ["number"],
    editor: "number",
    numericAlign: true,
    optionKeys: ["useGrouping", "prefix", "suffix"],
    format: (v, o) => {
      const n = toNumber(v);
      if (n === null) return null;
      return affix(groupedNumber(Math.trunc(n), { ...o, precision: 0 }), o);
    },
    parse: (raw) => {
      const n = toNumber(raw);
      return n === null ? null : Math.trunc(n);
    },
  },
  {
    id: "rating",
    label: "Rating",
    description: "Score out of a maximum, shown as stars",
    group: "Numbers",
    base: "integer",
    alsoAccepts: ["number"],
    editor: "rating",
    rich: true,
    optionKeys: ["ratingMax"],
    format: (v, o) => {
      const n = toNumber(v);
      if (n === null) return null;
      const max = o.ratingMax ?? 5;
      if (n < 0 || n > max) return null;
      return `${n} / ${max}`;
    },
    parse: (raw) => {
      const n = toNumber(raw);
      return n === null ? null : Math.round(n);
    },
  },
  {
    id: "file_size",
    label: "File size",
    description: "Byte count shown as KB / MB / GB",
    group: "Numbers",
    base: "integer",
    alsoAccepts: ["number"],
    editor: "number",
    numericAlign: true,
    format: (v) => {
      const n = toNumber(v);
      return n === null ? null : formatBytes(n);
    },
    parse: (raw) => {
      const n = toNumber(raw);
      return n === null ? null : Math.trunc(n);
    },
  },

  // ── Choice ────────────────────────────────────────────────────────────────
  {
    id: "boolean",
    label: "Yes / No",
    description: "True or false",
    group: "Choice",
    base: "boolean",
    editor: "checkbox",
    format: (v) => {
      if (typeof v === "boolean") return v ? "Yes" : "No";
      if (v === "true" || v === 1) return "Yes";
      if (v === "false" || v === 0) return "No";
      return null;
    },
    parse: (raw) => {
      if (typeof raw === "boolean") return raw;
      if (raw == null || raw === "") return null;
      return String(raw).toLowerCase() === "true" || raw === 1;
    },
  },

  // ── Dates ─────────────────────────────────────────────────────────────────
  {
    id: "date",
    label: "Date",
    description: "Calendar date",
    group: "Dates",
    base: "date",
    alsoAccepts: ["datetime", "string"],
    editor: "date",
    optionKeys: ["dateStyle"],
    format: (v, o) => {
      const d = toDate(v);
      if (!d) return null;
      return d.toLocaleDateString(undefined, {
        dateStyle: o.dateStyle ?? "medium",
      });
    },
    parse: (raw) => (raw === "" || raw == null ? null : String(raw)),
  },
  {
    id: "datetime",
    label: "Date & time",
    description: "Calendar date with a time of day",
    group: "Dates",
    base: "datetime",
    alsoAccepts: ["date", "string"],
    editor: "datetime",
    optionKeys: ["dateStyle"],
    format: (v, o) => {
      const d = toDate(v);
      if (!d) return null;
      return d.toLocaleString(undefined, {
        dateStyle: o.dateStyle ?? "medium",
        timeStyle: "short",
      });
    },
    parse: (raw) => (raw === "" || raw == null ? null : String(raw)),
  },
  {
    id: "relative_time",
    label: "Relative time",
    description: 'Shown as "3 days ago"',
    group: "Dates",
    base: "datetime",
    alsoAccepts: ["date", "string"],
    editor: "datetime",
    format: (v) => {
      const d = toDate(v);
      return d ? formatRelative(d) : null;
    },
    parse: (raw) => (raw === "" || raw == null ? null : String(raw)),
  },

  // ── Structured ────────────────────────────────────────────────────────────
  {
    id: "json",
    label: "JSON",
    description: "Structured object",
    group: "Structured",
    base: "json",
    alsoAccepts: ["array"],
    editor: "json",
    format: (v) => {
      if (v === null || v === undefined) return null;
      if (typeof v === "object") return JSON.stringify(v);
      return toText(v);
    },
    parse: (raw) => {
      if (raw == null || raw === "") return null;
      if (typeof raw !== "string") return raw;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return raw;
      }
    },
  },
  {
    id: "array",
    label: "List",
    description: "List of values",
    group: "Structured",
    base: "array",
    alsoAccepts: ["json"],
    editor: "json",
    format: (v) => {
      const list = toList(v);
      return list === null ? null : list.map((i) => String(i)).join(", ");
    },
    parse: (raw) => {
      if (raw == null || raw === "") return null;
      if (Array.isArray(raw)) return raw;
      return toList(raw) ?? raw;
    },
  },
  {
    id: "tags",
    label: "Tags",
    description: "List of values shown as chips",
    group: "Structured",
    base: "array",
    alsoAccepts: ["json", "string"],
    editor: "json",
    rich: true,
    format: (v) => {
      const list = toList(v);
      return list === null ? null : list.map((i) => String(i)).join(", ");
    },
    parse: (raw) => {
      if (raw == null || raw === "") return null;
      if (Array.isArray(raw)) return raw;
      return toList(raw) ?? raw;
    },
  },
];

export const FIELD_FORMATS: Readonly<Record<FieldFormatId, FieldFormatDef>> =
  Object.freeze(
    Object.fromEntries(DEFS.map((d) => [d.id, d])) as Record<
      FieldFormatId,
      FieldFormatDef
    >,
  );

export const FIELD_FORMAT_LIST: readonly FieldFormatDef[] = Object.freeze(DEFS);

export const FIELD_FORMAT_IDS = DEFS.map((d) => d.id) as FieldFormatId[];

export function getFieldFormat(
  id: string | null | undefined,
): FieldFormatDef | null {
  if (!id) return null;
  return FIELD_FORMATS[id as FieldFormatId] ?? null;
}

/**
 * The format a column gets when it declares none — the identity format for its
 * storage type. Every existing column therefore behaves exactly as before.
 */
export function defaultFormatForBase(base: string): FieldFormatId {
  switch (base as FieldBaseType) {
    case "number":
      return "number";
    case "integer":
      return "integer";
    case "boolean":
      return "boolean";
    case "date":
      return "date";
    case "datetime":
      return "datetime";
    case "json":
      return "json";
    case "array":
      return "array";
    default:
      return "text";
  }
}

/** Formats that can legally sit on a given storage type. */
export function formatsForBase(base: string): FieldFormatDef[] {
  return DEFS.filter(
    (d) => d.base === base || (d.alsoAccepts ?? []).includes(base as FieldBaseType),
  );
}

/** Group the pickable formats for a base type, preserving registry order. */
export function groupedFormatsForBase(
  base: string,
): { group: FieldFormatDef["group"]; formats: FieldFormatDef[] }[] {
  const out: { group: FieldFormatDef["group"]; formats: FieldFormatDef[] }[] =
    [];
  for (const def of formatsForBase(base)) {
    const bucket = out.find((g) => g.group === def.group);
    if (bucket) bucket.formats.push(def);
    else out.push({ group: def.group, formats: [def] });
  }
  return out;
}
