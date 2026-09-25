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
}

export interface PageCaptureRequest {
  method: string;
  path: string;
  status: string;
  httpStatus?: number;
  durationMs?: number;
  requestId?: string;
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
}

const COMPACT_CHARS = 6000;

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
  for (const c of contributions) {
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
  return { ...base, sections };
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

function envelopeContext(c: PageCapture): Record<string, string> {
  return {
    page: c.title,
    "surface-kind": c.kind,
    route: c.route,
    ...describeRecord(c.identity),
    ...describeRecord(c.selection),
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
        level === "full"
          ? s.value
          : level === "compact"
            ? compactValue(s.value)
            : (s.brief ?? shapeOf(s.value)),
    });
  }
  const requestSections = c.sections.filter((s) => s.role === "request");
  if (c.requests.length > 0 || requestSections.length > 0) {
    sections.push({
      id: "requests",
      title: "Recent requests",
      description: "The last server calls, newest first, with status and timing.",
      defaultSelection: "compact",
      build: (level: AlchemyDetail) => {
        const log = level === "brief" ? c.requests.slice(0, 3) : c.requests;
        const extra = Object.fromEntries(
          requestSections.map((s) => [
            s.title,
            level === "full" ? s.value : level === "compact" ? compactValue(s.value) : (s.brief ?? shapeOf(s.value)),
          ]),
        );
        return { log, ...extra };
      },
    });
  }
  return {
    label: c.title,
    kind: `page-capture:${c.kind}`,
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
    lines.push("", "## Recent requests", "", "| Status | Request | HTTP | Duration | Request id |", "|---|---|---|---|---|");
    for (const r of c.requests) {
      lines.push(
        `| ${r.status} | ${r.method} ${r.path} | ${r.httpStatus ?? ""} | ${typeof r.durationMs === "number" ? `${Math.round(r.durationMs)} ms` : ""} | ${r.requestId ?? ""} |`,
      );
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
