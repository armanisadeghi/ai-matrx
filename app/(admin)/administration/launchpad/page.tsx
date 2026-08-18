import AdminLaunchpad from "@/features/admin/components/AdminLaunchpad";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Launchpad",
  title: "Administration",
  description:
    "An always-open launch surface for every AI Matrx administration destination.",
  letter: "LP",
  canonicalPath: "/administration/launchpad",
});

export default function AdminLaunchpadPage() {
  return <AdminLaunchpad />;
}
