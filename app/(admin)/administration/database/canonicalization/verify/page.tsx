import { Suspense } from "react";
import { VerifyCanonicalPanel } from "@/features/administration/canonicalization/components/VerifyCanonicalPanel";

export default function CanonicalizationVerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          Loading verify…
        </div>
      }
    >
      <VerifyCanonicalPanel />
    </Suspense>
  );
}
