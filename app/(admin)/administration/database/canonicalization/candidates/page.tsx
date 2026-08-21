import { Suspense } from "react";
import { CandidatesPage } from "@/features/administration/canonicalization/components/CandidatesPage";

export default function CanonicalizationCandidatesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          Loading candidates…
        </div>
      }
    >
      <CandidatesPage />
    </Suspense>
  );
}
