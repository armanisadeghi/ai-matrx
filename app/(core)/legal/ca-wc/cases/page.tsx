import { CasesListClient } from "@/features/legal/wc/pd-ratings/CasesListClient";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";

export default function CasesPage() {
  return (
    <MarketingPageShell className="bg-background">
      <CasesListClient />
    </MarketingPageShell>
  );
}
