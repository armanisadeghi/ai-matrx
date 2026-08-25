"use client";

/**
 * AccessDenied — THE screen a user sees when they can't open something.
 *
 * One component covers every case, because the platform (not the surface) knows
 * which case it is: no access, deleted, never existed, signed out, or a
 * transient fault on something they CAN open. Before this existed, each surface
 * guessed, and the guess was usually wrong — the incident that produced this
 * feature told a signed-out user their data had been deleted.
 *
 * WHAT IT PROMISES
 *  - Human words only. Never a token, a uuid, an RLS error, a schema name, or a
 *    PostgREST code. The kind is a pretty label from the entity registry.
 *  - A real next step, always: request access, sign in, or a door to something
 *    the user CAN open. Never a Retry button that cannot succeed.
 *  - A LANDING, not a cul-de-sac. A surface may hand it `suggestions` — the
 *    two or three things a person in this feature actually wants when the
 *    thing they clicked isn't there ("your websites", "create one"). Without
 *    them the screen is technically honest and practically a dead end: it says
 *    what went wrong and leaves you to find your own way back.
 *  - Every identity it names is a door (THE DOOR LAW) — the owner, the
 *    organization, and the nearest reachable ancestor are all reachable.
 *
 * A feature that genuinely earns its own branded version composes the exported
 * `AccessDeniedView` at its own call site; it does not fork this file.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Lock,
  LogIn,
  RefreshCw,
  SearchX,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { RequestAccessPanel } from "@/features/access-gate/components/RequestAccessPanel";
import { useAccessGate } from "@/features/access-gate/hooks/useAccessGate";
import { useLoginHref } from "@/hooks/auth/useLoginHref";
import type { AccessDeniedContext } from "@/features/access-gate/types";

/**
 * One concrete way forward, offered by the surface that knows the feature.
 * The gate cannot invent these — only the CMS knows that "create a website" is
 * the useful thing to offer someone whose website link went nowhere.
 */
export interface AccessDeniedSuggestion {
  /** Short imperative label — "Your websites", "Create a website". */
  title: string;
  /** One line on what they will get. Optional. */
  description?: string;
  /** Where it goes. Must be a route this viewer can actually open (THE DOOR LAW). */
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface AccessDeniedProps {
  /** Canonical entity token of the thing the user tried to open. */
  token: string;
  /** Its id. */
  id: string;
  /** The original failed read, so the resolver can reconcile its capture. */
  readError?: unknown;
  /**
   * Where "go back to what I can see" should land when the platform can't find
   * a reachable ancestor — usually the feature's own list route.
   */
  fallbackHref?: string;
  fallbackLabel?: string;
  /** Retry the surface's own read, offered only where retrying can work. */
  onRetry?: () => void;
  /** Concrete next steps in THIS feature. See AccessDeniedSuggestion. */
  suggestions?: AccessDeniedSuggestion[];
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/** The full sentence: "Site · AI Matrx" or just "Site" when we may not say. */
function headline(context: AccessDeniedContext): string {
  const kind = context.entity.label.toLowerCase();
  switch (context.status) {
    case "denied":
      return `You don't have access to this ${kind}`;
    case "deleted":
      return `This ${kind} was deleted`;
    case "missing":
      return `We couldn't find this ${kind}`;
    case "anonymous":
      return `Sign in to open this ${kind}`;
    case "ok":
      return `We couldn't load this ${kind}`;
    default:
      return "Something went wrong";
  }
}

function explanation(context: AccessDeniedContext): string {
  const kind = context.entity.label.toLowerCase();
  switch (context.status) {
    case "denied": {
      const owner =
        context.organization && !context.organization.isPersonal
          ? context.organization.name
          : context.owner?.displayName;
      // Only promise the panel when it will actually render. `canRequest` is
      // false for rows with neither an owner nor an org (platform catalogs),
      // where "ask below" pointed at nothing. (Adversarial pass, 2026-08-11.)
      if (!context.canRequest && context.request?.status !== "pending") {
        return owner
          ? `It belongs to ${owner}, and there's no one for us to pass a request to.`
          : `It belongs to someone else, and there's no one for us to pass a request to.`;
      }
      return owner
        ? `It belongs to ${owner}. You can ask for access below.`
        : `It belongs to someone else. You can ask for access below.`;
    }
    case "deleted":
      return `It was removed, so there's nothing here to open.`;
    case "missing":
      return `The link may be wrong, or this ${kind} may have been permanently removed.`;
    case "anonymous":
      return `We can't tell you anything about it until we know who you are.`;
    case "ok":
      // The honest one nobody used to write: they DO have access.
      return `You do have access to it — something went wrong on our side. Try again.`;
    default:
      return `We couldn't work out what happened. Try again in a moment.`;
  }
}

function StatusIcon({ status }: { status: AccessDeniedContext["status"] }) {
  const className = "h-7 w-7 text-muted-foreground";
  if (status === "denied") return <Lock className={className} aria-hidden />;
  if (status === "deleted") return <Trash2 className={className} aria-hidden />;
  if (status === "missing")
    return <SearchX className={className} aria-hidden />;
  if (status === "anonymous")
    return <LogIn className={className} aria-hidden />;
  return <TriangleAlert className={className} aria-hidden />;
}

/**
 * One identity — owner or organization — rendered as a door when we know the
 * viewer can walk through it, and as plain text when we don't. Rendering a
 * `<Link>` to a route this viewer cannot open (or that doesn't exist) is the
 * dead end THE DOOR LAW is about; a name with no link is honest.
 */
function IdentityBlock({
  label,
  name,
  href,
  avatar,
}: {
  label: string;
  name: string;
  href: string | null;
  avatar: React.ReactNode;
}) {
  const body = (
    <>
      {avatar}
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="block truncate text-foreground">{name}</span>
      </span>
    </>
  );

  if (!href) {
    return (
      <span className="flex min-w-0 items-center gap-2 text-sm">{body}</span>
    );
  }
  return (
    <Link
      href={href}
      className="flex min-w-0 items-center gap-2 text-sm hover:underline"
    >
      {body}
    </Link>
  );
}

/**
 * The resolved surface. Split from the loader so a bespoke variant can reuse
 * the same body with different chrome.
 */
export function AccessDeniedView({
  context,
  id,
  fallbackHref,
  fallbackLabel,
  onRetry,
  onChanged,
  suggestions = [],
}: {
  context: AccessDeniedContext;
  id: string;
  fallbackHref?: string;
  fallbackLabel?: string;
  onRetry?: () => void;
  onChanged: () => void;
  suggestions?: AccessDeniedSuggestion[];
}) {
  const router = useRouter();
  const signInHref = useLoginHref();
  // A personal workspace IS its owner — naming it just repeats them back.
  const showOrg = Boolean(
    context.organization && !context.organization.isPersonal,
  );
  const ancestor = context.ancestor;
  const ancestorInfo = ancestor ? tryGetEntityInfo(ancestor.token) : null;
  const ancestorHref = ancestorInfo?.hrefFor?.(ancestor?.id ?? "") ?? null;
  const selfInfo = tryGetEntityInfo(context.entity.token);
  const selfHref = selfInfo?.hrefFor?.(id) ?? null;

  return (
    <div className="flex h-full min-h-64 w-full items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted">
            <StatusIcon status={context.status} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {headline(context)}
            </h1>

            {context.entity.title ? (
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {context.entity.label} &middot;{" "}
                <span className="text-foreground">{context.entity.title}</span>
              </p>
            ) : null}

            <p className="mt-2 text-sm text-muted-foreground">
              {explanation(context)}
            </p>
          </div>
        </div>

        {/* Who has it.
            THE DOOR LAW cuts both ways here: a link the viewer cannot open is a
            worse dead end than no link. A denied viewer is, by definition,
            usually outside the owning org — so each identity is a door only when
            we know it actually opens. */}
        {context.owner || showOrg ? (
          <div className="mt-5 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
            {context.owner ? (
              <IdentityBlock
                label="Owner"
                name={context.owner.displayName ?? "Someone else"}
                href={
                  context.owner.creatorHandle
                    ? `/c/${context.owner.creatorHandle}`
                    : null
                }
                avatar={
                  <Avatar className="h-7 w-7">
                    {context.owner.avatarUrl ? (
                      <AvatarImage
                        src={context.owner.avatarUrl}
                        alt={context.owner.displayName ?? "Owner"}
                      />
                    ) : null}
                    <AvatarFallback className="text-[11px]">
                      {initials(context.owner.displayName)}
                    </AvatarFallback>
                  </Avatar>
                }
              />
            ) : null}

            {showOrg && context.organization ? (
              <IdentityBlock
                label="Organization"
                name={context.organization.name ?? "An organization"}
                href={
                  context.organization.viewerIsMember
                    ? `/organizations/${context.organization.id}`
                    : null
                }
                avatar={
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-background">
                    <Building2
                      className="h-3.5 w-3.5 text-muted-foreground"
                      aria-hidden
                    />
                  </span>
                }
              />
            ) : null}
          </div>
        ) : null}

        {context.status === "denied" ? (
          <div className="mt-4">
            <RequestAccessPanel
              context={context}
              resourceId={id}
              href={selfHref}
              onChanged={onChanged}
            />
          </div>
        ) : null}

        {/* WHERE TO GO INSTEAD. The buttons below get you OUT; these get you
            somewhere useful. A screen that only says "back" makes the user
            re-navigate from scratch to do the thing they came to do. */}
        {suggestions.length > 0 ? (
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {suggestions.map((s) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.href + s.title}
                  href={s.href}
                  className="group flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-foreground/20 hover:bg-accent"
                >
                  {Icon ? (
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                  ) : null}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      {s.title}
                    </span>
                    {s.description ? (
                      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                        {s.description}
                      </span>
                    ) : null}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : null}

        {/* Always a real way forward. */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {context.status === "anonymous" ? (
            <Button asChild size="sm">
              <Link href={signInHref}>
                <LogIn className="mr-1.5 h-4 w-4" aria-hidden />
                Sign in
              </Link>
            </Button>
          ) : null}

          {(context.status === "ok" || context.status === "error") &&
          onRetry ? (
            <Button size="sm" onClick={onRetry}>
              <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
              Try again
            </Button>
          ) : null}

          {ancestor && ancestorHref ? (
            <Button asChild size="sm" variant="outline">
              <Link href={ancestorHref}>
                <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
                Open {ancestor.title ?? ancestor.label.toLowerCase()}
              </Link>
            </Button>
          ) : fallbackHref ? (
            <Button asChild size="sm" variant="outline">
              <Link href={fallbackHref}>
                <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
                {fallbackLabel ?? "Back to what you can see"}
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
              Go back
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The loader. Resolves why the record couldn't be opened, then renders it.
 *
 * A feature that genuinely earns a bespoke screen composes `AccessDeniedView`
 * (exported above) at its own call site — it does NOT register a variant here.
 * A token→component registry consulted during render is a dynamic component
 * boundary (react-hooks/static-components) for an extension point that has
 * exactly zero users, which is the speculative abstraction docs/reuse-first
 * bans. Passing your own component down is simpler and has no such hazard.
 */
export function AccessDenied({
  token,
  id,
  readError,
  fallbackHref,
  fallbackLabel,
  onRetry,
  suggestions,
}: AccessDeniedProps) {
  const { context, isLoading, refresh } = useAccessGate(token, id, {
    readError,
  });

  if (isLoading || !context) {
    // Deliberately quiet: this renders in a failure path that usually resolves
    // in well under a second, and a spinner-with-copy here would flash.
    return (
      <div className="flex h-full min-h-64 items-center justify-center p-6">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
      </div>
    );
  }

  return (
    <AccessDeniedView
      context={context}
      id={id}
      fallbackHref={fallbackHref}
      fallbackLabel={fallbackLabel}
      onRetry={onRetry}
      onChanged={refresh}
      suggestions={suggestions}
    />
  );
}
