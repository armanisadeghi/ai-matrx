import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAppSelector } from "@/lib/redux/hooks";
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
    mockedUseAppSelector.mockReturnValue("streaming");
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
});
