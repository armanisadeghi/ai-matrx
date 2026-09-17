import { renderToStaticMarkup } from "react-dom/server";
import { LiveGenerationPreview } from "./LiveGenerationPreview";

const markdownStreamSpy = jest.fn((_props: Record<string, unknown>) => (
  <div data-testid="markdown-stream" />
));

jest.mock("@/components/MarkdownStream", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => markdownStreamSpy(props),
}));

describe("LiveGenerationPreview", () => {
  beforeEach(() => {
    markdownStreamSpy.mockClear();
  });

  it("renders the active run through the assistant-message renderer", () => {
    const markup = renderToStaticMarkup(
      <LiveGenerationPreview requestId="request-123" />,
    );

    expect(markup).toContain('data-testid="markdown-stream"');
    expect(markdownStreamSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "request-123",
        isStreamActive: true,
        hideCopyButton: true,
        allowFullScreenEditor: false,
      }),
    );
  });

  it("waits for the canonical request id instead of mounting a second renderer", () => {
    const markup = renderToStaticMarkup(
      <LiveGenerationPreview requestId={null} />,
    );

    expect(markup).toBe("");
    expect(markdownStreamSpy).not.toHaveBeenCalled();
  });
});
