import { join } from "path";
import { scanRoutes } from "@/utils/route-discovery";
import { DemosRouteHeader } from "./DemosRouteHeader";

/**
 * One fallback header and one header-cleared content box for the complete demo
 * tree. A leaf route may replace the breadcrumb through PageHeaderPortal; it
 * must not add another header-height offset or subtract the viewport itself.
 * The filesystem scanner is also the landing page's source of truth, keeping
 * every breadcrumb menu current as demos are added or moved.
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
      <div
        className="h-full min-h-0"
        data-demo-content=""
      >
        {children}
      </div>
    </>
  );
}
