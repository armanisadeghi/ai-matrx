// lib/db/transientRetry.ts
//
// SURVIVING A TRANSIENT DATABASE CONDITION INSTEAD OF DESTROYING THE CALLER'S WORK.
//
// WHAT THIS CLOSES. On 2026-09-20 ~22:00Z a real-data crew (crew C, US National
// Parks itinerary import) tried twice to file the limitation it had just hit and
// got, both times:
//
//   agent feedback cannot be attributed: no agent id was supplied, and the
//   canonical lookup public.lookup_user_by_email(claude-01@aimatrx.com) failed:
//   canceling statement due to statement timeout [57014]
//
// The report was lost both times and had to be carried by hand in a markdown
// table. The lookup it died on is NOT slow: measured on the main database the
// same day, `auth.users` holds 742 rows and `lower(email) = $1` is served by
// `users_instance_id_email_idx` in 0.738 ms (index scan, 4 buffers). The
// `service_role` PostgREST session inherits `authenticator`'s
// `statement_timeout=8s`, so an 8-second cancellation on a 0.7 ms query is
// CONTENTION — another session holding a lock or saturating the pool — and
// contention is transient by definition. The defect was never the query. It was
// that one unlucky 8-second window permanently destroyed content a person (or an
// agent doing a person's job) had already written.
//
// THE CLASS, not the instance: any call in a content-carrying surface that dies
// on a retryable server condition and hands the caller nothing but the raw
// Postgres sentence. The remedy is the same everywhere — recognise the codes the
// server itself calls retryable, try again briefly, and SAY SO when you did.
//
// THE THREE RULES THIS FOLLOWS
//
//   1. Only genuinely retryable conditions are retried. A constraint violation, a
//      permission denial, a bad argument — anything the caller would get again
//      no matter how many times it asked — is returned untouched, immediately.
//      Retrying a deterministic failure is a slow way to fail.
//   2. NOTHING FAILS SILENTLY. A retry that succeeds is an automatic
//      intervention, so it announces itself on the console with the label, the
//      code it survived and how many tries it took. A retry that runs out
//      announces that too, and `describeTransient` gives the caller a sentence
//      that says what to DO — "ask again", not just "it broke".
//   3. It is bounded and cheap. Three attempts, 150 ms then 400 ms: a worst case
//      of ~550 ms of added latency on a path that only pays it when the database
//      is already refusing, and zero cost on the ordinary path.
//
// It deliberately does NOT know about feedback, or about any one feature. It
// takes a thunk and a label. Both Supabase shapes work through the ONE function:
// a call that RETURNS `{ error }` (PostgREST) and a call that THROWS (a resolver
// that raises on failure) are probed the same way.

/**
 * SQLSTATE codes the server itself considers retryable, and what each one means
 * for a caller that asked once and was refused.
 *
 * `57014` is the one the crew hit: the statement was CANCELED, not rejected —
 * the database is saying "not right now", which is the definition of worth
 * asking again.
 */
interface TransientFact {
  /** What the condition means, in the words a refusal will use. */
  readonly meaning: string;
  /**
   * 🚨 COULD THE WRITE HAVE LANDED ANYWAY? This is the whole reason retrying is
   * not automatically safe. A statement the SERVER canceled (57014) or a
   * transaction it rolled back (40001) provably wrote nothing, so asking again
   * can only produce the row once. A connection that DROPPED (08006, 57P01) may
   * have dropped after the commit and before the answer came back — asking again
   * would file the same report twice. `repeatable: false` is how a
   * caller that CREATES a row says it will not take that risk.
   */
  readonly mayHaveCommitted: boolean;
}

const TRANSIENT_SQLSTATES: ReadonlyMap<string, TransientFact> = new Map([
  // Provably nothing was written: the server itself cancelled or rolled back.
  ["57014", { meaning: "the statement was canceled by the server's timeout", mayHaveCommitted: false }],
  ["57P03", { meaning: "the server cannot accept connections yet", mayHaveCommitted: false }],
  ["40001", { meaning: "the transaction lost a serialization race", mayHaveCommitted: false }],
  ["40P01", { meaning: "the transaction was chosen to break a deadlock", mayHaveCommitted: false }],
  ["55P03", { meaning: "a lock it needed was held by someone else", mayHaveCommitted: false }],
  ["53300", { meaning: "the server has too many connections open", mayHaveCommitted: false }],
  ["53400", { meaning: "the server ran out of configuration resources", mayHaveCommitted: false }],
  ["08001", { meaning: "the client could not open a connection", mayHaveCommitted: false }],
  ["08004", { meaning: "the server rejected the connection", mayHaveCommitted: false }],
  // The answer was lost, which is NOT the same as the work being lost.
  ["57P01", { meaning: "the server is shutting this connection down", mayHaveCommitted: true }],
  ["57P02", { meaning: "the server is restarting after a crash", mayHaveCommitted: true }],
  ["08000", { meaning: "the connection dropped", mayHaveCommitted: true }],
  ["08003", { meaning: "the connection was already closed", mayHaveCommitted: true }],
  ["08006", { meaning: "the connection failed", mayHaveCommitted: true }],
]);

/** A transport failure never reaches a SQLSTATE, and may have dropped after the commit. */
const TRANSPORT_FACT: TransientFact = {
  meaning: "the connection to the database failed before an answer came back",
  mayHaveCommitted: true,
};

/**
 * Transport failures that never reach Postgres and so carry no SQLSTATE. These
 * are matched on the message because that is the only thing `fetch` gives us —
 * narrowly, on phrases that mean "the pipe broke", never on the word "error".
 */
const TRANSIENT_TRANSPORT =
  /\b(fetch failed|network error|socket hang up|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|terminating connection|connection terminated|server closed the connection)\b/i;

/** The shape every Postgres-ish error we see has some of. */
interface Errorish {
  readonly code?: string | null;
  readonly message?: string | null;
}

function asErrorish(value: unknown): Errorish | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Errorish;
  if (typeof v.code === "string" || typeof v.message === "string") return v;
  return null;
}

/**
 * The code this error is retryable UNDER, or `null` if asking again would just
 * produce the same answer. Exported because a caller that writes its own refusal
 * sentence needs to know which kind of failure it is explaining.
 */
export function transientCode(value: unknown): string | null {
  return transientFact(value)?.code ?? null;
}

function transientFact(
  value: unknown,
): { code: string; fact: TransientFact } | null {
  const e = asErrorish(value);
  if (!e) return null;
  const code = typeof e.code === "string" ? e.code : "";
  const known = TRANSIENT_SQLSTATES.get(code);
  if (known) return { code, fact: known };
  const message = typeof e.message === "string" ? e.message : "";
  if (message && TRANSIENT_TRANSPORT.test(message)) {
    return { code: code || "transport", fact: TRANSPORT_FACT };
  }
  return null;
}

/**
 * The sentence to append to a refusal when the thing that failed was transient:
 * it names the condition and tells the caller the one useful thing — that the
 * same request is worth making again. Without this, an agent reads "statement
 * timeout" as "this is broken" and gives up, which is exactly what crew C did.
 */
export function describeTransient(value: unknown, attempts: number): string {
  const found = transientFact(value);
  if (!found) return "";
  const tail = found.fact.mayHaveCommitted
    ? `The answer was lost rather than refused, so check whether it landed before sending it again.`
    : `Nothing was written — make the same request again; nothing about it needs to change.`;
  return (
    ` — this is a TRANSIENT database condition (${found.fact.meaning}), not a missing row and not a ` +
    `refusal: it was already retried up to ${attempts} times over ~0.5s and still did not clear, so ` +
    `the database is busy right now. ${tail}`
  );
}

export interface TransientRetryOptions {
  /**
   * 🚨 SET THIS `false` FOR A CALL THAT CREATES A ROW. The default (`true`)
   * suits a read or an idempotent update, where running the same statement
   * twice cannot produce two of anything. A call that INSERTs must pass
   * `false`: then only the conditions that provably wrote nothing are retried,
   * and a dropped connection — which may have dropped AFTER the commit — is
   * handed straight back to the caller with `describeTransient` telling it to
   * check before re-sending. Retrying blindly here is how one bug report
   * becomes three.
   */
  readonly repeatable?: boolean;
  /** Total tries, first attempt included. Three is the default. */
  readonly attempts?: number;
  /** Backoff before retry n: 150 ms, then 400 ms. */
  readonly delaysMs?: readonly number[];
  /** Where the announcement goes. Defaults to the console. */
  readonly warn?: (message: string) => void;
  /** Injectable so a suite does not spend real seconds proving the backoff. */
  readonly sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_DELAYS = [150, 400] as const;

/**
 * Run `run`, and if it fails transiently, run it again.
 *
 * Works with BOTH Supabase shapes and does not need to be told which:
 *   • a PostgREST call that resolves to `{ data, error }` — the `error` is probed;
 *   • a resolver that THROWS — the thrown value is probed, and re-thrown
 *     unchanged once the attempts run out, so no caller's `catch` changes shape.
 *
 * The return value is whatever `run` returned, untouched. This function never
 * converts a failure into a success, never substitutes a value, and never
 * swallows a non-transient error — it only decides whether to ask again.
 *
 * @param label what is being attempted, in the words the refusal will use
 *              (e.g. `public.lookup_user_by_email(claude-01@aimatrx.com)`).
 */
export async function withTransientRetry<T>(
  label: string,
  run: () => Promise<T>,
  options: TransientRetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const repeatable = options.repeatable ?? true;
  /**
   * The one question asked of every failure: may this be tried again? A
   * condition that could have committed is retryable only for a caller that
   * said repeating its statement is harmless.
   */
  const mayRetry = (value: unknown): string | null => {
    const found = transientFact(value);
    if (!found) return null;
    if (found.fact.mayHaveCommitted && !repeatable) return null;
    return found.code;
  };
  const delays = options.delaysMs ?? DEFAULT_DELAYS;
  const warn =
    options.warn ??
    ((message: string) => {
      // eslint-disable-next-line no-console
      console.warn(message);
    });
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let lastCode: string | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    let outcome: T;
    try {
      outcome = await run();
    } catch (thrown) {
      const code = mayRetry(thrown);
      if (!code || attempt === attempts) {
        if (code) {
          warn(
            `[transient-retry] ${label} still failing after ${attempts} attempts (${code}); ` +
              `giving the caller the refusal.`,
          );
        }
        throw thrown;
      }
      lastCode = code;
      warn(
        `[transient-retry] ${label} failed transiently (${code}) on attempt ${attempt} of ` +
          `${attempts}; asking again in ${delays[attempt - 1] ?? delays[delays.length - 1]}ms.`,
      );
      await sleep(delays[attempt - 1] ?? delays[delays.length - 1] ?? 150);
      continue;
    }

    const code = mayRetry((outcome as { error?: unknown } | null)?.error);
    if (!code) {
      // Announce the intervention: this call only succeeded because it was
      // retried, and a silent recovery is still an automatic intervention.
      if (lastCode) {
        warn(
          `[transient-retry] ${label} succeeded on attempt ${attempt} after surviving ${lastCode}.`,
        );
      }
      return outcome;
    }
    if (attempt === attempts) {
      warn(
        `[transient-retry] ${label} still failing after ${attempts} attempts (${code}); ` +
          `giving the caller the refusal.`,
      );
      return outcome;
    }
    lastCode = code;
    warn(
      `[transient-retry] ${label} failed transiently (${code}) on attempt ${attempt} of ` +
        `${attempts}; asking again in ${delays[attempt - 1] ?? delays[delays.length - 1]}ms.`,
    );
    await sleep(delays[attempt - 1] ?? delays[delays.length - 1] ?? 150);
  }

  // Unreachable: the loop either returns or throws on its last attempt.
  throw new Error(`${label}: transient retry loop ended without an outcome`);
}
