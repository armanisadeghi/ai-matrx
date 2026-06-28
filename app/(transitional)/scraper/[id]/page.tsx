import { redirect } from "next/navigation";

/**
 * Legacy socket task deep-links (`/scraper/{taskId}`) are retired.
 * Scrape results live in-page via `useScraperApi`, not task ids.
 */
export default function ScraperLegacyTaskPage() {
  redirect("/scraper");
}
