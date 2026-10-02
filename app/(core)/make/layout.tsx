import type { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/make", {
  title: "Make",
  description: "Make a table, form, booking page, checklist, dashboard, client portal or pick list.",
});

export default function MakeLayout({ children }: { children: ReactNode }) {
  return children;
}
