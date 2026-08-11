import {
  messagePartsFromPersistedContent,
  parsePersistedMessageContent,
} from "../persisted-content-boundary";

describe("persisted message content boundary", () => {
  it("recovers a historical quiz before strict MessagePart parsing", () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const legacyQuiz = {
      type: "quiz",
      _matrxBlockType: "quiz",
      _matrxBlockId: "quiz-history-1",
      _matrxState: {
        quizState: {
          title: "Stored quiz",
          originalQuestions: [
            { question: "Which contract is authoritative?", answer: "Generated" },
          ],
        },
      },
      metadata: { persisted: true },
    };

    try {
      const entries = parsePersistedMessageContent([
        { type: "text", text: "Before" },
        legacyQuiz,
        { type: "text", text: "After" },
      ]);

      expect(entries).toHaveLength(3);
      expect(entries[1]).toMatchObject({
        kind: "legacy_render_block",
        sourceIndex: 1,
        block: {
          blockId: "quiz-history-1",
          blockIndex: 1,
          type: "quiz",
          status: "complete",
          data: {
            quiz_title: "Stored quiz",
            questions: legacyQuiz._matrxState.quizState.originalQuestions,
            _matrxState: legacyQuiz._matrxState,
          },
          metadata: { persisted: true },
        },
      });
      expect(messagePartsFromPersistedContent([legacyQuiz])).toEqual([]);
      expect(errorSpy).toHaveBeenCalledWith(
        "[parsePersistedMessageContent] recovered legacy interactive block",
        expect.objectContaining({
          sourceIndex: 1,
          blockId: "quiz-history-1",
          blockType: "quiz",
        }),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("does not disguise malformed current or malformed legacy content", () => {
    expect(() =>
      parsePersistedMessageContent([{ type: "not_a_message_part" }]),
    ).toThrow();
    expect(() =>
      parsePersistedMessageContent([
        {
          type: "quiz",
          _matrxBlockType: "quiz",
          _matrxState: { quizState: { title: "Missing questions" } },
        },
      ]),
    ).toThrow();
  });
});
