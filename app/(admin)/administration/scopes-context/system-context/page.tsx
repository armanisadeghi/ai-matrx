"use client";

// System Context — Super Admin only. Thin route wrapper; the whole surface
// lives in features/admin/system-context/ (see its FEATURE.md).

import { SystemContextConsole } from "@/features/admin/system-context/SystemContextConsole";

export default function SystemContextPage() {
  return <SystemContextConsole />;
}
