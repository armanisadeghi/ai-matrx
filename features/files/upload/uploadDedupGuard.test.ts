/**
 * A RETRY MUST NEVER RESEND A FILE THAT ALREADY LANDED — a forcing function.
 *
 * `common-docs/projects/acquisition-frontier/own-files/VERIFICATION.md` §12
 * (2026-09-18): in a 7-file pile, both zero-byte files were uploaded TWICE,
 * 18s apart, the second auto-renamed "(1)" — right after the dev server had
 * refused connections. Nothing made the retry idempotent: each
 * `uploadFiles()` dispatch mints its own fresh idempotency key
 * (`newRequestId()` in `features/files/redux/thunks.ts`), and the server's
 * own `X-Idempotency-Key` replay (`aidream/aidream/api/routers/files/__init__.py`
 * `_replayable_412`) only replays a 412 — a SUCCESSFUL upload is never
 * deduped there. `uploadDedupGuard` is the client-side fallback this file's
 * own header calls for: never re-send a file whose first request may have
 * landed until its outcome is known.
 *
 * Drives the REAL `claimUpload`/`uploadDedupKey` — nothing here mocks the
 * guard under test.
 */

import {
  claimUpload,
  uploadDedupKey,
  __resetUploadDedupGuardForTests,
  type DedupedUploadOutcome,
} from "./uploadDedupGuard";

describe("uploadDedupGuard", () => {
  beforeEach(() => {
    __resetUploadDedupGuardForTests();
  });

  it("a second claim while the first is still in flight shares its outcome — never sends twice", async () => {
    const key = uploadDedupKey("Masterwork/Sources", "run1-blank-one.txt", 0);

    // Attempt 1 "owns" the signature — this is the real network request.
    const first = claimUpload(key);
    expect(first.shared).toBe(false);
    if (first.shared) throw new Error("unreachable");

    // Attempt 2 arrives before attempt 1 has settled — the shape of a
    // caller-level retry that fires while the first XHR is still pending.
    const second = claimUpload(key);
    expect(second.shared).toBe(true);

    let networkCalls = 0;
    const landed = async (): Promise<DedupedUploadOutcome> => {
      networkCalls += 1;
      return { fileId: "f-real-upload", filePath: "Masterwork/Sources/run1-blank-one.txt" };
    };

    // ← RED before the guard: with no claim, a naive retry calls the
    // network a second time and the batch ends up with two resources.
    first.settle(landed());
    if (!second.shared) throw new Error("unreachable");
    const secondOutcome = await second.promise;

    expect(networkCalls).toBe(1); // exactly one resource, not two
    expect(secondOutcome.fileId).toBe("f-real-upload");
  });

  it("a retry that arrives AFTER the first attempt already landed reuses it, not a fresh upload", async () => {
    const key = uploadDedupKey("Masterwork/Sources", "run1-blank-two.txt", 0);

    const first = claimUpload(key);
    if (first.shared) throw new Error("unreachable");
    first.settle(
      Promise.resolve({ fileId: "f-landed", filePath: "Masterwork/Sources/run1-blank-two.txt" }),
    );

    // The observed gap was 18s — simulate "well after landing" with a
    // second claim, no delay needed since the guard's window is time-based,
    // not tick-based, and a real 18s wait would be a slow test for no gain.
    const retry = claimUpload(key);
    expect(retry.shared).toBe(true); // ← RED before the guard: this was "false", a brand-new upload

    if (!retry.shared) throw new Error("unreachable");
    const outcome = await retry.promise;
    expect(outcome.fileId).toBe("f-landed");
  });

  it("a failed first attempt clears the slot — a genuine retry after real failure runs for real", async () => {
    const key = uploadDedupKey("Masterwork/Sources", "connection-reset.pdf", 4096);

    const first = claimUpload(key);
    if (first.shared) throw new Error("unreachable");
    first.settle(Promise.reject(new Error("Network error during upload")));

    // Give the guard's internal rejection handling a tick to clear the slot.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const retry = claimUpload(key);
    // A file that never landed must NOT be stuck deduped forever — the next
    // claim is a fresh owner, free to actually upload.
    expect(retry.shared).toBe(false);
  });

  it("different folders, names, or sizes never collide on the same key", () => {
    const a = uploadDedupKey("Masterwork/Sources", "page.jpg", 0);
    const b = uploadDedupKey("Masterwork/Sources", "page.jpg", 12);
    const c = uploadDedupKey("Other/Folder", "page.jpg", 0);
    const d = uploadDedupKey("Masterwork/Sources", "other.jpg", 0);
    expect(new Set([a, b, c, d]).size).toBe(4);
  });
});
