import { Suspense } from "react";
import { FunctionDepsPage } from "@/features/administration/canonicalization/components/FunctionDepsPage";

export default function CanonicalizationFunctionDepsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          Loading function dependencies…
        </div>
      }
    >
      <FunctionDepsPage />
    </Suspense>
  );
}
