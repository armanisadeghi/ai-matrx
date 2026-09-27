"use client";

// The pricing page reads live plan data on the server; when the database does
// not answer, `loadEducationPricing` throws a named error within
// PRICING_READ_TIMEOUT_MS. The canonical boundary shows it with a retry —
// never a blank card, never the hosting platform's timeout page.

import { ErrorBoundaryView } from "@/components/errors/ErrorBoundaryView";

const ROUTE_CONTEXT = "Pricing";

export default function PricingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorBoundaryView error={error} reset={reset} context={ROUTE_CONTEXT} />
  );
}
