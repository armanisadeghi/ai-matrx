/**
 * `AiModelTable.tsx`'s row-level Delete dialog never called the server: its
 * `AlertDialogAction` called `onDelete(item)` directly, and the container's
 * `handleDeleted` (`AiModelsContainer.tsx`) did ONLY
 * `setModels((prev) => prev.filter(...))` — a local-state filter with no
 * backend write. Refreshing the page brought the "deleted" model straight
 * back. Found and flagged (not fixed) by data-doctrine-adoption v5 lane
 * UNDONE-COPY-CENSUS-2 (`spawn_task task_17844c5b`); fixed by lane
 * UNDONE-COPY-CENSUS-3: the confirm now calls `aiModelService.remove(id)`
 * (a real hard `.delete()` on `ai.model_definition`, already verified
 * correct elsewhere in this feature) and only then calls `onDelete`, with a
 * pending state and `toastWriteFailure` on error.
 *
 * This test renders the exported `RowActions` row-menu component directly
 * (raw `react-dom/client`, matching this feature's existing
 * `AiModelFilterBar.test.tsx` pattern — no `@testing-library/react` in this
 * repo), clicks Delete then confirms, and asserts the server call happened
 * before `onDelete` fired.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RowActions } from "../AiModelTable";
import type { AiModel } from "../../types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const removeMock = jest.fn<Promise<void>, [string]>();

jest.mock("../../service", () => ({
  aiModelService: {
    remove: (id: string) => removeMock(id),
  },
}));

jest.mock("@/lib/errors/toastWriteFailure", () => ({
  toastWriteFailure: jest.fn(),
}));

function fixtureModel(): AiModel {
  return {
    id: "model-row-1",
    common_name: "Test Model",
    name: "test-model",
  } as unknown as AiModel;
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("AiModelTable row delete reaches the server", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    removeMock.mockReset();
    removeMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("calls aiModelService.remove with the row's id, then onDelete, when the delete is confirmed", async () => {
    const onDelete = jest.fn();
    const model = fixtureModel();

    act(() => {
      root.render(
        <RowActions
          item={model}
          onView={() => undefined}
          onEdit={() => undefined}
          onDuplicate={() => undefined}
          onDelete={onDelete}
        />,
      );
    });

    const deleteButton = container.querySelector<HTMLButtonElement>(
      'button[title="Delete"]',
    );
    expect(deleteButton).not.toBeNull();
    act(() => {
      deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // The AlertDialog portals to document.body.
    const confirmButton = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => b.textContent?.includes("Delete Model"));
    expect(confirmButton).toBeDefined();

    act(() => {
      confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushMicrotasks();

    expect(removeMock).toHaveBeenCalledWith("model-row-1");
    expect(onDelete).toHaveBeenCalledWith(model);
    // The server call must happen before the local-state callback — proves
    // this isn't the old "filter locally, never touch the server" bug.
    const removeOrder = removeMock.mock.invocationCallOrder[0];
    const onDeleteOrder = onDelete.mock.invocationCallOrder[0];
    expect(removeOrder).toBeLessThan(onDeleteOrder);
  });
});
