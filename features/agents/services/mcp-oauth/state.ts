/**
 * Fail-closed OAuth state verification for external MCP callbacks.
 *
 * Both values are required: accepting a missing returned state would bypass
 * the CSRF binding established when the authorization attempt started.
 */
export function isValidOAuthState(
  expectedState: unknown,
  returnedState: string | null,
): boolean {
  return (
    typeof expectedState === "string" &&
    expectedState.length > 0 &&
    returnedState !== null &&
    returnedState === expectedState
  );
}
