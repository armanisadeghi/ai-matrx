import { ModuleHeader } from "@/components/layout/new-layout/PageSpecificHeader";
import { scanRoutes, toModulePages } from "@/utils/route-discovery";

interface RouteHeaderDataProps {
  directory: string;
  moduleHome: string;
  moduleName: string;
  children: React.ReactNode;
}

export async function RouteHeaderData({
  directory,
  moduleHome,
  moduleName,
  children,
}: RouteHeaderDataProps) {
  // `/demos/**` now owns one route-tree breadcrumb in its root layout. A number
  // of older demo folders still use this helper for their index-page wrapper;
  // letting them inject their legacy module header would create a competing
  // portal and a second in-body header. Keep those layouts harmless while
  // preserving RouteHeaderData's established behavior everywhere else.
  if (directory.includes("app/(dev)/demos")) {
    return children;
  }

  const routes = await scanRoutes(directory);
  routes.sort();
  const pages = toModulePages(routes, moduleHome);

  return (
    <div className="flex flex-col h-page">
      <ModuleHeader
        pages={pages}
        currentPath=""
        moduleHome={moduleHome}
        moduleName={moduleName}
      />
      <main className="w-full h-full bg-textured">{children}</main>
    </div>
  );
}
