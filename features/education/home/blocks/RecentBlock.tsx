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
import { ArrowRight, LayoutGrid, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import { EducationLibraryCards } from "../../library/components/EducationLibraryCards";
import { EducationLibraryRows } from "../../library/components/EducationLibraryRows";
import { educationLibraryHref } from "../../library/types";
import { educationLibraryMenuFor } from "../../library/useEducationLibraryRowActions";
import type { EducationSnapshot } from "../types";

export function RecentBlock({ snapshot }: { snapshot: EducationSnapshot }) {
  const { prefs, setView } = useListViewPrefs("education-home-recent", {
    view: "cards",
  });
  const view = prefs.view === "rows" ? "rows" : "cards";

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">
          Recently created
        </h2>
        <div className="flex items-center gap-1">
          <div className="hidden items-center rounded-md border border-border p-0.5 sm:flex">
            <Button
              type="button"
              size="icon"
              variant={view === "cards" ? "secondary" : "ghost"}
              className="h-8 w-8"
              aria-label="Show recent study items as cards"
              onClick={() => setView("cards")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={view === "rows" ? "secondary" : "ghost"}
              className="h-8 w-8"
              aria-label="Show recent study items as rows"
              onClick={() => setView("rows")}
            >
              <Rows3 className="h-4 w-4" />
            </Button>
          </div>
          <Link
            href="/education/library"
            className="inline-flex min-h-10 items-center gap-1 px-1 text-xs text-primary"
          >
            Your library ({snapshot.library.total})
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
      {view === "rows" ? (
        <EducationLibraryRows
          rows={snapshot.library.recent}
          density="comfortable"
          showShared={false}
          menuFor={educationLibraryMenuFor}
          hrefFor={educationLibraryHref}
        />
      ) : (
        <EducationLibraryCards
          rows={snapshot.library.recent}
          density="comfortable"
          showShared={false}
          menuFor={educationLibraryMenuFor}
          hrefFor={educationLibraryHref}
        />
      )}
    </section>
  );
}
