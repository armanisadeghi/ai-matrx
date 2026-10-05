// app/(core)/data/pages/page.tsx — THE MOUNT, AND NOTHING MORE. Every page built from tables
// (v6 lane 11, wave D); the screen is `ItemsHome` (features/unified-data/pages).
import { createRouteMetadata } from "@/utils/route-metadata";
import { ItemsHome } from "@/features/unified-data/pages/ItemsHome";

export const metadata = createRouteMetadata("/data", {
  titlePrefix: "Pages",
  title: "Data",
  description: "Pages built from your tables.",
  letter: "PG",
});

export default function DataPagesRoute() {
  return <ItemsHome kind="page" />;
}
