/**
 * @jest-environment node
 */
/**
 * writeOne — a single-record write must PROVE it landed.
 *
 * The class: supabase-js answers an `.update()` / `.delete()` that RLS filters
 * to zero rows with `{ data: [], error: null }` (status 200) — no error at
 * all. A caller that judges success by `error == null` tells the person
 * "Card deleted" while nothing happened (flashcards, 2026-09-25).
 *
 * These tests drive a REAL supabase-js client whose fetch answers the way
 * PostgREST answers an RLS-refused write — `[]` with 200 — so they exercise
 * the real builder, not a hand-shaped stub of it.
 */
import { createClient } from "@supabase/supabase-js";
import { tryWriteOne, writeOne, WriteDidNotLandError } from "../writeOne";
import { describeWriteFailure } from "@/lib/errors/writeFailure";

type FetchAnswer = { status: number; body: unknown };

function clientAnswering(answer: FetchAnswer) {
  const calls: { url: string; method: string; prefer: string | null }[] = [];
  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      prefer: headers.get("Prefer"),
    });
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "Content-Type": "application/json" },
    });
  };
  const client = createClient("https://db.example.test", "anon-key", {
    global: { fetch: fakeFetch as typeof fetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { client, calls };
}

describe("the defect this primitive exists for", () => {
  it("supabase-js reports NO error when a filtered update changes zero rows", async () => {
    const { client } = clientAnswering({ status: 200, body: [] });
    const { error } = await client
      .from("fc_card")
      .update({ deleted_at: "2026-09-25T00:00:00Z" })
      .eq("id", "card-1");
    // This is the whole bug: nothing changed, and nothing says so.
    expect(error).toBeNull();
  });
});

describe("writeOne", () => {
  it("returns the written row when the write landed", async () => {
    const { client, calls } = clientAnswering({ status: 200, body: [{ id: "card-1" }] });
    const row = await writeOne(
      client.from("fc_card").update({ deleted_at: "now" }).eq("id", "card-1").select("id"),
      { action: "delete", noun: "card" },
    );
    expect(row).toEqual({ id: "card-1" });
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].prefer).toContain("return=representation");
  });

  it("raises a plain-English refusal when zero rows were written", async () => {
    const { client } = clientAnswering({ status: 200, body: [] });
    const attempt = writeOne(
      client.from("fc_card").update({ deleted_at: "now" }).eq("id", "card-1").select("id"),
      { action: "delete", noun: "card" },
    );
    await expect(attempt).rejects.toBeInstanceOf(WriteDidNotLandError);
    await expect(attempt).rejects.toThrow(
      "Nothing was deleted: this card no longer exists, or your access does not allow deleting it.",
    );
  });

  it("names the refusal with the verb the caller used", async () => {
    const { client } = clientAnswering({ status: 200, body: [] });
    await expect(
      writeOne(client.from("notes").update({ label: "x" }).eq("id", "n1").select("id"), {
        action: "save",
        noun: "note",
      }),
    ).rejects.toThrow("Nothing was saved: this note no longer exists, or your access does not allow saving it.");
  });

  it("passes a database error through untouched (callers keep their error handling)", async () => {
    const { client } = clientAnswering({
      status: 403,
      body: { code: "42501", message: "new row violates row-level security policy", details: null, hint: null },
    });
    await expect(
      writeOne(client.from("fc_card").delete().eq("id", "card-1").select("id"), {
        action: "delete",
        noun: "card",
      }),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("reads as words on screen through describeWriteFailure", async () => {
    const { client } = clientAnswering({ status: 200, body: [] });
    const err = await writeOne(
      client.from("fc_set").delete().eq("id", "s1").select("id"),
      { action: "archive", noun: "set" },
    ).catch((e: unknown) => e);
    const words = describeWriteFailure(err, { action: "archive this set" });
    expect(words.title).toBe("Could not archive this set.");
    expect(words.description).toContain("Nothing was archived: this set no longer exists");
  });
});

describe("tryWriteOne", () => {
  it("returns { row } when the write landed", async () => {
    const { client } = clientAnswering({ status: 200, body: [{ id: "s1" }] });
    const result = await tryWriteOne(client.from("fc_set").delete().eq("id", "s1").select("id"), {
      action: "delete",
      noun: "set",
    });
    expect(result).toEqual({ row: { id: "s1" }, error: null });
  });

  it("returns the refusal instead of throwing when zero rows were written", async () => {
    const { client } = clientAnswering({ status: 200, body: [] });
    const result = await tryWriteOne(client.from("fc_set").delete().eq("id", "s1").select("id"), {
      action: "delete",
      noun: "set",
    });
    expect(result.row).toBeNull();
    expect(result.error).toBeInstanceOf(WriteDidNotLandError);
    expect(result.error?.message).toBe(
      "Nothing was deleted: this set no longer exists, or your access does not allow deleting it.",
    );
  });
});
