import type { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/crm", {
  title: "CRM",
  description:
    "Manage people and companies, including contact details, affiliations, activity, notes, and files.",
  letter: "C",
});

export default function CrmLayout({ children }: { children: ReactNode }) {
  return children;
}
