// app/(core)/data/dashboards/page.tsx — THE MOUNT, AND NOTHING MORE. Every dashboard built from tables,
// in every organization, with Share (v7 APPS-ON-DATA item 4); the screen is `ItemsHome`.
import { createRouteMetadata } from "@/utils/route-metadata";
import { ItemsHome } from "@/features/unified-data/pages/ItemsHome";

export const metadata = createRouteMetadata("/data", {
  titlePrefix: "Dashboards",
  title: "Data",
  description: "Dashboards built from your tables.",
  letter: "DB",
});

export default function DataDashboardsRoute() {
  return <ItemsHome kind="dashboard" />;
}
