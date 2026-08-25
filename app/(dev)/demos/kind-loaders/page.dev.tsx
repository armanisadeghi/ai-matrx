// /demos/kind-loaders — the loading library in both phases, plus what the
// REAL registered kinds resolve to. Server-loads live `kind_definition` rows
// so section 2 is never invented data.

import type { Metadata } from "next";
import KindLoaderGallery from "./KindLoaderGallery";
import { loadRealKinds } from "./real-kinds";

export const metadata: Metadata = {
  title: "Kind Loading Library",
  description:
    "Every loading silhouette in placeholder and loading phases, plus the silhouette each real kind resolves to.",
};

export default async function KindLoadersDemoPage() {
  const { rows, error } = await loadRealKinds();
  return <KindLoaderGallery realKinds={rows} loadError={error} />;
}
