/**
 * A SESSION SAYS WHO ITS CONTENT IS (lane DRILL-EXPLAIN). A handler that opens the Alchemy session
 * on structured content (the drill explorer's "Explain this": a question and its answer) names it
 * for the AI envelope — kind, location, description, summary. The portal hands that envelope to the
 * one ContentTransferMenu, so "Copy as: For AI" and the AI preparation carry it instead of the
 * generic "Captured content for an assistant".
 *
 * AND A PRESS TO SEND ASKS FOR THE ORGANIZATION FIRST: "Explain this" opens the workspace to send
 * the answer to a chat; every destination is filed under an organization, and a person with none
 * chosen saw a workspace with no destinations at all (walk, 2026-09-30, admin@admin.com). With
 * `forDestination` the one write helper asks before the workspace opens; cancel still opens it.
 *
 * Break it names: the portal dropping `request.envelope` → red; the portal opening the workspace
 * before asking → red.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const menuProps: Array<Record<string, unknown>> = [];
const events: string[] = [];
const ask = jest.fn(async () => {
  events.push("asked");
});
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), loading: jest.fn(), success: jest.fn() } }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@ai-matrx/design-system/content-transfer", () => ({
  ContentTransferMenu: (props: Record<string, unknown>) => {
    menuProps.push(props);
    const R = jest.requireActual("react") as typeof import("react");
    R.useImperativeHandle(props.controllerRef as import("react").Ref<unknown>, () => ({
      preparePrimary: async () => {
        events.push("opened");
      },
    }));
    return null;
  },
  createTransferEmailActions: () => [],
  useContentTransferCapabilities: () => ({ actions: [] }),
}));
jest.mock("@/lib/redux/store-singleton", () => ({ getStoreSingleton: () => null }));
jest.mock("@/lib/redux/slices/userSlice", () => ({ selectUserId: () => "user-1" }));
jest.mock("@/lib/organization/organization-gate", () => ({
  ensureOrganizationForWrite: () => ask(),
  isOrganizationSelectionCancelled: (e: unknown) => e instanceof Error && e.message === "cancelled",
}));

import { AlchemySessionPortal } from "./AlchemySessionPortal";
import { openAlchemySession } from "./alchemy-session";

it("hands the request's envelope to the transfer menu", async () => {
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root.render(<AlchemySessionPortal />));
  const envelope = {
    kind: "drill-answer",
    location: "AI Matrx — Administration › Usage",
    description: "A question asked of Usage and its answer exactly as the screen shows it.",
    summary: "Usage: Cost (credits) by Provider, last 30 days.",
  };
  await act(async () => {
    openAlchemySession({
      key: "drill-explain:1",
      label: "Usage — Cost (credits) by Provider",
      source: { kind: "json", value: { screen: "Usage" } },
      envelope,
      intent: { kind: "prepare" },
    });
    await new Promise((r) => setTimeout(r, 20));
  });
  const last = menuProps.at(-1)!;
  expect(typeof last.envelope).toBe("function");
  expect((last.envelope as () => unknown)()).toEqual(envelope);
});

it("asks for the organization before opening a workspace pressed to send somewhere", async () => {
  events.length = 0;
  await act(async () => {
    openAlchemySession({
      key: "drill-explain:2",
      label: "Usage — Cost (credits) by Provider",
      source: { kind: "json", value: { screen: "Usage" } },
      intent: { kind: "prepare", forDestination: true },
    });
    await new Promise((r) => setTimeout(r, 2500));
  });
  expect(events).toEqual(["asked", "opened"]);
});

it("still opens the workspace when the person cancels the organization question", async () => {
  events.length = 0;
  ask.mockImplementationOnce(async () => {
    events.push("asked");
    throw new Error("cancelled");
  });
  await act(async () => {
    openAlchemySession({
      key: "drill-explain:3",
      label: "Usage",
      source: { kind: "json", value: { screen: "Usage" } },
      intent: { kind: "prepare", forDestination: true },
    });
    await new Promise((r) => setTimeout(r, 100));
  });
  expect(events).toEqual(["asked", "opened"]);
});

it("opens at once when the press is not a send", async () => {
  events.length = 0;
  await act(async () => {
    openAlchemySession({ key: "k4", label: "Usage", source: { kind: "json", value: {} }, intent: { kind: "prepare" } });
    await new Promise((r) => setTimeout(r, 50));
  });
  expect(events).toEqual(["opened"]);
});
