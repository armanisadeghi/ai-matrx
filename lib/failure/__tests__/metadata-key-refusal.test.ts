/**
 * THE GUARD: a refused metadata write says what was lost and how it gets fixed.
 *
 * ## The defect (2026-09-29, flashcards fix lane)
 *
 * `platform._metadata_guard` — the trigger on every table whose `metadata`
 * column is system-owned — refused `fc_set.metadata.source_set` because the key
 * was not registered in `platform.metadata_reserved_keys`. The database was
 * loud (SQLSTATE 42501, an operator's paragraph); the client was not:
 * `describeFailure` passed the paragraph through with NO remedy, `fcService`
 * prefixed it with a method name (`mergeSetMetadata: matrx_validation_gate: …`),
 * and `GenerateCardsDialog` discarded the result entirely (`void …`).
 *
 * ## The SUT and what is real
 *
 * `describeFailure` / `metadataKeyRefusal` in `lib/failure/transport.ts` (no
 * stub), and `fcService.mergeSetMetadata` through the REAL `mergeJsonColumn`
 * with only the supabase client faked. The error is the exact shape the live
 * guard raised on 2026-09-29 (verified by a rolled-back authenticated UPDATE
 * of an unregistered key on education.fc_set).
 *
 * ## Proven red before green (2026-09-29)
 *
 * Against the pre-fix `transport.ts` (scratch copy), `metadataKeyRefusal` does
 * not exist and `describeFailure` returns the raw paragraph with `remedy: ""`;
 * against the pre-fix `fcService.ts`, the returned error starts with
 * `mergeSetMetadata: matrx_validation_gate` and names no remedy.
 */

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: jest.fn(), rpc: jest.fn() },
}));
jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: { add: jest.fn(async () => ({ ok: true })) },
}));

import { supabase } from "@/utils/supabase/client";
import { fcService } from "@/features/flashcards/data/fcService";
import {
  describeFailure,
  metadataKeyRefusal,
} from "@/lib/failure/transport";

/** The live guard's refusal, as PostgREST hands it to supabase-js. */
function gateRefusal(key: string, table: string) {
  return {
    code: "42501",
    message: `matrx_validation_gate: metadata key "${key}" is not system-owned state on ${table} — the metadata column belongs to the platform, never to user content. Put this in a real column on the table (or in custom_fields), not in metadata.`,
    details: null,
    hint: "AI Matrx Data Doctrine §3.2/§4.4 (DD-060). If this key really is system state the server stamps, the server writes it with the service role (which bypasses this guard) or it is registered in platform.metadata_reserved_keys with a reason.",
  };
}

describe("the metadata gate's refusal is recognised on every table", () => {
  it.each([
    ["source_set", "education.fc_set"],
    ["zz_probe", "workbench.notes"],
    ["pasted", "agent.definition"],
  ])("names the key %s and the table %s", (key, table) => {
    expect(metadataKeyRefusal(gateRefusal(key, table))).toEqual({ key, table });
    // A caller's own prefix does not hide it.
    expect(
      metadataKeyRefusal(new Error(`mergeSetMetadata: ${gateRefusal(key, table).message}`)),
    ).toEqual({ key, table });
  });

  it("says what was lost, that it is not transient, and gives the remedy", () => {
    const out = describeFailure(gateRefusal("source_set", "education.fc_set"), {
      action: "saving this deck",
    });
    expect(out.transient).toBe(false);
    expect(out.sentence).toContain('"source_set"');
    expect(out.sentence).toContain("was not saved");
    expect(out.sentence).not.toContain("matrx_validation_gate");
    expect(out.remedy).toContain("platform.metadata_reserved_keys");
    expect(out.remedy).toContain("report it");
  });

  it("leaves every other 42501 decision word for word", () => {
    const other = { code: "42501", message: "permission denied for table fc_set" };
    expect(metadataKeyRefusal(other)).toBeNull();
    expect(describeFailure(other)).toMatchObject({
      sentence: "permission denied for table fc_set",
      remedy: "",
    });
  });
});

describe("fcService.mergeSetMetadata surfaces the refusal to its caller", () => {
  afterEach(() => jest.clearAllMocks());

  it("returns the sentence and remedy, never the operator paragraph", async () => {
    const row = { id: "set-1", version: 3, metadata: { generation: "surface_save" } };
    const q: Record<string, unknown> = {};
    let updating = false;
    Object.assign(q, {
      select: () => q,
      eq: () => q,
      is: () => q,
      update: () => {
        updating = true;
        return q;
      },
      maybeSingle: async () =>
        updating
          ? { data: null, error: gateRefusal("source_set", "education.fc_set") }
          : { data: row, error: null },
    });
    (supabase.schema as jest.Mock).mockReturnValue({ from: () => q });

    const res = await fcService.mergeSetMetadata("set-1", (current) => ({
      ...current,
      source_set: { __kind: "source_set", sources: [] },
    }));

    expect(res.data).toBeNull();
    expect(res.error).toContain('"source_set"');
    expect(res.error).toContain("platform.metadata_reserved_keys");
    expect(res.error).not.toMatch(/^mergeSetMetadata: matrx_validation_gate/);
  });
});
