export function isGoogleAuthorizationActionDisabled(
  isGoogleLoaded: boolean,
  busy: string | null,
): boolean {
  return !isGoogleLoaded || busy !== null;
}
