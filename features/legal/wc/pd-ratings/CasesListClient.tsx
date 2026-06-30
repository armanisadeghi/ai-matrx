"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderOpen,
  Plus,
  Trash2,
  Loader2,
  ArrowRight,
  LogIn,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectIsAuthenticated,
  selectUserId,
} from "@/lib/redux/slices/userSlice";
import {
  useMyClaims,
  useDeleteClaim,
  type SavedClaimRow,
} from "./api/claims";

export function CasesListClient() {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const isAuthed = useAppSelector(selectIsAuthenticated);
  // Direct Supabase query, RLS-gated to the current user. Replaces the
  // old wc_user_claim_bookmarks join table entirely.
  const { data: claims, isLoading, error } = useMyClaims(userId ?? undefined);
  const deleteClaim = useDeleteClaim();

  const [confirmTarget, setConfirmTarget] = React.useState<SavedClaimRow | null>(
    null,
  );
  const [busy, setBusy] = React.useState(false);

  if (!isAuthed) {
    return (
      <CenteredCard
        icon={LogIn}
        title="Sign in to see your saved cases"
        description="Your saved cases live with your account. Sign in or create an account to start saving."
        actions={
          <Button asChild>
            <Link
              href={`/login?redirectTo=${encodeURIComponent("/legal/ca-wc/cases")}`}
            >
              Sign in
            </Link>
          </Button>
        }
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading your cases…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <CenteredCard
        icon={AlertCircle}
        title="Couldn't load your cases"
        description={(error as Error).message ?? "Try refreshing."}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-gradient-to-b from-primary/5 via-background to-background">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary mb-4">
                <FolderOpen className="h-3.5 w-3.5" />
                Your cases
              </div>
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
                Saved CA PD rating cases
              </h1>
              <p className="mt-2 max-w-2xl text-sm sm:text-base text-muted-foreground">
                Click a case to open it, or start a new rating from a blank
                workspace.
              </p>
            </div>
            <Button asChild size="sm" className="gap-1.5 shrink-0">
              <Link href="/legal/ca-wc/pd-ratings-calculator">
                <Plus className="h-3.5 w-3.5" />
                New case
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {!claims || claims.length === 0 ? (
          <EmptyCases />
        ) : (
          <ul className="space-y-2.5">
            {claims.map((c) => (
              <CaseRow
                key={c.id}
                claim={c}
                onDelete={() => setConfirmTarget(c)}
              />
            ))}
          </ul>
        )}
      </main>

      <ConfirmDialog
        open={!!confirmTarget}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmTarget(null);
        }}
        title="Delete case"
        description={
          <>
            Permanently delete{" "}
            <b>{confirmTarget?.applicant_name ?? "this case"}</b>? This removes
            the claim and all of its injuries from the database. This cannot be
            undone.
          </>
        }
        confirmLabel="Delete case"
        variant="destructive"
        busy={busy}
        onConfirm={async () => {
          if (!confirmTarget || !userId) return;
          setBusy(true);
          try {
            await deleteClaim.mutateAsync({
              userId,
              claimId: confirmTarget.id,
            });
            toast.success("Case deleted");
            setConfirmTarget(null);
          } catch (err) {
            toast.error("Couldn't delete case", {
              description: err instanceof Error ? err.message : undefined,
            });
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function CaseRow({
  claim,
  onDelete,
}: {
  claim: SavedClaimRow;
  onDelete: () => void;
}) {
  // Surface case_number when present (the FE-collected ADJ/file number);
  // otherwise fall back to the short UUID prefix the way the old bookmarks
  // row did.
  const subtitle = claim.case_number
    ? claim.case_number
    : `${claim.id.slice(0, 8)}…`;
  const stamp = claim.updated_at ?? claim.created_at;
  return (
    <li className="group rounded-xl border border-border bg-card transition-colors hover:border-primary/30">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <Link
          href={`/legal/ca-wc/pd-ratings-calculator/${claim.id}`}
          className="flex-1 min-w-0 flex items-center gap-3"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderOpen className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">
              {claim.applicant_name || "Untitled case"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground font-mono truncate">
              {subtitle} · {formatDateRelative(stamp)}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary shrink-0" />
        </Link>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
          onClick={onDelete}
          aria-label="Delete case"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

function EmptyCases() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
      <FolderOpen className="h-6 w-6 mx-auto text-muted-foreground" />
      <p className="mt-3 text-sm font-medium text-foreground">No saved cases yet</p>
      <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
        Open the PD Ratings Calculator, fill in a claim, and click "Save case"
        to see it here.
      </p>
      <Button asChild className="mt-4 gap-1.5">
        <Link href="/legal/ca-wc/pd-ratings-calculator">
          <Plus className="h-3.5 w-3.5" />
          Start a new rating
        </Link>
      </Button>
    </div>
  );
}

function CenteredCard({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-center min-h-dvh px-4">
      <div className="text-center max-w-md">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
          <Icon className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
        {actions && <div className="mt-5">{actions}</div>}
      </div>
    </div>
  );
}

function formatDateRelative(iso: string): string {
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
