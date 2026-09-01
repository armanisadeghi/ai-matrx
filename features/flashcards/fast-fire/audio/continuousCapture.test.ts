const mockTrack = { stop: jest.fn() };
const mockStream = {
  getTracks: () => [mockTrack],
} as unknown as MediaStream;

const mockSource = {
  connect: jest.fn(),
  disconnect: jest.fn(),
};
const mockSinkGain = {
  gain: { value: 0 },
  connect: jest.fn(),
  disconnect: jest.fn(),
};

const mockContext = {
  currentTime: 10,
  sampleRate: 48_000,
  destination: {},
  audioWorklet: {
    addModule: jest.fn(async () => {
      // First-load module setup consumes real audio-clock time before the PCM
      // graph can emit its first frame.
      mockContext.currentTime = 13;
    }),
  },
  createMediaStreamSource: jest.fn(() => mockSource),
  createGain: jest.fn(() => mockSinkGain),
};

jest.mock("@ai-matrx/browser-audio/core", () => ({
  acquireMicStream: jest.fn(async () => mockStream),
  releaseMicStream: jest.fn(),
  getSharedAudioContext: jest.fn(() => mockContext as unknown as AudioContext),
  resumeSharedAudioContext: jest.fn(async () => undefined),
  createStreamLevelMeter: jest.fn(() => ({ stop: jest.fn() })),
}));

jest.mock("@/features/audio/captureLock", () => ({
  claimCapture: jest.fn(),
  releaseCapture: jest.fn(),
}));

jest.mock("@/features/audio/session/audioSessionRegistry", () => ({
  beginRecordingSession: jest.fn(() => ({ end: jest.fn() })),
}));

class MockAudioWorkletNode {
  static latest: MockAudioWorkletNode | null = null;

  port: { onmessage: ((event: MessageEvent<Float32Array>) => void) | null } = {
    onmessage: null,
  };

  connect = jest.fn();
  disconnect = jest.fn();

  constructor() {
    MockAudioWorkletNode.latest = this;
  }
}

describe("FastFire continuous capture clock", () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, "AudioWorkletNode", {
      configurable: true,
      value: MockAudioWorkletNode,
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: jest.fn(() => "blob:pcm-recorder"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: jest.fn(),
    });
  });

  beforeEach(() => {
    jest.useFakeTimers();
    mockContext.currentTime = 10;
    MockAudioWorkletNode.latest = null;
  });

  afterEach(async () => {
    const { hardStopCapture } = await import("./continuousCapture");
    hardStopCapture();
    jest.useRealTimers();
  });

  it("anchors card boundaries when the PCM graph starts, after async worklet setup", async () => {
    const { startContinuousCapture, startCardClip, stopCardClip } =
      await import("./continuousCapture");

    await startContinuousCapture({ padBeforeSec: 0, padAfterSec: 0 });

    mockContext.currentTime = 13.2;
    startCardClip("card-1");

    const node = MockAudioWorkletNode.latest;
    expect(node?.port.onmessage).toBeInstanceOf(Function);
    node?.port.onmessage?.({
      data: new Float32Array(48_000).fill(0.2),
    } as MessageEvent<Float32Array>);

    mockContext.currentTime = 14.2;
    const clipPromise = stopCardClip("card-1");
    jest.runOnlyPendingTimers();

    await expect(clipPromise).resolves.toEqual(expect.any(Blob));
  });
});
