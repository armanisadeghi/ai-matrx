import { join } from "path";
import { scanRoutesFs } from "@/utils/route-discovery/scan-fs";
import AdminDashboardClient from "./AdminDashboardClient";

export default async function AdminPage() {
  const filesystemRoutes = (
    await scanRoutesFs(join(process.cwd(), "app", "(admin)", "administration"))
  ).sort();

  return <AdminDashboardClient filesystemRoutes={filesystemRoutes} />;
}
