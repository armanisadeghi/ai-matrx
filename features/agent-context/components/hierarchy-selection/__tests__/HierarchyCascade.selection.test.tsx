import React, { act } from "react";
import { createRoot } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub;
HTMLElement.prototype.scrollIntoView = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
}));

jest.mock("../../../hooks/useHierarchy", () => ({
  useCreateProject: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useCreateTask: () => ({ isPending: false, mutateAsync: jest.fn() }),
}));

const setOrg = jest.fn();

jest.mock("../useHierarchySelection", () => ({
  FULL_HIERARCHY_LEVELS: ["organization", "scope", "project", "task"],
  useHierarchySelection: () => ({
    isLoading: false,
    orgs: [
      { id: "org-personal", name: "Personal", isPersonal: true },
      { id: "org-wts", name: "Write Target Sandbox" },
    ],
    scopeLevels: [],
    projects: [],
    tasks: [],
    setOrg,
  }),
}));

import { HierarchyCascade } from "../HierarchyCascade";

describe("HierarchyCascade single-select accessibility", () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    setOrg.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <HierarchyCascade
          levels={["organization"]}
          value={{
            organizationId: "org-wts",
            organizationName: "Write Target Sandbox",
            projectId: null,
            projectName: null,
            taskId: null,
            taskName: null,
            scopeSelections: {},
          }}
          onChange={jest.fn()}
          minRows={1}
        />,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("opens with the actual selected organization as the active option", async () => {
    const trigger = container.querySelector<HTMLElement>('[role="combobox"]');
    expect(trigger?.textContent).toContain("Write Target Sandbox");

    await act(async () => trigger?.click());

    const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
    const selected = options.filter(
      (option) => option.getAttribute("aria-selected") === "true",
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]?.textContent).toContain("Write Target Sandbox");
  });

  it("does not clear the organization when its selected option is activated", async () => {
    const trigger = container.querySelector<HTMLElement>('[role="combobox"]');
    await act(async () => trigger?.click());

    const selected = [
      ...document.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((option) => option.getAttribute("aria-selected") === "true");
    await act(async () => selected?.click());

    expect(setOrg).toHaveBeenCalledWith("org-wts");
    expect(setOrg).not.toHaveBeenCalledWith(null);
  });
});
