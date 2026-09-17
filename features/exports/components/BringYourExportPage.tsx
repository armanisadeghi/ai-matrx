"use client";

// features/exports/components/BringYourExportPage.tsx
//
// /exports — BRING YOUR EXPORT.
//
// The whole screen is one job: get the file somebody already downloaded from a
// service into a place where they can see what is in it. So the drop zone is
// the page, the catalogue of what we accept sits under it as the answer to the
// only question a first-time visitor has, and there is nothing else.

import PageHeader from "@/features/shell/components/header/PageHeader";
import { AdapterCatalog } from "./AdapterCatalog";
import { ExportDropZone } from "./ExportDropZone";
import { ExportsHeader } from "./ExportsHeader";

export function BringYourExportPage() {
  return (
    <>
      <PageHeader>
        <ExportsHeader />
      </PageHeader>
      {/* (core) body: fills the shell, never subtracts the header height. */}
      <div className="matrx-touch-targets h-full overflow-hidden">
        <div className="h-full overflow-y-auto overscroll-contain pb-safe">
          <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-[calc(var(--shell-header-h)+1rem)] sm:px-6">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Bring your export
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
              Every service will hand you your own data if you ask for it. Drop
              what they gave you and you will see what it is, how much of it
              there is, and what is worth keeping — in seconds.
            </p>

            <ExportDropZone className="mt-5" />

            <AdapterCatalog className="mt-8" />
          </div>
        </div>
      </div>
    </>
  );
}
