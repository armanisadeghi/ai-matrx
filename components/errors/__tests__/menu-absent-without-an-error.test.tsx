/**
 * @jest-environment jsdom
 */
/**
 * THE MENU NEVER SHOWS WITHOUT AN ERROR (page-pass 2026-09-27). A bare
 * `<ErrorAlchemyMenu />` outside any error box, or one handed `error={null}`,
 * offered "Error for AI" over nothing.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(node: React.ReactNode): Promise<HTMLDivElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  return host;
}

const menuIn = (host: Element) => host.querySelector("[data-error-alchemy-menu]");

it("is absent outside any error box", async () => {
  const host = await mount(<div className="flex gap-2"><span>Invoices</span><ErrorAlchemyMenu /></div>);
  expect(menuIn(host)).toBeNull();
});

it("is absent when handed error={null}", async () => {
  const host = await mount(<div role="alert"><p>Nothing failed</p><ErrorAlchemyMenu error={null} /></div>);
  expect(menuIn(host)).toBeNull();
});

it("shows inside an error box", async () => {
  const host = await mount(<div role="alert"><p>Could not save the invoice.</p><ErrorAlchemyMenu /></div>);
  expect(menuIn(host)).not.toBeNull();
});

it("shows on a destructive line", async () => {
  const host = await mount(<p className="text-sm text-destructive">Could not save.<ErrorAlchemyMenu /></p>);
  expect(menuIn(host)).not.toBeNull();
});

it("shows when handed an error", async () => {
  const host = await mount(<div><ErrorAlchemyMenu error={new Error("timeout")} /></div>);
  expect(menuIn(host)).not.toBeNull();
});
