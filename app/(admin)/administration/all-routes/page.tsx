import { join } from "path";
import { List } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

export default async function AllRoutesPage() {
  return (
    <RouteIndexPage
      directory={join(process.cwd(), "app", "(admin)", "administration")}
      basePath="/administration"
      title="All Administration Routes"
      description="Auto-generated index of every page under /administration"
      icon={List}
    />
  );
}
