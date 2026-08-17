import { redirect } from "next/navigation";

/**
 * Compatibility entry for old bookmarks and settings navigation.
 *
 * The Vault is a full workspace, not an embedded settings card grid. Keep one
 * canonical surface at `/vault` so its shell, responsive behavior, and
 * security-sensitive interactions cannot drift between two presentations.
 */
export default function SecretsSettingsRedirect() {
  redirect("/vault");
}
