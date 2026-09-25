/**
 * Whole-conversation export. The Markdown is the one source every format is
 * built from; PDF, Word and HTML go through `@ai-matrx/print/document` — the
 * ONE document exporter (its golden tests prove the Word file is native
 * WordprocessingML with sections, fields and bookmarks). The app never builds
 * a DOCX itself.
 */

import { buildConversationMarkdown } from "../conversation-markdown";
import { conversationDocumentSource, exportConversation } from "../export-conversation";

const mockExportDocument = jest.fn(async (_src: string, format: string, _opts: unknown) => ({
  format,
  bytes: new Uint8Array([0x50, 0x4b, 3, 4]),
  mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  fileName: "Quarterly-plan.docx",
  notices: [],
}));
jest.mock("@ai-matrx/print/document", () => ({
  exportDocument: (...a: [string, string, unknown]) => mockExportDocument(...a),
}));
jest.mock("@/lib/toast", () => ({
  toast: { loading: jest.fn(() => "t"), success: jest.fn(), error: jest.fn() },
}));
jest.mock("@/features/agents/redux/execution-system/messages/messages.selectors", () => ({
  extractFlatText: (r: { text: string }) => r.text,
}));
jest.mock("@/features/agents/redux/execution-system/conversations/conversations.selectors", () => ({
  selectConversationTitle: () => () => "Quarterly plan",
}));
jest.mock("../load-full-history", () => ({
  loadFullConversationHistory: async () => ({ complete: true, loaded: 2 }),
}));
jest.mock("@/features/agents/message-pins/pinned-messages-store", () => ({
  isMessagePinned: () => false,
}));

describe("buildConversationMarkdown", () => {
  it("writes a titled transcript with one section per turn", () => {
    const md = buildConversationMarkdown({
      title: "Quarterly plan",
      exportedAt: new Date("2026-09-25T10:00:00Z"),
      messages: [
        { role: "user", text: "What changed in Q3?", createdAt: "2026-09-25T09:00:00Z" },
        { role: "assistant", text: "| Month | Rev |\n|---|---|\n| Jul | 10 |", createdAt: null },
        { role: "assistant", text: "   " },
        { role: "system", text: "hidden system prompt" },
      ],
      assistantLabel: "Analyst",
    });
    expect(md.startsWith("# Quarterly plan\n")).toBe(true);
    expect(md).toContain("## You");
    expect(md).toContain("What changed in Q3?");
    expect(md).toContain("## Analyst");
    expect(md).toContain("| Month | Rev |");
    expect(md).not.toContain("hidden system prompt");
    // Blank turns are skipped, not rendered as empty headings.
    expect(md.match(/## Analyst/g)).toHaveLength(1);
  });

  it("marks pinned messages so a reader sees what mattered", () => {
    const md = buildConversationMarkdown({
      title: "t",
      messages: [{ role: "assistant", text: "Keep this", pinned: true }],
    });
    expect(md).toContain("## Assistant (pinned)");
  });
});

describe("exportConversation — Word/PDF/HTML come from the one package exporter", () => {
  it.each(["docx", "pdf", "html"] as const)("%s goes through @ai-matrx/print/document with the transcript", async (format) => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: jest.fn(() => "blob:x") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: jest.fn() });
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const state = {
      messages: {
        byConversationId: {
          c1: {
            orderedIds: ["m1", "m2"],
            byId: {
              m1: { id: "m1", role: "user", text: "What changed in Q3?", createdAt: null },
              m2: { id: "m2", role: "assistant", text: "Revenue rose 14%.", createdAt: null },
            },
          },
        },
      },
    } as never;
    mockExportDocument.mockClear();
    await exportConversation(jest.fn() as never, () => state, "c1", format);
    expect(mockExportDocument).toHaveBeenCalledTimes(1);
    const [src, fmt] = mockExportDocument.mock.calls[0]!;
    expect(fmt).toBe(format);
    expect(src).toMatch(/^---\ntitle: "Quarterly plan"/);
    expect(src).toContain("## You");
    expect(src).toContain("Revenue rose 14%.");
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it("gives the transcript page chrome without touching the markdown", () => {
    const src = conversationDocumentSource("# T\n\nbody\n", 'Plan "A"');
    expect(src).toContain('title: "Plan \'A\'"');
    expect(src).toContain('footer: "Page {page} of {pages}"');
    expect(src.endsWith("# T\n\nbody\n")).toBe(true);
  });
});
