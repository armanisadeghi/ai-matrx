import { Suspense } from "react";
import { BrokenFunctionsPage } from "@/features/administration/canonicalization/components/BrokenFunctionsPage";

export default function CanonicalizationBrokenFunctionsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          Loading broken functions…
        </div>
      }
    >
      <BrokenFunctionsPage />
    </Suspense>
  );
}
