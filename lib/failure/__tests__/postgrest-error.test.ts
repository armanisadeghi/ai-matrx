/**
 * A failed list read must never print the engine's words.
 *
 * The defect (2026-10-03): the study-kit builder's "Use existing" list and
 * /education/kits/new showed "canceling statement due to statement timeout
 * (57014)". Sixteen services built their Error as message + " (code)", so the
 * SQLSTATE prose reached the screen AND the code was lost from the error
 * object (the error display could no longer classify it). `postgrestError` is
 * the one translation; this pins both halves against the real Education
 * Library service, whose RPC is stubbed to answer the way PostgREST does.
 */
import { postgrestError } from "../postgrestError";

const TIMEOUT = {
  message: "canceling statement due to statement timeout",
  code: "57014",
  details: null,
  hint: null,
};

describe("postgrestError", () => {
  it("rewrites the engine's timeout into a sentence and keeps the code on the error", () => {
    const err = postgrestError(TIMEOUT, {
      action: "loading the Education Library",
      fallback: "The Education Library could not be loaded.",
    });
    expect(err.message).not.toMatch(/57014|canceling statement/);
    expect(err.message).toMatch(/took too long/);
    expect(err.code).toBe("57014");
    expect(err.cause).toBe(TIMEOUT);
  });

  it("passes our own function's sentence through word for word", () => {
    const err = postgrestError(
      { message: "You need to be the class owner to do that.", code: "P0001" },
      { action: "loading the classes", fallback: "x" },
    );
    expect(err.message).toBe("You need to be the class owner to do that.");
    expect(err.code).toBe("P0001");
  });

  it("uses the fallback when the database said nothing", () => {
    const err = postgrestError({ message: "  " }, { action: "a", fallback: "Nothing came back." });
    expect(err.message).toBe("Nothing came back.");
  });
});

jest.mock("@/utils/supabase/client", () => ({
  supabase: { rpc: jest.fn(async () => ({ data: null, error: TIMEOUT })) },
}));

describe("the Education Library read (the screen's error)", () => {
  it("throws a sentence a person can act on, never the SQLSTATE prose", async () => {
    const { fetchEducationLibraryPage } = await import("@/features/education/library/service");
    const thrown = await fetchEducationLibraryPage(
      {
        scope: { kind: "mine" },
        search: "",
        filters: {},
        page: 1,
      } as never,
      { sort: "updated", direction: "desc", favoritesFirst: false, pageSize: 25 } as never,
    ).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).not.toMatch(/57014|canceling statement/);
    expect((thrown as Error & { code?: string }).code).toBe("57014");
  });
});
