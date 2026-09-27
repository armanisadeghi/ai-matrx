"use client";

// The pricing page reads live plan data on the server; when the database does
// not answer, `loadEducationPricing` throws a named error within
// PRICING_READ_TIMEOUT_MS. This boundary says so honestly and offers a retry —
// never a blank card, never the hosting platform's timeout page.

import { RotateCw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PricingError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="matrx-touch-targets mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Pricing couldn&apos;t load right now
        </h1>
        <p className="text-sm text-muted-foreground">
          We read our plans live so the numbers here are always the real ones,
          and that read didn&apos;t answer in time. Try again in a moment.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button type="button" onClick={reset} className="gap-2">
            <RotateCw className="h-4 w-4" />
            Try again
          </Button>
          <Button asChild variant="ghost">
            <Link href="/pricing/pledge" data-tap-target>
              Read our billing pledge
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
