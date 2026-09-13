import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import FullScreenMarkdownEditor from "./FullScreenMarkdownEditor";

jest.mock("@/components/official/FullScreenOverlay", () => ({
  __esModule: true,
  default: ({
    onSave,
    isPending,
    errorMessage,
    onRetry,
    footerContent,
  }: {
    onSave?: () => void;
    isPending?: boolean;
    errorMessage?: string | null;
    onRetry?: () => void;
    footerContent?: React.ReactNode;
  }) => (
    <div>
      <button type="button" onClick={onSave} disabled={isPending}>
        Save
      </button>
      <span data-testid="pending">{isPending ? "pending" : "idle"}</span>
      {errorMessage ? <div role="alert">{errorMessage}</div> : null}
      {onRetry ? (
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      ) : null}
      {footerContent}
    </div>
  ),
}));

jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => false }));
jest.mock("@/styles/themes/useThemeMode", () => ({
  useThemeMode: () => "light",
}));
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("FullScreenMarkdownEditor settlement boundary", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("locks duplicate saves, exposes pending state, and retries the retained operation", async () => {
    const first = deferred<void>();
    const save = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(undefined);
    await act(async () => {
      root.render(
        <FullScreenMarkdownEditor
          isOpen
          initialContent="draft"
          onSave={save}
        />,
      );
    });

    const saveButton = container.querySelector("button")!;
    await act(async () => {
      saveButton.click();
      saveButton.click();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector('[data-testid="pending"]')?.textContent,
    ).toBe("pending");

    await act(async () => first.reject(new Error("conflict")));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "conflict",
    );
    expect(
      container.querySelector('[data-testid="pending"]')?.textContent,
    ).toBe("idle");

    await act(async () =>
      (
        container.querySelector(
          "button:last-of-type",
        ) as HTMLButtonElement | null
      )?.click(),
    );
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("settles a primary action through the same duplicate lock", async () => {
    const save = deferred<void>();
    const onPrimaryAction = jest.fn(() => save.promise);
    await act(async () => {
      root.render(
        <FullScreenMarkdownEditor
          isOpen
          initialContent="draft"
          primaryActions={[{ id: "resubmit", label: "Save & resubmit" }]}
          onPrimaryAction={onPrimaryAction}
        />,
      );
    });

    const action = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Save & resubmit",
    )!;
    await act(async () => {
      action.click();
      action.click();
    });
    expect(onPrimaryAction).toHaveBeenCalledTimes(1);
    expect(onPrimaryAction).toHaveBeenCalledWith("resubmit", "draft");
    await act(async () => save.resolve());
  });
});
