import { BundlesAdminPage } from "@/features/tool-registry/bundles/components/BundlesAdminPage";

export const metadata = {
  title: "Bundles | Tool Registry | Administration",
  description:
    "Admin view of tool bundles (tl_bundle): system + personal, with member management, metadata, and one-click bundle creation (auto-creates the lister tool).",
};

export default function Page() {
  return <BundlesAdminPage />;
}
