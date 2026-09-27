/**
 * Every new account is provisioned onto Premium at no charge by
 * `zzz_on_auth_user_created_prelaunch_plan`. Keep this client-safe so the
 * public pricing UI does not import the server-only database loader.
 * Update this with the signup trigger when the prelaunch offer ends.
 */
export const PRELAUNCH_COMPLIMENTARY_PREMIUM = true;
