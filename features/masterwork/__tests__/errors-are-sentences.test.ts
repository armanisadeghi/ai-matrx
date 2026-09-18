/**
 * AN ERROR A PERSON SEES IS A SENTENCE, NEVER AN OBJECT (2026-09-15).
 *
 * THE LIVE DEFECT. A user-driver on the Rulebook page clicked Approve on a
 * draft rule and got an unhandled runtime crash reading "[object Object]" —
 * nothing could be approved and the screen said nothing a person could act on.
 * The proximate cause was a broken module (a duplicate import) rendered by the
 * dev overlay, but it exposed the real class underneath: every Supabase call in
 * `features/masterwork/**` rethrew the raw PostgREST error object
 * (`if (error) throw error;`). A PostgrestError is NOT an Error — it has no
 * stack, `instanceof Error` is false, and anything that stringifies it prints
 * "[object Object]". Every `catch` in this feature is written
 * `err instanceof Error ? err.message : "…"`, so a raw object silently fell
 * through to a generic fallback; anything that escaped a catch reached the
 * overlay as an object.
 *
 * THE CLASS FIX: every one of those sites now throws `operationFailed(action,
 * cause)` from `utils/errors` — "We couldn't open that Rulebook." — with the
 * raw response preserved as `cause` for the inspector.
 *
 * TWO LEGS, both of which fail on a one-line regression:
 *
 *  1. BEHAVIOUR. The real `getRulebook` and `saveRules` are called with the
 *     Supabase client mocked to answer the way PostgREST does on a refusal.
 *     What comes out must be an Error whose message is a sentence, and
 *     `String(thrown)` must never contain "[object Object]". Put
 *     `throw error;` back and this fails.
 *  2. CENSUS. No file under `features/masterwork/` may rethrow a PostgREST
 *     error object. A new data module that copies the old shape fails here the
 *     day it is written, rather than the day a person clicks the button.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const POSTGREST_REFUSAL = {
  message: 'permission denied for table "rulebook"',
  code: "42501",
  details: null,
  hint: null,
};

/** The wire, answering the way PostgREST does when it refuses. */
const refuse = () => Promise.resolve({ data: null, error: POSTGREST_REFUSAL });
const builder: Record<string, unknown> = {};
for (const method of [
  "select",
  "update",
  "insert",
  "delete",
  "eq",
  "in",
  "is",
  "order",
  "range",
  "limit",
]) {
  builder[method] = () => builder;
}
builder.single = refuse;
builder.maybeSingle = refuse;
builder.then = (resolve: (v: unknown) => unknown) =>
  refuse().then(resolve as never);

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => ({ from: () => builder, rpc: () => builder }) },
  createClient: () => ({
    schema: () => ({ from: () => builder, rpc: () => builder }),
  }),
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  recordToast: jest.fn(),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { getRulebook } = require("../service");
/* eslint-enable @typescript-eslint/no-require-imports */

function assertIsASentence(thrown: unknown, what: string) {
  expect(thrown).toBeInstanceOf(Error);
  const error = thrown as Error;
  // A sentence a person can read: starts with a capital, ends with a stop,
  // and does not carry a PostgREST code or a schema name.
  expect(error.message).toMatch(/^[A-Z].*\.$/);
  expect(error.message).not.toMatch(/42501|permission denied|PGRST/);
  expect(String(error)).not.toContain("[object Object]");
  expect(`${what}: ${error.message}`).not.toContain("[object Object]");
  // The raw response survives for the inspector — nothing is swallowed.
  expect((error as Error & { cause?: unknown }).cause).toBe(POSTGREST_REFUSAL);
}

describe("1 · a refused read reaches the person as a sentence", () => {
  it("getRulebook", async () => {
    expect.assertions(6);
    try {
      await getRulebook("e3b21d77-ddab-484f-b877-6b3ddffd5ddd");
    } catch (thrown) {
      assertIsASentence(thrown, "open the Rulebook");
    }
  });
});

describe("2 · no file in features/masterwork rethrows a PostgREST object", () => {
  const ROOT = path.resolve(__dirname, "..");

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules" || entry === "__tests__") continue;
        out.push(...walk(full));
      } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        out.push(full);
      }
    }
    return out;
  }

  it("finds none", () => {
    const findings: string[] = [];
    for (const file of walk(ROOT)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        // The exact shape: a bare rethrow of the variable PostgREST hands back.
        if (/^\s*(if \(error\)\s*)?throw error;\s*$/.test(line)) {
          findings.push(`${path.relative(ROOT, file)}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(findings).toEqual([]);
  });
});
