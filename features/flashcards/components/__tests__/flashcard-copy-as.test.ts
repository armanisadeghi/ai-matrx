// The flashcard menu offers markdown or plain text one level under "Copy as", beside the one-click rows.
const copyRichContent = jest.fn(async () => true);
jest.mock("@ai-matrx/rich-content/copy/copy-commands", () => ({ copyRichContent: (...a: unknown[]) => (copyRichContent as (...x: unknown[]) => unknown)(...a) }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { buildFlashcardMenuSection } from "../flashcard-menu";

const row = { front: "**Photosynthesis** is", back: "How plants make *sugar*", index: 0 };

describe("flashcard menu copy flavours", () => {
  beforeEach(() => copyRichContent.mockClear());

  test("Copy front / Copy back copy the person's flavour; Copy as offers markdown and plain text", async () => {
    const section = buildFlashcardMenuSection({ getRow: () => row });
    const byId = new Map<string, any>();
    const walk = (items: any[]) => items.forEach((i) => { byId.set(i.id, i); if (i.children) walk(i.children); });
    walk(section.items as any[]);
    await byId.get("flashcard-copy-front").onSelect();
    expect(copyRichContent).toHaveBeenLastCalledWith(row.front, "default", expect.anything());
    await byId.get("flashcard-copy-back-text").onSelect();
    expect(copyRichContent).toHaveBeenLastCalledWith(row.back, "text", expect.anything());
    await byId.get("flashcard-copy-front-markdown").onSelect();
    expect(copyRichContent).toHaveBeenLastCalledWith(row.front, "markdown", expect.anything());
    expect(byId.get("flashcard-copy-as").kind).toBe("submenu");
  });
});
