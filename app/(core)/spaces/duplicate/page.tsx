// /spaces/duplicate?from=<link> — the in-app landing of "Duplicate" on a published page (I4).
import { Suspense } from "react";

import { DuplicateFromWeb } from "@/features/spaces/publish/DuplicateFromWeb";

export default function DuplicateFromWebRoute() {
  return (
    <Suspense>
      <DuplicateFromWeb />
    </Suspense>
  );
}
