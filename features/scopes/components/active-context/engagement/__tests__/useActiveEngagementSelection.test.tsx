/**
 * Surface A: the engagement picker's adapter onto the global working context
 * (it replaced useHierarchyReduxBridge; lane HIERARCHY-CASCADE). Real store,
 * real appContextSlice reducer. The case the old bridge dropped: ONE pick that
 * moves several rungs (a project of another organization) must land every rung.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import appContextReducer from "@/lib/redux/slices/appContextSlice";
import { useActiveEngagementSelection } from "../useActiveEngagementSelection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setup() {
  const store = configureStore({ reducer: { appContext: appContextReducer } });
  let api!: ReturnType<typeof useActiveEngagementSelection>;
  function Probe() {
    api = useActiveEngagementSelection();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() =>
    root.render(
      <Provider store={store}>
        <Probe />
      </Provider>,
    ),
  );
  return { store, get: () => api, root };
}

it("an organization + project + tags + task in one change all land, in rung order", () => {
  const { store, get, root } = setup();
  act(() =>
    get().onChange({
      organizationId: "org-castellano",
      organizationName: "Castellano & Reyes, LLP",
      projectId: "proj-renewal",
      projectName: "Meridian renewal",
      taskId: "task-draft",
      taskName: "Draft the renewal letter",
      scopeIds: ["scope-meridian", "scope-harbor"],
    }),
  );
  const ctx = store.getState().appContext;
  expect(ctx.organization_id).toBe("org-castellano");
  expect(ctx.project_id).toBe("proj-renewal");
  expect(ctx.task_id).toBe("task-draft");
  expect(Object.values(ctx.scope_selections).sort()).toEqual(["scope-harbor", "scope-meridian"]);
  expect(get().value.scopeIds.sort()).toEqual(["scope-harbor", "scope-meridian"]);

  // Removing one tag is surgical: project and task stay.
  act(() => get().onChange({ ...get().value, scopeIds: ["scope-harbor"] }));
  const after = store.getState().appContext;
  expect(Object.values(after.scope_selections)).toEqual(["scope-harbor"]);
  expect(after.project_id).toBe("proj-renewal");
  expect(after.task_id).toBe("task-draft");

  // Clearing everything clears the working context.
  act(() =>
    get().onChange({ organizationId: null, organizationName: null, projectId: null, projectName: null, taskId: null, taskName: null, scopeIds: [] }),
  );
  expect(store.getState().appContext.organization_id).toBeNull();
  act(() => root.unmount());
});
