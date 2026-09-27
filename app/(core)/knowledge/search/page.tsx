import { redirect } from "next/navigation";
import { searchLabToHref } from "@/features/knowledge/hub/legacyRoutes";

/**
 * `/knowledge/search` (and `/rag/search`) — the retired Search Lab. A person's
 * search is the Knowledge hub's (`?q=`, `?store_id=` → within that data store);
 * the developer tabs (`?tab=agent-sim|agent-chat|diagnostics`) and the HyDE /
 * multi-query / cluster / admin-bypass switches live in the admin Search Lab.
 */
interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RetiredSearchLab({ searchParams }: PageProps) {
  redirect(searchLabToHref(await searchParams));
}
