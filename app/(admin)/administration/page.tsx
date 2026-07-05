import { join } from "path";
import { scanRoutes } from "@/utils/route-discovery";
import AdminDashboardClient from "./AdminDashboardClient";

export default async function AdminPage() {
  const filesystemRoutes = (
    await scanRoutes(join(process.cwd(), "app", "(admin)", "administration"))
  ).sort();

  return <AdminDashboardClient filesystemRoutes={filesystemRoutes} />;
}
