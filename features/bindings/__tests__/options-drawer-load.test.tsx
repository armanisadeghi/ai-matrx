/**
 * THE GUARD ON THE OPTIONS DRAWER'S ONE-SHOT READ.
 *
 * 🚨 The defect this exists for, found on the live walk of v0.4.1561: the
 * drawer read its stored options in an effect gated on its OWN load state,
 * with that state in the dependency array —
 *
 *     if (!open || load.status !== "idle") return;
 *     setLoad({ status: "loading" });        // ← re-runs the effect
 *     …
 *   }, [open, load.status, owner.mandateId]);
 *
 * Setting "loading" re-ran the effect; the re-run's CLEANUP flipped the first
 * run's `cancelled` flag, so the answer that came back was thrown away; and the
 * re-run itself returned early because the status was no longer idle. The
 * drawer said "Reading this job's options…" forever, on a page where every
 * other state is a sentence with a remedy.
 *
 * The fix is that the latch must not be a value the asking itself changes. This
 * test fails against the old shape and passes against the ref latch, and it
 * asserts the two things a person actually experiences: the read happens
 * exactly ONCE, and the drawer SETTLES.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const readPresentation = jest.fn();

jest.mock("../treatment-writer", () => ({
  readPresentation: (...args: unknown[]) => readPresentation(...args),
  writePresentation: jest.fn(),
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => () => undefined,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ userAuth: { id: "user-1" } }),
}));

jest.mock("@/features/agents/redux/agent-shortcut-categories/selectors", () => ({
  selectAllCategoriesArray: () => [],
}));

jest.mock("@/features/agents/redux/agent-shortcut-categories/thunks", () => ({
  fetchCategoriesForScope: () => ({ type: "noop" }),
}));

// The four verbatim sections are the shortcut editor's own components and are
// covered where they live; this test is about the drawer's LOAD, so they are
// stubbed to keep the mount free of Redux, portals and the manifest registry.
jest.mock("@/features/agent-shortcuts/components/next/WidgetPicker", () => ({
  WidgetPicker: () => <div data-testid="widget-picker" />,
}));
jest.mock("@/features/agent-shortcuts/components/next/CategoryPicker", () => ({
  CategoryPicker: () => <div data-testid="category-picker" />,
}));
jest.mock("@/features/agent-shortcuts/components/next/SettingsSection", () => ({
  SettingsSection: () => <div data-testid="settings-section" />,
}));
jest.mock("@/features/agent-shortcuts/components/next/AdvancedSection", () => ({
  AdvancedSection: () => <div data-testid="advanced-section" />,
}));
jest.mock("@/features/surfaces/components/bind/WritePolicyEditor", () => ({
  WritePolicyEditor: () => <div data-testid="write-policy-editor" />,
}));
jest.mock("@/features/surfaces/manifests/registry", () => ({
  getManifest: () => null,
}));

import { BindingOptionsDrawer } from "../BindingOptionsDrawer";
import { defaultPresentation } from "../treatment-shape";

const OWNER = {
  mandateId: "mandate-1",
  organizationId: "org-1",
  label: "Goal Writer",
  visibility: "private" as never,
};

function drawer() {
  return (
    <BindingOptionsDrawer
      owner={OWNER}
      autoRun={false}
      organizationName="Titanium Success"
    />
  );
}

describe("BindingOptionsDrawer — the one-shot read", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    readPresentation.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("the CLOSED trigger already says what is set — 'empty' and 'unknown' never look alike", async () => {
    readPresentation.mockResolvedValue({
      treatmentId: null,
      presentation: defaultPresentation(),
      disabled: false,
    });
    await act(async () => {
      root.render(drawer());
    });
    expect(readPresentation).toHaveBeenCalledTimes(1);
    // Folded: the sections are not mounted, but the trigger is not silent.
    expect(container.querySelector('[data-testid="widget-picker"]')).toBeNull();
    expect(container.textContent).toContain("All platform defaults");
  });

  it("counts the answered options ON THE CLOSED TRIGGER, without being opened", async () => {
    readPresentation.mockResolvedValue({
      treatmentId: "treatment-1",
      presentation: { ...defaultPresentation(), displayMode: "sidebar" },
      disabled: false,
    });
    await act(async () => {
      root.render(drawer());
    });
    expect(container.textContent).toContain("1 set");
    expect(container.querySelector('[data-testid="widget-picker"]')).toBeNull();
  });

  it("a failed read is said ON THE TRIGGER too — a folded control never hides that it is broken", async () => {
    readPresentation.mockRejectedValue(new Error("permission denied"));
    await act(async () => {
      root.render(drawer());
    });
    expect(container.textContent).toContain("Couldn’t read");
  });

  it("SETTLES when opened, and reads exactly once", async () => {
    readPresentation.mockResolvedValue({
      treatmentId: "treatment-1",
      presentation: { ...defaultPresentation(), displayMode: "sidebar" },
      disabled: false,
    });
    await act(async () => {
      root.render(drawer());
    });
    const trigger = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });
    // The whole point: the reading sentence is GONE and the sections are here.
    expect(container.textContent).not.toContain("Reading this job’s options");
    expect(container.textContent).not.toContain("Reading this job's options");
    expect(container.querySelector('[data-testid="widget-picker"]')).not.toBeNull();
    expect(readPresentation).toHaveBeenCalledTimes(1);
  });

  it("a failed read is a sentence with a remedy, never a spinner that never stops", async () => {
    readPresentation.mockRejectedValue(
      new Error("This job's display options could not be read: permission denied"),
    );
    await act(async () => {
      root.render(drawer());
    });
    const trigger = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });
    expect(container.textContent).toContain("permission denied");
    expect(container.textContent).toContain("Try again");
  });
});
