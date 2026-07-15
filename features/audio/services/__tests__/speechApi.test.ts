import { postJson } from "@/lib/python-client";
import { generateSpeech, transcribeAudioUrl } from "../speechApi";

jest.mock("@/lib/python-client", () => ({
  postJson: jest.fn(),
  postMultipart: jest.fn(),
}));

const postJsonMock = jest.mocked(postJson);
const responseMeta = { requestId: "request-1", status: 200, serverRequestId: null };

describe("speechApi", () => {
  beforeEach(() => {
    postJsonMock.mockReset();
  });

  it("normalizes optional segment fields at the frontend boundary", async () => {
    postJsonMock.mockResolvedValueOnce({
      data: {
        text: "Hello",
        segments: [{ text: "Hello" }],
        meta: { attempts: 1, hallucinations_filtered: 0, model: "test" },
      },
      meta: responseMeta,
    });

    const result = await transcribeAudioUrl(
      "https://cdn.matrxserver.com/audio.wav",
    );

    expect(result.segments).toEqual([
      {
        id: 0,
        seek: 0,
        start: 0,
        end: 0,
        text: "Hello",
        tokens: [],
        temperature: 0,
        avg_logprob: 0,
        compression_ratio: 0,
        no_speech_prob: 0,
      },
    ]);
  });

  it("drops retired persisted voices so the catalog default wins", async () => {
    postJsonMock.mockResolvedValueOnce({
      data: {
        file_id: "file-1",
        url: "https://cdn.matrxserver.com/audio.wav",
        mime_type: "audio/wav",
        model: "tts-default",
      },
      meta: responseMeta,
    });

    await generateSpeech("Hello", { voice: "Cheyenne-PlayAI" });

    expect(postJsonMock).toHaveBeenCalledWith("/audio/text-to-speech", {
      text: "Hello",
      voice: undefined,
      quality: "fast",
    });
  });
});
