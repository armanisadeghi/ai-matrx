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

it("ErrorNotice's menu never takes a column of its own or a line of its own", async () => {
  // Measured 2026-09-26 at 375px on the org-unavailable notice: a menu column
  // beside the ⋯ grew the card 176→224px; inline at the end of a full last line
  // it wrapped and grew it 16px. It sits under the ⋯ in the column that
  // button already owns; a bare one-line notice keeps it on the sentence.
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ErrorNotice } = await import("@/components/errors/ErrorNotice");
  const titled = renderToStaticMarkup(<ErrorNotice title="We could not check your organization" message="Something went wrong." />);
  const corner = titled.slice(titled.indexOf('aria-label="') > -1 ? titled.lastIndexOf('<div class="flex shrink-0 flex-col items-center">') : 0);
  expect(titled).toContain('<div class="flex shrink-0 flex-col items-center">');
  expect(corner).toContain("data-error-alchemy-menu");
  expect(titled.split("data-error-alchemy-menu=").length - 1).toBe(1);
  const bare = renderToStaticMarkup(<ErrorNotice size="compact" message="Could not save." />);
  expect(bare).toMatch(/Could not save\.(?:<!-- -->)?<span hidden="" data-error-alchemy-anchor=""><\/span><span data-error-alchemy-menu/);
});
