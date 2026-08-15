import type { Metadata } from "next";
import AdminLaunchpad from "@/features/admin/components/AdminLaunchpad";

export const metadata: Metadata = {
  title: "Admin Launchpad | Administration",
  description:
    "An always-open launch surface for every AI Matrx administration destination.",
};

export default function AdminLaunchpadPage() {
  return <AdminLaunchpad />;
}
