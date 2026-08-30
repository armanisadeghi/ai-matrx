import { LinkValuationWorkspace } from "@/features/marketing/link-valuation/components/LinkValuationWorkspace";

/**
 * Backlink valuation — score a candidate backlink on quality, relevance and
 * placement, and price what it is worth paying; every weight, band and dollar
 * point tunable.
 *
 * Moved from the flat `/marketing/backlink-valuation` into the site's Links &
 * Authority group. The workspace scores a CANDIDATE link rather than reading
 * this site's rows, so it takes no site binding — it sits here because that is
 * where the decision is made.
 */
export default function MarketingSeoValuationPage() {
  return (
    <div className="h-full overflow-hidden">
      <LinkValuationWorkspace />
    </div>
  );
}
