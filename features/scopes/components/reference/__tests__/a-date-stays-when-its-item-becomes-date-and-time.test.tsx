/**
 * THE USE CASE (lane HANDOVER, 2026-09-27). The owner of Cedar Ridge Physical Therapy applied the
 * Medical Practice template, whose Date of Birth is a text item, and typed "1984-03-12" for her
 * patient Dana Whitfield. She then made Date of Birth a Date & time item. RED before the lane: the
 * patient's page drew an empty date-and-time box (the stored "1984-03-12" is not a datetime-local
 * value) while its header said "3 of 7 context items filled".
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const UNDER_TEST = process.env.CONTEXT_VALUE_INPUT_UNDER_TEST ?? "../ContextValueInput";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ContextValueInput } = require(UNDER_TEST) as typeof import("../ContextValueInput");

it("a date-only value shows as that day in a date-and-time item", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  await act(async () => {
    root.render(<ContextValueInput kind="datetime" value="1984-03-12" onChange={() => undefined} />);
  });
  const input = host.querySelector('input[type="datetime-local"]') as HTMLInputElement | null;
  expect(input).not.toBeNull();
  expect(input!.value).toBe("1984-03-12T00:00");
  await act(async () => root.unmount());
  host.remove();
});
