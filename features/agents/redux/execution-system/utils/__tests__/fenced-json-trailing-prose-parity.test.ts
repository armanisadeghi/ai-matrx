import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));

const captureErrorMock = captureError as jest.MockedFunction<typeof captureError>;

const QUIZ = {
  quiz_title: "Space Basics",
  multiple_choice: [
    {
      question: "Closest star to Earth?",
      options: ["The Sun", "Sirius"],
      correct_answer: "The Sun",
    },
  ],
};

const SOURCE = `Here is your quiz.\n\n\`\`\`json\n${JSON.stringify(QUIZ, null, 2)}\n\`\`\`\n\nGood luck!\n`;

function stream(source: string): Map<string, RenderBlockPayload> {
  const blocks = new Map<string, RenderBlockPayload>();
  const accumulator = new StreamBlockAccumulator(
    "fenced-json-trailing-prose",
    ((payload: { requestId: string; block: RenderBlockPayload }) => ({
      type: "test/upsert",
      payload,
    })) as never,
  );
  const dispatch = (action: unknown) => {
    const block = (action as { payload?: { block?: RenderBlockPayload } }).payload
      ?.block;
    if (block) blocks.set(block.blockId, block);
    return action;
  };
  for (let offset = 0; offset < source.length; offset += 4) {
    accumulator.ingest(source.slice(offset, offset + 4), dispatch);
  }
  accumulator.finalize(dispatch);
  return blocks;
}

describe("fenced JSON followed by prose", () => {
  it("keeps the completed quiz envelope on the fenced JSON block", () => {
    captureErrorMock.mockClear();
    const blocks = stream(SOURCE);

    const completedStructured = [...blocks.values()].filter(
      (block) =>
        block.status === "complete" &&
        (block.metadata as Record<string, unknown> | undefined)?.__ir,
    );

    expect(completedStructured).toHaveLength(1);
    const completed = completedStructured[0];
    expect(completed?.content).toBe(JSON.stringify(QUIZ, null, 2));
    expect(completed?.metadata?.__ir).toMatchObject({
      root: {
        status: "complete",
        value: { title: "Space Basics", questions: expect.any(Array) },
      },
    });
    expect((completed?.metadata?.__ir as { root: { value: { questions: unknown[] } } })
      .root.value.questions).toHaveLength(1);
    const reloaded = splitContentIntoBlocksV2(SOURCE).find(
      (block) => block.content === JSON.stringify(QUIZ, null, 2),
    );
    expect(completed?.metadata?.__ir).toEqual(reloaded?.metadata?.__ir);
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it("does not adapt a declared modern quiz or silence its parity check", () => {
    captureErrorMock.mockClear();
    const modernQuiz = {
      __kind: "quiz_set",
      title: "Written response",
      questions: [
        {
          __kind: "quiz_question",
          type: "written_response",
          question: "Explain gravity.",
          correct_answer: null,
          topic: "physics",
        },
      ],
    };
    const source = `\`\`\`json\n${JSON.stringify(modernQuiz, null, 2)}\n\`\`\`\n`;
    const completed = [...stream(source).values()].find(
      (block) => block.status === "complete" && block.content,
    );
    expect(completed?.metadata?.__ir).toMatchObject({
      root: {
        value: {
          title: "Written response",
          questions: [
            expect.objectContaining({ correct_answer: null, topic: "physics" }),
          ],
        },
      },
    });
    expect(captureErrorMock).not.toHaveBeenCalled();
  });
});
