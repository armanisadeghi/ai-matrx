// features/continued-access/ContinuedAccessPortal.tsx
//
// The departed-member portal surface (platform primitive `continued-access`, Arman 2026-08-29).
//
// 🚨 THIS IS THE ORGANIZATION'S OFFERING, NOT A PERSONAL SPACE. Everything here is scoped to the
// former EMPLOYER's organization: the employer decides whether the portal exists, which aspects
// of it are on, and when access ends. So the organization is NAMED on every screen — a person
// must never be left wondering whose portal they are standing in.
//
// 🚨 A REFUSAL IS A SENTENCE, NEVER AN EMPTY PAGE. There are four ways this portal can decline
// to help (no relationship, the org offers no portal, the window closed, access was withdrawn)
// and each one is a different thing to say. A former employee who lands here after being asked
// for an income verification and finds a blank screen has been failed twice.

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Clock, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLoginHref } from "@/hooks/auth/useLoginHref";
import {
  fetchContinuedAccessPortal,
  type ContinuedAccessOrganization,
} from "@/features/continued-access/service";
import { PORTAL_FEATURES } from "@/features/continued-access/portalFeatures";

function onDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * The one place a non-`departed` state becomes words. Each sentence names the organization,
 * because "your access ended" is unanswerable without knowing whose.
 */
function stateSentence(org: ContinuedAccessOrganization): string | null {
  switch (org.state) {
    case "departed":
      return null;
    case "portal_off":
      return `${org.organization_name} does not offer a portal to people who have left, so there is nothing for you to do here.`;
    case "access_expired":
      return `Your access to the ${org.organization_name} portal ended on ${onDate(org.access_cutoff_at)}.`;
    case "access_revoked":
      return `Your access to the ${org.organization_name} portal has been withdrawn by ${org.organization_name}.`;
    default:
      return `The ${org.organization_name} portal is not available to you.`;
  }
}

function OrganizationPanel({ org }: { org: ContinuedAccessOrganization }) {
  const refusal = stateSentence(org);

  // Only the aspects the organization switched on, in the order the door listed them.
  const features = org.features
    .map((key) => PORTAL_FEATURES[key])
    .filter((f): f is (typeof PORTAL_FEATURES)[string] => Boolean(f));

  return (
    <section className="rounded-lg border border-border bg-card text-card-foreground shadow-sm">
      <header className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">{org.organization_name}</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          You left on {onDate(org.departed_at)}.{" "}
          {org.state === "departed" &&
            (org.access_cutoff_at
              ? `Your access to this portal ends on ${onDate(org.access_cutoff_at)}.`
              : "Your access to this portal does not expire.")}
        </p>
      </header>

      <div className="px-5 py-4">
        {refusal ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{refusal}</span>
          </p>
        ) : features.length === 0 ? (
          // The org has the portal ON but has switched every aspect OFF. Say so plainly rather
          // than rendering an empty shell that reads as a broken page.
          <p className="text-sm text-muted-foreground">
            {org.organization_name} has not switched on anything for people who have left yet.
            There is nothing for you to do here right now.
          </p>
        ) : (
          <div className="space-y-8">
            {features.map((feature) => (
              <div key={feature.key}>
                <div className="mb-2 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <h3 className="font-medium">{feature.title}</h3>
                </div>
                <p className="mb-4 text-sm text-muted-foreground">{feature.blurb}</p>
                {feature.render()}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function ContinuedAccessPortal({ organizationId }: { organizationId?: string }) {
  const loginHref = useLoginHref();
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "signed_out"; message: string }
    | { status: "error"; message: string }
    | { status: "ready"; organizations: ContinuedAccessOrganization[] }
  >({ status: "loading" });

  const load = useCallback(async () => {
    const result = await fetchContinuedAccessPortal(organizationId);
    if (result.ok) {
      setState({ status: "ready", organizations: result.organizations });
    } else if (result.reason === "no_authenticated_caller") {
      setState({ status: "signed_out", message: result.message });
    } else {
      setState({ status: "error", message: result.message });
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Your portal</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This is what organizations you used to be part of still make available to you.
      </p>

      <div className="mt-8 space-y-6">
        {state.status === "loading" && (
          <p className="text-sm text-muted-foreground">Loading your portal…</p>
        )}

        {state.status === "signed_out" && (
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="text-sm">{state.message}</p>
            <Button asChild className="mt-4">
              <Link href={loginHref}>Sign in</Link>
            </Button>
          </div>
        )}

        {state.status === "error" && (
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="text-sm">{state.message}</p>
            <Button variant="outline" className="mt-4" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}

        {state.status === "ready" && state.organizations.length === 0 && (
          // 🚨 NOT A BLANK PAGE. Someone who followed a link here and has no portal at all needs
          // to be told that, in words, or they will keep clicking the link.
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              You do not have a portal with any organization. If you were expecting one, the
              organization you used to work with has not switched it on.
            </p>
          </div>
        )}

        {state.status === "ready" &&
          state.organizations.map((org) => (
            <OrganizationPanel key={org.organization_id} org={org} />
          ))}
      </div>
    </main>
  );
}
