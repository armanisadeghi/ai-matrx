import { ExposureAuditClient } from "@/features/admin/relationships/components/ExposureAuditClient";

export const metadata = {
  title: "Exposure Audit | Matrx Admin",
};

export default function ExposureAuditPage() {
  return (
    <div className="h-full overflow-hidden p-4">
      <Suspense
        fallback={
          <div className="p-4 text-sm text-muted-foreground">
            Loading exposure audit…
          </div>
        }
      >
        <ExposureAuditClient />
      </Suspense>
    </div>
  );
}
import { Suspense } from "react";
