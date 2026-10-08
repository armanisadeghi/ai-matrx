/**
 * components/dialogs/confirm/__tests__/confirm-waits-for-a-loading-host.test.tsx
 *
 * THE HOST IS ON ITS WAY, NOT ABSENT (applets builder, 2026-10-08). The first "Use it" press on
 * /applets/build printed "[confirm] no <ConfirmDialogHost /> is mounted" and did nothing: the host's shell
 * was mounted, but its body (a `next/dynamic` chunk of the design system) had not arrived within 5 s. A
 * mounted shell must make `confirm()` wait for its body, and the question must then be asked for real.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConfirmDialogHost as DesignSystemConfirmHost } from "@ai-matrx/design-system";
import { _resetConfirmOpenerState } from "@ai-matrx/kit/confirm-opener";

// The shell's body never arrives on its own here — exactly the slow chunk; the test delivers it later.
jest.mock("next/dynamic", () => () => () => null);

import { confirm, ConfirmDialogHost, CONFIRM_HOST_WAIT_MS } from "../ConfirmDialogHost";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  _resetConfirmOpenerState();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("a confirm raised while the mounted host is still loading waits for it and asks", async () => {
  const said: string[] = [];
  const spy = jest.spyOn(console, "error").mockImplementation((...args) => {
    said.push(args.join(" "));
  });
  jest.useFakeTimers({ doNotFake: ["performance", "requestAnimationFrame", "cancelAnimationFrame"] });
  try {
    await act(async () => {
      root.render(<ConfirmDialogHost />);
    });
    let answer: boolean | undefined;
    const asked = confirm({ title: "Publish this Applet?" }).then((a) => (answer = a));
    // Longer than a tree with no host waits: still pending, nothing announced.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(CONFIRM_HOST_WAIT_MS + 2000);
    });
    expect(answer).toBeUndefined();
    expect(said.join(" ")).not.toMatch(/no <ConfirmDialogHost \/> is mounted/);
    // The body arrives: the question is put on screen.
    await act(async () => {
      root.render(
        <>
          <ConfirmDialogHost />
          <DesignSystemConfirmHost />
        </>,
      );
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(200);
    });
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("Publish this Applet?");
    expect(answer).toBeUndefined();
    void asked;
  } finally {
    jest.useRealTimers();
    spy.mockRestore();
  }
});
