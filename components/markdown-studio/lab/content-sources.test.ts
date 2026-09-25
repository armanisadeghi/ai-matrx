jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: jest.fn() } }));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: jest.fn(() => "capture-1"),
  resolveCapturedError: jest.fn(),
}));

import { STUDIO_SOURCES, STUDIO_SOURCE_KINDS, listStudioSource, loadStudioSource } from "./content-sources";
import { isRecordUnavailableError } from "@/lib/records/recordUnavailable";

const ID = "49d31283-2890-4b9d-b7d3-80f510eebe7c";
const PGRST116 = {
  code: "PGRST116",
  message: "Cannot coerce the result to a single JSON object",
  details: "The result contains 0 rows",
};

describe("studio sources never show database text (RC-B1 verify r2 residual 3)", () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(STUDIO_SOURCE_KINDS)("%s: a malformed id is an absent record carrying its token", async (kind) => {
    const err = await loadStudioSource(kind, "not-an-id").catch((e: unknown) => e);
    expect(isRecordUnavailableError(err)).toBe(true);
    expect((err as { token?: string }).token).toBe(STUDIO_SOURCES[kind].token);
  });

  it.each(STUDIO_SOURCE_KINDS)("%s: a raw PostgREST failure becomes a plain sentence", async (kind) => {
    jest.spyOn(STUDIO_SOURCES[kind], "load").mockRejectedValue(PGRST116);
    const err = (await loadStudioSource(kind, ID).catch((e: unknown) => e)) as Error;
    expect(err.message).toMatch(/^We couldn't open this /);
    expect(err.message).not.toMatch(/PGRST|coerce|JSON object|rows/);
    expect(err.cause).toBe(PGRST116);
  });

  it.each(STUDIO_SOURCE_KINDS)("%s: a failed recent list is a plain sentence too", async (kind) => {
    jest.spyOn(STUDIO_SOURCES[kind], "list").mockRejectedValue(new Error("permission denied for schema chat (42501)"));
    const err = (await listStudioSource(kind, "").catch((e: unknown) => e)) as Error;
    expect(err.message).toMatch(/^We couldn't list your recent /);
    expect(err.message).not.toMatch(/permission denied|42501/);
  });
});
