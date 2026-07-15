import { LifeExpectancyCalculator } from "@/features/legal/wc/pd-ratings/components/LifeExpectancyCalculator";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { CrumbTrailHeader } from "@/features/shell/components/header/templates/CrumbTrailHeader";

export default function LifeExpectancyUtilityPage() {
  return (
    <>
      <PageHeader>
        <CrumbTrailHeader
          backHref="/legal/ca-wc/utilities"
          trail={[
            { label: "Legal", href: "/legal" },
            { label: "CA WC", href: "/legal/ca-wc" },
            { label: "Utilities", href: "/legal/ca-wc/utilities" },
            { label: "Life Expectancy" },
          ]}
        />
      </PageHeader>
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
