import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { WeeksCalculator } from "@/features/legal/wc/pd-ratings/components/WeeksCalculator";

export const metadata: Metadata = {
  title: "Number of Weeks · CA WC utilities",
  description:
    "Calculate weeks between two dates, or determine an end date from a start date and number of weeks.",
};

export default function WeeksUtilityPage() {
  return (
    <div className="h-dvh w-full overflow-y-auto">
      <div style={{ height: "var(--shell-header-h, 2.75rem)" }} />
      <div className="min-h-dvh bg-background">
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
          <WeeksCalculator />
        </main>
      </div>
    </div>
  );
}
