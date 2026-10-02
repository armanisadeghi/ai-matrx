import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  useAppDispatch,
  useAppSelector,
  useAppStore,
} from "@/lib/redux/hooks";
import { waitForConversationPersisted } from "@/features/agents/redux/execution-system/conversations/conversation-persistence";
import { useRouter } from "next/navigation";
import { useConversationRoutePromotion } from "./useConversationRoutePromotion";

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: jest.fn(),
  useAppSelector: jest.fn(),
  useAppStore: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock(
  "@/features/agents/redux/execution-system/conversations/conversation-persistence",
  () => ({
    waitForConversationPersisted: jest.fn(),
  }),
);

const mockedUseAppDispatch = jest.mocked(useAppDispatch);
const mockedUseAppSelector = jest.mocked(useAppSelector);
const mockedUseAppStore = jest.mocked(useAppStore);
const mockedUseRouter = jest.mocked(useRouter);
const mockedWaitForConversationPersisted = jest.mocked(
  waitForConversationPersisted,
);

const agentId = "4075cc74-4c4d-4f4b-8ca4-0b873b5a72fa";
const conversationId = "ca079d38-4dde-4a83-a0b8-7e7e680aaef0";
const surfaceKey = `code-route:${agentId}`;

function buildCodeHref(targetConversationId: string): string {
  return `/code?view=sandboxes&chat=1&agentId=${agentId}&conversationId=${targetConversationId}&sandbox=active`;
}

function Probe() {
  useConversationRoutePromotion({
    surfaceKey,
    agentId,
    liveConversationId: conversationId,
    basePath: "/code/[agentId]/run",
    buildHref: buildCodeHref,
  });
  return null;
}

describe("useConversationRoutePromotion", () => {
  let container: HTMLDivElement;
  let root: Root;
  let state: Record<string, unknown>;
  const replace = jest.fn();
  const dispatch = jest.fn();

  beforeAll(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    state = {
      surfaces: { byKey: {}, pendingNavigation: {} },
      messages: {
        byConversationId: {
          [conversationId]: { orderedIds: ["first-turn-user"] },
        },
      },
      conversationFocus: { bySurface: { [surfaceKey]: { input: conversationId } } },
    };
    mockedUseAppDispatch.mockReturnValue(dispatch as never);
    mockedUseAppStore.mockReturnValue({ getState: () => state } as never);
    mockedUseAppSelector.mockImplementation((selector) => selector(state as never));
    mockedUseRouter.mockReturnValue({ replace } as never);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  it("waits for the first conversation row, then preserves Code URL state while adding its id", async () => {
    let resolvePersisted: ((persisted: boolean) => void) | undefined;
    mockedWaitForConversationPersisted.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolvePersisted = resolve;
        }),
    );

    await act(async () => {
      root.render(<Probe />);
    });
    expect(mockedWaitForConversationPersisted).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();

    state = {
      ...state,
      messages: {
        byConversationId: {
          [conversationId]: {
            orderedIds: ["first-turn-user", "first-turn-assistant"],
          },
        },
      },
    };
    await act(async () => {
      root.render(<Probe />);
    });
    expect(mockedWaitForConversationPersisted).toHaveBeenCalledWith(
      conversationId,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(replace).not.toHaveBeenCalled();

    await act(async () => {
      resolvePersisted?.(true);
      await Promise.resolve();
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(buildCodeHref(conversationId));
  });

  it("does not put a client-only draft id into the URL when persistence fails", async () => {
    mockedWaitForConversationPersisted.mockResolvedValue(false);
    state = {
      ...state,
      messages: {
        byConversationId: {
          [conversationId]: {
            orderedIds: ["first-turn-user", "first-turn-assistant"],
          },
        },
      },
    };

    await act(async () => {
      root.render(<Probe />);
      await Promise.resolve();
    });

    expect(mockedWaitForConversationPersisted).toHaveBeenCalledWith(
      conversationId,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(replace).not.toHaveBeenCalled();
  });
});
