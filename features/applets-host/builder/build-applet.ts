// features/applets-host/builder/build-applet.ts — the data half of building an Applet by talking.
//
// THE PIPE (BUILD-LOOP §4; no second path):
//   1. the catalogue is read AS HER (`@ai-matrx/applets/catalogue`) — her tables, fields, sample rows,
//      the jobs that fit her sentence — so the builder copies ids, never guesses them;
//   2. the mandate `applets.build` (or `applets.fix` with the captured error) answers ONE whole Applet
//      record; whoever holds the mandate owns its quality — this file writes no instruction;
//   3. the record is written to `app.definition` as her, with its organization explicit. A new Applet is
//      born a draft (preview with held-back writes); every later save is a new version
//      (`app.definition_version`, the snapshot trigger) and "Use it" publishes.
//   4. TABLES SHE DOES NOT HAVE are part of the answer (`new_table` sources, applets 0.9.1): checked with
//      `checkAppletSources` before saving, previewed empty, and made by `makeNewTables` (the store's own
//      `ensureTable`, as her, in the Applet's organization) when she presses "Use it" — never an
//      unrelated table, never "make a table and come back".
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAppletSources, makeNewTables, type MadeTable } from "@ai-matrx/applets/platform";
import type { AppletSource, NewTableDeclaration } from "@ai-matrx/applets";

import type { Database, Json } from "@/types/database.types";
import { isReservedAppletSlug } from "@/features/applets/reserved-slugs";


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
  | { alias: string; entity: string }
  | { alias: string; new_table: NewTableDeclaration };

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

export interface SavedApplet {
  id: string;
  slug: string;
  version: number;
  status: string;
}

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
              ? { alias: s.alias, entity: s.entity }
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

const READS_SOURCE = /\buse(?:Rows|Row|Columns)\(\s*["'`]([^"'`$]+)["'`]/g;
/** A hand-built prose box in an Applet: the HTML element or the controls' Textarea. */
const BARE_WRITING_BOX = /<(textarea|Textarea)\b/g;
const RUNS_JOB = /\buseJob\(\s*["'`]([^"'`$]+)["'`]/g;

function namesIn(files: BuilderFile[], pattern: RegExp): Set<string> {
  const out = new Set<string>();
  for (const f of files) for (const m of f.source.matchAll(pattern)) if (m[1]) out.add(m[1]);
  return out;
}

/**
 * NOTHING THE BUILDER WROTE IS DROPPED SILENTLY. A source or job the coercion could not
 * read, a table source without its ids, or code that reads an alias the record never
 * declares refuses the whole answer — the app would otherwise open on
 * `no data source called "tasks"` (2026-10-07). Run on a fresh builder answer only.
 */
export function checkBuildAnswer(
  raw: unknown,
  answer: BuildAnswer,
  context: { organizationId?: string; tables?: readonly { table_id: string; organization_id: string; name: string }[] } = {},
): BuildAnswer {
  const { applet } = answer;
  const rawApplet = isRecord(raw) && isRecord(raw.applet) ? raw.applet : {};
  const problems: string[] = [];
  const rawSources = Array.isArray(rawApplet.sources) ? rawApplet.sources.length : 0;
  if (rawSources !== applet.sources.length) problems.push(`${rawSources - applet.sources.length} of its sources had no alias`);
  const rawMandates = Array.isArray(rawApplet.mandates) ? rawApplet.mandates.length : 0;
  if (rawMandates !== applet.mandates.length) problems.push(`${rawMandates - applet.mandates.length} of its jobs had no alias or key`);
  // ONE check for every source (applets 0.9.1): a bound table must be the Applet organization's own (an
  // Applet in one organization bound to another's table opens on data its members cannot read — audit
  // 2026-10-07), and a table the app asks for is checked whole — a missing choice list, a link to nowhere,
  // or a "new" table that repeats one she has is said before anything is saved.
  if (context.organizationId) {
    problems.push(...checkAppletSources(applet.sources as AppletSource[], { organizationId: context.organizationId, ...(context.tables ? { existing: context.tables } : {}) }));
  } else {
    for (const s of applet.sources) {
      if ("table_id" in s && (!s.table_id || !s.organization_id)) problems.push(`source "${s.alias}" names no table_id and organization_id`);
    }
  }
  const declared = new Set(applet.sources.map((s) => s.alias));
  for (const alias of namesIn(applet.files, READS_SOURCE)) {
    if (!declared.has(alias)) problems.push(`the code reads "${alias}" but sources declares no "${alias}"`);
  }
  const jobs = new Set(applet.mandates.map((m) => m.alias));
  for (const alias of namesIn(applet.files, RUNS_JOB)) {
    if (!jobs.has(alias)) problems.push(`the code runs job "${alias}" but mandates declares no "${alias}"`);
  }
  // Every box a person writes words in is <WritingBox> (mic + read-aloud) — never a bare textarea.
  for (const f of applet.files) {
    const bare = [...new Set([...f.source.matchAll(BARE_WRITING_BOX)].map((m) => m[1]))];
    for (const tag of bare) {
      problems.push(
        `${f.name} has a bare <${tag}> where a person writes — use <WritingBox value={text} onValueChange={setText} label="…" /> from "@ai-matrx/applets/react" (it carries the microphone and read-aloud)`,
      );
    }
  }
  if (problems.length > 0) {
    throw new BuildRefused(`Not saved: ${problems.join("; ")}.`, applet);
  }
  return answer;
}

/** What the builder is shown for a change: the stored record, files as a list. */
export async function readBuilderApplet(client: Client, appletId: string): Promise<{ applet: BuilderApplet; organizationId: string; slug: string; version: number }> {
  const { data, error } = await client
    .schema("app")
    .from("definition")
    .select("id, organization_id, slug, name, description, entry, files, pages, sources, mandates, version")
    .eq("id", appletId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That Applet is not there, or it has not been shared with you.");
  const files = isRecord(data.files) ? Object.entries(data.files).flatMap(([name, source]) => (typeof source === "string" ? [{ name, source }] : [])) : [];
  const answer = coerceBuildAnswer({ applet: { ...data, files }, note: "" });
  return { applet: answer.applet, organizationId: data.organization_id, slug: data.slug, version: data.version };
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

/** Write the answer as her: a new draft Applet, or a new version of the one she is changing. */
export async function saveBuiltApplet(
  client: Client,
  input: { organizationId: string; appletId: string | null; current: BuilderApplet | null; answer: BuildAnswer; request: string; conversationId: string | null },
): Promise<SavedApplet> {
  const { applet } = input.answer;
  const content = {
    name: applet.name,
    description: applet.description || null,
    entry: applet.entry,
    files: mergeFiles(applet.files, input.current?.files ?? null),
    pages: applet.pages,
    sources: applet.sources,
    mandates: applet.mandates,
  };
  // The request, its run and the note live in the build's request history (metadata.build, written by
  // ./build-session.ts) — never overwrite `metadata` here. A draft born empty at Build (no stored app
  // yet, so no `current`) takes the address the builder chose on its first save.
  if (input.appletId && !input.current) {
    const base = slugOf(applet.slug || applet.name);
    for (let attempt = 0; attempt < 4; attempt++) {
      const slug = attempt === 0 ? base : `${base.slice(0, 42)}-${Math.random().toString(36).slice(2, 6)}`;
      const { data, error } = await client
        .schema("app")
        .from("definition")
        .update({ ...content, slug })
        .eq("id", input.appletId)
        .select("id, slug, version, status")
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
      .select("id, slug, version, status")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const base = slugOf(applet.slug || applet.name);
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = attempt === 0 ? base : `${base.slice(0, 42)}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await client
      .schema("app")
      .from("definition")
      .insert({ ...content, organization_id: input.organizationId, slug, status: "draft" })
      .select("id, slug, version, status")
      .single();
    if (!error) return data;
    if (error.code !== "23505") throw new Error(error.message);
  }
  throw new Error(`Every address near "/applets/${base}" is taken.`);
}

/**
 * "Use it": first the tables the app asked for are made (as her, in the Applet's organization) and the
 * record is bound to them; then the draft goes live at /applets/<slug>. A refusal while making tables
 * publishes nothing and names the table; what was made stays, and the next "Use it" finds it.
 */
export async function publishApplet(client: Client, appletId: string, userId: string): Promise<{ made: MadeTable[] }> {
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
  const { error } = await client.schema("app").from("definition").update({ status: "published" }).eq("id", appletId);
  if (error) throw new Error(error.message);
  return { made };
}
