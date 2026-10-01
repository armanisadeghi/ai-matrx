"use client";

import Link from "next/link";
import { ArrowLeft, PackageX } from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { useRouter } from "next/navigation";
import { KIT_ROUTES, KIT_WORD } from "../constants";
import { ErrorNotice } from "./ErrorNotice";

/** A kit address that names no published kit — said plainly, with the way back. */
export function KitMissing({ kitKey, error, inactive }: { kitKey: string; error: string | null; inactive?: boolean }) {
  const router = useRouter();
  return (
    <>
      <PageHeader>
        <HeaderStructured back title={KIT_WORD.many} />
      </PageHeader>
      <div className="h-full overflow-y-auto bg-textured">
        <div className="mx-auto flex max-w-xl flex-col items-center px-4 pt-[calc(var(--shell-header-h)+3rem)] text-center">
          {error ? (
            <ErrorNotice className="w-full text-left" title={`This ${KIT_WORD.oneLower} could not be loaded.`} error={error} onRetry={() => router.refresh()} />
          ) : (
            <>
              <PackageX className="h-6 w-6 text-muted-foreground" />
              <p className="mt-3 text-base font-medium text-foreground">
                {inactive ? `This ${KIT_WORD.oneLower} is no longer available` : `No ${KIT_WORD.oneLower} called “${kitKey}”`}
              </p>
              {inactive && <p className="mt-1 text-sm text-muted-foreground">Existing installs keep working</p>}
            </>
          )}
          <Link href={KIT_ROUTES.gallery} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" />
            All {KIT_WORD.manyLower}
          </Link>
        </div>
      </div>
    </>
  );
}
