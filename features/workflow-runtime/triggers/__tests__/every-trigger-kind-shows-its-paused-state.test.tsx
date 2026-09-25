/**
 * A SCREEN NEVER LIES — every trigger kind renders its real paused state.
 *
 * The card gated its "Paused" line to `cron`/`event`, so a paused webhook
 * (is_active=false on the row, e.g. "ARQ Verify 09af6ffa Webhook" on workflow
 * 8f287c2b…) rendered as live: "Hasn't run yet · Try it now" with no Paused
 * label. The server refuses every fire of a disabled trigger (409 "trigger is
 * disabled"), so a live-looking "Try it now" was a dead control.
 *
 * This suite renders EVERY kind in the union, paused and active, and asserts
 * the state is on screen and the fire control is absent while paused.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href }, children),
}));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: () => Promise.resolve(false),
}));
jest.mock("@/components/ui/switch", () => ({
  Switch: ({ checked }: { checked: boolean }) =>
    React.createElement("input", {
      type: "checkbox",
      readOnly: true,
      checked,
      "data-testid": "switch",
    }),
}));
jest.mock("../useWorkflowTriggers", () => ({
  triggerWebhookUrl: (id: string) => `https://example.test/triggers/${id}/fire`,
}));
jest.mock("../components/TriggerFireHistory", () => ({
  TriggerFireHistory: () => null,
}));

import { TriggerCard } from "../components/TriggerCard";
import type { TriggerKind, WorkflowTrigger } from "../types";

const KINDS: TriggerKind[] = ["cron", "webhook", "manual", "event"];

function trigger(kind: TriggerKind, isActive: boolean): WorkflowTrigger {
  return {
    id: `t-${kind}`,
    definitionId: "def-1",
    name: `Nightly intake (${kind})`,
    description: null,
    kind,
    cronExpression: kind === "cron" ? "0 9 * * *" : null,
    eventSource: kind === "event" ? { table: "crm.contact" } : null,
    timezone: "UTC",
    isActive,
    defaultInputs: {},
    maxSteps: null,
    nextRunAt: kind === "cron" ? "2026-09-26T09:00:00Z" : null,
    lastFiredAt: null,
    lastRunId: null,
    fireCount: 0,
    createdAt: null,
  };
}

function render(t: WorkflowTrigger): { text: string; host: HTMLElement } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <TriggerCard
        trigger={t}
        busy={false}
        onSetActive={() => {}}
        onDelete={() => {}}
        onFireNow={() => {}}
        loadFires={() => Promise.resolve([])}
      />,
    );
  });
  const text = host.textContent ?? "";
  act(() => root.unmount());
  host.remove();
  return { text, host };
}

describe("TriggerCard renders the row's real state for every kind", () => {
  it.each(KINDS)("a paused %s trigger says Paused and offers to turn it on", (kind) => {
    const { text } = render(trigger(kind, false));
    expect(text).toContain("Paused");
    expect(text).toContain("Turn it back on");
    expect(text).not.toContain("Try it now");
  });

  it.each(KINDS)("an active %s trigger never says Paused", (kind) => {
    const { text } = render(trigger(kind, true));
    expect(text).not.toContain("Paused");
    expect(text).not.toContain("Turn it back on");
  });

  it("an active webhook still offers Try it now", () => {
    expect(render(trigger("webhook", true)).text).toContain("Try it now");
  });
});
