// app/(core)/libraries/page.tsx
//
// The retired Libraries list (KNOWLEDGE-HUB §6, H6b; HUB-PARITY-CHECKLISTS
// "Libraries — retired"). Finding and creating Libraries is the Knowledge
// hub's Libraries group now — the paste box, the four lanes, the source-type
// filter the Acquisition console links with, the Rulebook handoff — so this
// address lands there with every filter kept. Each Library's own page,
// /libraries/<id>, stays its record page.

import { redirect } from "next/navigation";
import { librariesToHubHref } from "@/features/knowledge/hub/legacyRoutes";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RetiredLibrariesPage({ searchParams }: PageProps) {
  redirect(librariesToHubHref(await searchParams));
}
