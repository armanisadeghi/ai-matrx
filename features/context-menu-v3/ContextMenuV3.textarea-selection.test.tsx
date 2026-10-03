import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditableContextMenu } from "./EditableContextMenu";
import { resolveApplicationScope } from "./value-resolution";

// The lazy menu body is replaced by a probe that records the props the shell hands it.
const lastProps: { current: Record<string, unknown> | null } = { current: null };
jest.mock("next/dynamic", () => () => (props: Record<string, unknown>) => {
  lastProps.current = props;
  const ReactModule = require("react");
  return ReactModule.createElement("div", { "data-testid": "alchemy-menu" });
});
jest.mock("@ai-matrx/kit/media-query", () => ({ ...jest.requireActual("@ai-matrx/kit/media-query"), useIsMobile: () => false }));
jest.mock("@ai-matrx/chat/agents/hooks/useWidgetHandle", () => ({
  useOptionalWidgetHandle: () => null,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A right-click whose mousedown lands outside the highlighted text collapses a textarea's
 * selection AFTER the menu captured it (the browser moves the caret). The menu header still
 * read "Selected: …", but a surface's live scope builder (the notes editor reads the field's
 * selectionStart/End) saw a caret — so the selection-only shortcuts vanished, or one ran with
 * an empty selection ("Extract the key points … ---\n\n---", 2026-10-02).
 * The selection the menu opened on must be the one every reader sees.
 */
describe("ContextMenuV3 — a textarea selection survives the right-click", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    lastProps.current = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("hands the live scope builder the selection captured at mousedown, not the collapsed caret", () => {
    let field: HTMLTextAreaElement | null = null;
    const liveScope = () => {
      const el = field!;
      return { selection: el.value.slice(el.selectionStart, el.selectionEnd) };
    };
    act(() => {
      root.render(
        <EditableContextMenu
          sourceFeature="notes"
          contentSource={{ type: "raw" }}
          getApplicationScope={liveScope}
        >
          <textarea data-testid="field" defaultValue="alpha beta gamma delta" />
        </EditableContextMenu>,
      );
    });
    field = host.querySelector<HTMLTextAreaElement>('[data-testid="field"]')!;
    field.focus();
    field.setSelectionRange(6, 10); // "beta"

    act(() => {
      field!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 2 }));
    });
    // The browser's default action for the right mousedown: the caret moves to the pointer.
    field.setSelectionRange(17, 17);
    act(() => {
      field!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
    });

    const props = lastProps.current!;
    expect(props).not.toBeNull();
    expect(props.selectedText).toBe("beta");
    const scope = resolveApplicationScope({
      getApplicationScope: props.getApplicationScope as () => Record<string, unknown>,
      contextData: (props.contextData ?? {}) as Record<string, unknown>,
      selectedText: props.selectedText as string,
      selectionRange: props.selectionRange as never,
      fallbackContent: props.fallbackContent as string,
    });
    expect(scope.selection).toBe("beta");
    expect([field.selectionStart, field.selectionEnd]).toEqual([6, 10]);
  });
});
