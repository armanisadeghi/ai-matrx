/**
 * A BUILD IS A RECORD: its request history is read back exactly as written, and THE CLAIM saves a
 * finished answer once — the tab that started the run and a tab that reopened it race for it, and only
 * one may win (the other would write a second version of the same answer).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { BuildRefused, coerceBuildAnswer, repairs } from "./build-applet";
import { checkBuildAnswer } from "./check-build-answer";
import {
  FIX_ROUND_FRESH_MS,
  STALE_CLAIM_MS,
  appendBuildEntry,
  claimBuildEntry,
  claimFixRound,
  UNTITLED_APPLET,
  isOpenEntry,
  isStaleClaim,
  newBuildEntry,
  patchBuildEntry,
  readBuildRequests,
  releaseStaleClaim,
  reopenOutcome,
  type BuildEntry,
} from "./build-session";

type Row = { id: string; organization_id: string; slug: string; name: string; version: number; status: string; entry: string | null; metadata: unknown };

/** The one row, behind the exact query shapes build-session uses, with `version` as the CAS token. */
function fakeClient(row: Row) {
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: structuredClone(row), error: null }) }),
      }),
      update: (patch: Partial<Row>) => ({
        eq: () => ({
          eq: (_col: string, expected: number) => ({
            select: () => ({
              maybeSingle: async () => {
                if (row.version !== expected) return { data: null, error: null };
                Object.assign(row, patch, { version: row.version + 1 });
                return { data: structuredClone(row), error: null };
              },
            }),
          }),
        }),
      }),
    }),
  };
  return { client: { schema: () => db } as unknown as SupabaseClient<Database>, row };
}

const base = (): Row => ({ id: "a1", organization_id: "o1", slug: "draft-x", name: "Reading list", version: 1, status: "draft", entry: null, metadata: { other: 1 } });

describe("build session", () => {
  it("reads the request history back, dropping what is not a request", () => {
    const entry = newBuildEntry("A reading list", null);
    expect(readBuildRequests({ build: { requests: [entry, { nope: true }] } })).toEqual([entry]);
    expect(readBuildRequests(null)).toEqual([]);
  });

  it("a new request starts open; saved and failed ones are closed", () => {
    const entry = newBuildEntry("x", null);
    expect(isOpenEntry(entry)).toBe(true);
    expect(isOpenEntry({ ...entry, state: "running" })).toBe(true);
    expect(isOpenEntry({ ...entry, state: "saved" })).toBe(false);
    expect(isOpenEntry({ ...entry, state: "failed" })).toBe(false);
  });

  it("names a draft Untitled Applet until the builder names it, never her sentence cut off", () => {
    expect(UNTITLED_APPLET).toBe("Untitled Applet");
  });

  it("appends and patches requests without touching the rest of metadata", async () => {
    const { client, row } = fakeClient(base());
    const entry = newBuildEntry("A reading list", null);
    await appendBuildEntry(client, "a1", entry);
    await patchBuildEntry(client, "a1", entry.id, { conversation_id: "c1", state: "running" });
    expect((row.metadata as { other: number }).other).toBe(1);
    expect(readBuildRequests(row.metadata)).toEqual([{ ...entry, conversation_id: "c1", state: "running" }]);
  });

  it("THE CLAIM: only the first caller saves a finished answer", async () => {
    const { client, row } = fakeClient(base());
    const entry = { ...newBuildEntry("A reading list", null), state: "running" as const, conversation_id: "c1" };
    row.metadata = { build: { requests: [entry] } };
    expect(await claimBuildEntry(client, "a1", entry.id)).toBe(true);
    expect(await claimBuildEntry(client, "a1", entry.id)).toBe(false);
    expect(readBuildRequests(row.metadata)[0]?.state).toBe("saving");
  });

  it("a claim whose tab died is released once, and the claim then decides again", async () => {
    const { client, row } = fakeClient(base());
    const entry = { ...newBuildEntry("A reading list", null), state: "running" as const, conversation_id: "c1" };
    row.metadata = { build: { requests: [entry] } };
    expect(await claimBuildEntry(client, "a1", entry.id)).toBe(true);
    const claimed = readBuildRequests(row.metadata)[0];
    expect(claimed?.claimed_at).toBeTruthy();
    // A live save is never taken over.
    expect(isStaleClaim(claimed)).toBe(false);
    expect(await releaseStaleClaim(client, "a1", entry.id)).toBe(false);
    // The claiming tab crashed: past the window, one releaser moves it back to running.
    const later = Date.parse(claimed?.claimed_at ?? "") + STALE_CLAIM_MS + 1;
    expect(isStaleClaim(claimed, later)).toBe(true);
    expect(await releaseStaleClaim(client, "a1", entry.id, later)).toBe(true);
    expect(await releaseStaleClaim(client, "a1", entry.id, later)).toBe(false);
    const released = readBuildRequests(row.metadata)[0];
    expect(released?.state).toBe("running");
    expect(released?.claimed_at).toBeUndefined();
    expect(released?.conversation_id).toBe("c1");
    expect(await claimBuildEntry(client, "a1", entry.id)).toBe(true);
  });

  it("an entry stuck in saving from before claims were stamped counts from when it started", () => {
    const old = { ...newBuildEntry("x", null), state: "saving" as const, started_at: new Date(Date.now() - STALE_CLAIM_MS - 5_000).toISOString() };
    expect(isStaleClaim(old)).toBe(true);
    expect(isStaleClaim({ ...old, state: "saved" })).toBe(false);
  });
});

/** An answer the checks refuse: a button that does nothing. */
const REFUSED_ANSWER = {
  applet: {
    name: "Reading list",
    entry: "App.tsx",
    files: [{ name: "App.tsx", source: "export default function App() { return <Button>New book</Button>; }" }],
    pages: [{ path: "/", title: "Books", file: "App.tsx" }],
    sources: [],
    mandates: [],
  },
  note: "",
};

/**
 * One tab's handling of a finished run, the way AppletBuilder runs it (live, or rejoined after a refresh):
 * check the answer; a refusal of her request is settled, then its ONE fix round is claimed.
 */
async function tabFinishes(client: ReturnType<typeof fakeClient>["client"], entry: BuildEntry) {
  try {
    checkBuildAnswer(REFUSED_ANSWER, coerceBuildAnswer(REFUSED_ANSWER));
    return { refused: false as const };
  } catch (err) {
    if (!(err instanceof BuildRefused)) throw err;
    await patchBuildEntry(client, "a1", entry.id, { state: "refused", error: err.message, refused_applet: err.applet, finished_at: new Date().toISOString() });
    if (!repairs(entry, err)) return { refused: true as const, fixRound: null };
    const fixRound = await claimFixRound(client, "a1", entry.id, newBuildEntry("Fix this error", { where: "record", message: err.message }));
    return { refused: true as const, fixRound };
  }
}

describe("THE FIX CLAIM — one automatic fix round per refusal, whatever the tabs", () => {
  it("two tabs refused on the same rejoined run start exactly one fix round; the other follows it", async () => {
    const { client, row } = fakeClient(base());
    const entry = { ...newBuildEntry("A reading list", null), state: "running" as const, conversation_id: "c1" };
    row.metadata = { build: { requests: [entry] } };
    const [first, second] = await Promise.all([tabFinishes(client, entry), tabFinishes(client, entry)]);
    const claims = [first, second].map((t) => (t.refused && t.fixRound ? t.fixRound.claimed : null));
    expect(claims.filter((c) => c === true)).toHaveLength(1);
    expect(claims.filter((c) => c === false)).toHaveLength(1);
    const requests = readBuildRequests(row.metadata);
    expect(requests.filter((r) => r.fix)).toHaveLength(1);
    expect(requests[0]?.fix_entry_id).toBe(requests[1]?.id);
    // The loser's record ends on the winner's open fix round — `follow` rejoins exactly that run.
    const loser = [first, second].find((t) => t.refused && t.fixRound && !t.fixRound.claimed);
    const latest = loser && loser.refused && loser.fixRound ? loser.fixRound.record.requests.at(-1) : null;
    expect(isOpenEntry(latest)).toBe(true);
    expect(latest?.fix).not.toBeNull();
  });

  it("a refused fix round never claims another (no loop)", async () => {
    const { client, row } = fakeClient(base());
    const fixEntry = { ...newBuildEntry("Fix this error", { where: "record", message: "x" }), state: "running" as const, conversation_id: "c2" };
    row.metadata = { build: { requests: [fixEntry] } };
    const outcome = await tabFinishes(client, fixEntry);
    expect(outcome).toEqual({ refused: true, fixRound: null });
    expect(await claimFixRound(client, "a1", fixEntry.id, newBuildEntry("Fix this error", { where: "record", message: "x" }))).toMatchObject({ claimed: false });
    expect(readBuildRequests(row.metadata)).toHaveLength(1);
  });
});

describe("reopening a refused build", () => {
  const refusedEntry = (over: Partial<BuildEntry>): BuildEntry => ({
    ...newBuildEntry("A reading list", null),
    state: "refused",
    error: "Not saved: x.",
    refused_applet: coerceBuildAnswer(REFUSED_ANSWER).applet,
    finished_at: new Date().toISOString(),
    ...over,
  });

  it("starts the fix round for a fresh refusal nobody took up", () => {
    expect(reopenOutcome([refusedEntry({})]).kind).toBe("start-fix");
  });
  it("never spends a run unasked on a stale refusal — it shows Fix it", () => {
    const old = new Date(Date.now() - FIX_ROUND_FRESH_MS - 1_000).toISOString();
    expect(reopenOutcome([refusedEntry({ finished_at: old })]).kind).toBe("show-refused");
  });
  it("shows a refused fix round with Fix it, and leaves a claimed refusal to its running round", async () => {
    expect(reopenOutcome([refusedEntry({ fix: { where: "record", message: "x" } })]).kind).toBe("show-refused");
    const { client, row } = fakeClient(base());
    const refused = refusedEntry({});
    row.metadata = { build: { requests: [refused] } };
    expect((await claimFixRound(client, "a1", refused.id, newBuildEntry("Fix this error", { where: "record", message: "x" }))).claimed).toBe(true);
    const requests = readBuildRequests(row.metadata);
    expect(reopenOutcome(requests).kind).toBe("nothing");
    expect(isOpenEntry(requests.at(-1))).toBe(true);
  });
});
