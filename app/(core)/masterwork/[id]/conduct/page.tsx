// app/(core)/masterwork/[id]/conduct/page.tsx
//
// "Make a Masterwork" as a REAL PAGE. Every creation/working mode gets a URL
// route (Arman, 2026-08-17) — a mode that exists only as a panel state is
// unfindable and unshareable.
//
// ONE implementation: this page renders the exact same `ConductorContent` the
// panel on the Rulebook page renders — chooser included.
//
// Deep links:
//   /masterwork/[id]/conduct                    → the chooser (or straight into
//                                                 a fresh session if there is
//                                                 no history)
//   /masterwork/[id]/conduct?conversation=<id>  → resume that session
//   /masterwork/[id]/conduct?new=1              → start a fresh session

"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { ConductorContent } from "@/features/masterwork/conduct/ConductorPanel";
import { getRulebook } from "@/features/masterwork/service";
import type { Rulebook } from "@/features/masterwork/types";

export default function RulebookConductRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("conversation") ?? undefined;
  const startNew = searchParams.get("new") === "1";

  const [rulebook, setRulebook] = useState<Rulebook | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getRulebook(id)
      .then((r) => {
        if (!cancelled) setRulebook(r);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton
              href={`/masterwork/${id}`}
              ariaLabel="Back to the Rulebook"
            />
            <h1 className="ml-2 truncate text-sm font-medium text-foreground">
              Make a Masterwork
              {rulebook ? (
                <span className="ml-2 font-normal text-muted-foreground">
                  {rulebook.name}
                </span>
              ) : null}
            </h1>
          </>
        }
      />
      <div className="flex h-full flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : !rulebook ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-muted-foreground">
              This Rulebook doesn&apos;t exist, or you don&apos;t have access to
              it.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/masterwork/all">Back to Masterwork Studio</Link>
            </Button>
          </div>
        ) : (
          <div className="mx-auto flex h-full w-full max-w-3xl min-h-0 flex-1 flex-col overflow-hidden">
            <ConductorContent
              key={`${conversationId ?? "-"}:${startNew ? "new" : ""}`}
              rulebookId={rulebook.id}
              rulebookName={rulebook.name}
              initialConversationId={conversationId}
              startNew={startNew}
            />
          </div>
        )}
      </div>
    </>
  );
}
