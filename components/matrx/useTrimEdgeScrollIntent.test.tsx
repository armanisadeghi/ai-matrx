import { useRef, useState } from "react";
import { renderHook } from "@/test-utils/renderHook";
import {
  useScrollEdgeIntent,
  useTrimEdgeScrollIntent,
} from "./useTrimEdgeScrollIntent";

function useTrimScrollHarness(element: HTMLElement) {
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [mode, setMode] = useState("plain");
  const trimScroll = useTrimEdgeScrollIntent(
    trimStart,
    setTrimStart,
    trimEnd,
    setTrimEnd,
  );
  const ref = useRef<HTMLElement | null>(element);
  useScrollEdgeIntent(trimScroll.intent, [ref], mode);
  return { ...trimScroll, setMode };
}

describe("trim edge scroll intent", () => {
  function createScrollableElement() {
    const element = document.createElement("div");
    Object.defineProperties(element, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 1000 },
    });
    document.body.appendChild(element);
    return element;
  }

  it("reveals the last retained text after an end trim", async () => {
    const element = createScrollableElement();
    const hook = await renderHook(() => useTrimScrollHarness(element));

    await hook.act(() => hook.current.setTrimEnd(12));

    expect(hook.current.intent).toMatchObject({ edge: "end" });
    expect(element.scrollTop).toBe(900);
    await hook.unmount();
    element.remove();
  });

  it("returns to the first retained text after a start trim", async () => {
    const element = createScrollableElement();
    element.scrollTop = 900;
    const hook = await renderHook(() => useTrimScrollHarness(element));

    await hook.act(() => hook.current.setTrimStart(12));

    expect(hook.current.intent).toMatchObject({ edge: "start" });
    expect(element.scrollTop).toBe(0);
    await hook.unmount();
    element.remove();
  });

  it("does not replay a cancelled request when the editor mode rebinds", async () => {
    const element = createScrollableElement();
    const hook = await renderHook(() => useTrimScrollHarness(element));

    await hook.act(() => hook.current.setTrimEnd(12));
    element.scrollTop = 400;
    element.dispatchEvent(new WheelEvent("wheel"));
    await hook.act(() => hook.current.setMode("preview"));

    expect(element.scrollTop).toBe(400);
    await hook.unmount();
    element.remove();
  });
});
