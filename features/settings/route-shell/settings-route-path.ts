/** The canonical route-family boundary used by shell and route-menu code. */
export const USER_SETTINGS_PATH_PATTERN = /^\/user-settings(?:\/|$)/;

export function isUserSettingsPath(pathname: string): boolean {
  return USER_SETTINGS_PATH_PATTERN.test(pathname);
}
