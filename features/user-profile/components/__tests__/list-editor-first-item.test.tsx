import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PhoneEntry } from "@/features/user-profile/types";
import { EmailListEditor } from "../EmailListEditor";
import { EmergencyContactListEditor } from "../EmergencyContactListEditor";
import { PhoneListEditor } from "../PhoneListEditor";
import { SocialHandleListEditor } from "../SocialHandleListEditor";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function PhoneHarness() {
  const [value, setValue] = useState<PhoneEntry[]>([]);
  return <PhoneListEditor value={value} onChange={setValue} />;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

it("uses one welcoming action instead of an icon-and-absence message", () => {
  act(() => {
    root.render(
      <>
        <PhoneListEditor value={[]} onChange={jest.fn()} />
        <EmailListEditor value={[]} onChange={jest.fn()} />
        <SocialHandleListEditor value={[]} onChange={jest.fn()} />
        <EmergencyContactListEditor value={[]} onChange={jest.fn()} />
      </>,
    );
  });

  expect(container.querySelectorAll("button")).toHaveLength(4);
  expect(container.textContent).toContain("Add your first phone number");
  expect(container.textContent).toContain("Add your first additional email");
  expect(container.textContent).toContain("Add your first social handle");
  expect(container.textContent).toContain("Add your first emergency contact");
  expect(container.textContent).not.toMatch(/No .+ yet/i);
});

it("moves focus into the new row after the first-item action", () => {
  let scheduledFocus: FrameRequestCallback | undefined;
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    scheduledFocus = callback;
    return 1;
  });
  jest
    .spyOn(globalThis.crypto, "randomUUID")
    .mockReturnValue("00000000-0000-4000-8000-000000000001");

  act(() => root.render(<PhoneHarness />));
  const firstItemAction = container.querySelector("button");
  expect(firstItemAction).not.toBeNull();

  act(() => firstItemAction?.click());
  expect(container.querySelector("select")).not.toBeNull();

  act(() => scheduledFocus?.(0));
  expect(document.activeElement).toBe(container.querySelector("select"));
});
