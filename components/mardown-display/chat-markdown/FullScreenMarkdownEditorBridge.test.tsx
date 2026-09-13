import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  createFullScreenEditorCallbackGroup,
  emitFullScreenEditorSave,
} from "@/features/overlays/callbacks/fullScreenEditor";
import { noteAdapter } from "@/features/rich-document/actions/sources/note";
import { FullScreenMarkdownEditorBridge } from "./FullScreenMarkdownEditorBridge";

let editorProps: {
  onSave: (content: string) => Promise<void>;
  onCancel: () => void;
  onPrimaryAction: (action: string, content: string) => Promise<void>;
} | null = null;
const dispatch = jest.fn();

jest.mock("next/dynamic", () => () => (props: typeof editorProps) => {
  editorProps = props;
  return <div data-testid="editor-bridge" />;
});
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppStore: () => ({
    getState: () => ({ messages: { byConversationId: {} } }),
  }),
}));
jest.mock("@/features/notes/service/notesApi", () => ({
  NotesAPI: { update: jest.fn() },
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("FullScreenMarkdownEditorBridge settlement", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    editorProps = null;
    dispatch.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps the real Notes adapter command available after failure and only closes after acknowledgement", async () => {
    const { NotesAPI } = jest.requireMock(
      "@/features/notes/service/notesApi",
    ) as {
      NotesAPI: { update: jest.Mock };
    };
    NotesAPI.update
      .mockRejectedValueOnce(new Error("conflict"))
      .mockResolvedValueOnce(undefined);
    const { callbackGroupId } = createFullScreenEditorCallbackGroup({
      onSave: (newContent) =>
        noteAdapter.edit!({
          newContent,
          source: { type: "note", noteId: "note-1" },
          dispatch: dispatch as never,
        }),
    });
    const onClose = jest.fn();
    await act(async () => {
      root.render(
        <FullScreenMarkdownEditorBridge
          isOpen
          onClose={onClose}
          callbackGroupId={callbackGroupId}
          content="draft"
        />,
      );
    });
    if (!editorProps) throw new Error("bridge did not render the editor");

    await expect(editorProps.onSave("draft")).rejects.toThrow("conflict");
    expect(onClose).not.toHaveBeenCalled();
    await editorProps.onSave("draft");
    expect(NotesAPI.update).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: expect.stringContaining("closeOverlay"),
      }),
    );

    const primaryGroup = createFullScreenEditorCallbackGroup({
      onAction: async (action, content) => {
        expect(action).toBe("resubmit");
        expect(content).toBe("next draft");
      },
    });
    await act(async () => {
      root.render(
        <FullScreenMarkdownEditorBridge
          isOpen
          onClose={onClose}
          callbackGroupId={primaryGroup.callbackGroupId}
          content="draft"
        />,
      );
    });
    if (!editorProps)
      throw new Error("bridge did not render the primary editor");
    await editorProps.onPrimaryAction("resubmit", "next draft");
    expect(dispatch).toHaveBeenCalled();
  });

  it("disposes the rendered editor target on terminal cancel", async () => {
    const { callbackGroupId } = createFullScreenEditorCallbackGroup({
      onSave: async () => undefined,
    });
    const onClose = jest.fn();
    await act(async () => {
      root.render(
        <FullScreenMarkdownEditorBridge
          isOpen
          onClose={onClose}
          callbackGroupId={callbackGroupId}
        />,
      );
    });
    if (!editorProps) throw new Error("bridge did not render the editor");
    editorProps.onCancel();
    expect(onClose).toHaveBeenCalledTimes(1);
    await expect(
      emitFullScreenEditorSave(callbackGroupId, "draft"),
    ).rejects.toThrow("Expected exactly one");
  });
});
