import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { emitGoogleConnectEvent } from "@/features/overlays/callbacks/googleConnectWindow";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockDispatch = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => mockDispatch,
}));

import { useOpenGoogleConnectWindow } from "./googleConnectWindow";

function MenuOwner({ onImported }: { onImported: () => void }) {
  const openGoogle = useOpenGoogleConnectWindow();
  return (
    <button
      type="button"
      onClick={() => openGoogle({ onDriveImported: onImported })}
    >
      Import from Google Drive
    </button>
  );
}

describe("Google connect window opener", () => {
  it("keeps the overlay callback alive when its menu owner unmounts", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onImported = jest.fn();
    act(() => root.render(<MenuOwner onImported={onImported} />));

    act(() => container.querySelector("button")?.click());
    const callbackGroupId = mockDispatch.mock.calls[0]?.[0]?.payload?.data
      ?.callbackGroupId as string;
    act(() => root.unmount());

    await expect(
      emitGoogleConnectEvent(callbackGroupId, {
        type: "drive-imported",
        files: [],
        failures: [],
      }),
    ).resolves.toBeUndefined();
    expect(onImported).toHaveBeenCalledTimes(1);
  });
});
