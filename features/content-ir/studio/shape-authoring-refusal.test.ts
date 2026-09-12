/**
 * B-23 / DD-123 / V-23 finding 2 — the shape-authoring refusal must reach the
 * person WITH its remedy.
 *
 * The door itself is the database trigger `zzz_component_author_gate` (aidream
 * migration 0639), proved refusing and admitting real identities against the
 * live database in aidream `tests/test_shape_authoring_platform_only_live.py`.
 * What this file guards is the last inch: PostgREST hands the refusal back as
 * a message PLUS a separate `hint` field, and `saveKindComponentCode` dropped
 * both into `operationFailed("save this Shape's component code")` — so an
 * organization admin saw "We couldn't save this Shape's component code." and
 * learned neither why nor what to do instead. The strings below are the ones
 * the trigger actually raises; the aidream parity test
 * `test_the_refusal_sentence_is_the_same_in_all_three_runtimes` fails if they
 * drift apart.
 */
import { saveKindComponentCode } from "@/features/content-ir/studio/kind-component-code-service";

const DB_MESSAGE =
  "Only AI Matrx staff can write shape component code right now. Custom shape " +
  "authoring opens to every organization when the isolated sandbox that runs " +
  "component code ships. The shapes you already have keep rendering exactly as " +
  "they do today — this only stops new or changed component code from being " +
  'saved. (component "invoice_card")';
const DB_HINT =
  "Ask AI Matrx to author or change this component for you, or use the " +
  "built-in shape components until custom authoring opens.";

const HONEST_SOURCE =
  'import React from "react";\n' +
  "export default function C({ data }) {\n" +
  "  return <div>{data?.title ?? null}</div>;\n" +
  "}\n";

/**
 * A supabase-js client whose UPDATE fails exactly the way PostgREST reports a
 * 42501 raised by the trigger: message, details, hint, code.
 */
function clientRefusing(error: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ["update", "eq", "is", "select"]) {
    chain[method] = () => chain;
  }
  chain.maybeSingle = () => Promise.resolve({ data: null, error });
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }),
    },
    schema: () => ({ from: () => chain }),
  } as never;
}

const component = {
  id: "11111111-1111-1111-1111-111111111111",
  kindDefinitionId: "22222222-2222-2222-2222-222222222222",
  platform: "web",
  role: "output",
  componentKey: "invoice_card",
  source: "db",
  componentSource: "",
  config: {},
  isActive: true,
  isDefault: true,
  semver: "1.0.0",
  version: 3,
  updatedAt: "2026-09-12T00:00:00.000Z",
} as never;

async function saveExpectingFailure(error: unknown): Promise<string> {
  try {
    await saveKindComponentCode(clientRefusing(error), {
      component,
      componentSource: HONEST_SOURCE,
    });
  } catch (thrown) {
    return (thrown as Error).message;
  }
  throw new Error("the save did not fail — this test proves nothing");
}

describe("the shape-authoring refusal reaches the person", () => {
  const refusal = {
    message: DB_MESSAGE,
    details: null,
    hint: DB_HINT,
    code: "42501",
  };

  it("shows the database's own sentence, not the generic wrapper", async () => {
    const message = await saveExpectingFailure(refusal);
    expect(message).toContain(DB_MESSAGE);
    expect(message).not.toContain("We couldn't");
  });

  it("carries the HINT, so the refusal comes with its remedy", async () => {
    const message = await saveExpectingFailure(refusal);
    expect(message).toContain(DB_HINT);
  });

  it("leaves every other failure to the generic wrapper", async () => {
    const message = await saveExpectingFailure({
      message: "could not connect to server",
      details: null,
      hint: null,
      code: "08006",
    });
    expect(message).toBe("We couldn't save this Shape's component code.");
  });
});
