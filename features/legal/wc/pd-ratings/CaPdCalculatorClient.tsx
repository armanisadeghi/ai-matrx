"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  RotateCcw,
  ShieldCheck,
  Plus,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectIsAuthenticated,
  selectUserId,
} from "@/lib/redux/slices/userSlice";
import { ClaimHeader } from "./components/workspace/ClaimHeader";
import { InjuriesList } from "./components/workspace/InjuriesList";
import { RatingBreakdownTable } from "./components/workspace/RatingBreakdownTable";
import { ResultPanel } from "./components/workspace/ResultPanel";
import { SaveCaseButton } from "./components/workspace/SaveCaseButton";
import { UtilityTeasers } from "./components/workspace/UtilityTeasers";
import { PrintCaseButton } from "./components/workspace/PrintCaseButton";
import { useClaimBookmarks } from "./api/bookmarks";
import { useImpairments, useOccupationalCodes } from "./api/hooks";
import { useRatingDraft } from "./state/useRatingDraft";
import { useLiveRating } from "./state/useLiveRating";
import { useSaveCase } from "./state/useSaveCase";
import { evaluateDraftReadiness } from "./state/buildStatelessPayload";
import type { RatingDraft } from "./state/types";

interface CaPdCalculatorClientProps {
  initialDraft?: RatingDraft;
  mode?: "draft" | "saved";
}

export function CaPdCalculatorClient({
  initialDraft,
  mode = "draft",
}: CaPdCalculatorClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAuthed = useAppSelector(selectIsAuthenticated);
  const userId = useAppSelector(selectUserId);

  const {
    draft,
    hydrated,
    updateClaim,
    addInjury,
    updateInjury,
    removeInjury,
    resetDraft,
  } = useRatingDraft({ initialDraft, persist: mode === "draft" });

  const liveRating = useLiveRating(draft);
  const { save, status: saveStatus } = useSaveCase();
  const { data: impairmentCatalog } = useImpairments();
  const { data: occupationCatalog } = useOccupationalCodes();

  const occupationLabel = React.useMemo(() => {
    const code = draft.claim.occupational_code;
    if (code == null || !occupationCatalog?.codes) return null;
    const jobs = occupationCatalog.codes[String(code)];
    if (!jobs) return null;
    const firstTitle = Object.keys(jobs)[0];
    return firstTitle ?? null;
  }, [draft.claim.occupational_code, occupationCatalog]);

  const hasContent =
    draft.claim.applicant_name !== "" ||
    draft.claim.occupational_code !== null ||
    draft.injuries.length > 0;

  const canPrint = liveRating.status === "ready" && !!liveRating.result;

  // Only fetch saved cases when relevant — authed, draft mode, and the draft is
  // empty (otherwise the user is mid-edit and the resume panel would just be
  // noise). The hook is also gated by `enabled: !!userId` internally.
  const shouldFetchBookmarks = mode === "draft" && isAuthed && !hasContent;
  const bookmarksQuery = useClaimBookmarks(
    shouldFetchBookmarks ? userId : undefined,
  );
  const bookmarks = bookmarksQuery.data ?? [];

  // Post-login auto-save trigger.
  // After redirect from /login?redirectTo=...?save=1, kick off the save flow
  // once auth is ready.
  const autoSaveTriggered = React.useRef(false);
  React.useEffect(() => {
    if (autoSaveTriggered.current) return;
    if (!hydrated) return;
    if (mode !== "draft") return;
    if (searchParams.get("save") !== "1") return;
    if (!isAuthed) return;

    const ready = evaluateDraftReadiness(draft);
    if (!ready.ready) return;

    autoSaveTriggered.current = true;
    (async () => {
      const result = await save(draft);
      if (result) {
        toast.success("Case saved", {
          description: "Your case is bookmarked and the rating is persisted.",
        });
        router.replace(`/legal/ca-wc/pd-ratings-calculator/${result.claimId}`);
      }
    })();
  }, [hydrated, isAuthed, mode, searchParams, draft, save, router]);

  const handleSaved = React.useCallback(
    (claimId: string) => {
      router.push(`/legal/ca-wc/pd-ratings-calculator/${claimId}`);
    },
    [router],
  );

  if (!hydrated) {
    return <WorkspaceSkeleton />;
  }

  const showResumePanel =
    mode === "draft" && isAuthed && !hasContent && bookmarks.length > 0;

  return (
    <>
      <PageHeader>
        <Toolbar
          mode={mode}
          isAuthed={isAuthed}
          applicantName={draft.claim.applicant_name}
          canReset={hasContent && mode === "draft"}
          onReset={resetDraft}
          rightActions={
            <>
              <PrintCaseButton
                disabled={!canPrint}
                draft={draft}
                result={liveRating.result}
                impairmentCatalog={impairmentCatalog?.impairments ?? null}
                occupationLabel={occupationLabel}
              />
              {mode === "draft" ? (
                <SaveCaseButton draft={draft} onSaved={handleSaved} />
              ) : (
                <SavedBadge status={saveStatus.kind} />
              )}
            </>
          }
        />
      </PageHeader>

      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 pb-16 space-y-4 lg:space-y-6">
        {showResumePanel && (
          <ResumeSavedCasesPanel
            bookmarks={bookmarks.slice(0, 5)}
            totalCount={bookmarks.length}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 pt-8 gap-4 lg:gap-6 items-start">
          <div className="lg:col-span-7 min-w-0">
            <ClaimHeader claim={draft.claim} onChange={updateClaim} />
          </div>

          <div className="lg:col-span-5 min-w-0">
            <div className="lg:sticky lg:top-4">
              <ResultPanel liveState={liveRating} />
            </div>
          </div>
        </div>

        <InjuriesList
          injuries={draft.injuries}
          onAdd={addInjury}
          onUpdate={updateInjury}
          onRemove={removeInjury}
          liveResult={liveRating.result}
        />

        {liveRating.result && (
          <RatingBreakdownTable
            result={liveRating.result}
            isStale={liveRating.status === "calculating"}
          />
        )}

        <UtilityTeasers />
      </main>
    </>
  );
}

function Toolbar({
  mode,
  isAuthed,
  applicantName,
  canReset,
  onReset,
  rightActions,
}: {
  mode: "draft" | "saved";
  isAuthed: boolean;
  applicantName: string;
  canReset: boolean;
  onReset: () => void;
  rightActions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between w-full h-full gap-3 px-1">
      <div className="flex items-center gap-2 min-w-0">
        <Link
          href="/legal/ca-wc"
          className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          CA WC
        </Link>
        <span className="hidden sm:inline text-muted-foreground/40">/</span>
        <span className="text-sm font-medium text-foreground whitespace-nowrap">
          PD Rating
        </span>
        <span className="hidden md:inline-flex items-center gap-1 ml-1 rounded-full border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          <ShieldCheck className="h-2.5 w-2.5" />
          CA Workers&apos; Comp
        </span>
        {mode === "draft" ? (
          <span className="hidden md:inline-flex items-center rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Draft · unsaved
          </span>
        ) : (
          <span className="hidden md:inline-flex items-center text-[10px] font-medium text-muted-foreground truncate max-w-[200px]">
            {applicantName ? `Saved · ${applicantName}` : "Saved case"}
          </span>
        )}
        <span className="hidden xl:inline ml-1 text-[11px] text-muted-foreground/80 truncate">
          AMA Guides aligned — estimates only, not legal advice.
        </span>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {isAuthed && (
          <Button asChild size="sm" variant="ghost" className="h-8 gap-1.5">
            <Link href="/legal/ca-wc/cases">
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">My cases</span>
            </Link>
          </Button>
        )}
        {canReset && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onReset}
            className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </Button>
        )}
        {rightActions}
      </div>
    </div>
  );
}

function SavedBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
      Saved · {status === "saving" ? "syncing…" : "live"}
    </span>
  );
}

function ResumeSavedCasesPanel({
  bookmarks,
  totalCount,
}: {
  bookmarks: Array<{
    claim_id: string;
    label: string | null;
    created_at: string;
  }>;
  totalCount: number;
}) {
  return (
    <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/[0.04] via-card to-secondary/[0.04] p-4 sm:p-5 shadow-sm">
      <header className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="rounded-md bg-primary/10 p-1.5 ring-1 ring-primary/15 shrink-0">
            <FolderOpen className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">
              Pick up a saved case
            </h2>
            <p className="text-xs text-muted-foreground">
              {totalCount === 1
                ? "You have one saved case."
                : `You have ${totalCount} saved cases.`}{" "}
              Pick one to resume, or start fresh below.
            </p>
          </div>
        </div>
        <Button asChild size="sm" variant="ghost" className="h-8 gap-1 text-xs">
          <Link href="/legal/ca-wc/cases">
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </header>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {bookmarks.map((bookmark) => (
          <li key={bookmark.claim_id}>
            <Link
              href={`/legal/ca-wc/pd-ratings-calculator/${bookmark.claim_id}`}
              className="group flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 transition-colors hover:border-primary/30 hover:bg-card/80"
            >
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">
                  {bookmark.label || "Untitled case"}
                </p>
                <p className="text-[10px] text-muted-foreground font-mono truncate">
                  {bookmark.claim_id.slice(0, 8)}… · saved{" "}
                  {formatRelative(bookmark.created_at)}
                </p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-0.5 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Plus className="h-3 w-3" />
        Or start a new case using the form below.
      </div>
    </section>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString();
}

function WorkspaceSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 pb-16">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          <div className="h-72 rounded-2xl bg-card border border-border animate-pulse" />
        </div>
        <div className="lg:col-span-5">
          <div className="h-72 rounded-2xl bg-card border border-border animate-pulse" />
        </div>
      </div>
      <div className="mt-6 h-48 rounded-2xl bg-card border border-border animate-pulse" />
    </div>
  );
}
