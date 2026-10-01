/** @jest-environment jsdom */
/**
 * A KIND IS NEVER DRAWN AS RAW JSON — the `standard` rich-content level (U1 of
 * features/content-ir/docs/KIND_NEVER_RAW_CHECKLIST.md, Arman 2026-09-30).
 *
 * The standard level rendered every structured payload as its JSON source,
 * BY DESIGN — and it is the level every shared conversation, shared note,
 * public resource body and nested section uses. A shared flashcard answer
 * showed as a ```json card on a public page. A region that carries `__kind`
 * now goes to the kind route (lazy `StandardKindRegion`); it shows a loader
 * while undecided mid-stream, the kind's broken state (source behind "View
 * source") when it cannot be read, and kindless JSON stays JSON.
 *
 * RED BEFORE GREEN: before the fix every kind case reached the code block.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("../standard/StandardKindRegion", () => ({
  __esModule: true,
  default: ({ value }: { value: unknown }) => {
    const items = Array.isArray(value) ? value : [value];
    return (
      <div data-route="kind">
        {items.map((v, i) => (
          <span key={i}>{(v as { __kind?: string }).__kind}</span>
        ))}
      </div>
    );
  },
  StandardBrokenKind: ({ slug }: { slug: string | null }) => (
    <div data-route="broken">{slug} could not be read</div>
  ),
}));
jest.mock("@/features/code-editor/components/code-block/CodeBlock", () => ({
  __esModule: true,
  default: ({ code }: { code: string }) => <pre data-route="code">{code}</pre>,
}));
jest.mock("@/components/mardown-display/chat-markdown/InlineCodeSnippet", () => ({
  InlineCodeSnippet: ({ code }: { code: string }) => (
    <code data-route="code">{code}</code>
  ),
}));

import { StandardBlock } from "../standard/StandardBlocks";
import { KindSourceView } from "@/components/mardown-display/chat-markdown/KindTextGate";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const flashcards = JSON.stringify(
  {
    __kind: "flashcard_set",
    title: "Cell biology",
    cards: [{ front: "Mitochondria", back: "Makes ATP" }],
  },
  null,
  2,
);

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(
  block: { type: string; content: string; language?: string },
  isStreaming = false,
) {
  await act(async () => {
    root.render(<StandardBlock block={block as never} isStreaming={isStreaming} />);
  });
  // Let the lazy kind chunk resolve.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const route = (name: string) => container.querySelector(`[data-route="${name}"]`);

describe("standard level: a kind region is drawn as its kind", () => {
  it("a ```json kind fence renders through the kind route", async () => {
    await render({ type: "code", language: "json", content: flashcards });
    expect(route("kind")?.textContent).toBe("flashcard_set");
    expect(route("code")).toBeNull();
    expect(container.innerHTML).not.toContain('"__kind"');
  });

  it("an unlabelled fence holding a kind does too", async () => {
    await render({ type: "code", content: flashcards });
    expect(route("kind")).not.toBeNull();
  });

  it("a list of kinds renders each as its kind", async () => {
    await render({
      type: "code",
      language: "json",
      content: `[${flashcards}, {"__kind":"quiz_set","questions":[]}]`,
    });
    expect(route("kind")?.textContent).toBe("flashcard_setquiz_set");
  });

  it("a promoted structured block carrying __kind renders as its kind", async () => {
    await render({ type: "flashcards", content: flashcards });
    expect(route("kind")).not.toBeNull();
    expect(route("code")).toBeNull();
  });

  it("an undecided region mid-stream shows the loader, not JSON", async () => {
    await render({ type: "code", language: "json", content: '{"__ki' }, true);
    expect(container.querySelector("[data-standard-kind-loading]")).not.toBeNull();
    expect(route("code")).toBeNull();
  });

  it("a settled unreadable kind shows its broken state, not its JSON", async () => {
    await render({
      type: "code",
      language: "json",
      content: '{"__kind":"flashcard_set","title":"Cell bi',
    });
    expect(route("broken")?.textContent).toContain("flashcard_set");
    expect(route("code")).toBeNull();
  });

  it("inside a source view (an XML card's prose) a kind line stays as written", async () => {
    await act(async () => {
      root.render(
        <KindSourceView>
          <StandardBlock block={{ type: "code", language: "json", content: flashcards } as never} />
        </KindSourceView>,
      );
    });
    expect(route("code")?.textContent).toContain("flashcard_set");
    expect(route("kind")).toBeNull();
  });

  it("kindless JSON still shows as JSON", async () => {
    await render({
      type: "code",
      language: "json",
      content: '{\n  "route": "North loop",\n  "stops": 14,\n  "landfill": "Puente Hills"\n}',
    });
    expect(route("code")?.textContent).toContain("North loop");
    expect(route("kind")).toBeNull();
  });
});
