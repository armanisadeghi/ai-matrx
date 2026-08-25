import { resolveMarkdownContext } from "./resolveMarkdownContext";

describe("resolveMarkdownContext", () => {
  it("uses the tagged assistant response body instead of message chrome", () => {
    document.body.innerHTML = `
      <article data-message-id="message-1">
        <div data-message-content>
          <style>.response { color: blue; }</style>
          <p>Selection speech verification text.</p>
        </div>
        <button>Copy message</button>
        <button>Play audio</button>
      </article>
    `;

    const target = document.querySelector<HTMLElement>("p");
    expect(resolveMarkdownContext(target, "conversation-1")).toMatchObject({
      conversationId: "conversation-1",
      messageId: "message-1",
      content: "Selection speech verification text.",
    });
  });

  it("keeps block-level text more specific than the response body", () => {
    document.body.innerHTML = `
      <article data-message-id="message-1">
        <div data-message-content>
          <div data-mtx-ctx="block" data-block-id="block-1">Focused block</div>
          <p>Other response text</p>
        </div>
      </article>
    `;

    const target = document.querySelector<HTMLElement>("[data-block-id]");
    expect(resolveMarkdownContext(target, "conversation-1")).toMatchObject({
      blockId: "block-1",
      content: "Focused block",
    });
  });
});
