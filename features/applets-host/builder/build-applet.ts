// features/applets-host/builder/build-applet.ts — the data half of building an Applet by talking.
//
// THE PIPE (BUILD-LOOP §4; no second path):
//   1. the catalogue is read AS HER (`@ai-matrx/applets/catalogue`) — her tables, fields, sample rows,
//      the jobs that fit her sentence — so the builder copies ids, never guesses them;
//   2. the mandate `applets.build` answers ONE whole Applet; a fix round is the next turn of the same conversation
//      record; whoever holds the mandate owns its quality — this file writes no instruction;
//   3. the record is written to `app.definition` as her, with its organization explicit. A new Applet is
//      born a draft (preview with held-back writes); every later save is a new version
//      (`app.definition_version`, the snapshot trigger) and "Use it" publishes.
//   4. TABLES SHE DOES NOT HAVE are part of the answer (`new_table` sources, applets 0.9.1): checked with
//      `checkAppletSources` before saving, previewed empty, and made by `makeNewTables` (the store's own
//      `ensureTable`, as her, in the Applet's organization) when she presses "Use it" — never an
//      unrelated table, never "make a table and come back".
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeNewTables, type MadeTable } from "@ai-matrx/applets/platform";
import type { AppletSource, NewTableDeclaration } from "@ai-matrx/applets";

import type { Database, Json } from "@/types/database.types";
import { isReservedAppletSlug } from "@/features/applets/reserved-slugs";
import { appletAudiencePatch } from "@/features/applets/lib/publication";


type Client = SupabaseClient<Database>;

export interface BuilderFile {
  name: string;
  source: string;
}

/** The record shape the builder reads and answers (provision `applets.build_request`). */
export interface BuilderApplet {
  name: string;
  slug: string;
  description: string;
  entry: string;
  files: BuilderFile[];
  pages: { path: string; title: string; file: string; parent?: string }[];
  sources: BuilderSource[];
  mandates: { alias: string; key: string }[];
}

/** One source as the builder writes it: her table, a platform record type, or a table to make. */
export type BuilderSource =
  | { alias: string; table_id: string; organization_id: string }
  | { alias: string; entity: string; organization_id?: string }
  | { alias: string; new_table: NewTableDeclaration };

/**
 * Platform-record sources read and save in the Applet's own organization (CONTRACTS v2.11): the builder
 * writes it on every save, so an Applet never lists another organization's records (bug desk 2026-10-08:
 * a client's contacts page showed platform test contacts). A source scope, not the person's list filter.
 */
export function scopeEntitySources(sources: readonly BuilderSource[], organizationId: string): BuilderSource[] {
  return sources.map((s) => ("entity" in s ? { alias: s.alias, entity: s.entity, organization_id: organizationId } : s));
}

/** The tables an answer reads that already exist, by id — the card names them in words. */
export function boundTableIds(applet: Pick<BuilderApplet, "sources">): string[] {
  return applet.sources.flatMap((s) => ("table_id" in s && s.table_id ? [s.table_id] : []));
}

/** The tables an answer will make, for the person to see before she presses "Use it". */
export function tablesToMake(applet: Pick<BuilderApplet, "sources">): { alias: string; name: string; fields: string[] }[] {
  return applet.sources.flatMap((s) => ("new_table" in s ? [{ alias: s.alias, name: s.new_table.name, fields: s.new_table.fields.map((f) => f.label) }] : []));
}

export interface BuildAnswer {
  applet: BuilderApplet;
  note: string;
}

/** The saved Applet as the builder shows it: THE state's fields (`appletState`) + the shown version. */
export interface SavedApplet {
  id: string;
  slug: string;
  name: string;
  /** What the Applet IS, as the build wrote it — never a run's note ("Fixed import locations…"). */
  description: string | null;
  status: string;
  published_to_web: boolean;
  deleted_at: string | null;
  /** The saved content version (never `version`, the row's write counter). */
  content_version: number;
}

export const SAVED_APPLET_COLUMNS = "id, slug, name, description, status, published_to_web, deleted_at, content_version";

const UNCHANGED = /^\(unchanged/i;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** The builder's JSON answer, checked: a missing part is a sentence, never a half-saved Applet. */
export function coerceBuildAnswer(value: unknown): BuildAnswer {
  if (!isRecord(value) || !isRecord(value.applet)) throw new Error("The builder answered without an app.");
  const a = value.applet;
  const files = (Array.isArray(a.files) ? a.files : []).flatMap((f) =>
    isRecord(f) && typeof f.name === "string" && typeof f.source === "string" ? [{ name: f.name, source: f.source }] : [],
  );
  const pages = (Array.isArray(a.pages) ? a.pages : []).flatMap((p) =>
    isRecord(p) && typeof p.path === "string" && typeof p.file === "string"
      ? [{ path: p.path, title: str(p.title) || p.path, file: p.file, ...(typeof p.parent === "string" && p.parent ? { parent: p.parent } : {}) }]
      : [],
  );
  const sources = (Array.isArray(a.sources) ? a.sources : []).flatMap((s): BuilderSource[] =>
    isRecord(s) && typeof s.alias === "string"
      ? [
          // Only a NAMED declaration is a table to make: a strict provider wire fills every optional arm,
          // so a bound source arrives with `new_table: { name: "", fields: [] }` (and a declaration with
          // `table_id: ""`). The arm with content decides.
          isRecord(s.new_table) && str(s.new_table.name).trim()
            ? { alias: s.alias, new_table: s.new_table as unknown as NewTableDeclaration }
            : typeof s.entity === "string" && s.entity
              ? { alias: s.alias, entity: s.entity, ...(typeof s.organization_id === "string" && s.organization_id ? { organization_id: s.organization_id } : {}) }
              : { alias: s.alias, table_id: str(s.table_id), organization_id: str(s.organization_id) },
        ]
      : [],
  );
  const mandates = (Array.isArray(a.mandates) ? a.mandates : []).flatMap((m) =>
    isRecord(m) && typeof m.alias === "string" && typeof m.key === "string" ? [{ alias: m.alias, key: m.key }] : [],
  );
  const applet: BuilderApplet = {
    name: str(a.name) || "My Applet",
    slug: str(a.slug),
    description: str(a.description),
    entry: str(a.entry) || "App.tsx",
    files,
    pages,
    sources,
    mandates,
  };
  if (!files.some((f) => f.name === applet.entry)) throw new Error(`The builder's Applet has no ${applet.entry} file.`);
  if (pages.length === 0) throw new Error("The builder's Applet has no pages.");
  return { applet, note: str(value.note) };
}

/** The builder's answer was refused: nothing was saved, and "Fix it" sends the reason back. */
export class BuildRefused extends Error {
  readonly applet: BuilderApplet;
  constructor(message: string, applet: BuilderApplet) {
    super(message);
    this.name = "BuildRefused";
    this.applet = applet;
  }
}

/**
 * Does this refusal go to the automatic fix round? Every refusal of a request SHE made (never one of a fix
 * round itself, which would loop) — however the answer arrived (a live run, a run rejoined after a refresh).
 */
export function repairs(entry: { fix: unknown }, err: unknown): err is BuildRefused {
  return err instanceof BuildRefused && !entry.fix;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The opening tag starting at `start` (`<Button …>`), braces and quotes respected. */
function openingTag(source: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start + 1; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote && source[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

/** A JSX string attribute holding an escaped newline: `placeholder="a\nb"` shows a literal "\n". */
const ESCAPED_NEWLINE_ATTR = /\s([A-Za-z][\w-]*)="[^"\n]*\\n[^"\n]*"/g;

/** Every JSX attribute whose plain string shows a literal "\n" on screen (social planner placeholder, 2026-10-08). */
export function literalNewlineAttributes(file: BuilderFile): string[] {
  return [...new Set([...file.source.matchAll(ESCAPED_NEWLINE_ATTR)].map((m) => m[1]!))];
}

/**
 * "USE IT" NEVER PUBLISHES A BROKEN APPLET. While the preview (or the last check) reports an error,
 * publishing is refused with the reason, and Fix it is the action — the social planner was published
 * with "Missing in this Applet: useNavigate" in red beside an enabled "Use it" (2026-10-08).
 */
export function publishBlockedBy(lastError: { message: string } | null): string | null {
  return lastError ? `Fix this before using it: ${lastError.message}` : null;
}

/** Every new-table field of one of these types, by key. */
function newTableFieldsOfType(applet: Pick<BuilderApplet, "sources">, types: ReadonlySet<string>): { alias: string; key: string; options: string[] }[] {
  return applet.sources.flatMap((s) =>
    "new_table" in s && Array.isArray(s.new_table.fields)
      ? s.new_table.fields.filter((f) => types.has(f.type)).map((f) => ({ alias: s.alias, key: f.key, options: Array.isArray(f.options) ? f.options : [] }))
      : [],
  );
}

const DATE_TYPES: ReadonlySet<string> = new Set(["date", "datetime"]);

/**
 * A DATE IS NEVER A TEXT BOX. A plain `<Field>` bound to a date field showed "YYYY-MM-DD" as text to type
 * (social planner, v0.4.3010). `<RecordField>` picks the date picker by itself; `<DateField>` is the control.
 */
export function dateFieldsAsText(applet: Pick<BuilderApplet, "files" | "sources">): string[] {
  const dates = newTableFieldsOfType(applet, DATE_TYPES).map((f) => f.key);
  const out = new Set<string>();
  for (const f of applet.files) {
    for (const m of f.source.matchAll(/<(Field|input)\b/g)) {
      const tag = openingTag(f.source, m.index ?? 0);
      if (/\btype\s*=\s*["'{]\s*["']?(date|datetime-local)/.test(tag)) continue;
      for (const key of dates) if (new RegExp(`\\b${escapeRe(key)}\\b`).test(tag)) out.add(key);
    }
  }
  return [...out];
}

/** The code names `key` — literally, or built in a template (`${p}_views` names `tt_views`). */
function namesField(all: string, key: string): boolean {
  if (new RegExp(`\\b${escapeRe(key)}\\b`).test(all)) return true;
  const parts = key.split("_");
  for (let i = 1; i < parts.length; i++) {
    const head = escapeRe(parts.slice(0, i).join("_"));
    const tail = escapeRe(parts.slice(i).join("_"));
    if (new RegExp(`\\}_${tail}\\b`).test(all) || new RegExp(`\\b${head}_\\$\\{`).test(all)) return true;
  }
  return false;
}

/**
 * EVERY TABLE THE APP MAKES CAN BE FILLED, AND EVERY FIELD IT DECLARES IS ON SCREEN. A new table with
 * no create path leaves her an app she can never add a row to; a declared field the code never names
 * is a thing she asked to track that the app does not show.
 */
export function newTableGaps(applet: Pick<BuilderApplet, "files" | "sources">): string[] {
  const out: string[] = [];
  const all = applet.files.map((f) => f.source).join("\n");
  for (const s of applet.sources) {
    if (!("new_table" in s)) continue;
    const fields = Array.isArray(s.new_table.fields) ? s.new_table.fields : [];
    const unseen = fields.map((f) => f.key).filter((key) => key && !namesField(all, key));
    if (unseen.length) out.push(`the table "${s.alias}" declares ${unseen.map((k) => `"${k}"`).join(", ")} but no page shows or edits ${unseen.length === 1 ? "it" : "them"}`);
    const vars = [...all.matchAll(new RegExp(`(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*useRows\\(\\s*["'\`]${escapeRe(s.alias)}["'\`]`, "g"))].map((m) => m[1]!);
    const reads = vars.length > 0 || new RegExp(`useRows\\(\\s*["'\`]${escapeRe(s.alias)}["'\`]`).test(all);
    if (!reads) continue;
    const creates =
      vars.some((v) => new RegExp(`\\b${escapeRe(v)}\\.create\\(`).test(all)) ||
      (vars.some((v) => new RegExp(`=\\{\\s*${escapeRe(v)}\\s*\\}`).test(all)) && /\.create\(/.test(all));
    if (!creates) out.push(`nothing in the app adds a row to "${s.alias}" — give her a way to create one`);
  }
  return out;
}

/** What the builder is shown for a change: the stored record, files as a list. */
export async function readBuilderApplet(client: Client, appletId: string): Promise<{ applet: BuilderApplet; organizationId: string; slug: string }> {
  const { data, error } = await client
    .schema("app")
    .from("definition")
    .select("id, organization_id, slug, name, description, entry, files, pages, sources, mandates")
    .eq("id", appletId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That Applet is not there, or it has not been shared with you.");
  const files = isRecord(data.files) ? Object.entries(data.files).flatMap(([name, source]) => (typeof source === "string" ? [{ name, source }] : [])) : [];
  const answer = coerceBuildAnswer({ applet: { ...data, files }, note: "" });
  return { applet: answer.applet, organizationId: data.organization_id, slug: data.slug };
}

/** A file the builder answered "(unchanged…)" keeps its stored source. */
function mergeFiles(answer: BuilderFile[], current: BuilderFile[] | null): Record<string, string> {
  const before = new Map((current ?? []).map((f) => [f.name, f.source]));
  const out: Record<string, string> = {};
  for (const f of answer) {
    const kept = UNCHANGED.test(f.source.trim()) ? before.get(f.name) : f.source;
    if (kept === undefined) throw new Error(`The builder left ${f.name} out.`);
    out[f.name] = kept;
  }
  return out;
}

const SLUG = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;

function slugOf(raw: string): string {
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  if (!SLUG.test(s)) return `applet-${Date.now().toString(36)}`;
  return isReservedAppletSlug(s) ? `${s}-applet` : s;
}

/**
 * The addresses near `base` she can already see. Checked BEFORE the write so a taken address is skipped
 * instead of answered with a 409 the console reports as an error (audit9 B14: every first build of a
 * common name logged one). Row security can hide another organization's row; the write's unique-violation
 * retry still covers that.
 */
async function takenSlugs(client: Client, base: string, selfId: string | null): Promise<Set<string>> {
  const { data, error } = await client.schema("app").from("definition").select("id, slug").like("slug", `${base}%`).limit(200);
  if (error || !data) return new Set();
  return new Set(data.filter((r) => r.id !== selfId).map((r) => r.slug));
}

/** The address to try on `attempt`: `base` when it is free, else `base-xxxx` not already taken. */
export function slugCandidate(base: string, attempt: number, taken: ReadonlySet<string>): string {
  if (attempt === 0 && !taken.has(base)) return base;
  for (let i = 0; i < 8; i++) {
    const next = `${base.slice(0, 42)}-${Math.random().toString(36).slice(2, 6)}`;
    if (!taken.has(next)) return next;
  }
  return `${base.slice(0, 42)}-${Date.now().toString(36).slice(-4)}`;
}

/** Write the answer as her: a new draft Applet, or a new version of the one she is changing. */
export async function saveBuiltApplet(
  client: Client,
  input: { organizationId: string; appletId: string | null; current: BuilderApplet | null; answer: BuildAnswer; request: string; conversationId: string | null },
): Promise<SavedApplet> {
  const { applet } = input.answer;
  const content = {
    name: applet.name,
    // What the Applet IS: a round that answers without one (a repair) keeps the description it had.
    description: applet.description || input.current?.description || null,
    entry: applet.entry,
    files: mergeFiles(applet.files, input.current?.files ?? null),
    pages: applet.pages,
    sources: scopeEntitySources(applet.sources, input.organizationId),
    mandates: applet.mandates,
  };
  // The request, its run and the note live in the build's request history (metadata.build, written by
  // ./build-session.ts) — never overwrite `metadata` here. A draft born empty at Build (no stored app
  // yet, so no `current`) takes the address the builder chose on its first save.
  if (input.appletId && !input.current) {
    const base = slugOf(applet.slug || applet.name);
    const taken = await takenSlugs(client, base, input.appletId);
    for (let attempt = 0; attempt < 4; attempt++) {
      const slug = slugCandidate(base, attempt, taken);
      const { data, error } = await client
        .schema("app")
        .from("definition")
        .update({ ...content, slug })
        .eq("id", input.appletId)
        .select(SAVED_APPLET_COLUMNS)
        .single();
      if (!error) return data;
      if (error.code !== "23505") throw new Error(error.message);
    }
    throw new Error(`Every address near "/applets/${base}" is taken.`);
  }
  if (input.appletId) {
    const { data, error } = await client
      .schema("app")
      .from("definition")
      .update(content)
      .eq("id", input.appletId)
      .select(SAVED_APPLET_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const base = slugOf(applet.slug || applet.name);
  const taken = await takenSlugs(client, base, null);
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = slugCandidate(base, attempt, taken);
    const { data, error } = await client
      .schema("app")
      .from("definition")
      .insert({ ...content, organization_id: input.organizationId, slug, status: "draft" })
      .select(SAVED_APPLET_COLUMNS)
      .single();
    if (!error) return data;
    if (error.code !== "23505") throw new Error(error.message);
  }
  throw new Error(`Every address near "/applets/${base}" is taken.`);
}

/**
 * "Use it": first the tables the app asked for are made (as her, in the Applet's organization) and the
 * record is bound to them; then the draft is put in use for the audience she chose — her organization
 * (the default) or anyone with the link at /applets/<slug>. A refusal while making tables changes nothing
 * and names the table; what was made stays, and the next "Use it" finds it.
 */
export async function publishApplet(
  client: Client,
  appletId: string,
  userId: string,
  audience: "organization" | "web" = "organization",
): Promise<{ made: MadeTable[] }> {
  const { data, error: readError } = await client.schema("app").from("definition").select("organization_id, sources").eq("id", appletId).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!data) throw new Error("That app is not there, or it has not been shared with you.");
  const sources = (Array.isArray(data.sources) ? data.sources : []) as unknown as AppletSource[];
  let made: MadeTable[] = [];
  if (sources.some((s) => "new_table" in s)) {
    const answer = await makeNewTables({ supabase: client, userId, organizationId: data.organization_id, sources });
    made = answer.made;
    if (!answer.ok) throw new Error(answer.message);
    const bound = await client.schema("app").from("definition").update({ sources: answer.sources as unknown as Json }).eq("id", appletId);
    if (bound.error) throw new Error(bound.error.message);
  }
  // ONE write for status AND the web switch (`appletAudiencePatch`), so every surface reads the same
  // state through `appletState` — "In use" for her organization, "Published" on the web.
  const { error } = await client.schema("app").from("definition").update(appletAudiencePatch(audience, new Date().toISOString(), userId)).eq("id", appletId);
  if (error) throw new Error(error.message);
  return { made };
}
