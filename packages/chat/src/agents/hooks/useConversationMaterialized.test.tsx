import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { waitForConversationPersisted } from "@/features/agents/redux/execution-system/conversations/conversation-persistence";
import { useConversationMaterialized } from "./useConversationMaterialized";

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: jest.fn(),
}));

jest.mock(
  "@/features/agents/redux/execution-system/conversations/conversation-persistence",
  () => ({
    waitForConversationPersisted: jest.fn(),
  }),
);

const mockedUseAppSelector = jest.mocked(useAppSelector);
const mockedWaitForConversationPersisted = jest.mocked(
  waitForConversationPersisted,
);

function Probe({ conversationId }: { conversationId: string }) {
  const materialized = useConversationMaterialized(conversationId);
  return <span>{materialized ? "ready" : "pending"}</span>;
}

describe("useConversationMaterialized", () => {
  let container: HTMLDivElement;
  let root: Root;
  let currentUserId: string;

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
    currentUserId = "7dc43e0d-66f0-4e4d-880b-11753bd766ee";
    mockedUseAppSelector.mockImplementation((selector) =>
      selector === selectUserId ? currentUserId : "streaming",
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  it("does not treat streaming as persistence before the row-read waiter succeeds", async () => {
    let resolveWait: ((persisted: boolean) => void) | undefined;
    mockedWaitForConversationPersisted.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveWait = resolve;
        }),
    );

    await act(async () => {
      root.render(
        <Probe conversationId="bb1fc515-e833-45f0-81d2-c1fda1b2bccc" />,
      );
    });
    expect(container.textContent).toBe("pending");

    await act(async () => {
      resolveWait?.(true);
      await Promise.resolve();
    });
    expect(container.textContent).toBe("ready");
  });

  it("does not reuse another authenticated user's materialization proof", async () => {
    mockedWaitForConversationPersisted.mockResolvedValue(true);
    const conversationId = "2c64fe35-262a-4ead-bbd1-cd120fd3f705";

    await act(async () => {
      root.render(<Probe conversationId={conversationId} />);
      await Promise.resolve();
    });
    expect(container.textContent).toBe("ready");

    mockedWaitForConversationPersisted.mockClear();
    currentUserId = "a0255105-000f-4ee4-b10f-101545a31aac";
    let resolveSecondUser: ((persisted: boolean) => void) | undefined;
    mockedWaitForConversationPersisted.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSecondUser = resolve;
        }),
    );

    await act(async () => {
      root.render(<Probe conversationId={conversationId} />);
    });

    expect(container.textContent).toBe("pending");
    expect(mockedWaitForConversationPersisted).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSecondUser?.(false);
      await Promise.resolve();
    });
    expect(container.textContent).toBe("pending");
  });
});
