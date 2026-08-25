"use client";

// features/education/home/blocks/RecentBlock.tsx
//
// The learner's newest study material, as the SAME cards the library renders.
//
// Deliberately not a bespoke mini-list: a deck must look identical on the home
// and in the library, or the learner has to re-learn the same object twice.
// Reusing `EducationLibraryCards` also means the study numbers (size, coverage,
// accuracy, what's due) are the ones the row already carries — there is no
// second definition of "how well do I know this" anywhere on this page.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EducationLibraryCards } from "../../library/components/EducationLibraryCards";
import { educationLibraryHref } from "../../library/types";
import { educationLibraryMenuFor } from "../../library/useEducationLibraryRowActions";
import type { EducationSnapshot } from "../types";

export function RecentBlock({ snapshot }: { snapshot: EducationSnapshot }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">
          Recently created
        </h2>
        <Link
          href="/education/library"
          className="inline-flex items-center gap-1 text-xs text-primary"
        >
          Your library ({snapshot.library.total})
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <EducationLibraryCards
        rows={snapshot.library.recent}
        density="compact"
        showShared={false}
        // The library's own menu builder, so "…" offers exactly the same
        // actions here as it does on /education/library.
        menuFor={educationLibraryMenuFor}
        hrefFor={educationLibraryHref}
      />
    </section>
  );
}
