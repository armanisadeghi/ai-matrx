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
            {
              question: "Which contract is authoritative?",
              answer: "Generated",
            },
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

  it("reports the actual source index and safe shape for malformed content", () => {
    expect(() =>
      parsePersistedMessageContent([
        { type: "text", text: "Valid first part" },
        {
          type: "media",
          kind: "image",
          file_id: "file-1",
          base64_data: "inline-but-still-malformed",
          width: undefined,
        },
      ]),
    ).toThrow(
      "Invalid chat.message.content[1]: type=media; keys=[base64_data,file_id,kind,type,width]; part does not match the generated MessagePart contract",
    );
  });

  it.each([
    {
      label: "durable file identity",
      media: {
        type: "media",
        kind: "image",
        origin: "matrx",
        file_id: "13c2a464-2ead-4611-9990-702a03e643c4",
        mime_type: "image/png",
        size_bytes: 184,
        base64_data: "captured-inline-png-bytes",
        metadata: { display_title: "review-red-checker.png" },
      },
      expectedLocator: {
        file_id: "13c2a464-2ead-4611-9990-702a03e643c4",
      },
    },
    {
      label: "durable external URL",
      media: {
        type: "media",
        kind: "image",
        origin: "external",
        url: "https://cdn.example.test/review-blue-checker.png",
        mime_type: "image/png",
        size_bytes: 185,
        base64: "captured-legacy-inline-png-bytes",
        metadata: { display_title: "review-blue-checker.png" },
      },
      expectedLocator: {
        url: "https://cdn.example.test/review-blue-checker.png",
      },
    },
  ])(
    "recovers a persisted media projection with inline bytes plus $label",
    ({ media, expectedLocator }) => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      try {
        const [entry] = parsePersistedMessageContent([media]);

        expect(entry).toMatchObject({
          kind: "message_part",
          sourceIndex: 0,
          part: {
            type: "media",
            kind: "image",
            ...expectedLocator,
            metadata: media.metadata,
          },
        });
        if (entry?.kind === "message_part") {
          expect(entry.part).not.toHaveProperty("base64_data");
          expect(entry.part).not.toHaveProperty("base64");
        }
        expect(errorSpy).toHaveBeenCalledWith(
          "[parsePersistedMessageContent] recovered media with inline bytes",
          expect.objectContaining({
            sourceIndex: 0,
            kind: "image",
          }),
        );
      } finally {
        errorSpy.mockRestore();
      }
    },
  );

  it("refuses inline-only persisted media because reload has no durable locator", () => {
    expect(() =>
      parsePersistedMessageContent([
        {
          type: "media",
          kind: "image",
          mime_type: "image/png",
          base64_data: "inline-only-bytes",
        },
      ]),
    ).toThrow("part does not match the generated MessagePart contract");
  });
});
