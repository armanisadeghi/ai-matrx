// HR & Employment Law › Jurisdiction rules (SPEC-UI-IA §3.12 route 85).
//
// The platform rule library. ?rule=<id> deep-links a single rule (the
// compliance exception queues link in this way), so the client reads
// searchParams and needs a Suspense boundary.

import { Suspense } from "react";

import { JurisdictionRulesLibraryClient } from "@/features/admin/hr/jurisdiction-rules/components/JurisdictionRulesLibraryClient";

export default function JurisdictionRulesPage() {
  return (
    <Suspense fallback={null}>
      <JurisdictionRulesLibraryClient />
    </Suspense>
  );
}
