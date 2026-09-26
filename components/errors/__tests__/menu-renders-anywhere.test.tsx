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

it("takes one line-height of width in the text flow, not its 32px tap target (never wraps a line that just fits)", async () => {
  // Measured 2026-09-26: the organization picker's "Could not load
  // organizations." is 170px in a 202px line; a 32px-wide menu filled it to
  // the pixel and wrapped, growing the box from 32px to 48px.
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<p>Could not load organizations.<ErrorAlchemyMenu input={{ message: "Could not load organizations." }} /></p>);
  });
  const menu = host.querySelector("[data-error-alchemy-menu]")!;
  const cls = menu.className.split(/\s+/);
  expect(cls).toEqual(expect.arrayContaining(["w-[1lh]", "h-[1lh]", "justify-center", "overflow-visible"]));
  await act(async () => root.unmount());
});
