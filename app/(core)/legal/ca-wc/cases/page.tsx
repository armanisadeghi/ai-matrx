import type { Metadata } from "next";
import { CasesListClient } from "@/features/legal/wc/pd-ratings/CasesListClient";

export const metadata: Metadata = {
  title: "Saved cases · CA WC",
  description: "Your saved California Workers' Comp PD rating cases.",
};

export default function CasesPage() {
  return (
    <div className="h-dvh w-full overflow-y-auto">
      <div style={{ height: "var(--shell-header-h, 2.75rem)" }} />
      <CasesListClient />
    </div>
  );
}
