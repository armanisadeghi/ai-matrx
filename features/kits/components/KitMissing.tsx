"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { useRouter } from "next/navigation";
import { KIT_ROUTES, KIT_WORD } from "../constants";
import { ErrorNotice } from "./ErrorNotice";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/** A kit address that names no published kit — said plainly, with the way back. */
export function KitMissing({ kitKey, error, inactive }: { kitKey: string; error: string | null; inactive?: boolean }) {
  const router = useRouter();
  return (
    <>
      <PageHeader>
        <HeaderStructured back title={KIT_WORD.many} />
      </PageHeader>
      <div className="h-full overflow-y-auto bg-textured">
        <div className="mx-auto max-w-xl px-4 pt-[calc(var(--shell-header-h)+2rem)]">
          <div className="rounded-xl border border-border bg-card p-5">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <p className="mt-2 text-sm font-medium text-foreground">
              {error
                ? `This ${KIT_WORD.oneLower} could not be loaded.`
                : inactive
                  ? `This ${KIT_WORD.oneLower} is not available right now — it has been taken out of the gallery, so it cannot be installed.`
                  : `There is no published ${KIT_WORD.oneLower} called “${kitKey}”.`}
              <ErrorAlchemyMenu />
            </p>
            {inactive && (
              <p className="mt-1 text-xs text-muted-foreground">
                Anything you already installed from it keeps working and stays where it is.
              </p>
            )}
            {error && <ErrorNotice className="mt-3" title="What happened" error={error} onRetry={() => router.refresh()} />}
            <Link href={KIT_ROUTES.gallery} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" />
              All {KIT_WORD.manyLower}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
