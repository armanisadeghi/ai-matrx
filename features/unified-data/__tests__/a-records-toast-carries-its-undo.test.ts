/**
 * records-ui hands its host an Undo with a sentence (a table archived from its settings, DATA-V2-BASICS-2):
 * the app's toast carries that one button, and a sentence without one stays a plain toast.
 */
const success = jest.fn();
jest.mock("@/lib/toast", () => ({ toast: { success: (...a: unknown[]) => success(...a), error: jest.fn() } }));

import { RECORDS_NOTIFY } from "../recordsNotify";

it("puts the package's Undo on the toast", () => {
  const run = jest.fn();
  RECORDS_NOTIFY.success("“Appointments” is archived. You can restore it from Trash.", { label: "Undo", run });
  const [message, options] = success.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }];
  expect(message).toMatch(/is archived/);
  expect(options.action.label).toBe("Undo");
  options.action.onClick();
  expect(run).toHaveBeenCalledTimes(1);
  RECORDS_NOTIFY.success("Saved.");
  expect(success.mock.calls[1]).toEqual(["Saved."]);
});
