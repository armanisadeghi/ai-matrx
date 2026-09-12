import { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AlchemyHost, guardAiPreparation } from "./AlchemyHost";
import type { AiPreparation } from "@ai-matrx/kit/content-transfer";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { useContentTransferCapabilities } from "@ai-matrx/design-system/content-transfer";

let identity = { userId: "user-a", organizationId: "org-a" };
const dispatch = jest.fn();
let providerProps: {
  transport: { fetch: (path: string, init: unknown) => Promise<unknown> };
  onProgress: (progress: {
    requestId: string | null;
    conversationId: string;
    status: string;
  }) => void;
} | null = null;
let lastPreparationSignal: AbortSignal | undefined;
let mockAdoptOptions: { abortController?: AbortController } | null = null;
const mockConsume = jest.fn(() => new Promise<void>(() => {}));
let mockResponse: {
  ok: boolean;
  headers: { get: (name: string) => string | null };
  clone: () => Response;
} = {
  ok: false,
  headers: { get: () => null },
  clone: () => ({}) as Response,
};

const state = () =>
  ({
    userAuth: { id: identity.userId },
    appContext: { organization_id: identity.organizationId },
  }) as never;

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (value: unknown) => unknown) => selector(state()),
  useAppStore: () => ({ getState: state }),
  useAppDispatch: () => dispatch,
  useDispatchThunk: () => (options: { abortController?: AbortController }) => {
    mockAdoptOptions = options;
    return mockConsume;
  },
}));

jest.mock("@ai-matrx/agents/content-transfer/react", () => ({
  MatrxContentTransferProvider: ({
    children,
    ...props
  }: {
    children: ReactNode;
    transport: { fetch: (path: string, init: unknown) => Promise<unknown> };
    onProgress: (progress: {
      requestId: string | null;
      conversationId: string;
      status: string;
    }) => void;
  }) => {
    providerProps = props;
    return children;
  },
}));

jest.mock("@/lib/api/matrx-transport", () => ({
  createMatrxTransport: () => ({
    fetch: async (_path: string, init: { signal?: AbortSignal }) => {
      lastPreparationSignal = init.signal;
      return mockResponse;
    },
  }),
}));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock(
  "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream",
  () => ({
    adoptForeignStream: jest.fn((options) => options),
  }),
);
jest.mock("@/features/overlays/openers/liveRunWindow", () => ({
  openLiveRunWindowAction: jest.fn((value) => value),
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn() } }));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("AlchemyHost identity lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    identity = { userId: "user-a", organizationId: "org-a" };
    providerProps = null;
    lastPreparationSignal = undefined;
    mockAdoptOptions = null;
    mockConsume.mockClear();
    mockResponse = {
      ok: false,
      headers: { get: () => null },
      clone: () => ({}) as Response,
    };
    dispatch.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("changes the real capability identity and aborts an adopted stream without remounting siblings", async () => {
    let mounts = 0;
    const observedIdentityKeys: string[] = [];
    function Descendant() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return <output>mounted</output>;
    }
    function CapabilityObserver() {
      const { identityKey } = useContentTransferCapabilities();
      observedIdentityKeys.push(identityKey ?? "missing");
      return null;
    }

    act(() => {
      root.render(
        <AlchemyHost>
          <Descendant />
          <CapabilityObserver />
        </AlchemyHost>,
      );
    });
    const oldPorts = providerProps;
    expect(oldPorts).not.toBeNull();
    if (!oldPorts)
      throw new Error("Alchemy provider did not receive host ports.");
    expect(mounts).toBe(1);
    expect(observedIdentityKeys.at(-1)).toBe(
      JSON.stringify(["user-a", "org-a"]),
    );
    mockResponse = {
      ok: true,
      headers: {
        get: (name) =>
          name === "X-Request-ID"
            ? "request-a"
            : name === "X-Conversation-ID"
              ? "conversation-a"
              : null,
      },
      clone: () => ({}) as Response,
    };
    await oldPorts.transport.fetch(
      `/ai/mandates/${encodeURIComponent(MANDATE_KEYS.alchemy__prepare_content)}`,
      {},
    );
    expect(mockConsume).toHaveBeenCalledTimes(1);
    const oldController = mockAdoptOptions?.abortController;
    expect(oldController?.signal.aborted).toBe(false);

    identity = { userId: "user-a", organizationId: "org-b" };
    act(() => {
      root.render(
        <AlchemyHost>
          <Descendant />
          <CapabilityObserver />
        </AlchemyHost>,
      );
    });

    expect(mounts).toBe(1);
    expect(providerProps?.transport).not.toBe(oldPorts.transport);
    expect(observedIdentityKeys.at(-1)).toBe(
      JSON.stringify(["user-a", "org-b"]),
    );
    expect(oldController?.signal.aborted).toBe(true);
    oldPorts.onProgress({
      requestId: "old-request",
      conversationId: "old-conversation",
      status: "detached",
    });
    expect(dispatch).not.toHaveBeenCalled();
    await expect(
      oldPorts.transport.fetch("/ai/mandates/x", {}),
    ).rejects.toThrow("account or organization changed");
  });

  it("rejects a preparation draft that settles after its identity changed", async () => {
    let currentOrganization = "org-a";
    let resolveDraft!: (
      draft: Awaited<ReturnType<AiPreparation["run"]>>,
    ) => void;
    const source: AiPreparation = {
      supports: () => true,
      run: () =>
        new Promise<Awaited<ReturnType<AiPreparation["run"]>>>((resolve) => {
          resolveDraft = resolve;
        }),
    };
    const guarded = guardAiPreparation(source, () => {
      if (currentOrganization !== "org-a")
        throw new Error("account or organization changed");
    });

    const pending = guarded.run({} as Parameters<AiPreparation["run"]>[0]);
    currentOrganization = "org-b";
    resolveDraft({} as Awaited<ReturnType<AiPreparation["run"]>>);

    await expect(pending).rejects.toThrow("account or organization changed");
  });
});
