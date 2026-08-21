"use client";

import Link from "next/link";
import { FilePlus2, LibraryBig } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { educationLibraryListConfig } from "../listConfig";

export function EducationLibraryPage() {
  const createButton = (
    <Button asChild size="sm" className="h-11 lg:h-7">
      <Link href="/education/start">
        <FilePlus2 className="h-4 w-4" />
        <span className="max-sm:sr-only">Create kit</span>
      </Link>
    </Button>
  );

  return (
    <div className="h-full [--shell-header-h:0px]">
      <EntityListPage
        config={educationLibraryListConfig}
        headerActions={
          <>
            <Button asChild variant="outline" size="sm" className="h-11 lg:h-7">
              <Link href="/education/library/community">
                <LibraryBig className="h-4 w-4" />
                <span className="max-sm:sr-only">Community</span>
              </Link>
            </Button>
            {createButton}
          </>
        }
        emptyAction={createButton}
      />
    </div>
  );
}
