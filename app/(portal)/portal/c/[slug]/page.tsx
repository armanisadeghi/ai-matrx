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
import { ChevronRight, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { PublicLinkNotice } from "@/components/public-link/PublicLinkNotice";
import {
  PortalAccentBand,
  PortalBrandHeading,
  PortalFooter,
  PortalLogo,
} from "@/features/portals/PortalBrand";
import { portalLook, type PortalLook } from "@/features/portals/look";
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
import { isHers, readable, shownFields } from "@/features/portals/shown";
import { stageLabel } from "@/features/portals/timeline";

// Who is asking decides the whole page, and her rows move.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const portal = await portalPublic(slug).catch(() => null);
  const name = portal ? portalLook(portal.style, portal.organization).name : null;
  return {
    title: portal ? `${portal.title} · ${name}` : "Client portal",
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

  // S6: WHOSE PORTAL THIS IS, before she types anything — the business's own name, logo and
  // colour, resolved by the store (the organization's brand when the portal set none).
  const look = portalLook(portal.style, portal.organization);

  const viewer = await portalViewer();
  if (!viewer) {
    return (
      <Shell look={look}>
        <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <PortalBrandHeading look={look} withWelcome={false} />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
            {portal.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {look.welcome ?? "Sign in to see your jobs and invoices."}
          </p>
          <PortalSignInForm slug={portal.slug} />
        </section>
        <PortalFooter look={look} />
      </Shell>
    );
  }

  const me = await portalMe();
  const membership = membershipFor(me, portal.slug);

  if (!membership) {
    return (
      <Shell look={look}>
        <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <PortalBrandHeading look={look} withWelcome={false} />
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

  // Her own portal carries the look it was read with (portal_me), the same answer as above.
  const her = portalLook(membership.style ?? portal.style, membership.organization);
  const forms = [...(membership.forms ?? [])].sort((a, b) => a.order - b.order);

  return (
    <Shell align="start" look={her}>
      <div className="w-full max-w-3xl">
        <header className="flex items-start justify-between gap-3 pt-2">
          <div className="flex min-w-0 items-center gap-3">
            <PortalLogo look={her} />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {her.name}
              </p>
              <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight text-foreground">
                {membership.client}
              </h1>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{membership.title}</p>
            </div>
          </div>
          <PortalSignOutButton slug={membership.slug} />
        </header>
        {her.welcome ? <p className="mt-4 px-1 text-sm text-muted-foreground">{her.welcome}</p> : null}

        <div className="mt-6 space-y-8 pb-12">
          {forms.length > 0 ? <FormsSection slug={membership.slug} forms={forms} look={her} /> : null}
          {membership.tables.map((table) => (
            <TableSection key={table.table_id} membership={membership} table={table} />
          ))}
          {membership.tables.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              {membership.organization} has not shared anything on this portal yet.
            </p>
          ) : null}
        </div>
        <PortalFooter look={her} />
      </div>
    </Shell>
  );
}

/**
 * S6: EVERY WAY SHE CAN ASK FOR SOMETHING, in the owner's order — each one opens in the portal,
 * signed in as her, and what she sends lands on her own list (`custom.portal_form_submit`).
 */
function FormsSection({
  slug,
  forms,
  look,
}: {
  slug: string;
  forms: NonNullable<PortalMembership["forms"]>;
  look: PortalLook;
}) {
  return (
    <section aria-labelledby="portal-forms-heading">
      <h2 id="portal-forms-heading" className="px-1 text-sm font-semibold tracking-tight text-foreground">
        Ask for something
      </h2>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {forms.map((form) => (
          <li key={form.form_id}>
            <Link
              href={`/portal/c/${encodeURIComponent(slug)}/f/${form.form_id}`}
              data-tap-target
              className={`flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none ${look.tintClass ?? "bg-card"}`}
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{form.label || form.title}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The page frame. Fixed dimensions, server-rendered, so the first paint is the
 * real screen at its real size — nothing here settles after hydration.
 */
function Shell({
  children,
  align = "center",
  look,
}: {
  children: React.ReactNode;
  align?: "center" | "start";
  look: PortalLook;
}) {
  return (
    <main
      className={`matrx-touch-targets flex min-h-dvh w-full flex-col items-center bg-textured px-4 pb-safe sm:px-6 ${
        align === "center" ? "justify-center py-10" : "justify-start py-6"
      }`}
    >
      <PortalAccentBand look={look} />
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
  const [fields, readable_] = await Promise.all([
    shownFields(membership.organization_id, table),
    portalRecords({ organizationId: membership.organization_id, tableId: table.table_id }),
  ]);
  const records = readable_.filter((r) => isHers(r.document, table.names_via, membership.client_record_id));

  // A relation Field holds another record's id, which is not something a person reads; the
  // headline is the first Field that holds words.
  const worded = fields.filter((f) => f.type !== "relation");
  const stageKey = table.stage?.field ?? null;

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
              // The headline is the first Field that says something for THIS record (a gate-code
              // update has no "what is wrong"), never the stage and never an empty "Untitled".
              const lead =
                worded.find((f) => f.key !== stageKey && readable(record.document[f.key])) ?? worded[0];
              const rest = worded.filter((f) => f !== lead);
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
                            const raw = record.document[field.key];
                            const value = field.key === stageKey ? stageLabel(table.stage, raw) : readable(raw);
                            if (!value) return null;
                            return field.key === (stageKey ?? rest[0]?.key) ? (
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
