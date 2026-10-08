"use client";

import Link from "next/link";
import { FilePlus2, LibraryBig } from "lucide-react";
import { Button as ControlButton } from "@ai-matrx/design-system/controls";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { educationLibraryListConfig } from "../listConfig";
import { EDUCATION_LIBRARY_SURFACE } from "../librarySurface";

export function EducationLibraryPage() {
  const createButton = (
    <ControlButton variant="primary" asChild icon={<FilePlus2 className="h-4 w-4" />} collapse="container">
      <Link href="/education/kits/new">
        Create kit
      </Link>
    </ControlButton>
  );

  return (
    <div className="h-full [--shell-header-h:0px]">
      {/* Every other education tool home carries its identity through
          EducationToolHeader; the Library list rendered with no page title
          anywhere at all (page-pass 2026-09-28) — nothing in the shell
          header, nothing in the body. `EntityListPage` never renders one
          itself (see its header doctrine), so this was the missing piece. */}
      <EducationToolHeader title="Library" />
      <EntityListPage
        config={educationLibraryListConfig}
        // Agent surface `matrx-user/education-library`: what the list shows +
        // the `library_view` write (features/education/library/librarySurface.ts).
        surface={EDUCATION_LIBRARY_SURFACE}
        headerActions={
          <>
            <ControlButton variant="outline" asChild icon={<LibraryBig className="h-4 w-4" />} collapse="container">
              <Link href="/education/library/community">
                Community
              </Link>
            </ControlButton>
            {createButton}
          </>
        }
        emptyAction={createButton}
      />
    </div>
  );
}
