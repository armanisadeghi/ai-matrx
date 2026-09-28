import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CleanupOutput } from "./CleanupOutput";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const renderDocument = jest.fn();
jest.mock("@/features/rich-document/RichDocument", () => ({
  RichDocument: (props: unknown) => {
    renderDocument(props);
    return <div>Rendered answer</div>;
  },
}));
jest.mock("@/components/errors/ErrorNotice", () => ({
  ErrorNotice: () => <div role="alert">Run failed</div>,
}));

describe("cleanup output editing boundary", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    renderDocument.mockClear();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });
  async function render(isBusy: boolean) {
    await act(async () => {
      root.render(
        <CleanupOutput
          label="Cleaned transcript"
          content="The answer only."
          requestId="request-with-reasoning"
          conversationId="conversation"
          isBusy={isBusy}
          error={null}
          placeholder="Ready"
          onContentChange={jest.fn()}
        >
          <textarea
            aria-label="Answer editor"
            defaultValue="The answer only."
          />
        </CleanupOutput>,
      );
    });
  }
  it("renders the request while streaming without exposing a save callback", async () => {
    await render(true);
    expect(renderDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestId: "request-with-reasoning",
        onContentChange: undefined,
        allowFullScreenEditor: false,
      }),
    );
  });
  it("edits settled answer content without the reasoning-bearing request", async () => {
    await render(false);
    expect(renderDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestId: undefined,
        content: "The answer only.",
        onContentChange: expect.any(Function),
      }),
    );
    await act(async () => host.querySelector("button")?.click());
    expect(host.querySelector("textarea")?.value).toBe("The answer only.");
    await act(async () => host.querySelector("button")?.click());
    expect(host.querySelector("textarea")).toBeNull();
  });
});
