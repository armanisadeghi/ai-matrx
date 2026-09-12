/**
 * ROUND 3 — THE PROPOSAL CARD MUST NOT CLAIM A WRITE THAT HAS NOT HAPPENED.
 *
 * V-24, live 2026-09-12: while a `create_project_with_tasks` directive sat
 * awaiting approval, the card read, verbatim:
 *
 *   "The project is still being created. Please refresh the browser to see the
 *    live project and tasks."
 *
 * Nothing was being created. Under the `ask` apply policy the write is gated on
 * a click the user has not made, and `workspace.projects` was empty at that
 * instant. Law 4: a screen is absent or honest — never wearing a false sentence.
 *
 * All this state actually knows is that the poll schedule ran out without
 * finding a project by that name. This test pins that the card says exactly
 * that, and never the old claim.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import type { DecodedDirective } from "@ai-matrx/content-ir";

import overlayReducer from "@/lib/redux/slices/overlaySlice";

// The card is an app-router client component; only its SENTENCE is under test.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), prefetch: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/chat",
  useSearchParams: () => new URLSearchParams(),
}));

// The card polls the database for the created project; "exhausted" is the state
// the verifier saw — polled, found nothing.
jest.mock(
  "@/features/matrx-envelope/directives/createProjectWithTasks/useResolveCreatedProject",
  () => ({
    useResolveCreatedProject: () => ({ status: "exhausted", data: null }),
  }),
);

import CreateProjectWithTasksRenderer from "@/features/matrx-envelope/directives/createProjectWithTasks/CreateProjectWithTasksRenderer";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SLUG = "directive_v1_action_create_project_with_tasks";

const directive = {
  slug: SLUG,
  directiveClass: "action",
  noun: "create_project_with_tasks",
  items: [
    {
      name: "V-24 Browser Leg",
      tasks: [{ name: "Task One" }, { name: "Task Two" }],
    },
  ],
  shell: { __kind: SLUG, items: [] },
  parsed: { executes: true },
} as unknown as DecodedDirective;

function render(): { text: string; cleanup: () => void } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  let root: Root | null = null;
  act(() => {
    root = createRoot(host);
    root.render(
      <Provider store={configureStore({ reducer: { overlay: overlayReducer } })}>
        <CreateProjectWithTasksRenderer directive={directive} />
      </Provider>,
    );
  });
  const text = host.textContent ?? "";
  return {
    text,
    cleanup: () => {
      act(() => root?.unmount());
      host.remove();
    },
  };
}

describe("the project directive card, with nothing written yet", () => {
  it("never says the project is being created", () => {
    const view = render();
    expect(view.text).not.toContain("still being created");
    expect(view.text).not.toMatch(/being created/i);
    view.cleanup();
  });

  it("says what is actually true: nothing exists yet, and why", () => {
    const view = render();
    expect(view.text).toContain("Nothing has been created yet");
    expect(view.text).toContain("no project by this name exists");
    // And it still gives the remedy for the other reading — an apply that has
    // landed but not yet been polled. The remedy CHANGED on 2026-09-12 (DD-135,
    // V-34): it used to be the sentence "refresh to see it", which kept standing
    // after the apply succeeded, above a receipt saying the project WAS created.
    // The remedy is now a control that asks again, so the guard's intent — the
    // card never leaves the reader stuck — is asserted on the control.
    expect(view.text).not.toContain("refresh to see it");
    expect(view.text).toContain("Check again");
    view.cleanup();
  });

  it("renders NOTHING for a directive with zero items", () => {
    // DD-135 / V-34: a bound agent answering a plain question emits its shell
    // with an empty items array. This used to draw "Project directive — waiting
    // for project details…" — a card that promises something still coming when
    // nothing is. Absent, never a false pending state.
    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | null = null;
    const empty = {
      slug: SLUG,
      items: [],
      shell: { __kind: SLUG, items: [] },
      parsed: { executes: true },
    } as unknown as DecodedDirective;
    act(() => {
      root = createRoot(host);
      root.render(
        <Provider store={configureStore({ reducer: { overlay: overlayReducer } })}>
          <CreateProjectWithTasksRenderer directive={empty} />
        </Provider>,
      );
    });
    expect((host.textContent ?? "").trim()).toBe("");
    act(() => root?.unmount());
    host.remove();
  });
});
