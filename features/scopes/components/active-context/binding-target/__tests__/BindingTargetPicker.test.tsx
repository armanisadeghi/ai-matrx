/**
 * BindingTargetPicker — the single-node host that replaced the bespoke
 * ShortcutScopePicker (lane HIERARCHY-CASCADE). Real: the picker, DrillDeck in
 * `rungs="engagements"`, the single-node engine. Mocked: the universe loader.
 *
 * Use case: a "Summarize this matter" shortcut is bound for everyone, just
 * the author, or exactly one of Castellano & Reyes' organization / project /
 * task.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { OrgNode } from "@/features/scopes/types";

const fixture = {
  orgs: [
    { id: "org-castellano", name: "Castellano & Reyes, LLP", slug: "castellano-reyes", is_personal: false, scope_types: [] },
  ] as unknown as OrgNode[],
  projects: [{ id: "proj-renewal", name: "Meridian renewal", orgId: "org-castellano", isPersonal: false }],
  tasks: [{ id: "task-draft", title: "Draft the renewal letter", projectId: "proj-renewal", orgId: "org-castellano", status: "incomplete" }],
  treeStatus: "ready" as const,
  treeError: null,
  retryTree: () => undefined,
  engagementStatus: "ready" as const,
  engagementError: null,
  retryEngagement: () => undefined,
};
jest.mock("@/features/scopes/components/active-context/quick-pick/engine", () => ({
  ...jest.requireActual("@/features/scopes/components/active-context/quick-pick/engine"),
  useUniverse: () => fixture,
}));
jest.mock("@/features/scopes/components/context-assignment/data", () => ({
  fetchTypeItems: jest.fn(async () => []),
  fetchAssignableProjects: jest.fn(async () => []),
  fetchAssignableTasks: jest.fn(async () => []),
  fetchProjectTasks: jest.fn(async () => []),
}));

import { BindingTargetPicker } from "../BindingTargetPicker";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Rung = "global" | "user" | "organization" | "project" | "task";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const onScopeChange = jest.fn();
async function render(props: Partial<React.ComponentProps<typeof BindingTargetPicker<Rung>>> = {}) {
  await act(async () =>
    root.render(
      <BindingTargetPicker<Rung> scope="user" onScopeChange={onScopeChange} {...props} />,
    ),
  );
}
const trigger = () => host.querySelector('button[role="combobox"]') as HTMLButtonElement;
const open = async () => {
  await act(async () => {
    trigger().click();
  });
};
const buttonByText = (text: string) =>
  [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) as
    | HTMLButtonElement
    | undefined;

beforeEach(() => onScopeChange.mockClear());

it("names the held record on the trigger, with its path", async () => {
  await render({ scope: "task", scopeId: "task-draft" });
  expect(trigger().textContent).toContain("Draft the renewal letter");
  expect(trigger().textContent).toContain("Castellano & Reyes, LLP › Tasks");
});

it("the id-less rungs are rows; allowGlobal=false removes Global", async () => {
  await render({ allowGlobal: false });
  await open();
  expect(buttonByText("Available to every user")).toBeUndefined();
  await act(async () => buttonByText("Personal — only the current user")!.click());
  expect(onScopeChange).toHaveBeenLastCalledWith("user", undefined);
});

it("picking one node sets the rung from the node's kind and hands its id", async () => {
  await render();
  await open();
  // Root lists organizations; the check glyph selects, the row drills.
  const selectOrg = document.body.querySelector('button[aria-label="Select Castellano & Reyes, LLP"]') as HTMLButtonElement;
  await act(async () => selectOrg.click());
  expect(onScopeChange).toHaveBeenLastCalledWith("organization", "org-castellano");

  await open();
  await act(async () => buttonByText("Castellano & Reyes, LLP")!.click()); // drill
  const selectProject = document.body.querySelector('button[aria-label="Select Meridian renewal"]') as HTMLButtonElement;
  await act(async () => selectProject.click());
  expect(onScopeChange).toHaveBeenLastCalledWith("project", "proj-renewal");
});

it("a host restricted to user / organization gets flat organization rows (a mandate binding)", async () => {
  await render({ allowedScopes: ["user", "organization"] });
  await open();
  // No drill: nothing under an organization could be saved.
  await act(async () => buttonByText("Castellano & Reyes, LLP")!.click());
  expect(onScopeChange).toHaveBeenLastCalledWith("organization", "org-castellano");
  expect(document.body.textContent).not.toContain("Meridian renewal");
});
