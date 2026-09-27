/**
 * NO WORKSPACE CHOSEN → THE PERSON PICKS ONE, NEVER A RUN ERROR (page-pass
 * 2026-09-27, /agent-apps/[id]/run).
 *
 * Live before: with no organization selected, the Fact Checker app printed
 * `execution_error: mandate "app.precision_fact_checker" cannot resolve yet…`
 * twice on first paint. The holder carried the refusal only as `error`, so
 * every shell printed it. This suite pins the two halves of the fix:
 *   1. `useAppHolder` reports the refusal as `organizationPending` with a
 *      sentence that names no internal key.
 *   2. `AppWorkspaceGate` hands that fact to the canonical `WorkspaceGate`
 *      (the inline membership picker) instead of rendering the app.
 * Only `useMandate`, the auth selector and the gate's picker are stubbed.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mandateState = {
  mandate: null,
  loading: false,
  error: 'mandate "app.precision_fact_checker" cannot resolve yet: no organization is selected.',
  absent: false,
  organizationPending: true,
};

jest.mock("@/features/mandates/useMandate", () => ({
  useMandate: () => mandateState,
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => true,
}));
jest.mock("@/features/organizations/components/WorkspaceGate", () => ({
  WorkspaceGate: ({
    blocked,
    sentence,
    children,
  }: {
    blocked: boolean;
    sentence: string;
    children: React.ReactNode;
  }) => (blocked ? <div data-testid="gate">{sentence}</div> : <>{children}</>),
}));

import { useAppHolder } from "../lib/appHolder";
import { AppWorkspaceGate } from "./AppWorkspaceGate";
import type { PublicAgentApp } from "../types";

const app = {
  id: "app-1",
  name: "Fact Checker",
  agent_id: "agent-1",
  mandate_id: "mandate-1",
  mandate_key: "app.precision_fact_checker",
} as unknown as PublicAgentApp;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("useAppHolder reports no-workspace as organizationPending with no internal key", () => {
  let seen: ReturnType<typeof useAppHolder> | null = null;
  function Probe() {
    seen = useAppHolder(app);
    return null;
  }
  act(() => root.render(<Probe />));
  expect(seen!.organizationPending).toBe(true);
  expect(seen!.agentId).toBeNull();
  expect(seen!.error).not.toMatch(/mandate|app\.precision_fact_checker/);
});

it("AppWorkspaceGate shows the workspace picker instead of the app", () => {
  act(() =>
    root.render(
      <AppWorkspaceGate app={app}>
        <div data-testid="app-body">app</div>
      </AppWorkspaceGate>,
    ),
  );
  expect(container.querySelector('[data-testid="gate"]')?.textContent).toBe(
    "Fact Checker needs a workspace to run.",
  );
  expect(container.querySelector('[data-testid="app-body"]')).toBeNull();
});
