import { act } from "react";
import { createRoot } from "react-dom/client";

let organizationState: "resolving" | "ready" | "unavailable" = "resolving";
const loadDecision = jest.fn();
const runDecision = jest.fn();
const dispatch = jest.fn();
const retry = jest.fn();

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("execution_id=saved-1"),
}));
jest.mock("@/features/organizations/useOrganizationRequired", () => ({
  useOrganizationRequired: () => ({ organizationState, retry }),
}));
jest.mock(
  "@/features/organizations/components/OrganizationRequiredNotice",
  () => ({
    OrganizationContextNotice: ({
      state,
      onRetry,
    }: {
      state: string;
      onRetry: () => void;
    }) =>
      state === "unavailable" ? (
        <button onClick={onRetry}>Retry organization</button>
      ) : null,
  }),
);
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => dispatch }));
jest.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: ({
    value,
    onChange,
  }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea value={value} onChange={onChange} />
  ),
}));
jest.mock("@/features/ai-models/components/lab/ModelListDropdown", () => ({
  ModelListDropdown: () => null,
}));
jest.mock("./DecisionQuestionEditor", () => ({
  DecisionQuestionEditor: () => null,
}));
jest.mock("./decision-api", () => ({
  loadDecision: (...args: unknown[]) => loadDecision(...args),
  runDecision: (...args: unknown[]) => runDecision(...args),
}));

import { DecisionPlayground } from "./DecisionPlayground";

describe("DecisionPlayground saved result recovery", () => {
  beforeEach(() => {
    organizationState = "resolving";
    jest.clearAllMocks();
  });
  beforeAll(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  });
  afterAll(() => {
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  });
  it("waits through organization hydration, then issues one saved GET and no paid POST", async () => {
    loadDecision.mockResolvedValue({
      executionId: "saved-1",
      source: "recovered",
      model: "jev",
      answers: {},
      inputTokens: 0,
      outputTokens: 0,
      costUsd: null,
      offeringId: null,
      route: null,
      requestId: null,
      providerRequestId: null,
    });
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => {
      root.render(<DecisionPlayground />);
    });
    expect(loadDecision).not.toHaveBeenCalled();
    organizationState = "ready";
    await act(async () => {
      root.render(<DecisionPlayground />);
    });
    expect(loadDecision).toHaveBeenCalledTimes(1);
    expect(loadDecision.mock.calls[0][1]).toBe("saved-1");
    expect(runDecision).not.toHaveBeenCalled();
    await act(async () => {
      root.unmount();
    });
  });
  it("exposes the canonical retry action after organization lookup fails without issuing a request", async () => {
    organizationState = "unavailable";
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => {
      root.render(<DecisionPlayground />);
    });
    const retryButton = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Retry organization",
    );
    expect(retryButton).toBeDefined();
    await act(async () => {
      retryButton?.click();
    });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(loadDecision).not.toHaveBeenCalled();
    expect(runDecision).not.toHaveBeenCalled();
    await act(async () => {
      root.unmount();
    });
  });
});
