"use client";

// The 404 boundary for /data/[id].
//
// It used to say "The table you're looking for doesn't exist or you don't have
// permission to view it" — a hedge written because the code genuinely could
// not tell those two apart. The access gate can: it asks the platform which of
// the four states this actually is (denied / deleted / never existed / signed
// out), names the table and its owner, and offers a one-click request when the
// answer is "someone else's".

import { useParams } from "next/navigation";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

export default function DataTableUnavailable() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";

  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <AccessGate
        token="dataset"
        id={id}
        fallbackHref="/data"
        fallbackLabel="Your tables"
      />
    </div>
  );
}
