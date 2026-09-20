import { act } from "react";
import { createRoot } from "react-dom/client";

import { SourceResolverPanel } from "./SourceResolverPanel";

const mockLongNoteContent = Array.from(
  { length: 2_000 },
  (_, index) => `Page ${index + 1}: podcast source material`,
).join("\n");
const mockGetById = jest.fn(
  async (_noteId: string, _options?: { failureMode?: "empty" | "throw" }) => ({
    id: "long-note",
    label: "Long research note",
    content: mockLongNoteContent,
  }),
);

jest.mock("@/features/notes/components/NotePickerPopover", () => ({
  NotePickerPopover: ({
    trigger,
    onSelectNote,
  }: {
    trigger: React.ReactNode;
    onSelectNote: (noteId: string) => Promise<void>;
  }) => (
    <div>
      {trigger}
      <button type="button" onClick={() => void onSelectNote("long-note")}>
        Pick long note
      </button>
    </div>
  ),
}));

jest.mock("@/features/notes/service/notesApi", () => ({
  NotesAPI: {
    getById: (...args: Parameters<typeof mockGetById>) => mockGetById(...args),
  },
}));

jest.mock("../useSourceResolvers", () => ({
  useSourceResolvers: () => ({
    resolveWebsite: jest.fn(),
    resolveYouTube: jest.fn(),
    resolveAudioFile: jest.fn(),
    agentRunning: false,
    audioBusy: false,
  }),
}));

jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: ({
    autoGrow,
    minHeight,
    maxHeight,
    enableTextStats,
    ...props
  }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    autoGrow?: boolean;
    minHeight?: number;
    maxHeight?: number;
    enableTextStats?: boolean;
  }) => (
    <textarea
      {...props}
      data-auto-grow={String(autoGrow)}
      data-min-height={minHeight}
      data-max-height={maxHeight}
      data-text-stats={String(enableTextStats)}
    />
  ),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("SourceResolverPanel", () => {
  beforeEach(() => {
    mockGetById.mockReset();
    mockGetById.mockResolvedValue({
      id: "long-note",
      label: "Long research note",
      content: mockLongNoteContent,
    });
  });

  it("loads only the selected note and keeps its long body in a bounded scrolling editor", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onChange = jest.fn();

    act(() =>
      root.render(
        <SourceResolverPanel resolveKind="note" value="" onChange={onChange} />,
      ),
    );

    const noteButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Pick long note",
    );
    expect(noteButton).toBeDefined();

    await act(async () => noteButton?.click());
    expect(onChange).toHaveBeenCalledWith(mockLongNoteContent);

    await act(async () =>
      root.render(
        <SourceResolverPanel
          resolveKind="note"
          value={mockLongNoteContent}
          onChange={onChange}
        />,
      ),
    );

    const editor = container.querySelector("textarea");
    expect(editor).not.toBeNull();
    expect(editor?.dataset.autoGrow).toBe("true");
    expect(editor?.dataset.minHeight).toBe("168");
    expect(editor?.dataset.maxHeight).toBe("420");
    expect(editor?.value).toBe(mockLongNoteContent);

    act(() => root.unmount());
  });

  it("ignores a note body that finishes loading after the source changes", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onChange = jest.fn();
    let resolveRequest:
      | ((note: { id: string; label: string; content: string }) => void)
      | undefined;
    mockGetById.mockImplementationOnce(
      () =>
        new Promise<{
          id: string;
          label: string;
          content: string;
        }>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    act(() =>
      root.render(
        <SourceResolverPanel resolveKind="note" value="" onChange={onChange} />,
      ),
    );
    const noteButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Pick long note",
    );

    act(() => noteButton?.click());
    act(() =>
      root.render(
        <SourceResolverPanel
          resolveKind="website"
          value=""
          onChange={onChange}
        />,
      ),
    );
    await act(async () => {
      resolveRequest?.({
        id: "long-note",
        label: "Long research note",
        content: mockLongNoteContent,
      });
    });

    expect(onChange).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
