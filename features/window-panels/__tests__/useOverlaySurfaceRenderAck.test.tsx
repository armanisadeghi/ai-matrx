import { useState } from "react";
import { renderHook } from "@/test-utils/renderHook";

const ack = jest.fn();
const clear = jest.fn();

jest.mock(
  "@/features/window-panels/diagnostics/overlayRenderWatchdog",
  () => ({
    ackOverlaySurfaceRender: (overlayId: string) => ack(overlayId),
    clearOverlaySurfaceRender: (overlayId: string) => clear(overlayId),
  }),
);

import { useOverlaySurfaceRenderAck } from "@/features/window-panels/diagnostics/useOverlaySurfaceRenderAck";

beforeEach(() => {
  ack.mockClear();
  clear.mockClear();
});

it("acks only while the alternate surface is active and clears on transition", async () => {
  const hook = await renderHook(() => {
    const [active, setActive] = useState(false);
    useOverlaySurfaceRenderAck("mobile-sheet", active);
    return { setActive };
  });

  expect(ack).not.toHaveBeenCalled();
  await hook.act(() => hook.current.setActive(true));
  expect(ack).toHaveBeenCalledWith("mobile-sheet");

  await hook.act(() => hook.current.setActive(false));
  expect(clear).toHaveBeenCalledWith("mobile-sheet");
  await hook.unmount();
  expect(clear).toHaveBeenCalledTimes(1);
});

it("clears an active acknowledgement on unmount", async () => {
  const hook = await renderHook(() => {
    useOverlaySurfaceRenderAck("mobile-viewer", true);
  });

  expect(ack).toHaveBeenCalledWith("mobile-viewer");
  await hook.unmount();
  expect(clear).toHaveBeenCalledWith("mobile-viewer");
});
