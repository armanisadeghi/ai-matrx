import type { Metadata } from "next";
import PicklistLanding from "@/features/udt-picklist/PicklistLanding";

export const metadata: Metadata = {
  title: "Picklists",
  description:
    "Create and manage reusable option sets (udt_picklists) for dropdowns, dependent pickers, and forms.",
};

export default function PicklistsLandingPage() {
  return (
    <div className="h-dvh w-full overflow-y-auto bg-textured">
      <div style={{ height: "var(--shell-header-h, 2.75rem)" }} />
      <PicklistLanding />
    </div>
  );
}
