import { permanentRedirect } from "next/navigation";

/**
 * LEGACY: the flat cross-brand site portfolio.
 *
 * The agency plane has no site list of its own any more — a website belongs to
 * a client, so the roster is the door and each brand carries its own Websites
 * section (`/marketing/[brandKey]/websites`).
 */
export default function LegacyMarketingSitesRedirect() {
  permanentRedirect("/marketing/brands");
}
