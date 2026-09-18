/**
 * features/files/upload/uploadDedupGuard.ts
 *
 * Root cause (`common-docs/projects/acquisition-frontier/own-files/VERIFICATION.md`
 * §12, 2026-09-18): in a 7-file pile, both zero-byte files were uploaded
 * TWICE, 18s apart, the second auto-renamed "(1)" by `uniqueName()` in
 * `features/files/redux/thunks.ts` — right after the dev server had refused
 * connections. A client-side retry of the whole `uploadFiles()` dispatch
 * after a transient failure re-sends a file whose first attempt may already
 * have landed server-side (the client only knows its OWN request failed —
 * a connection reset gives no proof the server never received the bytes).
 *
 * The obvious fix is the backend's OWN `X-Idempotency-Key` mechanism
 * (`lib/python-client.ts` already sends it, `aidream` already stores it in
 * `metadata._idempotency_key`) — but it is not the full answer here: the
 * key is only reused *within* a single `uploadFiles()` dispatch
 * (`newRequestId()` mints a fresh one per worker() call in thunks.ts), and
 * server-side `_replayable_412` in `aidream/aidream/api/routers/files/__init__.py`
 * only replays a 412 (precondition-failed) response under the key — a
 * SUCCESSFUL upload is never deduped by the server on replay. So a second,
 * independent `uploadFiles()` dispatch for the same intended file — the
 * shape a caller-level retry takes — is indistinguishable from a genuinely
 * new upload to both client and server.
 *
 * This guard closes the gap client-side, per (folder, name, size): the
 * FIRST claim for a signature performs the real network request; any
 * SECOND claim for the same signature while that request is still in
 * flight, or shortly after it landed, reuses the first attempt's outcome
 * instead of sending the bytes again. A claim that ends in failure is
 * cleared immediately, so a genuine "it never landed, please retry" case is
 * never blocked — only a request whose outcome is still pending, or already
 * known-good, is deduped.
 */

export interface DedupedUploadOutcome {
  fileId: string;
  filePath: string;
}

interface Claim {
  promise: Promise<DedupedUploadOutcome>;
  expiresAt: number;
}

/**
 * How long a landed (or in-flight) upload's signature stays claimed. Long
 * enough to cover the 18s gap actually observed between the two identical
 * uploads in the verifier's run, with wide margin for a slower connection.
 */
const CLAIM_WINDOW_MS = 3 * 60 * 1000;

const claims = new Map<string, Claim>();

/** The dedup key: same folder, same original name, same byte count. */
export function uploadDedupKey(
  folderPath: string,
  fileName: string,
  fileSize: number,
): string {
  return [folderPath, fileName, String(fileSize)].join("\\0");
}

export type UploadClaim =
  | { shared: true; promise: Promise<DedupedUploadOutcome> }
  | {
      shared: false;
      /**
       * The caller that owns this claim MUST call `settle` exactly once
       * with the real upload's outcome (or a rejected promise on failure).
       */
      settle: (outcome: Promise<DedupedUploadOutcome>) => void;
    };

/**
 * Claim a signature before starting an upload. See module doc for the
 * contract: a `shared: true` result means someone else already owns this
 * signature — await its `promise` instead of sending the file again.
 */
export function claimUpload(key: string): UploadClaim {
  const now = Date.now();
  const existing = claims.get(key);
  if (existing && existing.expiresAt > now) {
    return { shared: true, promise: existing.promise };
  }

  let settleFn!: (outcome: Promise<DedupedUploadOutcome>) => void;
  const publicPromise = new Promise<DedupedUploadOutcome>(
    (resolve, reject) => {
      settleFn = (outcome) => {
        outcome.then(
          (value) => {
            // Success stays claimed for the full window — a landed upload
            // must keep deduping late-arriving retries too.
            resolve(value);
          },
          (err) => {
            // A failed attempt must never haunt a real retry: clear the
            // slot immediately so the next claim for this signature runs
            // for real instead of replaying a failure forever.
            claims.delete(key);
            reject(err instanceof Error ? err : new Error(String(err)));
          },
        );
      };
    },
  );
  // Every claim gets a silent subscriber of its own: a claim nobody ever
  // shares (the common case — most uploads never race a retry) must not
  // trip Node's unhandled-rejection detector when it fails. This does not
  // swallow the failure for a real shared consumer — each `.then()`/`.catch()`
  // on the same promise still sees the rejection independently.
  publicPromise.catch(() => {});
  claims.set(key, { promise: publicPromise, expiresAt: now + CLAIM_WINDOW_MS });
  return { shared: false, settle: settleFn };
}

/** Test-only: clears every claim so suites don't leak state between tests. */
export function __resetUploadDedupGuardForTests(): void {
  claims.clear();
}
