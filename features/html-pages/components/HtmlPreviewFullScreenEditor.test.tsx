import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import HtmlPreviewFullScreenEditor from "./HtmlPreviewFullScreenEditor";

jest.mock("@/components/official/FullScreenOverlay", () => ({
  __esModule: true,
  default: ({
    onSave,
    isPending,
    errorMessage,
    onRetry,
  }: {
    onSave?: () => void;
    isPending?: boolean;
    errorMessage?: string | null;
    onRetry?: () => void;
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
    </div>
  ),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => null }));

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

const state = {
  currentMarkdown: "draft",
  setCurrentMarkdown: jest.fn(),
} as never;

describe("HtmlPreviewFullScreenEditor settlement boundary", () => {
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

  it("keeps the HTML editor open until save acknowledgement and retries failure", async () => {
    const first = deferred<void>();
    const onSave = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(undefined);
    const onClose = jest.fn();
    await act(async () => {
      root.render(
        <HtmlPreviewFullScreenEditor
          isOpen
          onClose={onClose}
          htmlPreviewState={state}
          onSave={onSave}
          showSaveButton
        />,
      );
    });

    const save = container.querySelector("button")!;
    await act(async () => {
      save.click();
      save.click();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="pending"]')?.textContent,
    ).toBe("pending");

    await act(async () => first.reject(new Error("write failed")));
    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "write failed",
    );
    await act(async () =>
      (
        container.querySelector(
          "button:last-of-type",
        ) as HTMLButtonElement | null
      )?.click(),
    );
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
