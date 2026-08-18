// app/(core)/masterwork/[id]/interview/page.tsx
//
// The Scout interview as a REAL PAGE. Arman's ruling (2026-08-17): "it doesn't
// make sense that there's no URL route for it. I like routes for each
// individual thing… it needs to be /masterwork/[id]/<route>."
//
// ONE implementation: this page renders the exact same `ScoutInterviewContent`
// the "Interview me" sheet on the Rulebook page renders — chooser included.
// Deep links:
//   /masterwork/[id]/interview                     → the chooser (or straight
//                                                    into a fresh interview if
//                                                    there is no history)
//   /masterwork/[id]/interview?conversation=<id>   → resume that conversation
//   /masterwork/[id]/interview?new=1               → start a fresh interview
//   /masterwork/[id]/interview?seed=<text>         → prefill the composer (a
//                                                    gaps follow-up from the
//                                                    import/ingest lanes; the
//                                                    Expert always presses send)

"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { ScoutInterviewContent } from "@/features/masterwork/components/detail/ScoutInterviewPanel";
import { getRulebook } from "@/features/masterwork/service";
import type { Rulebook } from "@/features/masterwork/types";

export default function RulebookInterviewRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("conversation") ?? undefined;
  const startNew = searchParams.get("new") === "1";
  const seedText = searchParams.get("seed") ?? undefined;
  const userId = useAppSelector(selectUserId);

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

  const canEdit =
    rulebook !== null && userId !== null && rulebook.created_by === userId;

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
              Interview
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
        ) : !canEdit ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-muted-foreground">
              Only the Rulebook&apos;s owner can be interviewed for it — the
              rules have to come from the Expert themself.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/masterwork/${id}`}>Open the Rulebook</Link>
            </Button>
          </div>
        ) : (
          <div className="mx-auto flex h-full w-full max-w-3xl min-h-0 flex-1 flex-col overflow-hidden">
            <ScoutInterviewContent
              key={`${conversationId ?? "-"}:${startNew ? "new" : ""}`}
              rulebookId={rulebook.id}
              rulebookName={rulebook.name}
              seedText={seedText}
              initialConversationId={conversationId}
              startNew={startNew}
            />
          </div>
        )}
      </div>
    </>
  );
}
