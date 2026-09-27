/**
 * `/knowledge/ask` → the hub with Ask docked over the same filter
 * (`/knowledge?…&mode=ask`, KNOWLEDGE-HUB §5.3). Every hub filter param is kept.
 */

import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function KnowledgeAskRedirect({ searchParams }: PageProps) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    for (const one of Array.isArray(v) ? v : v === undefined ? [] : [v]) p.append(k, one);
  }
  p.set("mode", "ask");
  redirect(`/knowledge?${p.toString()}`);
}
