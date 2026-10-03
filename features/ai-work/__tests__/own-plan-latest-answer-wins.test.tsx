/**
 * FORCING GUARD — the own-plan sign-in step shows the NEWEST answer.
 *
 * Connect boots the person's sandbox (a minute or two). If they flip "Who
 * pays" away and back meanwhile, a status read used to start, answer first,
 * clear "Starting your sandbox" and re-enable Connect — and whichever request
 * finished last won, so a late read could erase the sign-in link. Only the
 * own-plan wire is mocked; the component and its parent state are real.
 */

import * as React from "react";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const readOwnPlanStatus = jest.fn();
const startOwnPlanSignIn = jest.fn();

jest.mock("@/features/ai-work/lib/ownPlan", () => ({
  readOwnPlanStatus: (...a: unknown[]) => readOwnPlanStatus(...a),
  startOwnPlanSignIn: (...a: unknown[]) => startOwnPlanSignIn(...a),
  submitOwnPlanCode: jest.fn(),
  cancelOwnPlanSignIn: jest.fn(),
  signOutOwnPlan: jest.fn(),
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

import { HostedBillingStep } from "@/features/ai-work/compose/components/HostedBillingStep";
import type { HostedBilling, OwnPlanStatus } from "@/features/ai-work/lib/ownPlan";

function Host({ initial }: { initial: OwnPlanStatus }) {
  const [billing, setBilling] = useState<HostedBilling>("own_plan");
  const [status, setStatus] = useState<OwnPlanStatus | null>(initial);
  return (
    <>
      <HostedBillingStep
        billing={billing}
        onBillingChange={setBilling}
        status={status}
        onStatusChange={setStatus}
      />
      <output data-testid="state">{status?.state ?? "none"}</output>
    </>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function button(container: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  );
  if (!found) throw new Error(`no button "${text}"`);
  return found as HTMLButtonElement;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  readOwnPlanStatus.mockReset();
  startOwnPlanSignIn.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("a payer flip during Connect neither re-reads nor erases the sign-in link", async () => {
  const start = deferred<OwnPlanStatus>();
  startOwnPlanSignIn.mockReturnValue(start.promise);
  readOwnPlanStatus.mockResolvedValue({ provider: "claude_code", state: "signed_out" });

  act(() => {
    root.render(<Host initial={{ provider: "claude_code", state: "signed_out" } as OwnPlanStatus} />);
  });

  act(() => button(container, "Connect your Claude account").click());
  expect(container.textContent).toContain("Starting your sandbox");

  await act(async () => {
    button(container, "AI Matrx credits").click();
  });
  await act(async () => {
    button(container, "Your Claude plan").click();
  });

  expect(readOwnPlanStatus).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Starting your sandbox");
  expect(button(container, "Connect your Claude account").disabled).toBe(true);

  await act(async () => {
    start.resolve({ provider: "claude_code", state: "awaiting_code" } as OwnPlanStatus);
  });
  expect(container.querySelector('[data-testid="state"]')?.textContent).toBe("awaiting_code");
});
