/**
 * utils/errors.ts — THE APP'S DOOR to the two halves of an error's audience.
 *
 * 🚨 THIS IS A DOOR, NOT A BODY. The bodies live in the packages and are
 * re-exported here so this repo's ~500 `@/utils/errors` importers keep their
 * import path:
 *   - `extractErrorMessage` (LOGS and the Error Inspector: every scrap of
 *     PostgREST detail) — `@ai-matrx/data/net`. The host body was deleted
 *     2026-09-11 in the byte-size/error twins collapse.
 *   - `operationFailed`, `makeAssertData`, `stripTerminalCodes`,
 *     `humanizeBackendError` (what a PERSON reads) — `@ai-matrx/kit/errors`,
 *     moved 2026-10-01 (chat-package independence P12).
 * Never re-grow a body here; a fix goes into the package and is adopted.
 * Guard: `pnpm check:package-twins`.
 *
 * Handing `error.message` straight to a user is the defect
 * `pnpm check:access-errors` counts. When the failure is a single-record READ,
 * render `<AccessGate token id error/>` instead (features/access-gate/).
 */
import { extractErrorMessage } from "@ai-matrx/data/net";
export { extractErrorMessage };
export { humanizeBackendError, makeAssertData, operationFailed, stripTerminalCodes, } from "@ai-matrx/kit/errors";
/**
 * Postgres governance guards use a machine code before a sentence deliberately
 * written for the person making the change. Preserve only the allow-listed
 * codes; every other PostgREST failure keeps the calm generic action message.
 * (Host-owned: it composes `@ai-matrx/data/net` with `@ai-matrx/kit/errors`,
 * and kit may not import data.)
 */
export declare function makeGovernedDataAsserter(action: string, governanceCode: RegExp): <T>(data: T | null, error: unknown, override?: string) => T;
