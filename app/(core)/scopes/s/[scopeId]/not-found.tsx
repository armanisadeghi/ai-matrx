"use client";

// The 404 boundary for /scopes/s/[scopeId]. The page calls notFound() when the
// scope row is missing or not readable; the access gate asks the platform which
// state it actually is (denied / deleted / never existed / signed out) instead
// of the bare root 404.

import { useParams } from "next/navigation";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

export default function ScopeUnavailable() {
  const params = useParams();
  const scopeId = typeof params?.scopeId === "string" ? params.scopeId : "";

  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <AccessGate
        token="scope"
        id={scopeId}
        fallbackHref="/scopes"
        fallbackLabel="Your scopes"
      />
    </div>
  );
}
