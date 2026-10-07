/**
 * A BUILD IS A RECORD: its request history is read back exactly as written, and THE CLAIM saves a
 * finished answer once — the tab that started the run and a tab that reopened it race for it, and only
 * one may win (the other would write a second version of the same answer).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { STALE_CLAIM_MS, appendBuildEntry, claimBuildEntry, draftNameOf, isOpenEntry, isStaleClaim, newBuildEntry, patchBuildEntry, readBuildRequests, releaseStaleClaim } from "./build-session";

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

  it("names a draft from her own words, cut at a word", () => {
    expect(draftNameOf("  A simple   reading list ")).toBe("A simple reading list");
    const long = draftNameOf("A page where I see my clients and approve their posts every single morning before nine");
    expect(long.length).toBeLessThanOrEqual(61);
    expect(long.endsWith("…")).toBe(true);
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
