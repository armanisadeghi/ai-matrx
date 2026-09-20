/**
 * A FAILED UPLOAD IS NOT "NOTHING ATTACHED YET" — a forcing function.
 *
 * ## What it exists to stop happening again
 *
 * `common-docs/projects/acquisition-frontier/own-files/VERIFICATION.md` §18
 * claim 1b (independent verify, 2026-09-19). A realistic 400 on a fresh
 * Rulebook upload — the matrx-files "this write carries no organization"
 * sentence — surfaced ONLY as a toast that vanished on its own timer. The
 * Resources card read "Nothing attached yet" before, during and after: an
 * upload that failed was indistinguishable from an upload nobody started.
 *
 * The association edge (`sourceLinks`) only exists for a file that LANDED, so
 * a failure needs its own row. `SourceRows` (the card's list renderer) now
 * takes a `failedUploads` prop straight off `state.cloudFiles.uploads`
 * (`UploadState[]`, filtered to this Rulebook's own `folderPath` by
 * `selectFailedUploadsForFolderPath` — see `RulebookSourcesPanel.tsx`) and
 * renders the SERVER's own sentence, a Retry, and a Dismiss for each one.
 *
 * Two breaks guarded, both proven RED before the fix existed:
 *   1. a failed upload with nothing else attached shows the server's
 *      sentence — never "Nothing attached yet";
 *   2. Retry, once it lands a file, clears the failed row (Dismiss removes
 *      it unconditionally).
 *
 * Nothing here mocks `SourceRows` itself — it is the real component,
 * rendered with a real `UploadState`-shaped entry.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { SourceRows } from "../RulebookSourcesPanel";
import type { UploadState } from "@/features/files/types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** The exact body files.matrxserver.com returned on the verified run. */
const ORG_REFUSAL =
  "matrx-files: this write carries no organization (owner=87a6e699-3622-4869-8843-d0867456c0dd). " +
  "Pass organization_id= explicitly (the file row's own column, the upload metadata, or the " +
  "request's organization), or run it inside a request context that carries one.";

function failedUpload(overrides: Partial<UploadState> = {}): UploadState {
  return {
    requestId: "req-1",
    fileName: "sop.pdf",
    fileSize: 4096,
    parentFolderId: null,
    folderPath: "Masterwork/Sources/rb-1",
    status: "error",
    bytesUploaded: 0,
    startedAt: Date.now(),
    completedAt: Date.now(),
    error: ORG_REFUSAL,
    retries: 0,
    fileId: null,
    ...overrides,
  };
}

const noop = () => undefined;

describe("SourceRows — a failed upload is a row, not a blank card", () => {
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

  it('never says "Nothing attached yet" over a failed upload — it says the server\'s sentence', () => {
    act(() => {
      root.render(
        <SourceRows
          sourceLinks={[]}
          stagedUrls={[]}
          titleFor={() => ""}
          status="ready"
          error={null}
          busyKey={null}
          canEdit
          onDetach={noop}
          onRemoveUrl={noop}
          failedUploads={[failedUpload()]}
        />,
      );
    });

    expect(container.textContent).not.toContain("Nothing attached yet");
    expect(container.textContent).toContain("sop.pdf");
    expect(container.textContent).toContain("carries no organization");
  });

  it("still says the honest empty sentence when nothing failed and nothing attached", () => {
    act(() => {
      root.render(
        <SourceRows
          sourceLinks={[]}
          stagedUrls={[]}
          titleFor={() => ""}
          status="ready"
          error={null}
          busyKey={null}
          canEdit
          onDetach={noop}
          onRemoveUrl={noop}
          failedUploads={[]}
        />,
      );
    });

    expect(container.textContent).toContain("Nothing attached yet");
  });

  it("Dismiss removes the row unconditionally", () => {
    const onDismissUpload = jest.fn();
    act(() => {
      root.render(
        <SourceRows
          sourceLinks={[]}
          stagedUrls={[]}
          titleFor={() => ""}
          status="ready"
          error={null}
          busyKey={null}
          canEdit
          onDetach={noop}
          onRemoveUrl={noop}
          failedUploads={[failedUpload()]}
          onDismissUpload={onDismissUpload}
        />,
      );
    });

    const dismissButton = container.querySelector<HTMLButtonElement>(
      'button[title="Dismiss this failed upload"]',
    );
    act(() => dismissButton?.click());
    expect(onDismissUpload).toHaveBeenCalledWith("req-1");
  });

  it("Retry hands the picked file back to the caller, keyed to the failed row", async () => {
    const onRetryUpload = jest.fn();
    const entry = failedUpload();
    act(() => {
      root.render(
        <SourceRows
          sourceLinks={[]}
          stagedUrls={[]}
          titleFor={() => ""}
          status="ready"
          error={null}
          busyKey={null}
          canEdit
          onDetach={noop}
          onRemoveUrl={noop}
          failedUploads={[entry]}
          onRetryUpload={onRetryUpload}
        />,
      );
    });

    const retryButton = Array.from(
      container.querySelectorAll("button"),
    ).find((b) => b.textContent?.includes("Retry"));
    act(() => retryButton?.click());

    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    const reselected = new File(["contents"], "sop.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [reselected],
    });
    await act(async () =>
      input?.dispatchEvent(new Event("change", { bubbles: true })),
    );

    expect(onRetryUpload).toHaveBeenCalledWith(entry, reselected);
  });

  it("a retry that lands clears the row — RulebookSourcesPanel's own contract", () => {
    // The panel dismisses the OLD failed entry once `retryFailedUpload`
    // resolves (see `RulebookSourcesPanel.tsx`), so re-rendering `SourceRows`
    // with that entry gone is what "removed" looks like from here.
    const onDismissUpload = jest.fn();
    act(() => {
      root.render(
        <SourceRows
          sourceLinks={[]}
          stagedUrls={[]}
          titleFor={() => ""}
          status="ready"
          error={null}
          busyKey={null}
          canEdit
          onDetach={noop}
          onRemoveUrl={noop}
          failedUploads={[failedUpload()]}
          onDismissUpload={onDismissUpload}
        />,
      );
    });
    expect(container.textContent).toContain("carries no organization");

    // Simulate the panel's post-success state: the failed entry is gone.
    act(() => {
      root.render(
        <SourceRows
          sourceLinks={[]}
          stagedUrls={[]}
          titleFor={() => ""}
          status="ready"
          error={null}
          busyKey={null}
          canEdit
          onDetach={noop}
          onRemoveUrl={noop}
          failedUploads={[]}
          onDismissUpload={onDismissUpload}
        />,
      );
    });

    expect(container.textContent).not.toContain("carries no organization");
    expect(container.textContent).toContain("Nothing attached yet");
  });
});
