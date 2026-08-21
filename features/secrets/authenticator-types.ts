/**
 * Matrx Authenticator — wire types for the GA manage surface.
 *
 * Seeds never cross this boundary. Entries are metadata; the separate code
 * response is short-lived and belongs only to the signed-in owner surface.
 */

/** One account's authenticator as the manage surface reports it. */
export interface AuthenticatorEntry {
  credential_item_id: string;
  display_name: string;
  label: string | null;
  issuer: string | null;
  digits: number;
  period: number;
  algorithm: string;
  enabled: boolean;
  login_urls: string[];
  seed_field_id: string | null;
}

export interface AuthenticatorCode {
  code: string;
  valid_for_seconds: number;
}
