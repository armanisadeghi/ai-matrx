/**
 * A bare host (no app registrations) is honest about the content-ir and rich-document seams
 * (chat-package-move P14): blocks render as the text they are, no kind is invented, nothing is
 * validated as a pass, and the one capability with no honest stand-in (the block classifier)
 * fails loudly by name. Each missing slot is reported once.
 */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { resetChatUiForTests } from "../ui-slots";
import {
  contentIrKindValidator,
  contentSplitterPrimitives,
  isSpecialCodeLanguage,
  kindRegistry,
  sessionEnvelope,
  withIrEnvelope,
} from "../content-ir-slots";
import { RecordAnnotations, RegistryContextMenu, buildChatMessageActions } from "../rich-document-slots";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => resetChatUiForTests());

describe("content-ir slots on a bare host", () => {
  it("attaches no envelope and knows no kind", () => {
    const metadata = { a: 1 };
    expect(withIrEnvelope('{"__kind":"x"}', metadata)).toBe(metadata);
    expect(kindRegistry.resolver().get("quiz_set")).toBeUndefined();
    expect(sessionEnvelope(null)).toBeNull();
  });

  it("never reports an unchecked kind as valid", async () => {
    const verdict = await contentIrKindValidator().validate({}, "quiz_set");
    expect(verdict.checked).toBe(false);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors[0]).toMatch(/no kind catalog/);
  });

  it("fails loudly, by name, where there is no honest stand-in", () => {
    expect(() => contentSplitterPrimitives()).toThrow(/contentSplitterPrimitives/);
    expect(() => isSpecialCodeLanguage("quiz_set")).toThrow(/contentSplitterPrimitives/);
  });
});

describe("rich-document slots on a bare host", () => {
  it("derives the message's text and source and offers no actions", () => {
    const config = buildChatMessageActions({
      conversationId: "c1",
      messageId: "m1",
      role: "assistant",
      messageContent: "hello",
    });
    expect(config.content).toBe("hello");
    expect(config.source).toEqual({ type: "chat-message", conversationId: "c1", messageId: "m1" });
  });

  it("leaves wrapped content on screen, marked as the stand-in", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        createElement(
          RegistryContextMenu,
          null,
          createElement(RecordAnnotations, { record: null }, createElement("p", null, "the answer")),
        ),
      ),
    );
    expect(host.textContent).toBe("the answer");
    expect(host.querySelector('[data-chat-slot-fallback="RegistryContextMenu"]')).not.toBeNull();
    expect(host.querySelector('[data-chat-slot-fallback="RecordAnnotations"]')).not.toBeNull();
    act(() => root.unmount());
    host.remove();
  });
});
