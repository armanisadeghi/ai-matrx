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
        { name: "api_key", classification: "secret" },
        { name: "hidden", exportable: false },
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
    expect(data.surface.note).toMatch(/no surface registration/i);
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
