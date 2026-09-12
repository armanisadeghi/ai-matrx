/**
 * ONE COMPLETED RUN, ONE CALLBACK (Bugbot, PR #222, 2026-09-12).
 *
 * THE DEFECT: the four ingest dialogs fired `onIngested` from an effect whose
 * deps carried the callback, and every host passes a fresh inline arrow every
 * render — so a finished run reloaded the Rulebook, and that reload re-rendered
 * the dialog, which reloaded the Rulebook again.
 *
 * ONE-LINE BUG EACH TEST CATCHES:
 *  · first  — putting the callback identity back in charge of firing;
 *  · second — keying so hard on the run that a genuinely NEW result is lost.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useRunResultOnce } from "./useRunResultOnce";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function Host({
  result,
  runId,
  onIngested,
}: {
  result: { added: number } | null;
  runId: string | null;
  onIngested: () => void;
}) {
  // EXACTLY what the dialogs do: a brand-new arrow on every single render.
  useRunResultOnce({ result, runId }, () => onIngested());
  return <span>{result ? "done" : "working"}</span>;
}

async function render(props: {
  result: { added: number } | null;
  runId: string | null;
  onIngested: () => void;
}) {
  await act(async () => {
    root.render(<Host {...props} />);
  });
}

it("tells the host once per completed run, however often it re-renders", async () => {
  const onIngested = jest.fn();
  const result = { added: 4 };

  await render({ result: null, runId: "run-1", onIngested });
  expect(onIngested).not.toHaveBeenCalled();

  await render({ result, runId: "run-1", onIngested });
  expect(onIngested).toHaveBeenCalledTimes(1);

  // The reload the callback started re-renders the dialog three more times.
  await render({ result, runId: "run-1", onIngested });
  await render({ result, runId: "run-1", onIngested });
  await render({ result, runId: "run-1", onIngested });
  expect(onIngested).toHaveBeenCalledTimes(1);
});

it("fires again for a genuinely new run, and for a new result on the same run", async () => {
  const onIngested = jest.fn();
  await render({ result: { added: 1 }, runId: "run-1", onIngested });
  await render({ result: { added: 2 }, runId: "run-2", onIngested });
  expect(onIngested).toHaveBeenCalledTimes(2);

  // A rejoin that settled a different document on the same run id still counts.
  await render({ result: { added: 3 }, runId: "run-2", onIngested });
  expect(onIngested).toHaveBeenCalledTimes(3);
});
