/**
 * A RESERVED SLOT HYDRATES WITHOUT A MISMATCH (REVIEW-FIX 4, 2026-10-06 review): the inline script
 * reserves the remembered size on the server's HTML before React hydrates, and the client then
 * rendered `style={undefined}` — React logged "A tree hydrated but some attributes of the server
 * rendered HTML didn't match" on every entity-list load. The REAL slot component is rendered on the
 * server, its own script is run against that HTML, and the page is hydrated: no hydration error.
 * Break: drop `suppressHydrationWarning` from the slot div → red.
 */
import * as React from "react";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

import { ReservedSlot } from "../components/ReservedSlot";
import { reserveSlotScript } from "../components/useReservedSlot";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Page({ style }: { style: React.CSSProperties | undefined }) {
  return (
    <div>
      <ReservedSlot slotRef={() => {}} style={style} surfaceKey="data-home" name="tabs" reserve className="flex" data-slot="" />
      <span>search</span>
    </div>
  );
}

it("the slot the pre-hydration script reserved hydrates with no attribute mismatch", async () => {
  window.localStorage.setItem("matrx:list-slot-size:data-home:tabs", JSON.stringify({ w: 278, h: 31 }));
  const container = document.createElement("div");
  container.innerHTML = renderToString(<Page style={undefined} />);
  document.body.appendChild(container);
  // The browser runs the inline script while parsing: the slot holds the reservation before React.
  const script = container.querySelector("script") as HTMLScriptElement;
  new Function("document", reserveSlotScript("data-home", "tabs"))({ currentScript: script });
  const slot = container.querySelector("[data-slot]") as HTMLElement;
  expect(slot.style.minWidth).toBe("278px");

  const errors: string[] = [];
  const spy = jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => errors.push(args.map(String).join(" ")));
  let root: ReturnType<typeof hydrateRoot> | null = null;
  await act(async () => {
    // The client's first render: the hook has not read storage yet, so no style.
    root = hydrateRoot(container, <Page style={undefined} />, { onRecoverableError: (e) => errors.push(String(e)) });
  });
  spy.mockRestore();
  expect(errors.filter((e) => /hydrat|did(n't| not) match/i.test(e))).toEqual([]);
  await act(async () => root?.unmount());
});
