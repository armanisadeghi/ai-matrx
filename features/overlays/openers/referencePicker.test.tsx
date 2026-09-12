import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { getReferencePickerCallbackGroup } from "@/features/overlays/callbacks/referencePicker";
import {
  useOpenReferencePicker,
  type ReferencePickerHandle,
} from "./referencePicker";

const dispatch = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatch,
}));

describe("useOpenReferencePicker", () => {
  it("keeps the pick callback alive when the opening menu unmounts", async () => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      value: true,
    });
    const onPicked = jest.fn();
    let handle: ReferencePickerHandle | null = null;

    function OpeningMenu() {
      const openReferencePicker = useOpenReferencePicker();
      useEffect(() => {
        handle = openReferencePicker({ mode: "insert", onPicked });
      }, [openReferencePicker]);
      return null;
    }

    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<OpeningMenu />));
    expect(handle).not.toBeNull();
    const callbackGroupId = handle!.callbackGroupId;

    await act(async () => root.unmount());

    const group = getReferencePickerCallbackGroup(callbackGroupId);
    expect(group).not.toBeNull();
    group!.onPicked({
      delivery: "insert",
      fence: "```matrx\n{}\n```",
      title: "Test chat",
    });
    expect(onPicked).toHaveBeenCalledTimes(1);
    expect(getReferencePickerCallbackGroup(callbackGroupId)).toBeNull();
  });
});
