/**
 * @jest-environment jsdom
 */
/**
 * The menu renders on screens with no app providers — app/global-error.tsx
 * replaces the root layout, toasts mount beside it — so it must never need a
 * provider above it (RC-B12: a crash screen that crashes is a blank page).
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("renders with no provider above it", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<ErrorAlchemyMenu input={{ message: "This page crashed." }} />);
  });
  expect(host.querySelector("[data-error-alchemy-menu] button")).not.toBeNull();
  await act(async () => root.unmount());
});
