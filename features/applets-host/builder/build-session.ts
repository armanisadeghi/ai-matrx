// features/applets-host/builder/build-session.ts — A BUILD IS A RECORD WITH ITS OWN URL.
//
// The build's record is the draft Applet itself (`app.definition`): it is born the moment the person
// presses Build — before the builder runs — so the page can move to /applets/build/<id> at once, the
// Applets list shows it, and a refresh or a later visit reopens the same build. A conversation id
// cannot be the identity: every request (the first, each "Change it", each "Fix it") is its own run.
//
// What the person asked lives on that row, server-side, in `metadata.build.requests` — one entry per
// request with its text, the run's conversation id, and how it ended. Every write goes through
// `mergeJsonColumn` (the guarded jsonb merge), so two tabs never lose each other's entries. A metadata
// write never makes a new Applet version (the snapshot trigger watches content columns only).
//
// THE CLAIM: a finished answer is saved exactly once. The tab that started the run and a tab that
// reopened it both wait for the same answer; whichever moves the entry out of "running" first saves it
// (`claimBuildEntry`), the other stands down and re-reads the row.
import { asJsonObject, mergeJsonColumn } from "@ai-matrx/data/db";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import type { BuilderApplet } from "./build-applet";

type Client = SupabaseClient<Database>;

/** starting — the record exists, the run has no conversation yet; running — the run is on the server. */
export type BuildEntryState = "starting" | "running" | "saving" | "saved" | "failed" | "refused";

export interface BuildEntry {
  id: string;
  /** Exactly what the person typed (or "Fix this error" for Fix it). */
  text: string;
  /** Fix it carries the error it was asked to fix. */
  fix: { where: string; message: string } | null;
  conversation_id: string | null;
  started_at: string;
  state: BuildEntryState;
  finished_at?: string;
  /** The Applet version this request saved. */
  version?: number;
  /** The builder's one-line note. */
  note?: string;
  error?: string;
  /** An answer refused before saving — Fix it hands it back, so nothing is lost across a refresh. */
  refused_applet?: BuilderApplet;
}

export interface BuildRecord {
  id: string;
  slug: string;
  name: string;
  version: number;
  status: string;
  organizationId: string;
  /** False while the draft holds no app yet (its first request has not landed). */
  hasContent: boolean;
  requests: BuildEntry[];
}

const OPEN: ReadonlySet<BuildEntryState> = new Set(["starting", "running", "saving"]);

export function isOpenEntry(entry: BuildEntry | null | undefined): entry is BuildEntry {
  return Boolean(entry && OPEN.has(entry.state));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const STATES: ReadonlySet<string> = new Set(["starting", "running", "saving", "saved", "failed", "refused"]);

function readEntry(raw: unknown): BuildEntry | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.text !== "string") return null;
  const state = typeof raw.state === "string" && STATES.has(raw.state) ? (raw.state as BuildEntryState) : "failed";
  const fix = isRecord(raw.fix) && typeof raw.fix.where === "string" && typeof raw.fix.message === "string" ? { where: raw.fix.where, message: raw.fix.message } : null;
  return {
    id: raw.id,
    text: raw.text,
    fix,
    conversation_id: typeof raw.conversation_id === "string" ? raw.conversation_id : null,
    started_at: typeof raw.started_at === "string" ? raw.started_at : "",
    state,
    ...(typeof raw.finished_at === "string" ? { finished_at: raw.finished_at } : {}),
    ...(typeof raw.version === "number" ? { version: raw.version } : {}),
    ...(typeof raw.note === "string" ? { note: raw.note } : {}),
    ...(typeof raw.error === "string" ? { error: raw.error } : {}),
    ...(isRecord(raw.refused_applet) ? { refused_applet: raw.refused_applet as unknown as BuilderApplet } : {}),
  };
}

/** The request history stored on the row's `metadata.build.requests`, oldest first. */
export function readBuildRequests(metadata: unknown): BuildEntry[] {
  const build = asJsonObject(metadata).build;
  const requests = isRecord(build) && Array.isArray(build.requests) ? build.requests : [];
  return requests.flatMap((r) => {
    const e = readEntry(r);
    return e ? [e] : [];
  });
}

function withRequests(metadata: Record<string, unknown>, requests: BuildEntry[]): Record<string, unknown> {
  const build = isRecord(metadata.build) ? metadata.build : {};
  return { ...metadata, build: { ...build, requests } };
}

const RECORD_COLUMNS = "id, organization_id, slug, name, version, status, entry, metadata";

type RecordRow = {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  version: number;
  status: string;
  entry: string | null;
  metadata: unknown;
};

function toRecord(row: RecordRow): BuildRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    version: row.version,
    status: row.status,
    organizationId: row.organization_id,
    hasContent: Boolean(row.entry),
    requests: readBuildRequests(row.metadata),
  };
}

/** The build at /applets/build/<id>: the Applet row and its request history. */
export async function readBuildRecord(client: Client, appletId: string): Promise<BuildRecord> {
  const { data, error } = await client.schema("app").from("definition").select(RECORD_COLUMNS).eq("id", appletId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That Applet is not there, or it has not been shared with you.");
  return toRecord(data as RecordRow);
}

export function newBuildEntry(text: string, fix: BuildEntry["fix"]): BuildEntry {
  return { id: crypto.randomUUID(), text, fix, conversation_id: null, started_at: new Date().toISOString(), state: "starting" };
}

/** A name until the builder names it: the person's own words, cut at a word. */
export function draftNameOf(request: string): string {
  const flat = request.replace(/\s+/g, " ").trim();
  if (flat.length <= 60) return flat || "New Applet";
  const cut = flat.slice(0, 60);
  const space = cut.lastIndexOf(" ");
  return `${(space > 30 ? cut.slice(0, space) : cut).trim()}…`;
}

/**
 * Press Build on a new app: the draft Applet is born NOW, carrying the request, before the builder
 * runs — it is the build's identity and its URL. Its slug is a placeholder the first answer replaces.
 */
export async function startBuildRecord(client: Client, input: { organizationId: string; entry: BuildEntry }): Promise<BuildRecord> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = `draft-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await client
      .schema("app")
      .from("definition")
      .insert({
        organization_id: input.organizationId,
        slug,
        name: draftNameOf(input.entry.text),
        status: "draft",
        metadata: { build: { requests: [input.entry] } },
      })
      .select(RECORD_COLUMNS)
      .single();
    if (!error) return toRecord(data as RecordRow);
    if (error.code !== "23505") throw new Error(error.message);
  }
  throw new Error("Could not start your Applet — try again.");
}

type MergeOutcome = { status: "saved" | "skipped"; record: BuildRecord };

/** Thrown from the merge when the edit has nothing to write; never escapes `editRequests`. */
class NothingToWrite extends Error {}

/**
 * Rewrite the request list with `edit` (pure in its input; re-run on a lost race). Return `null` from
 * `edit` to write nothing — the outcome is then "skipped" with the row as it stands.
 */
async function editRequests(client: Client, appletId: string, edit: (requests: BuildEntry[]) => BuildEntry[] | null): Promise<MergeOutcome> {
  const db = client.schema("app");
  let latest: RecordRow | null = null;
  const result = await mergeJsonColumn<RecordRow>({
    fetchCurrent: async () => {
      const res = await db.from("definition").select(RECORD_COLUMNS).eq("id", appletId).maybeSingle();
      if (res.data) latest = res.data as RecordRow;
      return { data: (res.data as RecordRow | null) ?? null, error: res.error };
    },
    readColumn: (row) => row.metadata,
    merge: (current) => {
      const next = edit(readBuildRequests(current));
      if (next === null) throw new NothingToWrite();
      return withRequests(current, next);
    },
    applyUpdate: async ({ value, expectedVersion, nextVersion }) => {
      const res = await db
        .from("definition")
        .update({ metadata: value as Database["app"]["Tables"]["definition"]["Update"]["metadata"], version: nextVersion })
        .eq("id", appletId)
        .eq("version", expectedVersion)
        .select(RECORD_COLUMNS)
        .maybeSingle();
      return { data: (res.data as RecordRow | null) ?? null, error: res.error };
    },
  });
  if (result.status === "saved") return { status: "saved", record: toRecord(result.row) };
  if (result.status === "error" && result.error instanceof NothingToWrite && latest) return { status: "skipped", record: toRecord(latest) };
  if (result.status === "not_found") throw new Error("That Applet is not there, or it has not been shared with you.");
  if (result.status === "conflict") throw new Error("This Applet changed in another tab at the same moment — reload to see it.");
  const error = result.status === "error" ? result.error : null;
  throw error instanceof Error ? error : new Error(isRecord(error) && typeof error.message === "string" ? error.message : "Could not save your request.");
}

/** A follow-up request ("Change it" / "Fix it") joins the history before its run starts. */
export async function appendBuildEntry(client: Client, appletId: string, entry: BuildEntry): Promise<BuildRecord> {
  return (await editRequests(client, appletId, (requests) => [...requests, entry])).record;
}

/** Patch one entry. */
export async function patchBuildEntry(client: Client, appletId: string, entryId: string, patch: Partial<BuildEntry>): Promise<BuildRecord> {
  return (
    await editRequests(client, appletId, (requests) =>
      requests.some((r) => r.id === entryId) ? requests.map((r) => (r.id === entryId ? { ...r, ...patch } : r)) : null,
    )
  ).record;
}

/**
 * THE CLAIM: move an open entry to "saving". True only for the one caller that moved it; every
 * other waiter on the same run stands down.
 */
export async function claimBuildEntry(client: Client, appletId: string, entryId: string): Promise<boolean> {
  const outcome = await editRequests(client, appletId, (requests) => {
    const entry = requests.find((r) => r.id === entryId);
    if (!entry || (entry.state !== "starting" && entry.state !== "running")) return null;
    return requests.map((r) => (r.id === entryId ? { ...r, state: "saving" as const } : r));
  });
  return outcome.status === "saved";
}
