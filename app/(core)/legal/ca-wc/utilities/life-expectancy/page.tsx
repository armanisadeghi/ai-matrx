import { LifeExpectancyCalculator } from "@/features/legal/wc/pd-ratings/components/LifeExpectancyCalculator";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";

export default function LifeExpectancyUtilityPage() {
  return (
    <>
      <RecordPageHeader
        backHref="/legal/ca-wc/utilities"
        parents={[
          { label: "Legal", href: "/legal" },
          { label: "CA WC", href: "/legal/ca-wc" },
          { label: "Utilities", href: "/legal/ca-wc/utilities" },
        ]}
        record={{ name: "Life Expectancy" }}
      />
      <MarketingPageShell className="bg-background">
        <main
          className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pb-8"
          style={{ paddingTop: "calc(var(--shell-header-h) + 1.5rem)" }}
        >
          <LifeExpectancyCalculator />
        </main>
      </MarketingPageShell>
    </>
  );
}
