import { Suspense } from "react";
import { FindingsPage } from "@/features/administration/canonicalization/components/FindingsPage";

export default function CanonicalizationFindingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          Loading findings…
        </div>
      }
    >
      <FindingsPage />
    </Suspense>
  );
}
