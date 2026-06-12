import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LifeExpectancyCalculator } from "@/features/legal/wc/pd-ratings/components/LifeExpectancyCalculator";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";

export default function LifeExpectancyUtilityPage() {
  return (
    <MarketingPageShell className="bg-background">
      <header className="border-b border-border">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <Link
            href="/legal/ca-wc/utilities"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to utilities
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <LifeExpectancyCalculator />
      </main>
    </MarketingPageShell>
  );
}
