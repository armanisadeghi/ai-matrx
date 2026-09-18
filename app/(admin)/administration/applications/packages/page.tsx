import { PackagesCatalogClient } from "@/features/admin/applications/packages/components/PackagesCatalogClient";
import { loadNpmPackageCatalog } from "@/features/admin/applications/packages/npmRegistry";

export default async function ApplicationsPackagesPage() {
  let rows: Awaited<ReturnType<typeof loadNpmPackageCatalog>> = [];
  let errorMessage: string | null = null;
  try {
    rows = await loadNpmPackageCatalog();
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Unknown registry error";
  }
  return <PackagesCatalogClient rows={rows} error={errorMessage} />;
}
