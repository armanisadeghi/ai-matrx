import { join } from "path";
import { permanentRedirect } from "next/navigation";
import { scanRoutes } from "@/utils/route-discovery";
import {
  adminDomainHref,
  adminNavigationRegistry,
} from "@/features/admin/constants/admin-navigation";
import AdminDashboardClient from "./AdminDashboardClient";

interface AdminPageProps {
  searchParams: Promise<{ domain?: string | string[] }>;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const domainName = (await searchParams).domain;
  if (typeof domainName === "string") {
    const legacyDomain = adminNavigationRegistry.find(
      (domain) => domain.name === domainName,
    );
    if (legacyDomain) permanentRedirect(adminDomainHref(legacyDomain));
  }

  const filesystemRoutes = (
    await scanRoutes(join(process.cwd(), "app", "(admin)", "administration"))
  ).sort();

  return <AdminDashboardClient filesystemRoutes={filesystemRoutes} />;
}
