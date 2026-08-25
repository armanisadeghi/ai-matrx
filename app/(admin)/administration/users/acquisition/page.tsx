import { Suspense } from "react";
import { UserAcquisitionTableClient } from "@/features/admin/users/components/UserAcquisitionTableClient";

export default function UserAcquisitionPage() {
  return (
    <Suspense
      fallback={
        <div className="m-4 h-96 animate-pulse rounded-md bg-muted/50" />
      }
    >
      <UserAcquisitionTableClient />
    </Suspense>
  );
}
