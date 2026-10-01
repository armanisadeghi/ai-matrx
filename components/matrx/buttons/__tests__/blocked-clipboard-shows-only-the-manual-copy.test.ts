/**
 * A blocked clipboard shows the "Copy manually" dialog and nothing else
 * (PB-06 W-57, 2026-10-01).
 *
 * Dry run: copying an answer with clipboard permission denied opened the good
 * manual-copy dialog AND a raw developer toast — "Failed to execute 'writeText'
 * on 'Clipboard': Write permission denied." — beside it. Callers' `onError`
 * toasts ("Failed to copy") doubled it the same way.
 *
 * Break guarded: the copy primitive reporting a failure it already handed to
 * the person. The double replaces only the browser clipboard (the dependency).
 */
jest.mock("@/components/dialogs/clipboard-fallback/manualCopyOpener", () => ({
  showManualCopy: jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), info: jest.fn(), success: jest.fn() },
}));

import { copyToClipboard } from "../markdown-copy-utils";
import { showManualCopy } from "@/components/dialogs/clipboard-fallback/manualCopyOpener";
import { toast } from "@/lib/toast";

const ANSWER = "Okafor upright: crate code PX-3318, two-person carry, ground floor only.";
const DENIED = "Failed to execute 'writeText' on 'Clipboard': Write permission denied.";

function denyClipboard() {
  const denied = () => Promise.reject(new DOMException(DENIED, "NotAllowedError"));
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: jest.fn(denied), write: jest.fn(denied) },
  });
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: jest.fn(() => false),
  });
}

beforeEach(() => {
  jest.mocked(showManualCopy).mockClear();
  jest.mocked(toast.error).mockClear();
  denyClipboard();
});

describe("a blocked clipboard", () => {
  it("opens the manual copy with the answer and raises no error toast", async () => {
    const onError = jest.fn();
    expect(await copyToClipboard(ANSWER, { onError })).toBe(false);
    expect(jest.mocked(showManualCopy).mock.calls).toEqual([[{ text: ANSWER }]]);
    expect(toast.error).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("still reports a failure that never reached the manual copy", async () => {
    const onError = jest.fn();
    // A record that cannot be serialized never produces text to hand over.
    const crate: Record<string, unknown> = { code: "PX-3318" };
    crate.self = crate;
    expect(await copyToClipboard(crate, { onError })).toBe(false);
    expect(showManualCopy).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
