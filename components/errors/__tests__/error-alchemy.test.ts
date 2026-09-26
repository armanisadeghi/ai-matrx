/**
 * The Alchemy payload an error carries is what an AI needs to ACT on it:
 * the sentence the person saw, the code/status, the operation attempted, the
 * records involved, the surface and its declared values, and the person's
 * unsaved input. These tests pin that contract on the pure builder every error
 * render shares (ErrorNotice, destructive Alert, route/section boundaries,
 * error toasts).
 */
import { buildAgentPayload } from "@ai-matrx/kit/content-transfer";
import {
  buildErrorAlchemyPayload,
  buildErrorFixPrompt,
  buildErrorHumanText,
  describeError,
  matchCapturedErrors,
  pickDeclaredSurfaceValues,
  type ErrorSurfaceSnapshot,
} from "@/components/errors/error-alchemy";

const surface: ErrorSurfaceSnapshot = {
  surfaceName: "matrx-user/study-guide",
  label: "Study guide",
  status: "live",
  declared: ["document_id", "selection"],
  values: { document_id: "doc-1", selection: "photosynthesis" },
};

describe("describeError", () => {
  it("keeps a PostgREST error's code, details and hint", () => {
    const out = describeError({
      code: "42501",
      message: "permission denied for table annotation",
      details: "row-level security",
      hint: "check the share level",
    });
    expect(out).toMatchObject({
      message: "permission denied for table annotation",
      code: "42501",
      details: "row-level security",
      hint: "check the share level",
    });
  });

  it("keeps an Error's name and strips chunk URLs from its stack", () => {
    const err = new TypeError("x is undefined");
    err.stack =
      "TypeError: x is undefined\n    at f (http://a.localhost:3001/_next/static/chunks/abc123.js:1:2)";
    const out = describeError(err);
    expect(out.name).toBe("TypeError");
    expect(out.stack).toContain("(<chunk:abc123.js>)");
    expect(out.stack).not.toContain("_next/static");
  });

  it("reads an HTTP status from a fetch-shaped error", () => {
    expect(describeError({ status: 409, message: "Conflict" }).status).toBe(409);
  });

  it("accepts a plain string", () => {
    expect(describeError("Network down").message).toBe("Network down");
  });
});

describe("pickDeclaredSurfaceValues", () => {
  it("keeps only declared, exportable, non-secret values", () => {
    const picked = pickDeclaredSurfaceValues(
      { document_id: "d", api_key: "sk-live", undeclared: 1, hidden: "h" },
      [
        { name: "document_id" },
        { name: "api_key", sensitivity: { classification: "secret" } },
        { name: "hidden", sensitivity: { exportable: false } },
      ],
    );
    expect(picked).toEqual({ document_id: "d" });
  });
});

describe("buildErrorAlchemyPayload", () => {
  const input = {
    title: "Not saved",
    message: "Your comment could not be saved: permission denied.",
    error: { code: "42501", message: "permission denied", status: 403 },
    operation: "Save comment",
    records: [{ type: "document", id: "doc-1", label: "Cell biology" }],
    unsavedInput: { comment: "This paragraph needs a source." },
    source: "inline" as const,
  };

  it("puts the rendered sentence, code, operation, records, surface values and unsaved input in the data", () => {
    const payload = buildErrorAlchemyPayload(input, surface);
    expect(payload.kind).toBe("ui-error");
    const data = payload.data as Record<string, unknown>;
    expect(data.shown).toEqual({
      title: "Not saved",
      message: "Your comment could not be saved: permission denied.",
    });
    expect(data.error).toMatchObject({ code: "42501", status: 403 });
    expect(data.operation).toBe("Save comment");
    expect(data.records).toEqual(input.records);
    expect(data.unsaved_input).toEqual(input.unsavedInput);
    expect(data.surface).toEqual({
      name: "matrx-user/study-guide",
      label: "Study guide",
      status: "live",
      declared_values: ["document_id", "selection"],
      values: { document_id: "doc-1", selection: "photosynthesis" },
    });
    expect(payload.attributes).toMatchObject({
      code: "42501",
      status: 403,
      surface: "matrx-user/study-guide",
      has_unsaved_input: true,
    });
  });

  it("serializes into the canonical envelope with the live route", () => {
    const text = buildAgentPayload(buildErrorAlchemyPayload(input, surface), {
      url: "http://x.localhost:3001/study/doc-1",
      route: "/study/doc-1",
      capturedAt: "2026-09-25T00:00:00.000Z",
    });
    expect(text).toContain("Your comment could not be saved");
    expect(text).toContain("/study/doc-1");
    expect(text).toContain("This paragraph needs a source.");
    expect(text).toContain("photosynthesis");
  });

  it("says plainly when the page has no surface registration", () => {
    const payload = buildErrorAlchemyPayload(
      { message: "Failed to load" },
      {
        surfaceName: null,
        label: null,
        status: "unregistered",
        declared: [],
        values: null,
      },
    );
    const data = payload.data as { surface: { status: string; note: string } };
    expect(data.surface.status).toBe("unregistered");
    expect(data.surface.note).toMatch(/not a registered surface/i);
    expect(data.surface.note).toMatch(/url and route/i);
  });
});

describe("human text and fix prompt", () => {
  it("human text is the sentence the person saw", () => {
    expect(
      buildErrorHumanText({ title: "Not saved", message: "Denied.", operation: "Save comment" }),
    ).toBe("Not saved: Denied.\nWhile: Save comment");
  });

  it("the fix prompt wraps the faithful payload with an instruction", () => {
    const prompt = buildErrorFixPrompt({ message: "Boom" }, surface, {
      url: "http://x/a",
      route: "/a",
      capturedAt: "2026-09-25T00:00:00.000Z",
    });
    expect(prompt).toMatch(/diagnose/i);
    expect(prompt).toContain("Boom");
    expect(prompt).toContain("matrx-user/study-guide");
  });
});

describe("the network error behind the sentence (RC-B12 verify F7)", () => {
  const now = 1_000_000;
  const captured = [
    { source: "supabase", lastAt: now - 5_000, route: "/schedules", relation: "sch_task", operation: "select", code: "XX500", status: 500, message: "forced failure (RC-B12 verify)" },
    { source: "supabase", lastAt: now - 600_000, route: "/schedules", relation: "old", code: "42501", status: 403, message: "stale" },
    { source: "supabase", lastAt: now - 2_000, route: "/notes", relation: "notes", code: "X", status: 400, message: "other page" },
  ];

  it("offers only this route's recent captures, newest first", () => {
    expect(matchCapturedErrors("anything", "/schedules", captured, now).map((c) => c.relation)).toEqual(["sch_task"]);
    expect(matchCapturedErrors("anything", "/elsewhere", captured, now)).toEqual([]);
  });

  it("fills code/status/relation from the box's own declared call", () => {
    const payload = buildErrorAlchemyPayload(
      { message: "Couldn't load schedules", calls: ["sch_task"], captured: matchCapturedErrors("x", "/schedules", captured, now) },
      surface,
    );
    const data = payload.data as { error: Record<string, unknown>; captured_errors: unknown[] };
    expect(data.error).toMatchObject({ code: "XX500", status: 500, relation: "sch_task" });
    expect(data.captured_errors).toHaveLength(1);
  });

  it("keeps the caller's own error fields over the captured ones", () => {
    const payload = buildErrorAlchemyPayload(
      { message: "x", error: { code: "OWN", status: 409 }, calls: ["sch_task"], captured: matchCapturedErrors("x", "/schedules", captured, now) },
      surface,
    );
    expect((payload.data as { error: Record<string, unknown> }).error).toMatchObject({ code: "OWN", status: 409 });
  });

  it("with no declared call, lists captures as recent and unmatched, and pins none", () => {
    const data = buildErrorAlchemyPayload(
      { message: "Couldn't load", captured: matchCapturedErrors("x", "/schedules", captured, now) },
      surface,
    ).data as { error: Record<string, unknown>; recent_unmatched_errors: unknown[] };
    expect(data.error.relation).toBeUndefined();
    expect(data.recent_unmatched_errors).toHaveLength(1);
  });
});

describe("pin only the box's own call (RC-B12 round 2, R2-2)", () => {
  const now = 3_000_000;
  const captured = [
    { source: "supabase", lastAt: now - 1_000, route: "/chat/x", relation: "conversation", code: "XX500", status: 500, message: "forced failure" },
    { source: "supabase", lastAt: now - 2_000, route: "/chat/x", relation: "matrx_action_ledger", code: "XX500", status: 500, message: "forced failure" },
  ];
  const sentence = "Could not load what this conversation's actions did (forced failure).";

  it("never pins a capture because the sentence happens to contain its table's name", () => {
    const recent = matchCapturedErrors(sentence, "/chat/x", captured, now);
    const data = buildErrorAlchemyPayload({ message: sentence, captured: recent }, surface).data as {
      error: Record<string, unknown>;
      recent_unmatched_errors: Array<Record<string, unknown>>;
    };
    expect(data.error.relation).toBeUndefined();
    expect(data.recent_unmatched_errors.map((c) => c.relation)).toEqual(["conversation", "matrx_action_ledger"]);
  });

  it("pins the capture of the call the box declared", () => {
    const recent = matchCapturedErrors(sentence, "/chat/x", captured, now);
    const data = buildErrorAlchemyPayload(
      { message: sentence, captured: recent, calls: ["matrx_action_ledger"] },
      surface,
    ).data as { error: Record<string, unknown>; captured_errors: Array<Record<string, unknown>> };
    expect(data.error).toMatchObject({ relation: "matrx_action_ledger", code: "XX500", status: 500 });
    expect(data.captured_errors.map((c) => c.relation)).toEqual(["matrx_action_ledger"]);
  });
});

it("never repeats a title the sentence already starts with", () => {
  expect(
    buildErrorHumanText({
      title: "Couldn't load this conversation",
      message: "Couldn't load this conversation: forced failure.",
    }),
  ).toBe("Couldn't load this conversation: forced failure.");
});

describe("a box's declared call is always retained (RC-B12 round 3)", () => {
  const now = 10_000_000;
  const route = "/settings/profile";
  const own = { source: "app-api-http", lastAt: now - 600_000, route, relation: "/api/user/profile", status: 500, message: "GET /api/user/profile → 500" };
  const noise = Array.from({ length: 8 }, (_, i) => ({
    source: "supabase-postgrest",
    lastAt: now - 1_000 * (i + 1),
    route,
    relation: `shell_rpc_${i}`,
    status: 500,
    message: "forced",
  }));

  it("keeps the declared call's failure however old and however many others failed after it", () => {
    const offered = matchCapturedErrors("Couldn't load your profile", route, [own, ...noise], now, ["/api/user/profile"]);
    const data = buildErrorAlchemyPayload(
      { message: "Couldn't load your profile", calls: ["/api/user/profile"], captured: offered },
      surface,
    ).data as { error: Record<string, unknown>; recent_unmatched_errors: unknown[] };
    expect(data.error).toMatchObject({ relation: "/api/user/profile", status: 500 });
    expect(data.recent_unmatched_errors.length).toBeLessThanOrEqual(5);
  });
});

describe("sentences joined into the copy never double a full stop (RC-B12 round 8)", () => {
  it("'{error}. Dropping…' where the error already ends in a period copies one period", () => {
    const payload = buildErrorAlchemyPayload(
      { message: "The list of formats could not be read: Network failed, try again.. Dropping a file still works.", title: "Formats unavailable.", source: "alert" },
      surface,
    );
    const text = JSON.stringify(payload);
    expect(text).not.toMatch(/again\.\./);
    expect(text).toContain("try again. Dropping");
    expect(buildErrorHumanText({ title: "Could not save.", message: "The server said no.. Try later...", source: "alert" })).toBe(
      "Could not save. The server said no. Try later...",
    );
  });
});
