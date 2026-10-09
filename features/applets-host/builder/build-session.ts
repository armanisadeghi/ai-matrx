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
  /** When THE CLAIM moved it to "saving" — a claim this old whose tab never settled it is released. */
  claimed_at?: string;
  /** The builder's one-line note. */
  note?: string;
  error?: string;
  /** An answer refused before saving — Fix it hands it back, so nothing is lost across a refresh. */
  refused_applet?: BuilderApplet;
  /** THE FIX CLAIM: the automatic fix round that answers this refusal (one per refusal, whichever tab). */
  fix_entry_id?: string;
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
    ...(typeof raw.claimed_at === "string" ? { claimed_at: raw.claimed_at } : {}),
    ...(typeof raw.version === "number" ? { version: raw.version } : {}),
    ...(typeof raw.note === "string" ? { note: raw.note } : {}),
    ...(typeof raw.error === "string" ? { error: raw.error } : {}),
    ...(isRecord(raw.refused_applet) ? { refused_applet: raw.refused_applet as unknown as BuilderApplet } : {}),
    ...(typeof raw.fix_entry_id === "string" ? { fix_entry_id: raw.fix_entry_id } : {}),
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

export const RECORD_COLUMNS = "id, organization_id, slug, name, version, status, entry, metadata";

export type RecordRow = {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  version: number;
  status: string;
  entry: string | null;
  metadata: unknown;
};

/** The row as the build reads it — also how the page's server render hands the record over (audit9 B1). */
export function toRecord(row: RecordRow): BuildRecord {
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

/** A draft's name until the builder's answer names it — never her sentence cut off. */
export const UNTITLED_APPLET = "Untitled Applet";

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
        name: UNTITLED_APPLET,
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
  const claimedAt = new Date().toISOString();
  const outcome = await editRequests(client, appletId, (requests) => {
    const entry = requests.find((r) => r.id === entryId);
    if (!entry || (entry.state !== "starting" && entry.state !== "running")) return null;
    return requests.map((r) => (r.id === entryId ? { ...r, state: "saving" as const, claimed_at: claimedAt } : r));
  });
  return outcome.status === "saved";
}

/**
 * THE FIX CLAIM: the one automatic fix round a refusal gets. Two tabs on the same refused build (the tab
 * that ran it and one that rejoined it) both see the refusal; whichever stamps the refused entry with its
 * fix round first appends that round and runs it, the other stands down and follows that run. True only
 * for the one caller that claimed it; `record` is the row as it now stands either way.
 */
export async function claimFixRound(client: Client, appletId: string, refusedEntryId: string, fixEntry: BuildEntry): Promise<{ claimed: boolean; record: BuildRecord }> {
  const outcome = await editRequests(client, appletId, (requests) => {
    const refused = requests.find((r) => r.id === refusedEntryId);
    if (!refused || refused.fix || refused.fix_entry_id) return null;
    return [...requests.map((r) => (r.id === refusedEntryId ? { ...r, fix_entry_id: fixEntry.id } : r)), fixEntry];
  });
  return { claimed: outcome.status === "saved", record: outcome.record };
}

/**
 * How long after a refusal reopening the build still starts its fix round unasked: the tab that was
 * refused closed before it could start one. Older than this, reopening shows "Fix it" and spends nothing
 * until she presses it.
 */
export const FIX_ROUND_FRESH_MS = 120_000;

export type ReopenOutcome =
  /** A fresh refusal of her request nobody took up: its one fix round starts (through THE FIX CLAIM). */
  | { kind: "start-fix"; refused: BuildEntry & { refused_applet: BuilderApplet } }
  /** A refusal shown with "Fix it": a refused fix round, or one too old to spend a run on unasked. */
  | { kind: "show-refused"; refused: BuildEntry & { refused_applet: BuilderApplet } }
  | { kind: "failed"; entry: BuildEntry }
  | { kind: "nothing" };

/** What reopening a build does with how its last request ended. */
export function reopenOutcome(requests: readonly BuildEntry[], now: number = Date.now()): ReopenOutcome {
  const latest = requests.at(-1);
  if (!latest) return { kind: "nothing" };
  if (latest.state === "refused" && latest.refused_applet) {
    const refused = { ...latest, refused_applet: latest.refused_applet };
    const ended = Date.parse(latest.finished_at ?? "");
    const fresh = Number.isFinite(ended) && now - ended <= FIX_ROUND_FRESH_MS;
    return !latest.fix && !latest.fix_entry_id && fresh ? { kind: "start-fix", refused } : { kind: "show-refused", refused };
  }
  if (latest.state === "failed") return { kind: "failed", entry: latest };
  return { kind: "nothing" };
}

/**
 * A save takes seconds (one row write). A claim older than this was taken by a tab that closed or
 * crashed between claiming the answer and settling it — nobody is saving it any more.
 */
export const STALE_CLAIM_MS = 90_000;

/** The entry sits in "saving" under a claim nobody is going to finish. */
export function isStaleClaim(entry: BuildEntry | null | undefined, now: number = Date.now()): entry is BuildEntry {
  if (!entry || entry.state !== "saving") return false;
  const since = Date.parse(entry.claimed_at ?? entry.started_at ?? "");
  return !Number.isFinite(since) || now - since > STALE_CLAIM_MS;
}

/**
 * Release a stale claim: the entry goes back to "running", so the next opener rejoins its run and
 * THE CLAIM decides again who saves it. Exactly one releaser writes (the guarded merge re-reads on a
 * race and finds the entry no longer stale). True when this caller released it.
 */
export async function releaseStaleClaim(client: Client, appletId: string, entryId: string, now: number = Date.now()): Promise<boolean> {
  const outcome = await editRequests(client, appletId, (requests) => {
    const entry = requests.find((r) => r.id === entryId);
    if (!isStaleClaim(entry, now)) return null;
    return requests.map((r) => {
      if (r.id !== entryId) return r;
      const { claimed_at: _released, ...rest } = r;
      return { ...rest, state: "running" as const };
    });
  });
  return outcome.status === "saved";
}

/**
 * HOW EACH REQUEST ENDED, as the history reads it — one state for the history, the card and the header.
 * A request refused and then saved by its fix round reads as that save ("Fixed · Saved v1"), never
 * "Not saved" beside a saved card (social planner, v0.4.3010).
 */
export function requestOutcome(requests: readonly BuildEntry[], index: number): { label: string; tone: "neutral" | "success" | "warning" | "destructive" } {
  const entry = requests[index];
  if (!entry) return { label: "Stopped", tone: "destructive" };
  switch (entry.state) {
    case "starting":
    case "running":
    case "saving":
      return { label: entry.fix ? "Fixing" : "Building", tone: "neutral" };
    case "saved":
      return { label: entry.version ? `Saved v${entry.version}` : "Saved", tone: "success" };
    case "refused": {
      // The fix rounds that answered this request (up to her next request).
      for (const later of requests.slice(index + 1)) {
        if (!later.fix) break;
        if (later.state === "saved") return { label: later.version ? `Fixed · Saved v${later.version}` : "Fixed · Saved", tone: "success" };
        // Its fix round is the row that says "Fixing"; this one says what happened to it (F6: both said "Fixing").
        if (later.state === "starting" || later.state === "running" || later.state === "saving") return { label: "Problem found", tone: "warning" };
      }
      return { label: "Not saved", tone: "warning" };
    }
    default:
      return { label: "Stopped", tone: "destructive" };
  }
}

/**
 * What a check's refusal is about, in her words — the check speaks to the builder ("use <RecordField …/>"),
 * never to her. The first quoted name it mentions becomes "the created date field"; otherwise "something".
 */
export function problemSubject(message: string | null | undefined): string {
  const quoted = /["“]([A-Za-z][\w .-]{0,60})["”]/.exec(message ?? "")?.[1];
  if (!quoted) return "";
  const words = quoted.replace(/[_.-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return words ? `the ${words} field` : "";
}

/** The builder's narration of a fix round: "I found a problem with the created date field and I'm fixing it." */
export function fixNarration(message: string | null | undefined): string {
  const subject = problemSubject(message);
  return subject ? `I found a problem with ${subject} and I'm fixing it` : "I found a problem and I'm fixing it";
}

/** A fix round's row in the history: what it fixes, never "Fix this error". */
export function fixRowText(entry: Pick<BuildEntry, "fix">): string {
  const subject = problemSubject(entry.fix?.message);
  return subject ? `Fix ${subject}` : "Fix a problem";
}

/** What the card says once an answer is saved: what it is now, and what each button does (F6). */
export function doneLine(kind: string | null): string {
  if (kind === "draft") return "Saved as a draft. Use it to go live; Open to try it.";
  return "Saved. Open to try it in a new tab.";
}

/** The Applet's full address on this site: https://www.aimatrx.com/applets/<slug> — never a bare path. */
export function appletLink(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, "")}/applets/${encodeURIComponent(slug)}`;
}

/** The preview header's held-writes badge, explained: what is held and that nothing reached her tables. */
export function heldHint(count: number): string {
  const what = count === 1 ? "1 change you made" : `${count} changes you made`;
  return `${what} in the preview, held here and never written to your tables`;
}

/** The fix button's words: a draft is fixed so she can use it; a published Applet is just fixed. */
export function fixLabel(kind: string | null): string {
  return kind === "published" ? "Fix it" : "Fix it to use it";
}

/**
 * The preview's header line — ONE story: this pane is a preview, and what she adds in it is held here, never
 * written to her tables. Whether the Applet is a draft or published is the card's word, never repeated here:
 * "Published v2 · try it here, nothing you add is kept" read as a published app that throws her work away.
 */
export function previewLine(versionLabel: string | null): string {
  return `Preview${versionLabel ? ` of ${versionLabel}` : ""} · what you add here is held, never saved`;
}

/**
 * What the page says while a request is still open — read from the record alone, so the server render and
 * a refresh mid-build show "Building your Applet" with its own start time, never the empty start screen
 * (audit9 B1). Null when nothing is in flight.
 */
export function buildingStep(requests: readonly BuildEntry[] | null | undefined): { label: string; since: number } | null {
  const latest = requests?.at(-1);
  if (!isOpenEntry(latest)) return null;
  const since = Date.parse(latest.started_at);
  return { label: latest.fix ? fixNarration(latest.fix.message) : "Building your Applet", since: Number.isFinite(since) ? since : Date.now() };
}

/**
 * ONE CONVERSATION PER BUILD (lane F6b). The build's conversation is the first run's: every later round — the
 * automatic fix round, "Change it", her replies — is the next turn of THAT conversation, so she reads and
 * answers the whole build in one place and the builder sees every earlier round. Stored with the build
 * (`metadata.build.requests[].conversation_id`); null until the first run exists.
 */
export function buildConversationId(requests: readonly Pick<BuildEntry, "conversation_id">[]): string | null {
  return requests.find((r) => r.conversation_id)?.conversation_id ?? null;
}

/** The turn the HOST writes for a fix round — never quoted as hers (`host_turn`; the details ride `context`). */
export function fixHostTurn(message: string | null | undefined): { text: string; reason: string } {
  const subject = problemSubject(message);
  return {
    text: `Your last answer could not be saved${subject ? ` (${subject})` : ""}. The reason is in last_check. Fix only that and return the whole record.`,
    reason: "applets.build fix round",
  };
}
