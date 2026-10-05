"use client";

// HeaderSpecimen — a stand-in shell header band that renders a REAL page-top
// template in place (the system page, docs, demos). Same band height, same
// solid background, same 8px fade, same `.shell-header-center` container — so
// the template lays out exactly as it does in the shell. Its actions never
// leak into the real shell's ⋮ sheet (header-specimen-context.ts).
//
//   <HeaderSpecimen>
//     <RecordPageHeader backHref="/forms" parents={[…]} record={{ name: "…" }} />
//   </HeaderSpecimen>

import type { ReactNode } from "react";
import { HeaderSpecimenContext } from "@/features/shell/components/header/header-specimen-context";

export function HeaderSpecimen({ children }: { children: ReactNode }) {
  return (
    <HeaderSpecimenContext value={true}>
      <div
        data-header-specimen
        className="relative z-10 flex h-[var(--shell-header-h)] items-center bg-background"
      >
        <div className="shell-header-center">{children}</div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-full h-[var(--shell-header-fade-h)] bg-gradient-to-b from-background to-transparent"
        />
      </div>
    </HeaderSpecimenContext>
  );
}
