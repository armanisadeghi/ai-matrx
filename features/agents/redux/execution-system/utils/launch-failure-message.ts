/**
 * The human sentence behind a rejected agent launch.
 *
 * 🚨 WHY THIS EXISTS: `launchAgentExecution` is a `createAsyncThunk`, and RTK's
 * `.unwrap()` rethrows the SERIALIZED error — a plain `{name, message, stack}`
 * object, NOT an `Error` instance. Every call site written as
 *
 *     catch (err) { toast.error(err instanceof Error ? err.message : "…") }
 *
 * therefore takes the fallback branch and throws our own written-for-humans
 * refusal away. Found live 2026-08-22: launching the endowment analyst with no
 * organization selected showed "The endowment analysis failed to start" and the
 * scraper tabs showed "Failed", while the launch had refused with the exact
 * instruction the person needed — "Select an organization before sending this
 * message. The request was not sent."
 *
 * The launch path's refusals (`requireExecutionOrganizationId`, the mandate
 * contract assertions, the mutually-exclusive-selector guards) are sentences we
 * wrote FOR the user, so passing them through is the honest thing. Anything
 * without a usable message falls back to the caller's own words.
 */
export function launchFailureMessage(err: unknown, fallback: string): string {
  if (typeof err === "string" && err.trim()) return err;
  if (err instanceof Error && err.message.trim()) return err.message;
  if (err && typeof err === "object") {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}
