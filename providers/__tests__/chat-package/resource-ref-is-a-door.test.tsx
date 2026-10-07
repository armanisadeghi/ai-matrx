/**
 * A `resource_ref` (aidream `conversation_context/resource_context.py` — a
 * WIRE pointer `{__kind:"resource_ref", resource_type, resource_id}`, not a
 * content-IR output kind) is drawn as the record it points to: its title and
 * its door. Never as raw data, never through a markdown leaf.
 *
 * PB-01 run 4 (conversation 9fcf3382, 2026-10-01): the `apply_surface_write`
 * receipt's `change.before` carried the note's page value — a resource_ref as
 * a JSON string — and the grid handed it to BasicMarkdownContent, which filed
 * a RED Error Inspector entry and showed '"resource_ref" is not a registered
 * shape, so it can only render as raw data'.
 *
 * Real grid, real value door, real markdown leaf, real EntityRef. The only
 * stand-ins: next/dynamic (sync), the title read (network) and the capture
 * sink (observed).
 */
import "@/__tests__/helpers/register-chat-host";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () =>
    jest.requireActual("@ai-matrx/rich-content/markdown-core/MarkdownCoreImpl").default,
}));
const mockCaptureError = jest.fn();
jest.mock("@ai-matrx/chat/host/diagnostics", () => ({
  ...jest.requireActual("@ai-matrx/chat/host/diagnostics"),
  captureError: (input: unknown) => mockCaptureError(input),
}));
// The subject still reaches the app's Error Inspector through other host
// modules; both sinks share one mock so no capture escapes the assertions.

const mockFetchTitles = jest.fn();
jest.mock("@/features/scopes/service/entityTitles", () => ({
  getCachedEntityTitle: () => null,
  entityTitleFallback: (token: string) => (token === "note" ? "Note" : "Record"),
  fetchEntityTitles: (token: string, ids: string[]) => mockFetchTitles(token, ids),
}));

import { KeyValueGrid } from "@ai-matrx/chat/tool-call-visualization/result-fields/KeyValueGrid";
import { ResultValue } from "@ai-matrx/chat/tool-call-visualization/result-fields/ResultValue";
import { detectResultShape } from "@ai-matrx/chat/tool-call-visualization/result-fields/shape";
import { resetKindAtRawRendererReports } from "@/features/content-ir/surfaces/report-kind-at-raw-renderer";

const NOTE_ID = "59678b3b-3620-442d-872b-0331ac74a1cf";
const REF = { __kind: "resource_ref", resource_type: "note", resource_id: NOTE_ID };

// The production `apply_surface_write` result, verbatim in shape.
const SURFACE_WRITE_RESULT = {
  ok: true,
  status: "applied_now",
  surface_name: "matrx-user/notes",
  target: "note_content",
  mode: "draft",
  // Verbatim shape of the production message: prose with the pointer inline.
  // THIS field is what filed the RED entry (ResultMarkdown → BasicMarkdownContent).
  message:
    '"Note content" staged into the page\'s draft — the user still reviews and saves. ' +
    `Before this call "current_note" was: ${JSON.stringify(REF)}. ` +
    "Page values you receive after this result were re-read after the write.",
  change: {
    page_value: "current_note",
    before: JSON.stringify(REF),
    written: "# Move 4471 — routing Routing line: Los Angeles | Fog | G-7A40",
  },
};

describe("a resource_ref renders as the record it points to", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    mockCaptureError.mockClear();
    mockFetchTitles.mockReset();
    mockFetchTitles.mockResolvedValue(new Map([[NOTE_ID, "Delgado routing sheet"]]));
    resetKindAtRawRendererReports();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = async (node: React.ReactElement) => {
    await act(async () => root.render(node));
    await act(async () => {
      await Promise.resolve();
    });
  };
  const contentIrCaptures = () =>
    mockCaptureError.mock.calls.filter(
      ([input]) => (input as { source?: string }).source === "content-ir",
    );

  it.each([
    ["an object", REF],
    ["a JSON string", JSON.stringify(REF)],
  ])("detects %s as a record reference", (_label, value) => {
    expect(detectResultShape(value)).toEqual({
      kind: "recordRef",
      token: "note",
      id: NOTE_ID,
    });
  });

  it("the surface-write receipt's Before is the note's title and door, with an empty Error Inspector", async () => {
    await render(<KeyValueGrid value={SURFACE_WRITE_RESULT} density="full" />);
    const text = container.textContent ?? "";
    expect(contentIrCaptures()).toEqual([]);
    expect(text).toContain("Delgado routing sheet");
    expect(text).not.toContain("resource_ref");
    expect(text).not.toContain("__kind");
    expect(text).not.toMatch(/not a registered shape/);
    // Both the Before value and the pointer inside the message are doors.
    expect(container.querySelectorAll(`a[href*="${NOTE_ID}"]`).length).toBe(2);
    expect(text).toContain('Before this call "current_note" was:');
    expect(mockFetchTitles).toHaveBeenCalledWith("note", [NOTE_ID]);
  });

  it("splits prose around an inline pointer and leaves other text alone", () => {
    expect(detectResultShape(`was: ${JSON.stringify(REF)}.`)).toEqual({
      kind: "textWithRecordRefs",
      segments: [
        { type: "text", text: "was: " },
        { type: "ref", token: "note", id: NOTE_ID },
        { type: "text", text: "." },
      ],
    });
    expect(detectResultShape("the word resource_ref alone").kind).not.toBe("textWithRecordRefs");
  });

  it("a pointer that carries its own label shows that name, never the raw type", async () => {
    // 2026-10-03: a canvas HTML page read back as "Untitled html_page".
    mockFetchTitles.mockResolvedValueOnce(new Map());
    await render(
      <ResultValue
        value={{
          __kind: "resource_ref",
          resource_type: "html_page",
          resource_id: NOTE_ID,
          label: "Mini Reaction Lab",
        }}
        density="full"
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Mini Reaction Lab");
    expect(text).not.toContain("html_page");
  });

  it("an unknown resource type still names itself without raw data or a report", async () => {
    await render(
      <ResultValue
        value={{ __kind: "resource_ref", resource_type: "zz_unknown", resource_id: NOTE_ID }}
        density="full"
      />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("resource_ref");
    expect(contentIrCaptures()).toEqual([]);
  });
});
