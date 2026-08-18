/**
 * Matrx Authenticator — wire types for the GA manage surface.
 *
 * 🚨 There is deliberately no `code` and no `seed` member on any shape here, and
 * there never will be (D-15). Everything is metadata.
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
