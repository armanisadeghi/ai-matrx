import { SocialReportsSection } from "@/features/marketing/social/components/SocialReportsSection";

/**
 * The agency-plane social roll-up: every client's tracked accounts and recent
 * outliers. The ONE cross-brand social place (it used to be a card at the foot
 * of Reports); a brand's own social work lives at /marketing/[brand]/socials.
 */
export default function MarketingSocialPage() {
  return (
    <main className="h-full overflow-y-auto bg-textured px-3 pb-6 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4">
      <div className="mx-auto w-full max-w-[1600px]">
        <SocialReportsSection />
      </div>
    </main>
  );
}
