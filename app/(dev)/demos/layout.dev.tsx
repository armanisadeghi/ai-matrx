import { join } from "path";
import { scanRoutes } from "@/utils/route-discovery";
import { DemosRouteHeader } from "./DemosRouteHeader";

/**
 * One header for the complete demo tree. The filesystem scanner is also the
 * landing page's source of truth, keeping every breadcrumb menu current as
 * demos are added or moved.
 */
export default async function DemosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const routes = await scanRoutes(join(process.cwd(), "app", "(dev)", "demos"));

  return (
    <>
      <DemosRouteHeader routes={routes.sort()} />
      {children}
    </>
  );
}
