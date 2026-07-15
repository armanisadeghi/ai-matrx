import { apiPost } from "@/lib/api/typed-client";
import { generateSpeech, transcribeAudioUrl } from "../speechApi";

jest.mock("@/lib/api/typed-client", () => ({
  apiPost: jest.fn(),
  apiMultipart: jest.fn(),
}));

const apiPostMock = jest.mocked(apiPost);
const responseMeta = { requestId: "request-1", status: 200, serverRequestId: null };

describe("speechApi", () => {
  beforeEach(() => {
    apiPostMock.mockReset();
  });

  it("normalizes optional segment fields at the frontend boundary", async () => {
    apiPostMock.mockResolvedValueOnce({
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
    apiPostMock.mockResolvedValueOnce({
      data: {
        file_id: "file-1",
        url: "https://cdn.matrxserver.com/audio.wav",
        mime_type: "audio/wav",
        model: "tts-default",
      },
      meta: responseMeta,
    });

    await generateSpeech("Hello", { voice: "Cheyenne-PlayAI" });

    expect(apiPostMock).toHaveBeenCalledWith("/audio/text-to-speech", {
      text: "Hello",
      voice: undefined,
      quality: "fast",
    });
  });
});
