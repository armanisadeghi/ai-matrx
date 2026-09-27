/**
 * THE USE CASE (lane HANDOVER, 2026-09-27): a patient's Date of Birth "1984-03-12", typed while the
 * item was text, then drawn by the Date & time input the item was changed to. RED before the lane:
 * the box drew empty (datetime-local refuses a date-only value).
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const UNDER_TEST = process.env.SCALAR_INPUT_UNDER_TEST ?? "../ScalarVariableInput";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ScalarVariableInput = (require(UNDER_TEST) as { default: typeof import("../ScalarVariableInput").default }).default;

it("a date-only value shows as that day at midnight", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () =>
    root.render(<ScalarVariableInput kind="datetime" value="1984-03-12" onChange={() => undefined} variableName="Date of Birth" />),
  );
  expect((host.querySelector('input[type="datetime-local"]') as HTMLInputElement).value).toBe("1984-03-12T00:00");
  await act(async () => root.unmount());
});
