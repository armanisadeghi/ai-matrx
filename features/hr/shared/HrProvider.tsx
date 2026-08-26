// features/hr/shared/HrProvider.tsx
//
// Mounts ONE employer resolution for the whole `/hr` tree. Without it every shell,
// nav item, page and panel would fire its own `hr_my_context` — and worse, they
// could briefly disagree about which employer they are showing, which in a
// single-employer module is a data-integrity problem, not a performance one.
//
// Mounted in `app/(core)/hr/layout.tsx`. Nothing else should mount it.

"use client";

import type { ReactNode } from "react";

import { HrRuntimeContext, useHrContextResolver } from "./useHrContext";

export function HrProvider({ children }: { children: ReactNode }) {
  const value = useHrContextResolver();
  return (
    <HrRuntimeContext.Provider value={value}>{children}</HrRuntimeContext.Provider>
  );
}
