"use client";

/**
 * UnresolvedEntityRef — the inline sibling of `EntityRef`.
 *
 * `EntityRef` is THE DOOR LAW for a record you CAN read: name → route, new tab,
 * peek. This is the same law for the record you cannot. A list that joins to
 * another table always has rows whose embed came back null, and every one of
 * them is ambiguous for the four reasons `features/access-gate` exists to
 * disambiguate. Printing "(record unavailable)" is the surface asserting a
 * cause it never checked, offering no door and no repair.
 *
 * This renders the RESOLVED state in the cell — "No access · Steven Wax" — and
 * puts the whole explanation plus the one-click fix one click away: the owner,
 * the organization, and the canonical `RequestAccessPanel` for a denial, the
 * destination-preserving sign-in link when the session lapsed, a real Try again
 * when the caller actually HAS access and the read merely failed.
 *
 * The caller resolves the state with `useAccessStates` (one hook for the whole
 * page) and passes it down, so the row's action menu can branch on exactly the
 * same answer instead of resolving it a second time.
 */

import { useState } from "react";
import Link from "next/link";
import {
  Ban,
  HelpCircle,
  Loader2,
  LogIn,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useLoginHref } from "@/hooks/auth/useLoginHref";
import { cn } from "@/lib/utils";
import { RequestAccessPanel } from "@/features/access-gate/components/RequestAccessPanel";
import type { AccessDeniedContext } from "@/features/access-gate/types";

export interface UnresolvedEntityRefProps {
  /** The record's id — the resolver never echoes back an id the caller had. */
  id: string;
  /**
   * The resolved answer, or null while `useAccessStates` is still asking.
   * Never synthesize one: a guessed state is the defect this component fixes.
   */
  context: AccessDeniedContext | null;
  /** Re-resolve after the owner grants, so the row heals in place. */
  onChanged?: () => void;
  /**
   * The surface's own repair for a record it cannot resolve — "Remove from
   * outreach list", "Detach", "Replace". Rendered inside the popover under the
   * platform's own actions. THE DOOR LAW's third corollary: a problem you can
   * detect ships with its fix.
   */
  repairAction?: React.ReactNode;
  className?: string;
}

/** The one-line label the cell shows. Short enough for a dense table row. */
function chipLabel(context: AccessDeniedContext): string {
  const kind = context.entity.label.toLowerCase();
  switch (context.status) {
    // The state has to be readable WITHOUT opening the popover — a bare name in
    // a roster reads as an ordinary row, which is the lie all over again.
    case "denied":
      return context.entity.title
        ? `${context.entity.title} — no access`
        : `A ${kind} you can't open`;
    case "deleted":
      return context.entity.title
        ? `${context.entity.title} — deleted`
        : `Deleted ${kind}`;
    case "missing":
      return `This ${kind} no longer exists`;
    case "anonymous":
      return "Sign in to see this";
    case "ok":
      return context.entity.title ?? `This ${kind} didn't load`;
    default:
      return "Couldn't check this record";
  }
}

/** The honest sentence, in the popover. */
function explanation(context: AccessDeniedContext): string {
  const kind = context.entity.label.toLowerCase();
  switch (context.status) {
    case "denied":
      return `This ${kind} exists, but it isn't shared with you. You can ask for access — the row stays in the list either way.`;
    case "deleted":
      return `This ${kind} was moved to the trash. Whoever deleted it can restore it; until then there is nothing here to open.`;
    case "missing":
      return `There is no ${kind} with this id. The reference is stale.`;
    case "anonymous":
      return "Your session ended, so we can't tell you anything about this record. Sign in and it will load.";
    case "ok":
      return `You DO have access to this ${kind} — the read failed for some other reason. Trying again should work.`;
    default:
      return "We couldn't work out why this didn't load. That's a fault on our side, not a permission problem.";
  }
}

function StatusIcon({ status }: { status: AccessDeniedContext["status"] }) {
  const className = "h-3.5 w-3.5 shrink-0";
  switch (status) {
    case "denied":
      return <Ban className={className} aria-hidden />;
    case "deleted":
      return <Trash2 className={className} aria-hidden />;
    case "missing":
      return <HelpCircle className={className} aria-hidden />;
    case "anonymous":
      return <LogIn className={className} aria-hidden />;
    case "ok":
      return <RefreshCw className={className} aria-hidden />;
    default:
      return <TriangleAlert className={className} aria-hidden />;
  }
}

export function UnresolvedEntityRef({
  id,
  context,
  onChanged,
  repairAction,
  className,
}: UnresolvedEntityRefProps) {
  const [open, setOpen] = useState(false);
  const signInHref = useLoginHref();

  if (!context) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-sm text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Checking…
      </span>
    );
  }

  const label = chipLabel(context);
  // A denial is expected authorization, not a fault — muted. A resolver failure
  // and a stale reference are real problems and read as warnings.
  const tone =
    context.status === "error" || context.status === "missing"
      ? "text-amber-700 dark:text-amber-400"
      : "text-muted-foreground";
  const showOrg = Boolean(
    context.organization && !context.organization.isPersonal,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          // Inside a clickable row: this opens the explanation, not the record.
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex min-w-0 items-center gap-1.5 rounded-md border border-dashed border-border px-1.5 py-0.5 text-sm italic transition-colors hover:bg-muted",
            tone,
            className,
          )}
          title="Why can't I see this?"
        >
          <StatusIcon status={context.status} />
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-medium text-foreground">
          {context.entity.title ?? context.entity.label}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {explanation(context)}
        </p>

        {/* Who has it. Each identity is a door only when it actually opens —
            a denied viewer is usually outside the owning org, and a link into a
            second locked door is a worse dead end than plain text. */}
        {context.owner || showOrg ? (
          <dl className="mt-2 space-y-0.5 rounded-md bg-muted/50 px-2 py-1.5 text-xs">
            {context.owner ? (
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Owner</dt>
                <dd className="min-w-0 truncate text-foreground">
                  {context.owner.creatorHandle ? (
                    <Link
                      href={`/c/${context.owner.creatorHandle}`}
                      className="underline underline-offset-2"
                    >
                      {context.owner.displayName ?? "Someone else"}
                    </Link>
                  ) : (
                    (context.owner.displayName ?? "Someone else")
                  )}
                </dd>
              </div>
            ) : null}
            {showOrg && context.organization ? (
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Organization</dt>
                <dd className="min-w-0 truncate text-foreground">
                  {context.organization.viewerIsMember ? (
                    <Link
                      href={`/organizations/${context.organization.id}`}
                      className="underline underline-offset-2"
                    >
                      {context.organization.name ?? "An organization"}
                    </Link>
                  ) : (
                    (context.organization.name ?? "An organization")
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {context.status === "denied" ? (
          <div className="mt-2">
            <RequestAccessPanel
              context={context}
              resourceId={id}
              onChanged={() => onChanged?.()}
            />
          </div>
        ) : null}

        {context.status === "anonymous" ? (
          <Button asChild size="sm" className="mt-2 h-7 w-full text-xs">
            <Link href={signInHref}>
              <LogIn className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Sign in
            </Link>
          </Button>
        ) : null}

        {(context.status === "ok" || context.status === "error") && onChanged ? (
          <Button
            size="sm"
            className="mt-2 h-7 w-full text-xs"
            onClick={() => onChanged()}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Try again
          </Button>
        ) : null}

        {repairAction ? <div className="mt-2">{repairAction}</div> : null}
      </PopoverContent>
    </Popover>
  );
}
