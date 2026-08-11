"use client";

/**
 * OrganizationAccessGate — the ONE "couldn't open this organization" surface.
 *
 * Every `/organizations/[orgId]/…` page had its own copy of the same two
 * guesses: "Organization not found" when the read came back empty, and "Access
 * denied. You must be a member." when the role did. Neither could be known —
 * under RLS both branches fire for a denied org, a deleted org, an id that
 * never existed, and an expired session alike. This routes the question to the
 * platform (`<AccessGate>`) instead, which answers it and offers the owner a
 * one-click way to say yes.
 *
 * THE SLUG CASE. `[orgId]` accepts a uuid or a slug, and the access gate is
 * keyed on the record's uuid. When the param is a slug we could not resolve, we
 * have no record to ask about — so we say exactly that ("this address doesn't
 * match an organization you can open") and stop. We do NOT upgrade it to
 * "doesn't exist" or "no permission": that is the hedge this whole feature
 * deletes.
 */

import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OrganizationAccessGateProps {
  /** The raw `[orgId]` route param — uuid or slug. */
  orgSlugOrId: string;
  /** The org's real uuid, once the resolver found it. */
  organizationId?: string | null;
  /** A genuine fault from the read, if there was one. */
  error?: unknown;
  onRetry?: () => void;
  /** Which sub-surface they were reaching for — used for the door back. */
  fallbackHref?: string;
  fallbackLabel?: string;
}

export function OrganizationAccessGate({
  orgSlugOrId,
  organizationId,
  error,
  onRetry,
  fallbackHref = "/organizations",
  fallbackLabel = "Your organizations",
}: OrganizationAccessGateProps) {
  const id =
    organizationId ?? (UUID_RE.test(orgSlugOrId) ? orgSlugOrId : null);

  if (id) {
    return (
      <AccessGate
        token="organization"
        id={id}
        error={error}
        onRetry={onRetry}
        fallbackHref={fallbackHref}
        fallbackLabel={fallbackLabel}
      />
    );
  }

  return (
    <div className="flex h-full min-h-64 w-full items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted">
            <Building2 className="h-6 w-6 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-foreground">
              This address doesn&apos;t match an organization you can open
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Organization links can use a short name, and this one didn&apos;t
              resolve for your account. Check the link, or open one of yours.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={fallbackHref}>
              <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
              {fallbackLabel}
            </Link>
          </Button>
          {onRetry ? (
            <Button size="sm" variant="ghost" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
