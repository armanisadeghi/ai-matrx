// /education/game/solo — the solo arcade (SRS-wired single-player). Server
// shell resolves an optional `?set=<id>` deep link; the heavy game surface is
// code-split behind next/dynamic({ ssr:false }) via SoloArcade.
import type { Metadata } from "next";
import { SoloArcade } from "@/features/education/engage/components/solo/SoloArcade";

export const metadata: Metadata = {
  title: "Solo Arcade — Study Games",
};

interface SoloPageProps {
  searchParams: Promise<{ set?: string }>;
}

export default async function SoloArcadePage({ searchParams }: SoloPageProps) {
  const { set } = await searchParams;
  return (
    <div className="h-full overflow-hidden">
      <SoloArcade sourceSetId={set ?? null} />
    </div>
  );
}
