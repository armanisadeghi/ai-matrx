import { renderHook } from "@/test-utils/renderHook";

const dispatch = jest.fn();
const createSession = jest.fn();
const startContinuousCapture = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: () => ({
    setId: "set-fastfire",
    setName: "FastFire Test Deck",
    secondsPerCard: 12,
    cardLimit: 0,
    liveScore: true,
    spokenFronts: false,
    voiceAnswerSeconds: 8,
    warningSeconds: 3,
    adaptive: true,
  }),
}));

jest.mock("@/features/flashcards/data/fcService", () => ({
  fcService: {
    getSetWithCards: async () => ({
      data: {
        set: { id: "set-fastfire", name: "FastFire Test Deck" },
        cards: [
          {
            id: "card-1",
            front: "Question",
            back: "Answer",
            position: 0,
            details: [],
            metadata: {},
            topic: null,
          },
        ],
      },
      error: null,
    }),
    getExpansionEdges: async () => ({ data: {}, error: null }),
  },
}));

jest.mock("@/features/flashcards/data/cardSource", () => ({
  readCardSourceRefs: async () => ({}),
}));

jest.mock("@/features/education/study/service/studyService", () => ({
  studyService: {
    getMasteryBulk: async () => ({ data: [], error: null }),
    createSession: (...args: unknown[]) => createSession(...args),
  },
}));

jest.mock("../../audio/continuousCapture", () => ({
  startContinuousCapture: (...args: unknown[]) =>
    startContinuousCapture(...args),
}));

import { useFastFireLauncher } from "../useFastFireLauncher";

describe("useFastFireLauncher", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createSession.mockResolvedValue({
      data: { id: "session-fastfire" },
      error: null,
    });
    startContinuousCapture.mockResolvedValue(undefined);
  });

  it("does not create a durable study session when microphone startup fails", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    startContinuousCapture.mockRejectedValue(
      new DOMException("Permission denied", "NotAllowedError"),
    );
    const hook = await renderHook(() => useFastFireLauncher());

    let started = true;
    await hook.act(async () => {
      started = await hook.current.start();
    });

    expect(started).toBe(false);
    expect(startContinuousCapture).toHaveBeenCalledTimes(1);
    expect(createSession).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(hook.current.startError).toMatch(/Microphone access was denied/);
    errorSpy.mockRestore();
    await hook.unmount();
  });

  it("creates the study session only after capture is ready", async () => {
    const order: string[] = [];
    startContinuousCapture.mockImplementation(async () => {
      order.push("capture");
    });
    createSession.mockImplementation(async () => {
      order.push("session");
      return { data: { id: "session-fastfire" }, error: null };
    });
    const hook = await renderHook(() => useFastFireLauncher());

    let started = false;
    await hook.act(async () => {
      started = await hook.current.start();
    });

    expect(started).toBe(true);
    expect(order).toEqual(["capture", "session"]);
    await hook.unmount();
  });
});
