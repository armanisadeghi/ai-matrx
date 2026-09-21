/**
 * @jest-environment node
 *
 * THE DECISION `withTransientRetry` MAKES, tested on the real thing.
 *
 * Only the DB LEAF is faked — a function that hands back what PostgREST hands
 * back. Every judgement the primitive exists to make (is this retryable? may
 * this statement have committed? what do we tell the caller?) runs for real,
 * because that judgement is what the 2026-09-20 report loss turned on.
 *
 * THE USE CASE behind the fixtures is the one that produced the defect: crew C
 * was entering a US National Parks trip itinerary through the live system,
 * hit a limitation, and tried to file it. Its two attempts died on the exact
 * PostgREST error reproduced verbatim below.
 */
import {
  describeTransient,
  transientCode,
  withTransientRetry,
} from "@/lib/db/transientRetry";

/** The exact shape PostgREST returned to crew C, 2026-09-20 ~22:00Z. */
const STATEMENT_TIMEOUT = {
  code: "57014",
  message: "canceling statement due to statement timeout",
  details: null,
  hint: null,
};

/** A dropped connection: the answer was lost, the write may have landed. */
const CONNECTION_FAILED = {
  code: "08006",
  message: "connection failure",
  details: null,
  hint: null,
};

/** A refusal. Asking again produces exactly the same answer, forever. */
const PERMISSION_DENIED = {
  code: "42501",
  message: "permission denied for function lookup_user_by_email",
  details: null,
  hint: null,
};

const SERVICE_ACCOUNT_ROW = [{ user_id: "4cf62e4e-0000-0000-0000-000000000001" }];

/** No real waiting: the backoff is proven by what it does, not by elapsed time. */
const noSleep = () => Promise.resolve();

function leafReturning(...outcomes: Array<{ data: unknown; error: unknown }>) {
  const calls: number[] = [];
  let i = 0;
  return {
    calls,
    run: async () => {
      calls.push(++i);
      return outcomes[Math.min(i - 1, outcomes.length - 1)]!;
    },
  };
}

describe("withTransientRetry — which failures are worth asking again", () => {
  it("survives the statement timeout that destroyed crew C's report", async () => {
    const leaf = leafReturning(
      { data: null, error: STATEMENT_TIMEOUT },
      { data: SERVICE_ACCOUNT_ROW, error: null },
    );
    const warnings: string[] = [];

    const out = await withTransientRetry(
      "public.lookup_user_by_email(claude-01@aimatrx.com)",
      leaf.run,
      { sleep: noSleep, warn: (m) => warnings.push(m) },
    );

    expect(out.error).toBeNull();
    expect(out.data).toEqual(SERVICE_ACCOUNT_ROW);
    expect(leaf.calls).toHaveLength(2);
    // NOTHING FAILS SILENTLY: the recovery announced itself, naming the code.
    expect(warnings.join("\n")).toContain("57014");
    expect(warnings.join("\n")).toContain("lookup_user_by_email");
  });

  it("does not retry a refusal — asking twice is a slow way to fail", async () => {
    const leaf = leafReturning({ data: null, error: PERMISSION_DENIED });

    const out = await withTransientRetry("a door that said no", leaf.run, {
      sleep: noSleep,
      warn: () => {},
    });

    expect(leaf.calls).toHaveLength(1);
    expect((out.error as { code: string }).code).toBe("42501");
  });

  it("retries a canceled statement even for a call that CREATES a row", async () => {
    // 57014 means the server cancelled and rolled back, so the row provably
    // does not exist and asking again can only ever produce it once.
    const leaf = leafReturning(
      { data: null, error: STATEMENT_TIMEOUT },
      { data: { id: "f31ede0b-0000-0000-0000-000000000002" }, error: null },
    );

    const out = await withTransientRetry("the report insert", leaf.run, {
      repeatable: false,
      sleep: noSleep,
      warn: () => {},
    });

    expect(leaf.calls).toHaveLength(2);
    expect(out.error).toBeNull();
  });

  it("refuses to re-send a CREATE when the connection dropped", async () => {
    // The answer was lost; the insert may already have landed. Filing crew C's
    // limitation three times is its own defect, so this one stops at one try.
    const leaf = leafReturning({ data: null, error: CONNECTION_FAILED });

    const out = await withTransientRetry("the report insert", leaf.run, {
      repeatable: false,
      sleep: noSleep,
      warn: () => {},
    });

    expect(leaf.calls).toHaveLength(1);
    expect((out.error as { code: string }).code).toBe("08006");
  });

  it("still retries a dropped connection for a plain read", async () => {
    const leaf = leafReturning(
      { data: null, error: CONNECTION_FAILED },
      { data: SERVICE_ACCOUNT_ROW, error: null },
    );

    const out = await withTransientRetry("a read", leaf.run, {
      sleep: noSleep,
      warn: () => {},
    });

    expect(leaf.calls).toHaveLength(2);
    expect(out.data).toEqual(SERVICE_ACCOUNT_ROW);
  });

  it("re-throws a thrown failure unchanged once the attempts run out", async () => {
    const thrown = Object.assign(new Error("canceling statement due to statement timeout"), {
      code: "57014",
    });
    let calls = 0;

    await expect(
      withTransientRetry(
        "iam.system_orgs lookup",
        async () => {
          calls++;
          throw thrown;
        },
        { attempts: 3, sleep: noSleep, warn: () => {} },
      ),
    ).rejects.toBe(thrown);
    expect(calls).toBe(3);
  });
});

describe("what the caller is told", () => {
  it("tells an agent to send the same report again when nothing was written", () => {
    const said = describeTransient(STATEMENT_TIMEOUT, 3);
    expect(said).toContain("TRANSIENT");
    expect(said).toContain("Nothing was written");
    expect(said).toContain("make the same request again");
  });

  it("tells an agent to CHECK first when the write may have landed", () => {
    const said = describeTransient(CONNECTION_FAILED, 3);
    expect(said).toContain("check whether it landed");
    expect(said).not.toContain("Nothing was written");
  });

  it("says nothing at all about a refusal, which is not transient", () => {
    expect(describeTransient(PERMISSION_DENIED, 3)).toBe("");
    expect(transientCode(PERMISSION_DENIED)).toBeNull();
    expect(transientCode(STATEMENT_TIMEOUT)).toBe("57014");
  });
});
