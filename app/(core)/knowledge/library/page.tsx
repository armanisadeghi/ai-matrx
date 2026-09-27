import { redirect } from "next/navigation";
import { libraryToHubHref } from "@/features/knowledge/hub/legacyRoutes";

/**
 * `/knowledge/library` (and `/rag/library`, via the `/rag/*` config redirect) —
 * the retired Sources page. Every action it offered lives in the Knowledge hub
 * (HUB-PARITY-CHECKLISTS "Sources — retired 2026-09-27, walked"); the address
 * lands on the hub's Sources view with `?show=` and the search words kept.
 */
interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RetiredSourcesPage({ searchParams }: PageProps) {
  redirect(libraryToHubHref(await searchParams));
}
