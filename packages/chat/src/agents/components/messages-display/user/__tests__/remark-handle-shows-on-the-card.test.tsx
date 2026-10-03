/**
 * @jest-environment jsdom
 *
 * Each sent remark carries the handle the server gave it (`c3`), shown subtly at
 * the end of its row so the person can refer to it the way the agent does
 * ("about c3…"). A value that is not a handle is never printed.
 *
 * Use case: a site lead commented on an answer's sentence about weighing
 * aluminum and chose SQLite for the intake log; the agent will reply to c3.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { RemarksTranscriptView } from "../RemarksTranscriptView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(payload: Record<string, unknown>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<RemarksTranscriptView payload={payload} />));
  return { container, done: () => { act(() => root.unmount()); container.remove(); } };
}

it("shows each remark's handle on its row", () => {
  const { container, done } = render({
    items: [
      { kind: "comment", quote: "Weigh every inbound load", body: "Truck scale or floor scale?", handle: "c3" },
      { kind: "choice", body: "SQLite", title: "Intake log store", handle: "c4" },
    ],
  });
  const rows = [...container.querySelectorAll("[data-remark-handle]")];
  expect(rows.map((r) => r.getAttribute("data-remark-handle"))).toEqual(["c3", "c4"]);
  expect(rows[0]!.textContent).toContain("c3");
  done();
});

it("prints nothing for a missing or malformed handle", () => {
  const { container, done } = render({
    items: [
      { kind: "comment", body: "No handle yet" },
      { kind: "comment", body: "Bad handle", handle: "c03; drop" },
    ],
  });
  expect(container.querySelectorAll("[data-remark-handle]")).toHaveLength(0);
  expect(container.textContent).not.toContain("c03");
  done();
});
