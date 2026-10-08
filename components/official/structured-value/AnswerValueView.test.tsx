import { renderToStaticMarkup } from "react-dom/server";
import { AnswerValueView } from "./AnswerValueView";

jest.mock("@ai-matrx/chat/ui/markdown-stream/MarkdownStream", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <pre>{content}</pre>,
}));
jest.mock("@/features/content-ir/studio/components/KindInstanceRender", () => ({
  __esModule: true,
  default: ({ kind }: { kind: string }) => <div data-kind={kind} />,
}));
jest.mock("./StructuredValueView", () => ({
  StructuredValueView: () => <div>Generic value</div>,
}));
jest.mock("@ai-matrx/media/react", () => ({ InlineMediaRef: () => null }));

describe("AnswerValueView stored kind text", () => {
  it("hands serialized kind inputs to the canonical JSON detector intact", () => {
    const value = '{"__kind":"buyer_jobs_result","jobs":[],"jobs":[1]}';
    const html = renderToStaticMarkup(<AnswerValueView value={value} />);
    expect(html).toContain("```json");
    expect(html).toContain("&quot;jobs&quot;:[],&quot;jobs&quot;:[1]");
  });

  it("detects a marked text-only result", () => {
    const html = renderToStaticMarkup(
      <AnswerValueView text={'{"__kind":"buyer_jobs_result","jobs":[]}'} />,
    );
    expect(html).toContain("```json");
  });

  it("keeps ordinary JSON and prose as text", () => {
    for (const value of ['{"ordinary":true}', "A short answer", '{"__kind":']) {
      expect(
        renderToStaticMarkup(<AnswerValueView value={value} />),
      ).not.toContain("```json");
    }
  });

  it("uses the declared kind for an older unmarked object", () => {
    expect(
      renderToStaticMarkup(
        <AnswerValueView value={{ jobs: [] }} kind="buyer_jobs_result" />,
      ),
    ).toContain('data-kind="buyer_jobs_result"');
  });
});
