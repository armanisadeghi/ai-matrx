/**
 * An empty document is a real document.
 *
 * The break this guards: TuiEditorContent treated `content === ""` as "still
 * loading" and rendered "Loading editor..." forever — every new note opened in
 * the Write view (the platform default, and the only view on narrow windows)
 * never showed an editor. It also skipped syncing `""` into a mounted editor,
 * so switching to an empty document kept the previous document's text.
 * Restore the `!content` gate (render or sync) and these go red.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const tui: {
    markdown: string;
    getMarkdown: jest.Mock<string, []>;
    setMarkdown: jest.Mock<void, [string]>;
} = {
    markdown: "",
    getMarkdown: jest.fn((): string => tui.markdown),
    setMarkdown: jest.fn((md: string) => {
        tui.markdown = md;
    }),
};

jest.mock("next/dynamic", () => () => {
    const ReactLib = jest.requireActual<typeof import("react")>("react");
    const Stub = ReactLib.forwardRef<unknown, { initialValue: string }>(({ initialValue }, ref) => {
        ReactLib.useImperativeHandle(ref, () => ({
            getInstance: () => tui,
            getRootElement: () => null,
        }));
        // Real TUI reads initialValue once, at mount — later props are ignored.
        ReactLib.useState(() => {
            tui.markdown = initialValue;
            return null;
        });
        return <div data-testid="tui-editor" />;
    });
    Stub.displayName = "TuiEditorStub";
    return Stub;
});
jest.mock("@/styles/themes/useThemeMode", () => ({ useThemeMode: () => "light" }));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("../tuiMarkdownGuard", () => ({ attachTuiMarkdownGuard: () => () => {} }));
jest.mock("@toast-ui/editor-plugin-color-syntax", () => ({ __esModule: true, default: () => ({}) }));
jest.mock("@toast-ui/editor/dist/toastui-editor.css", () => ({}));
jest.mock("@toast-ui/editor/dist/theme/toastui-editor-dark.css", () => ({}));
jest.mock("../TuiEditorContent.css", () => ({}));

import TuiEditorContent from "../TuiEditorContent";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    tui.markdown = "";
    tui.setMarkdown.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
});

it("opens an editor for an empty document instead of loading forever", async () => {
    await act(async () => {
        root.render(<TuiEditorContent content="" />);
    });
    expect(container.querySelector('[data-testid="tui-editor"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Loading editor...");
});

it("clears the editor when the document becomes empty", async () => {
    await act(async () => {
        root.render(<TuiEditorContent content="# Old note" />);
    });
    await act(async () => {
        root.render(<TuiEditorContent content="" />);
    });
    expect(tui.setMarkdown).toHaveBeenCalledWith("", false);
    expect(tui.markdown).toBe("");
});
