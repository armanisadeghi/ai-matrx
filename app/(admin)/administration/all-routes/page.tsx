import { join } from "path";
import { scanRoutes } from "@/utils/route-discovery";
import { AdminRoutesDirectory } from "@/features/admin/components/AdminRoutesDirectory";

export default async function AllRoutesPage() {
  const routes = await scanRoutes(
    join(process.cwd(), "app", "(admin)", "administration"),
  );

  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="mx-auto max-w-7xl px-4 py-5">
        <AdminRoutesDirectory routes={routes.sort()} />
      </div>
    </div>
  );
}
