// app/(core)/maps/[id]/page.tsx
//
// One map, open for editing. The map itself loads client-side (it is a
// per-user canvas item read straight from Supabase) behind the ONE dynamic
// front door in features/canvas/maps/MapCanvas.tsx.

import type { Metadata } from "next";
import { MapEditor } from "@/features/canvas/maps/MapEditor";

export const metadata: Metadata = {
  title: "Map",
};

export default async function MapDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MapEditor mapId={id} />;
}
