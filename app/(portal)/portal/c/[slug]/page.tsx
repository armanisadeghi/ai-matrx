// app/(portal)/portal/c/[slug]/page.tsx — THE CLIENT PORTAL.
//
// A client of a business follows a link, signs in with a one-time email link,
// and sees HER jobs and HER invoices and nothing else. On a phone, first.
//
// WHY IT LIVES IN `(portal)` AND NOT IN A SHELL OF ITS OWN. That route group is
// already the platform's answer to "a signed-in person with no organization
// grants": `app/(portal)/layout.tsx` renders `<Providers>` and NOTHING else —
// no AppShell, no org switcher, no global nav, no global search. Every one of
// those would be a door that refuses the person standing here. The absence is
// the design (`features/continued-access/FEATURE.md`), and a second shell built
// beside it would be the same screen with the lesson removed.
//
// WHY THE SEGMENT IS THE STATIC `c`. `/portal/[orgId]` already exists in this
// group for the departed-member portal. A second dynamic segment beside it would
// be a routing collision; a static one cannot collide with anything, and `c` is
// for the client whose portal this is.
//
// THE THREE PEOPLE WHO CAN ARRIVE HERE, and the three different screens:
//   1. Signed out           → the sign-in panel, in the portal's own words.
//   2. Signed in, a principal → her portal.
//   3. Signed in, NOT a principal → a plain sentence and what to do about it.
//      Never a blank page, and never a 404: a 404 would tell a real client that
//      her supplier's portal does not exist, which is both false and alarming.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { PublicLinkNotice } from "@/components/public-link/PublicLinkNotice";
import { PortalSignInForm } from "@/features/portals/PortalSignInForm";
import { PortalSignOutButton } from "@/features/portals/PortalSignOutButton";
import {
  membershipFor,
  portalMe,
  portalPublic,
  portalRecords,
  portalViewer,
  type PortalMembership,
  type PortalTable,
} from "@/features/portals/service";
import { readable, shownFields } from "@/features/portals/shown";

// Who is asking decides the whole page, and her rows move.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const portal = await portalPublic(slug).catch(() => null);
  return {
    title: portal ? `${portal.title} · ${portal.organization}` : "Client portal",
    // A portal link is sent to the clients it belongs to, never found by
    // strangers searching.
    robots: { index: false, follow: false },
  };
}

export default async function ClientPortalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // ONE ANSWER TO THREE QUESTIONS: missing, closed, and "this organization has
  // not opened its external lane" are all `null`, and all 404.
  const portal = await portalPublic(slug);
  if (!portal) notFound();

  // THE STORE IS SWITCHED OFF (STORE-OFF, 2026-09-22), AND THIS WAS THE LONGEST
  // WALK INTO A WALL IN THE PRODUCT. `custom.portal_public` was the one public
  // reader that never asked the store's own switch — it asks the external LANE —
  // so a real client of a store-off organization was shown the sign-in panel,
  // typed her email, got a magic link, clicked it, came back signed in, and only
  // then met `custom.assert_store_door`'s 42501: a sentence written for the owner
  // of the store, about writes, shown to somebody's customer. Asked once, here,
  // before the panel, in the store's own words.
  // NOT inside `Shell`: the notice IS the whole screen and carries its own
  // full-height `<main>`, and a host frame either IS the chrome or has none.
  if (portal.state === "unavailable") {
    return <PublicLinkNotice title={portal.title} message={portal.message} />;
  }

  const viewer = await portalViewer();
  if (!viewer) {
    return (
      <Shell>
        <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {portal.organization}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {portal.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to see your jobs and invoices.
          </p>
          <PortalSignInForm slug={portal.slug} />
        </section>
      </Shell>
    );
  }

  const me = await portalMe();
  const membership = membershipFor(me, portal.slug);

  if (!membership) {
    return (
      <Shell>
        <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {portal.organization}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {portal.title}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This portal exists, but the account you are signed in as
            {viewer.email ? ` (${viewer.email})` : ""} is not on it. {portal.organization}{" "}
            invites each client by email address.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Sign out and open the link that was emailed to you, or ask{" "}
            {portal.organization} to invite this address.
          </p>
          <div className="mt-5">
            <PortalSignOutButton
              slug={portal.slug}
              variant="outline"
              label="Sign out and start again"
            />
          </div>
        </section>
      </Shell>
    );
  }

  return (
    <Shell align="start">
      <div className="w-full max-w-3xl">
        <header className="flex items-start justify-between gap-3 pt-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {membership.organization}
            </p>
            <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight text-foreground">
              {membership.client}
            </h1>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{membership.title}</p>
          </div>
          <PortalSignOutButton slug={membership.slug} />
        </header>

        <div className="mt-6 space-y-8 pb-12">
          {membership.tables.map((table) => (
            <TableSection key={table.table_id} membership={membership} table={table} />
          ))}
          {membership.tables.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              {membership.organization} has not shared anything on this portal yet.
            </p>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}

/**
 * The page frame. Fixed dimensions, server-rendered, so the first paint is the
 * real screen at its real size — nothing here settles after hydration.
 */
function Shell({
  children,
  align = "center",
}: {
  children: React.ReactNode;
  align?: "center" | "start";
}) {
  return (
    <main
      className={`matrx-touch-targets flex min-h-dvh w-full flex-col items-center bg-textured px-4 pb-safe sm:px-6 ${
        align === "center" ? "justify-center py-10" : "justify-start py-6"
      }`}
    >
      {children}
    </main>
  );
}

/** One Table: its name, how many of her rows are in it, and the rows. */
async function TableSection({
  membership,
  table,
}: {
  membership: PortalMembership;
  table: PortalTable;
}) {
  const [fields, records] = await Promise.all([
    shownFields(membership.organization_id, table),
    portalRecords({ organizationId: membership.organization_id, tableId: table.table_id }),
  ]);

  const lead = fields[0];
  const rest = fields.slice(1);

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{table.name}</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{records.length}</span>
      </div>

      <div className="mt-2 overflow-hidden rounded-xl border border-border bg-card">
        {records.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No {table.name.toLowerCase()} yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {records.map((record) => {
              const headline = lead ? readable(record.document[lead.key]) : "";
              return (
                <li key={record.id}>
                  <Link
                    href={`/portal/c/${encodeURIComponent(membership.slug)}/r/${record.id}`}
                    data-tap-target
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {headline || `Untitled ${table.name.toLowerCase()}`}
                      </p>
                      {rest.length > 0 ? (
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          {rest.map((field) => {
                            const value = readable(record.document[field.key]);
                            if (!value) return null;
                            return field.key === rest[0]?.key ? (
                              <Badge
                                key={field.key}
                                variant="secondary"
                                className="rounded-full px-2 py-0 text-[11px] font-medium"
                              >
                                {value}
                              </Badge>
                            ) : (
                              <span key={field.key} className="truncate">
                                {field.label}: {value}
                              </span>
                            );
                          })}
                        </p>
                      ) : null}
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
