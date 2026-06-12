import LegalLanding from "@/features/legal/components/landing/LegalLanding";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";

export default function LegalPage() {
  return (
    <MarketingPageShell>
      <LegalLanding />
    </MarketingPageShell>
  );
}
