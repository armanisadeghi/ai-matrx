/**
 * A CLEAN THAT IS NOT COMING BACK SAYS SO, WITH ITS REMEDY (2026-10-03).
 *
 * Live: a 48-page PDF sat on "Cleaning…" for 25+ minutes on /education/start.
 * Its 48 page cleans were queued on the Batch lane (≥ the
 * content_processing.clean_batch_min_pages knob), which answers in hours and
 * carries no deadline unless batch.deadline.processing_mode is "deadline" —
 * so nothing would ever move it while the person waited. The SUT is the real
 * ProcessingLine; the stage-status read is its seam (it reports nothing done).
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { CLEAN_STALL_MS, ProcessingLine } from "./SourceCard";

jest.mock("@/features/rag/hooks/useStagesStatus", () => ({
  useStagesStatus: () => ({ status: null, reload: jest.fn() }),
}));
jest.mock("@ai-matrx/design-system", () => ({ ...jest.requireActual("@ai-matrx/design-system"), ErrorNotice: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const card = {
  id: "c1",
  status: "ready",
  draft: { kind: "files", label: "nist-sp-800-61r3.pdf", processedDocumentId: "pd-1", waitForClean: false },
} as never;
const entry = { state: "processing", state_detail: "Cleaning… using the raw text for now" } as never;

function mount(onCleanNow: jest.Mock, onWaitChange = jest.fn()) {
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  act(() =>
    createRoot(host).render(
      <ProcessingLine
        card={card}
        entry={entry}
        job={null}
        onWaitChange={onWaitChange}
        onSettled={jest.fn()}
        onCleanNow={onCleanNow}
      />,
    ),
  );
  return host;
}

beforeEach(() => jest.useFakeTimers({ now: new Date("2026-10-03T07:05:45Z") }));
afterEach(() => jest.useRealTimers());

describe("a Source stuck on Cleaning…", () => {
  it("names the wait and offers Clean now once it has stalled", () => {
    const cleanNow = jest.fn();
    const host = mount(cleanNow);
    expect(host.textContent).toMatch(/Cleaning… using the raw text/);
    expect(host.textContent).not.toMatch(/Clean now/);

    act(() => {
      jest.advanceTimersByTime(CLEAN_STALL_MS + 10_000);
    });
    expect(host.textContent).toMatch(/Cleaning queued · \d+m/);
    const button = [...host.querySelectorAll("button")].find((b) => b.textContent === "Clean now");
    expect(button).toBeDefined();
    act(() => button!.click());
    expect(cleanNow).toHaveBeenCalledWith("pd-1");
  });

  it("starts the clean the moment the person chooses to wait for it", () => {
    const cleanNow = jest.fn();
    const wait = jest.fn();
    const host = mount(cleanNow, wait);
    const box = host.querySelector('[role="checkbox"]') as HTMLElement;
    act(() => box.click());
    expect(wait).toHaveBeenCalledWith(true);
    expect(cleanNow).toHaveBeenCalledWith("pd-1");
  });
});
