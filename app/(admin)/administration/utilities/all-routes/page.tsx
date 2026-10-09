import { scanRoutes } from "@/utils/route-discovery";
import { AdminRoutesDirectory } from "@/features/admin/components/AdminRoutesDirectory";
import { StaticSurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/StaticSurfaceRuntimeProvider";
import { ADMIN_UTILITIES_SURFACE_NAME, createAdminUtilitiesScope } from "@/features/surfaces/manifests/admin-utilities.manifest";
import { appDir } from "@/utils/route-discovery/app-tree";

export default async function AllRoutesPage() {
  const routes = await scanRoutes(
    appDir("(admin)", "administration"),
  );

  const sortedRoutes = routes.sort();
  return (
    <StaticSurfaceRuntimeProvider
      surfaceName={ADMIN_UTILITIES_SURFACE_NAME}
      scope={createAdminUtilitiesScope({
        utilities_section: "all_routes",
        all_routes_list: sortedRoutes,
      })}
    >
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="mx-auto max-w-7xl px-4 py-5">
        <AdminRoutesDirectory routes={sortedRoutes} />
      </div>
    </div>
    </StaticSurfaceRuntimeProvider>
  );
}
