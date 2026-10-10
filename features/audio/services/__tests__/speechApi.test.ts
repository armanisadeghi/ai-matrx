import { apiMultipart, apiPost } from "@/lib/api/typed-client";
import {
  generateSpeech,
  previewVoice,
  transcribeAudioFile,
  transcribeAudioUrl,
} from "../speechApi";

jest.mock("@/lib/api/typed-client", () => ({
  apiPost: jest.fn(),
  apiMultipart: jest.fn(),
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: jest.fn().mockResolvedValue("org-1"),
}));

// Cast: the typed client's overload union is too complex for jest.mocked to represent.
const apiPostMock = apiPost as unknown as jest.Mock;
const apiMultipartMock = apiMultipart as unknown as jest.Mock;
const responseMeta = {
  requestId: "request-1",
  status: 200,
  serverRequestId: null,
};

describe("speechApi", () => {
  beforeEach(() => {
    apiPostMock.mockReset();
    apiMultipartMock.mockReset();
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
    expect(apiPostMock).toHaveBeenCalledWith("/audio/transcribe-url", {
      url: "https://cdn.matrxserver.com/audio.wav",
      language: undefined,
      organization_id: "org-1",
    });
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
      organization_id: "org-1",
      voice: undefined,
      quality: "fast",
    });
  });

  it("text-to-speech sends the chosen class beside its model", async () => {
    apiPostMock.mockResolvedValueOnce({
      data: { file_id: "f", url: "u", mime_type: "audio/wav", model: "m" },
      meta: responseMeta,
    });
    await generateSpeech("Hello", {
      voice: "troy",
      model: "eleven_v3",
      offeringId: "e500ce86-d54d-4e0e-af27-101bdc5cbf1d",
    });
    expect(apiPostMock).toHaveBeenCalledWith(
      "/audio/text-to-speech",
      expect.objectContaining({
        model: "eleven_v3",
        offering_id: "e500ce86-d54d-4e0e-af27-101bdc5cbf1d",
      }),
    );
  });

  it("a voice preview of a pinned class sends offering_id and is cached per class", async () => {
    apiPostMock.mockResolvedValue({
      data: { url: "u", model: "eleven_v3", voice: "kore", source: "synthesized" },
      meta: responseMeta,
    });
    await previewVoice({ model: "eleven_v3", voice: "kore", offeringId: "class-a" });
    await previewVoice({ model: "eleven_v3", voice: "kore", offeringId: "class-b" });
    await previewVoice({ model: "eleven_v3", voice: "kore", offeringId: "class-a" });
    expect(apiPostMock).toHaveBeenCalledTimes(2);
    expect(apiPostMock).toHaveBeenNthCalledWith(1, "/audio/voice-preview", {
      model: "eleven_v3",
      voice: "kore",
      organization_id: "org-1",
      offering_id: "class-a",
    });
    expect(apiPostMock).toHaveBeenNthCalledWith(
      2,
      "/audio/voice-preview",
      expect.objectContaining({ offering_id: "class-b" }),
    );
  });

  it("passes a transcription deadline to the canonical multipart client", async () => {
    apiMultipartMock.mockResolvedValueOnce({
      data: {
        text: "Hello",
        segments: [],
        meta: { attempts: 1, hallucinations_filtered: 0, model: "test" },
      },
      meta: responseMeta,
    });

    const file = new File(["audio"], "chunk.webm", { type: "audio/webm" });
    await transcribeAudioFile(file, undefined, {
      timeoutMs: 30_000,
      captureErrors: false,
    });

    expect(apiMultipartMock).toHaveBeenCalledWith(
      "/audio/transcribe",
      expect.any(FormData),
      { timeoutMs: 30_000, captureErrors: false },
    );
  });
});
