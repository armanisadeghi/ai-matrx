/**
 * The page capture — ONE description of what a person is looking at, handed to
 * both consumers of "show the agent this page" (lane ALCHEMY-BUTTON, Arman
 * 2026-09-25):
 *
 * - the Alchemy menu (`CopyButtons` over `MatrxCopyMenu`): the default copy is
 *   everything, "Only the data" drops the request log, and the Groomer is the
 *   filter (per-section Full / Compact / Brief / Off);
 * - the admin debug context (`useDebugContext`, LargeIndicator "Copy Full
 *   Context").
 *
 * A capture always names the page (title, route, url, surface kind), the exact
 * selection with names AND ids, the errors on screen verbatim, the data
 * sections, and the recent requests with their timings. Pure: no React, no
 * network — the suite drives it directly.
 */

import type { AgentPayloadInput } from "@ai-matrx/kit/content-transfer";
import type {
  AlchemyDetail,
  AlchemyGroomerConfig,
  AlchemyGroomerSection,
} from "@ai-matrx/design-system/content-transfer";

export type PageCaptureKind = "table-page" | "record" | "dialog" | "admin-page";

/** A chosen thing, by name and id. Either may be null (not chosen / not loaded). */
export interface PageCaptureNamed {
  id: string | null;
  name: string | null;
}

export type PageCaptureValue = PageCaptureNamed | string | number | boolean | null;

export interface PageCaptureSection {
  /** Stable id — the Groomer's section id. Unique within one capture. */
  id: string;
  /** What the person calls this part of the page. */
  title: string;
  description?: string;
  /** `data` survives "Only the data"; `request` does not. */
  role: "data" | "request";
  value: unknown;
  /** The one-line brief (counts, a sentence). Defaults to the value's shape. */
  brief?: unknown;
  /**
   * A section too big to hold on the page (a table's records): `value` is the
   * honest stub saying it is not included, and `load` reads it at copy time for
   * the "with …" variants. Never a second read while the page is only open.
   */
  load?: () => Promise<unknown>;
}

export interface PageCaptureRequest {
  method: string;
  path: string;
  status: string;
  httpStatus?: number;
  durationMs?: number;
  requestId?: string;
  /** Which client door (supabase-rest, supabase-rpc, aidream, next-api …). */
  client?: string;
  /** The JSON request body under 8 KB, credentials redacted. */
  requestBody?: unknown;
  requestBodyNote?: string;
  /** A failed request's own sentence from the server (the refusal, verbatim). */
  errorSentence?: string;
  timestamp: number;
}

export interface PageCapture {
  kind: PageCaptureKind;
  title: string;
  route: string;
  url?: string;
  /** What this page is OF (table, record, dialog subject …), names and ids. */
  identity: Record<string, PageCaptureValue>;
  /** The exact choices the person made on the page, in order. */
  selection: Record<string, PageCaptureValue>;
  sections: PageCaptureSection[];
  /** The error sentences on screen, verbatim. */
  errors: string[];
  requests: PageCaptureRequest[];
}

export interface PageCaptureContribution {
  owner: string;
  sections: PageCaptureSection[];
  /** Names a descendant knows and the page does not (a table's name read inside its mount). */
  identity?: Record<string, PageCaptureValue>;
}

const COMPACT_CHARS = 6000;

// ── THE CAPTURE IS PLAIN JSON (lane V24-TAILS, VERIFIER-24 item 6). ──
//
// A table page's capture carried a `load` function and a declaration read from the store; the
// Alchemy workspace clones its source through the kit's strict JSON clone, which refused the whole
// capture with a bare "Unsupported value". Every value a surface registers is made plain here, at
// registration: dates become ISO text, maps and sets become arrays, functions and symbols are
// dropped, `undefined` properties are dropped, a repeated reference becomes a named marker. A value
// that still cannot be represented is refused by `checkedTransferJson` with its path in words.

/** The marker a cycle leaves where the repeated object would have been. */
export const CIRCULAR_MARKER_PREFIX = "[circular reference to ";

/** A JSON pointer path in words: `/sections/1/load` → `sections › 1 › load`; root is "the capture itself". */
export function pathInWords(path: string | undefined | null): string {
  if (!path || path === "/") return "the capture itself";
  return path
    .split("/")
    .filter((p) => p !== "")
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"))
    .join(" › ");
}

function plainAt(value: unknown, path: string, stack: WeakMap<object, string>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return undefined;
  if (typeof value !== "object") return String(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "Invalid date" : value.toISOString();
  const seenAt = stack.get(value);
  if (seenAt !== undefined) return `${CIRCULAR_MARKER_PREFIX}${pathInWords(seenAt)}]`;
  stack.set(value, path);
  try {
    if (Array.isArray(value)) {
      return Array.from(value, (x, i) => {
        const v = plainAt(x, `${path}/${i}`, stack);
        return v === undefined ? null : v;
      });
    }
    if (value instanceof Map) {
      return Array.from(value.entries(), ([k, v], i) => ({
        key: plainAt(k, `${path}/${i}/key`, stack) ?? null,
        value: plainAt(v, `${path}/${i}/value`, stack) ?? null,
      }));
    }
    if (value instanceof Set) {
      return Array.from(value.values(), (x, i) => plainAt(x, `${path}/${i}`, stack) ?? null);
    }
    if (ArrayBuffer.isView(value)) {
      return Array.from(value as unknown as ArrayLike<number>, (x) => (typeof x === "bigint" ? String(x) : x));
    }
    if (value instanceof Error) return { name: value.name, message: value.message };
    const withJson = value as { toJSON?: () => unknown };
    if (typeof withJson.toJSON === "function") {
      return plainAt(withJson.toJSON(), path, stack);
    }
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(value as Record<string, unknown>)) {
      const v = plainAt(x, `${path}/${k.replace(/~/g, "~0").replace(/\//g, "~1")}`, stack);
      if (v !== undefined) out[k] = v;
    }
    return out;
  } finally {
    stack.delete(value);
  }
}

/**
 * Any value as plain JSON: dates to ISO, maps to `{key, value}` arrays, sets to arrays, class
 * instances to their own fields (or their `toJSON`), functions / symbols / `undefined` dropped
 * (`null` inside an array), a cycle broken with "[circular reference to <path>]".
 */
export function toPlainJson(value: unknown): unknown {
  const v = plainAt(value, "", new WeakMap());
  return v === undefined ? null : v;
}

/**
 * The strict check the Alchemy workspace makes, run here first so a refusal names WHERE: a value
 * the kit's clone refuses throws a sentence with the path in words, never "Unsupported value" alone.
 */
export function checkedTransferJson<T>(value: T, what: string): T {
  const walk = (v: unknown, path: string, seen: Set<object>): void => {
    if (v === null || typeof v === "string" || typeof v === "boolean") return;
    const refuse = (why: string): never => {
      throw new Error(`${what} could not be prepared: ${pathInWords(path)} ${why}.`);
    };
    if (typeof v === "number") {
      if (!Number.isFinite(v)) refuse(`is ${String(v)}, which is not a number JSON can hold`);
      return;
    }
    if (typeof v !== "object") refuse(`is ${v === undefined ? "missing (undefined)" : `a ${typeof v}`}, which is not plain data`);
    const o = v as object;
    if (seen.has(o)) refuse("refers back to itself");
    const proto = Object.getPrototypeOf(o);
    if (!Array.isArray(o) && proto !== Object.prototype && proto !== null) {
      refuse(`is a ${(o as { constructor?: { name?: string } }).constructor?.name ?? "class instance"}, not a plain object`);
    }
    seen.add(o);
    if (Array.isArray(o)) o.forEach((x, i) => walk(x, `${path}/${i}`, seen));
    else for (const [k, x] of Object.entries(o)) if (x !== undefined) walk(x, `${path}/${k}`, seen);
    seen.delete(o);
  };
  walk(value, "", new Set());
  return value;
}


function isNamed(v: PageCaptureValue): v is PageCaptureNamed {
  return typeof v === "object" && v !== null && "id" in v && "name" in v;
}

/** `Name (id)`, `Name`, `(id)`, or "not chosen". */
export function describeValue(v: PageCaptureValue): string {
  if (v === null || v === undefined || v === "") return "not chosen";
  if (isNamed(v)) {
    if (v.name && v.id) return `${v.name} (${v.id})`;
    if (v.name) return v.name;
    if (v.id) return `(${v.id})`;
    return "not chosen";
  }
  return String(v);
}

function describeRecord(rec: Record<string, PageCaptureValue>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) out[k] = describeValue(v);
  return out;
}

function toJson(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return String(value);
  }
}

function shapeOf(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (value && typeof value === "object") return `${Object.keys(value).length} fields`;
  if (value === null || value === undefined) return "empty";
  return toJson(value).slice(0, 200);
}

/** A value cut at COMPACT_CHARS, saying what was left out. Small values pass whole. */
function compactValue(value: unknown): unknown {
  const text = toJson(value);
  if (text.length <= COMPACT_CHARS) return value;
  return {
    omitted: `${(text.length - COMPACT_CHARS).toLocaleString("en-US")} characters left out of ${text.length.toLocaleString("en-US")} (${shapeOf(value)}); choose Full for all of it.`,
    preview: text.slice(0, COMPACT_CHARS),
  };
}

/** Merge descendant sections into a capture. Two owners claiming one id is a loud error. */
export function mergePageCapture(
  base: PageCapture,
  contributions: readonly PageCaptureContribution[],
): PageCapture {
  const owners = new Map<string, string>(base.sections.map((s) => [s.id, "page"]));
  const sections = [...base.sections];
  const identity = { ...base.identity };
  for (const c of contributions) {
    for (const [k, v] of Object.entries(c.identity ?? {})) {
      // A descendant fills in what the page left unnamed; it never overrides a name the page gave.
      const prior = identity[k];
      if (prior === undefined || prior === null || (isNamed(prior) && !prior.name)) identity[k] = v;
    }
    for (const s of c.sections) {
      const prior = owners.get(s.id);
      if (prior) {
        throw new Error(
          `[page-capture] section "${s.id}" is claimed by both "${prior}" and "${c.owner}"`,
        );
      }
      owners.set(s.id, c.owner);
      sections.push(s);
    }
  }
  return { ...base, identity, sections };
}

function plainNamedRecord(rec: Record<string, PageCaptureValue>): Record<string, PageCaptureValue> {
  return toPlainJson(rec) as Record<string, PageCaptureValue>;
}

/**
 * THE CAPTURE MADE PLAIN AT REGISTRATION (`getActivePageCapture` calls this): identity, selection,
 * every section's value and brief, and every request body are plain JSON. A section's `load` stays a
 * function — it is how the "with …" copies read — and is never handed to a transfer (see
 * `pageCaptureJson`).
 */
export function normalizePageCapture(c: PageCapture): PageCapture {
  return {
    ...c,
    identity: plainNamedRecord(c.identity),
    selection: plainNamedRecord(c.selection),
    errors: c.errors.map((e) => String(e)),
    sections: c.sections.map((s) => {
      const out: PageCaptureSection = { ...s, value: toPlainJson(s.value) };
      if (s.brief !== undefined) out.brief = toPlainJson(s.brief);
      else delete out.brief;
      if (s.description === undefined) delete out.description;
      if (s.load === undefined) delete out.load;
      return out;
    }),
    requests: c.requests.map((r) => toPlainJson(r) as PageCaptureRequest),
  };
}

/**
 * The capture as the Alchemy menu's JSON source (the "Prepare for AI" workspace clones it): plain,
 * with each `load` replaced by the sentence saying the section is read at copy time.
 */
export function pageCaptureJson(c: PageCapture): Record<string, unknown> {
  const plain = normalizePageCapture(c);
  return checkedTransferJson(
    toPlainJson({
      ...plain,
      sections: plain.sections.map(({ load, ...s }) =>
        load ? { ...s, read_at_copy_time: `Choose a "with ${s.title.toLowerCase()}" copy to read it now.` } : s,
      ),
    }) as Record<string, unknown>,
    `The ${c.title} page`,
  );
}

function pageBlock(c: PageCapture) {
  return {
    title: c.title,
    kind: c.kind,
    route: c.route,
    ...(c.url ? { url: c.url } : {}),
    ...describeRecord(c.identity),
  };
}

/** An envelope key is an XML name (the kit refuses anything else): "Scope type" → "scope-type". */
export function envelopeKey(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return /^[a-z_]/.test(slug) ? slug : `k-${slug || "value"}`;
}

function keyed(rec: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(rec).map(([k, v]) => [envelopeKey(k), v]));
}

function envelopeContext(c: PageCapture): Record<string, string> {
  return {
    page: c.title,
    "surface-kind": c.kind,
    route: c.route,
    ...keyed(describeRecord(c.identity)),
    ...keyed(describeRecord(c.selection)),
  };
}

function attributes(c: PageCapture) {
  return {
    sections: c.sections.length,
    errors: c.errors.length,
    requests: c.requests.length,
  };
}

/** The Groomer — the filter. Page identity is never cuttable; everything else is. */
export function pageCaptureGroomer(c: PageCapture): AlchemyGroomerConfig {
  const sections: AlchemyGroomerSection[] = [
    {
      id: "page",
      title: "Page",
      description: "Which page this is: title, route, address and what it is of.",
      cuttable: false,
      build: () => pageBlock(c),
    },
    {
      id: "selection",
      title: "Selection",
      description: "The exact choices on the page, names and ids.",
      cuttable: false,
      build: () => describeRecord(c.selection),
    },
  ];
  if (c.errors.length > 0) {
    sections.push({
      id: "errors",
      title: "Errors on screen",
      cuttable: false,
      build: () => c.errors,
    });
  }
  for (const s of c.sections) {
    if (s.role !== "data") continue;
    sections.push({
      id: s.id,
      title: s.title,
      description: s.description,
      build: (level: AlchemyDetail) =>
        checkedTransferJson(
          toPlainJson(
            level === "full"
              ? s.value
              : level === "compact"
                ? compactValue(s.value)
                : (s.brief ?? shapeOf(s.value)),
          ),
          `The "${s.title}" section`,
        ),
    });
  }
  const requestSections = c.sections.filter((s) => s.role === "request");
  if (c.requests.length > 0 || requestSections.length > 0) {
    sections.push({
      id: "requests",
      title: "Recent requests",
      description: "The last server calls (every client: supabase, records, aidream, fetch): failing ones first with the server's sentence, then newest first, with status, timing and the JSON request body.",
      defaultSelection: "compact",
      build: (level: AlchemyDetail) => {
        const log = level === "brief" ? c.requests.slice(0, 3) : c.requests;
        const extra = Object.fromEntries(
          requestSections.map((s) => [
            s.title,
            level === "full" ? s.value : level === "compact" ? compactValue(s.value) : (s.brief ?? shapeOf(s.value)),
          ]),
        );
        return checkedTransferJson(toPlainJson({ log, ...extra }), "The request log");
      },
    });
  }
  return {
    label: c.title,
    kind: `page-capture.${c.kind}`,
    location: `${c.title} — ${c.route}`,
    description: `What the person sees on ${c.title}: the page, the selection, the data${c.requests.length ? " and the recent requests" : ""}.`,
    context: envelopeContext(c),
    attributes: attributes(c),
    sections,
  };
}

/** "everything" — every section in full; "data" — the page, selection, errors and data only. */
export function pageCapturePayload(
  c: PageCapture,
  variant: "everything" | "data",
): AgentPayloadInput {
  const g = pageCaptureGroomer(c);
  const data: Record<string, unknown> = {};
  for (const s of g.sections) {
    if (variant === "data" && s.id === "requests") continue;
    data[s.id] = s.build("full");
  }
  return {
    kind: g.kind,
    location: g.location,
    description:
      variant === "data"
        ? `${g.description} Request log left out.`
        : g.description,
    context: g.context,
    attributes: g.attributes,
    data,
  };
}

/** The human copy — readable markdown, errors first. */
export function pageCaptureMarkdown(c: PageCapture): string {
  const lines: string[] = [`# ${c.title}`, "", `- Page kind: ${c.kind}`, `- Route: ${c.route}`];
  if (c.url) lines.push(`- Address: ${c.url}`);
  for (const [k, v] of Object.entries(c.identity)) lines.push(`- ${k}: ${describeValue(v)}`);
  if (Object.keys(c.selection).length > 0) {
    lines.push("", "## Selection");
    for (const [k, v] of Object.entries(c.selection)) lines.push(`- ${k}: ${describeValue(v)}`);
  }
  if (c.errors.length > 0) {
    lines.push("", "## Errors on screen");
    for (const e of c.errors) lines.push(`- ${e}`);
  }
  for (const s of c.sections) {
    lines.push("", `## ${s.title}`);
    if (s.description) lines.push(s.description, "");
    const text = toJson(s.value);
    lines.push(typeof s.value === "string" ? text : "```json\n" + text + "\n```");
  }
  if (c.requests.length > 0) {
    lines.push("", "## Recent requests", "", "Failing first, then newest first.", "", "| Status | Request | HTTP | Duration | Request id | Server said |", "|---|---|---|---|---|---|");
    const cell = (t: string) => t.replace(/\|/g, "\\|").replace(/\n/g, " ");
    for (const r of c.requests) {
      lines.push(
        `| ${r.status} | ${cell(`${r.method} ${r.path}`)} | ${r.httpStatus ?? ""} | ${typeof r.durationMs === "number" ? `${Math.round(r.durationMs)} ms` : ""} | ${r.requestId ?? ""} | ${cell(r.errorSentence ?? "")} |`,
      );
    }
    const withBodies = c.requests.filter((r) => r.requestBody !== undefined);
    for (const r of withBodies) {
      lines.push("", `Request body — ${r.method} ${r.path}`, "```json", toJson(r.requestBody), "```");
    }
  }
  return lines.join("\n");
}

/** The admin debug context entries (`useDebugContext(namespace).publish`). */
export function pageCaptureDebugEntries(c: PageCapture): Record<string, unknown> {
  const out: Record<string, unknown> = {
    Page: c.title,
    Kind: c.kind,
    Route: c.route,
    ...(c.url ? { Address: c.url } : {}),
    ...describeRecord(c.identity),
    ...describeRecord(c.selection),
  };
  if (c.errors.length > 0) out["Errors"] = c.errors;
  for (const s of c.sections) out[s.title] = s.value;
  if (c.requests.length > 0) out["Recent requests"] = c.requests;
  return out;
}

// ── One helper per surface kind: each states its own identity. ──

interface CaptureBase {
  title: string;
  route: string;
  url?: string;
  selection?: Record<string, PageCaptureValue>;
  sections: PageCaptureSection[];
  errors?: Array<string | null | undefined | false>;
  requests?: PageCaptureRequest[];
}

function finish(
  kind: PageCaptureKind,
  base: CaptureBase,
  identity: Record<string, PageCaptureValue>,
): PageCapture {
  return {
    kind,
    title: base.title,
    route: base.route,
    ...(base.url ? { url: base.url } : {}),
    identity,
    selection: base.selection ?? {},
    sections: base.sections,
    errors: (base.errors ?? []).filter((e): e is string => typeof e === "string" && e !== ""),
    requests: base.requests ?? [],
  };
}

/** A table page: which table, which view (Sheet/Grid/Board/Calendar), its filters as selection. */
export function tablePageCapture(
  base: CaptureBase & { table: PageCaptureNamed; view?: string | null },
): PageCapture {
  return finish("table-page", base, { Table: base.table, View: base.view ?? null });
}

/** A record page: which record, of which table. */
export function recordPageCapture(
  base: CaptureBase & { record: PageCaptureNamed; table?: PageCaptureNamed | null },
): PageCapture {
  return finish("record", base, {
    Record: base.record,
    ...(base.table ? { Table: base.table } : {}),
  });
}

/** A dialog or window: its name and the thing it is about. */
export function dialogCapture(
  base: CaptureBase & { dialog: string; subject?: PageCaptureNamed | null },
): PageCapture {
  return finish("dialog", base, {
    Dialog: base.dialog,
    ...(base.subject ? { Subject: base.subject } : {}),
  });
}

/** An admin page: its title is its identity; the selection carries its choices. */
export function adminPageCapture(
  base: CaptureBase & { identity?: Record<string, PageCaptureValue> },
): PageCapture {
  return finish("admin-page", base, base.identity ?? {});
}

/** The sections with a `load`, by title — what a "with …" variant adds. */
export function loadableSections(c: PageCapture): PageCaptureSection[] {
  return c.sections.filter((s) => typeof s.load === "function");
}

/** The capture with every loadable section read now; a failed read says so in its place. */
export async function resolvePageCapture(c: PageCapture): Promise<PageCapture> {
  const sections = await Promise.all(
    c.sections.map(async (s) => {
      if (!s.load) return s;
      try {
        const value = toPlainJson(await s.load());
        const { load: _read, ...rest } = s;
        return { ...rest, value };
      } catch (e) {
        const { load: _read, ...rest } = s;
        return {
          ...rest,
          value: `${s.title} could not be read: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }),
  );
  return { ...c, sections };
}
