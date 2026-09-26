/**
 * FORCING FUNCTION: editing or streaming a large document re-renders ONLY the
 * block that changed, and a huge document never mounts in one frozen commit.
 *
 * THE DEFECT THIS CATCHES (Arman, 2026-09-26: "the markdown tester … was
 * causing the browser to crash"). Measured in the Markdown Studio on the
 * shared dev server with the stress corpus (`__fixtures__/stress-corpus.ts`):
 *   - typing 20 characters into a 100 KB operations report held the main
 *     thread for 15.2 s (~760 ms per keystroke) — every keystroke re-parsed
 *     EVERY block through react-markdown;
 *   - a 1 MB paste after that sat in one 40.7 s long task with 389,197 DOM
 *     nodes, which is what a browser shows as a crashed tab.
 * Two shared-layer root causes, both in the ONE renderer every surface uses
 * (chat, notes, study guides, the studio, the tester):
 *   1. the document-numbering context handed EVERY MarkdownCore leaf a NEW
 *      object on every change, and
 *   2. EnhancedChatMarkdown handed every block a NEW block object and NEW
 *      callbacks on every change,
 * so the compiled SafeBlockRenderer could never skip an unchanged block.
 *
 * The React Compiler (which skips a block whose props are identical) does not
 * run under Jest, so this test asserts the INPUT it depends on: identical
 * props for every unchanged block, and one stable numbering value. Each
 * assertion fails on the pre-fix code.
 *
 * Budgets (the browser half is `__fixtures__/stress-bench.mjs`):
 *   - a one-character edit hands new props to at most 1 block;
 *   - the numbering value survives an edit that moves no number;
 *   - a 1 MB document mounts at most PROGRESSIVE_FIRST_SLICE blocks in its
 *     first commit and every block after the slices drain.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { technicalReport, megaDoc } from "../__fixtures__/stress-corpus";

type Recorded = Record<string, unknown> & { block: { type: string; content: string }; index: number };
const renders: Recorded[][] = [];
let current: Recorded[] = [];

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (value: unknown) => unknown) =>
    selector({
      activeRequests: { byRequestId: {} },
      conversations: { byConversationId: {} },
      instanceUIState: { byConversationId: {} },
      messages: { byId: {}, byConversationId: {} },
    }),
  useAppDispatch: () => () => undefined,
}));
jest.mock("next/dynamic", () => ({ __esModule: true, default: () => () => null }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn(), revalidateTag: jest.fn() }));
jest.mock("@/components/mardown-display/chat-markdown/internal-handlers/SafeBlockRenderer", () => ({
  SafeBlockRenderer: (props: Recorded) => {
    current.push(props);
    return null;
  },
}));
jest.mock("@/components/mardown-display/chat-markdown/FullScreenMarkdownEditor", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/mardown-display/blocks/json/useBoundAgentOutputSchema", () => ({ useBoundAgentOutputSchema: () => null }));
jest.mock("@/features/agents/components/shared/transcript-audience", () => ({ useMachineFramesVisible: () => true }));

import { EnhancedChatMarkdownInternal } from "@/components/mardown-display/chat-markdown/EnhancedChatMarkdown";
import {
  DocumentNumberingProvider,
  useDocumentNumbering,
} from "@/components/markdown-core/syntax/elements/DocumentNumbering";
import { PROGRESSIVE_FIRST_SLICE } from "@/components/mardown-display/chat-markdown/progressive-mount";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function renderDoc(root: ReturnType<typeof createRoot>, content: string, onContentChange?: (n: string) => void) {
  current = [];
  await act(async () => {
    root.render(
      <EnhancedChatMarkdownInternal content={content} hideCopyButton allowFullScreenEditor={false} onContentChange={onContentChange} />,
    );
  });
  // The last full pass of this render (effects may re-render once).
  const byIndex = new Map<number, Recorded>();
  for (const p of current) byIndex.set(p.index, p);
  const pass = [...byIndex.values()].sort((a, b) => a.index - b.index);
  renders.push(pass);
  return pass;
}

describe("THE UNCHANGED-BLOCK LAW — a one-character edit re-renders one block", () => {
  it("hands identical props to every block the edit did not touch (100 KB report)", async () => {
    const doc = technicalReport(40, 1);
    // A realistic edit: a word typed into the middle of the report.
    const at = doc.indexOf("### 20.1 Findings");
    expect(at).toBeGreaterThan(0);
    const edited = doc.slice(0, at) + "Z" + doc.slice(at);

    const host = document.createElement("div");
    const root = createRoot(host);
    const onChange = () => undefined;
    const before = await renderDoc(root, doc, onChange);
    const after = await renderDoc(root, edited, onChange);

    expect(before.length).toBeGreaterThan(50);
    expect(after.length).toBe(before.length);
    const changed = after.filter((p, i) => {
      const q = before[i] as Recorded;
      return (
        p.block !== q.block ||
        p.replaceBlockContent !== q.replaceBlockContent ||
        p.onContentChange !== q.onContentChange ||
        p.handleOpenEditor !== q.handleOpenEditor
      );
    });
    // Budget: only the block that received the character.
    expect(changed.length).toBeLessThanOrEqual(1);
    await act(async () => root.unmount());
  });

  it("a streamed append re-renders only the tail block", async () => {
    const doc = technicalReport(10, 3);
    const host = document.createElement("div");
    const root = createRoot(host);
    const before = await renderDoc(root, doc.slice(0, doc.length - 200));
    const after = await renderDoc(root, doc);
    const unchanged = before.slice(0, -1).filter((p, i) => (after[i] as Recorded).block === p.block);
    expect(unchanged.length).toBe(before.length - 1);
    await act(async () => root.unmount());
  });
});

describe("the document numbering value is stable across edits that move no number", () => {
  it("keeps the same object when a paragraph is edited", async () => {
    const seen: unknown[] = [];
    function Probe() {
      seen.push(useDocumentNumbering());
      return null;
    }
    const src = technicalReport(6, 2);
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<DocumentNumberingProvider source={src}><Probe /></DocumentNumberingProvider>));
    await act(async () => root.render(<DocumentNumberingProvider source={src + "\n\nOne more sentence."}><Probe /></DocumentNumberingProvider>));
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[seen.length - 1]).toBe(seen[0]);
    // …and a real numbering change still reaches the leaves.
    await act(async () =>
      root.render(
        <DocumentNumberingProvider source={src + "\n\n:::figure[A new chart]\n![x](y)\n:::\n"}>
          <Probe />
        </DocumentNumberingProvider>,
      ),
    );
    expect(seen[seen.length - 1]).not.toBe(seen[0]);
    await act(async () => root.unmount());
  });
});

describe("a huge document mounts in slices", () => {
  it("a 1 MB document mounts at most one slice in its first commit, then all of it", async () => {
    const doc = megaDoc(1_000_000);
    const host = document.createElement("div");
    const root = createRoot(host);
    current = [];
    act(() => {
      root.render(<EnhancedChatMarkdownInternal content={doc} hideCopyButton allowFullScreenEditor={false} />);
    });
    const firstCommit = new Set(current.map((p) => p.index)).size;
    expect(firstCommit).toBeGreaterThan(0);
    expect(firstCommit).toBeLessThanOrEqual(PROGRESSIVE_FIRST_SLICE);
    // Drain the slices.
    for (let i = 0; i < 200; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
    const all = new Set(current.map((p) => p.index)).size;
    expect(all).toBeGreaterThan(1000);
    await act(async () => root.unmount());
  }, 120_000);
});
