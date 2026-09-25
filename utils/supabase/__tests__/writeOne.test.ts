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

/** A client whose answers are consumed in order: the write, then the re-read. */
function clientAnsweringInOrder(answers: FetchAnswer[]) {
  const queue = [...answers];
  const methods: string[] = [];
  const fakeFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    methods.push(init?.method ?? "GET");
    const answer = queue.shift() ?? { status: 200, body: [] };
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "Content-Type": "application/json" },
    });
  };
  const client = createClient("https://db.example.test", "anon-key", {
    global: { fetch: fakeFetch as typeof fetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { client, methods };
}

describe("writeOne — idempotent mode (alreadyDone)", () => {
  type Row = { id: string; deleted_at: string | null };
  const archive = (client: ReturnType<typeof clientAnsweringInOrder>["client"]) =>
    writeOne<Row>(
      client
        .from("canvas_item")
        .update({ deleted_at: "now" })
        .eq("id", "c1")
        .is("deleted_at", null)
        .select("id, deleted_at"),
      {
        action: "archive",
        noun: "canvas item",
        alreadyDone: {
          reread: () => client.from("canvas_item").select("id, deleted_at").eq("id", "c1").maybeSingle(),
          isDone: (row) => row.deleted_at != null,
        },
      },
    );

  it("zero rows on a record that is already archived is success — returns the record as it stands", async () => {
    const { client, methods } = clientAnsweringInOrder([
      { status: 200, body: [] },
      { status: 200, body: { id: "c1", deleted_at: "2026-09-24T00:00:00Z" } },
    ]);
    await expect(archive(client)).resolves.toEqual({ id: "c1", deleted_at: "2026-09-24T00:00:00Z" });
    expect(methods).toEqual(["PATCH", "GET"]);
  });

  it("zero rows on a record that is still live is a refusal", async () => {
    const { client } = clientAnsweringInOrder([
      { status: 200, body: [] },
      { status: 200, body: { id: "c1", deleted_at: null } },
    ]);
    await expect(archive(client)).rejects.toThrow(
      "Nothing was archived: this canvas item no longer exists, or your access does not allow archiving it.",
    );
  });

  it("zero rows on a record the person cannot see is a refusal", async () => {
    const { client: c2 } = clientAnsweringInOrder([
      { status: 200, body: [] },
      { status: 200, body: [] },
    ]);
    await expect(archive(c2)).rejects.toBeInstanceOf(WriteDidNotLandError);
  });

  it("a write that landed never re-reads", async () => {
    const { client, methods } = clientAnsweringInOrder([{ status: 200, body: [{ id: "c1", deleted_at: "now" }] }]);
    await expect(archive(client)).resolves.toEqual({ id: "c1", deleted_at: "now" });
    expect(methods).toEqual(["PATCH"]);
  });
});

describe("writeOne — compare-and-set mode", () => {
  it("zero rows means someone else got there first, and says so", async () => {
    const { client } = clientAnswering({ status: 200, body: [] });
    const attempt = writeOne(
      client.from("question").update({ answered_at: "now" }).eq("id", "q1").is("answered_at", null).select("id"),
      { action: "save", noun: "answer", compareAndSet: true },
    );
    await expect(attempt).rejects.toBeInstanceOf(WriteDidNotLandError);
    await expect(attempt).rejects.toThrow("This answer was already handled — refresh to see the latest.");
  });

  it("the sentence survives describeWriteFailure for a toast", async () => {
    const { client } = clientAnswering({ status: 200, body: [] });
    const result = await tryWriteOne(
      client.from("task").update({ state: "done" }).eq("id", "t1").eq("state", "assigned").select("id"),
      { action: "update", noun: "task", compareAndSet: true },
    );
    expect(result.error).toBeInstanceOf(WriteDidNotLandError);
    expect((result.error as WriteDidNotLandError).reason).toBe("taken");
    expect(describeWriteFailure(result.error, { action: "finish this task" }).description).toContain(
      "This task was already handled — refresh to see the latest.",
    );
  });
});

describe("the refusal survives a Redux thunk", () => {
  it("describeWriteFailure keeps the words after RTK serializes the error to { name, message }", async () => {
    const { client } = clientAnswering({ status: 200, body: [] });
    const err = await writeOne(client.from("tasks").update({ deleted_at: "now" }).eq("id", "t1").select("id"), {
      action: "delete",
      noun: "task",
    }).then(
      () => new Error("the write should have been refused"),
      (e: Error) => e,
    );
    const serialized = { name: err.name, message: err.message }; // what `.unwrap()` rejects with
    expect(describeWriteFailure(serialized, { action: "delete this task" }).description).toContain(
      "Nothing was deleted: this task no longer exists",
    );
  });
});
