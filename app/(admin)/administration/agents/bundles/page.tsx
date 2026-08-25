import { Suspense } from "react";
import { BundlesAdminPage } from "@/features/tool-registry/bundles/components/BundlesAdminPage";

export const metadata = {
  title: "Bundles | Tool Registry | Administration",
  description:
    "Admin view of tool bundles (tool_bundle): system + personal, with member management, metadata, and one-click bundle creation (auto-creates the lister tool).",
};

export default function Page() {
  // `?bundle=<id>` deep link (features/tool-registry/doors.ts) is read with
  // useSearchParams, which the App Router requires under a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <BundlesAdminPage />
    </Suspense>
  );
}
