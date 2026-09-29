import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
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

describe("fenced JSON followed by prose", () => {
  it("keeps the completed quiz envelope on the fenced JSON block", () => {
    captureErrorMock.mockClear();
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

    for (let offset = 0; offset < SOURCE.length; offset += 4) {
      accumulator.ingest(SOURCE.slice(offset, offset + 4), dispatch);
    }
    accumulator.finalize(dispatch);

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
    expect(captureErrorMock).not.toHaveBeenCalled();
  });
});
