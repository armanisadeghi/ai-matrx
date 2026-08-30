/** @jest-environment jsdom */

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const replaceMock = jest.fn();
const dispatchMock = jest.fn();
const fetchTranscriptByIdMock = jest.fn();
const promoteTranscriptThunkMock = jest.fn();
const toastErrorMock = jest.fn();

let searchParams = new URLSearchParams();
let userId: string | null = "user-1";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParams,
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: () => userId,
}));

jest.mock("@/features/transcripts/service/transcriptsService", () => ({
  fetchTranscriptById: (...args: unknown[]) => fetchTranscriptByIdMock(...args),
}));

jest.mock("@/features/transcript-studio/redux/transcriptBridge.thunks", () => ({
  promoteTranscriptThunk: (...args: unknown[]) =>
    promoteTranscriptThunkMock(...args),
}));

jest.mock("@/features/transcript-studio/components/StudioView", () => ({
  StudioView: () => <div data-testid="studio-view" />,
}));

jest.mock("@/lib/toast", () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}));

import { StudioRoute } from "./StudioRoute";

async function mount({ strict = false }: { strict?: boolean } = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      strict ? (
        <StrictMode>
          <StudioRoute />
        </StrictMode>
      ) : (
        <StudioRoute />
      ),
    );
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return {
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe("StudioRoute transcript import", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParams = new URLSearchParams("import=transcript-1");
    userId = "user-1";
    promoteTranscriptThunkMock.mockReturnValue({ type: "promote" });
  });

  it("promotes the linked transcript and replaces the dead import URL", async () => {
    const transcript = { id: "transcript-1", title: "Canary" };
    fetchTranscriptByIdMock.mockResolvedValue(transcript);
    dispatchMock.mockReturnValue({
      unwrap: () => Promise.resolve({ sessionId: "session-1" }),
    });

    const view = await mount({ strict: true });

    expect(fetchTranscriptByIdMock).toHaveBeenCalledWith("transcript-1");
    expect(promoteTranscriptThunkMock).toHaveBeenCalledWith({
      transcript,
      userId: "user-1",
    });
    expect(replaceMock).toHaveBeenCalledWith(
      "/transcripts/studio?session=session-1",
    );
    await view.unmount();
  });

  it("reports an unavailable import without dispatching a write", async () => {
    fetchTranscriptByIdMock.mockResolvedValue(null);

    const view = await mount();

    expect(toastErrorMock).toHaveBeenCalledWith(
      "That transcript isn't available — it may have been deleted, or it isn't shared with you.",
    );
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("does not import until the authenticated user id is available", async () => {
    userId = null;

    const view = await mount();

    expect(fetchTranscriptByIdMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
    await view.unmount();
  });
});
