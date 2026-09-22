import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useShare, type UseShareResult } from "../useShare";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const Harness = React.forwardRef<UseShareResult>((_props, ref) => {
  const actions = useShare();
  React.useImperativeHandle(ref, () => actions, [actions]);
  return <>{actions.fallbackDialog}</>;
});
Harness.displayName = "UseShareHarness";

describe("useShare handoff results", () => {
  let host: HTMLDivElement;
  let root: Root;
  let writeText: jest.Mock;
  let actionsRef: React.RefObject<UseShareResult | null>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    actionsRef = React.createRef<UseShareResult>();
    writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })) as typeof window.matchMedia;
    act(() => root.render(<Harness ref={actionsRef} />));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    Reflect.deleteProperty(navigator, "share");
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("opens native sharing with the exact reviewed message and no implicit extra URL", async () => {
    const nativeShare = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: nativeShare,
    });
    const message =
      "I shared an AI Matrx item with you: https://app.matrx.com/s/4bd3a1";
    let outcome: string | undefined;

    await act(async () => {
      outcome = await actionsRef.current?.share({
        title: "AI Matrx share",
        text: message,
        url: null,
        copyText: message,
      });
    });

    expect(nativeShare).toHaveBeenCalledWith({
      title: "AI Matrx share",
      text: message,
    });
    expect(outcome).toBe("shared");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("does not copy anything when the person cancels native sharing", async () => {
    const nativeShare = jest
      .fn()
      .mockRejectedValue(
        new DOMException("The person closed the share sheet", "AbortError"),
      );
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: nativeShare,
    });
    let outcome: string | undefined;

    await act(async () => {
      outcome = await actionsRef.current?.share({
        title: "AI Matrx share",
        text: "A reviewed share message",
        url: null,
        copyText: "A reviewed share message",
      });
    });

    expect(outcome).toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies the complete reviewed message when native sharing is unavailable", async () => {
    const message =
      "I shared an AI Matrx item with you: https://app.matrx.com/s/4bd3a1";
    let outcome: string | undefined;

    await act(async () => {
      outcome = await actionsRef.current?.share({
        title: "AI Matrx share",
        text: message,
        url: null,
        copyText: message,
      });
    });

    expect(outcome).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(message);
  });

  it("reports clipboard fallback when native share cannot open", async () => {
    const nativeShare = jest
      .fn()
      .mockRejectedValue(new Error("Share is unavailable"));
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: nativeShare,
    });
    const message =
      "I shared an AI Matrx item with you: https://app.matrx.com/s/4bd3a1";
    let outcome: string | undefined;

    await act(async () => {
      outcome = await actionsRef.current?.share({
        title: "AI Matrx share",
        text: message,
        url: null,
        copyText: message,
      });
    });

    expect(outcome).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(message);
  });

  it("opens the accessible manual-copy dialog when clipboard is unavailable", async () => {
    writeText.mockRejectedValue(new Error("Clipboard permission denied"));
    const message =
      "I shared an AI Matrx item with you: https://app.matrx.com/s/4bd3a1";
    let outcome: string | undefined;

    await act(async () => {
      outcome = await actionsRef.current?.share({
        title: "AI Matrx share",
        text: message,
        url: null,
        copyText: message,
        fallbackTitle: "Copy message",
        fallbackDescription:
          "Copy the reviewed message below and paste it into your messaging app.",
      });
    });

    expect(outcome).toBe("manual");
    expect(document.body.textContent).toContain("Copy message");
    expect(document.querySelector("input")?.value).toBe(message);
    expect(document.body.textContent).not.toContain("sent");
  });
});
