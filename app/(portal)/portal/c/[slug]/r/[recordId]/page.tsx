// app/(portal)/portal/c/[slug]/r/[recordId]/page.tsx — ONE OF HER RECORDS.
//
// The fields the portal allows, with their real labels; the ones it opened for
// editing, editable in place; and, where it allows them, the conversation.
//
// 🚨 WHICH FIELDS APPEAR IS THE PORTAL'S LIST, NEVER THE DOCUMENT'S KEYS. The
// door does not delete a masked field — it returns it as a NULL key beside a
// `_hidden` block naming it and saying why — so a screen that looped over the
// document would print `internal_margin` to a customer. `features/portals/shown.ts`
// takes the portal's own `visible_fields` and nothing else. See its header.
//
// WHICH TABLE THIS RECORD IS IN is answered by asking the doors, not by guessing
// from the shape of the document: each Table the portal opens is read and the
// record is located in one of them. A record that is in none of them is not hers
// to see, and the page says exactly that.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { PortalCommentThread, type ThreadComment } from "@/features/portals/PortalCommentThread";
import { PortalFieldEditor } from "@/features/portals/PortalFieldEditor";
import { PortalSignOutButton } from "@/features/portals/PortalSignOutButton";
import {
  membershipFor,
  portalComments,
  portalMe,
  portalPublic,
  portalRecord,
  portalRecords,
  portalViewer,
  type PortalMembership,
  type PortalTable,
} from "@/features/portals/service";
import { readable, shownFields } from "@/features/portals/shown";

import { addPortalComment, savePortalField } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your record",
  robots: { index: false, follow: false },
};

export default async function PortalRecordPage({
  params,
}: {
  params: Promise<{ slug: string; recordId: string }>;
}) {
  const { slug, recordId } = await params;

  const portal = await portalPublic(slug);
  if (!portal) notFound();

  const viewer = await portalViewer();
  const membership = viewer ? membershipFor(await portalMe(), portal.slug) : null;

  // Signed out, or signed in as somebody who is not on this portal: the portal's
  // own front page says the right sentence for both, so send them there rather
  // than writing a second, quieter version of it here.
  if (!membership) {
    return (
      <Frame>
        <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-sm shadow-sm sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{portal.title}</h1>
          <p className="mt-2 text-muted-foreground">
            Sign in to see this. {portal.organization} invites each client by email address.
          </p>
          <Link
            href={`/portal/c/${encodeURIComponent(portal.slug)}`}
            className="mt-4 inline-block font-medium text-primary underline underline-offset-4"
          >
            Go to the sign-in page
          </Link>
        </section>
      </Frame>
    );
  }

  const located = await locate(membership, recordId);
  if (!located) {
    return (
      <Frame>
        <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-sm shadow-sm sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            That is not on your portal
          </h1>
          <p className="mt-2 text-muted-foreground">
            This link points at something {membership.organization} has not shared with{" "}
            {membership.client}.
          </p>
          <Link
            href={`/portal/c/${encodeURIComponent(membership.slug)}`}
            className="mt-4 inline-block font-medium text-primary underline underline-offset-4"
          >
            Back to your portal
          </Link>
        </section>
      </Frame>
    );
  }

  const { table } = located;
  const [document, fields] = await Promise.all([
    portalRecord({ organizationId: membership.organization_id, recordId }),
    shownFields(membership.organization_id, table),
  ]);
  if (!document) notFound();

  const comments: ThreadComment[] = table.comments
    ? (
        await portalComments({
          organizationId: membership.organization_id,
          recordId,
        })
      ).map((comment) => ({
        id: comment.id,
        body: comment.body,
        author:
          comment.created_by && comment.created_by === viewer?.id
            ? "You"
            : membership.organization,
        when: WHEN.format(new Date(comment.created_at)),
        mine: Boolean(comment.created_by && comment.created_by === viewer?.id),
      }))
    : [];

  const headline = fields[0] ? readable(document[fields[0].key]) : "";
  const readOnly = fields.filter((field) => !field.editable);
  const editable = fields.filter((field) => field.editable);

  return (
    <Frame align="start">
      <div className="w-full max-w-2xl">
        <header className="flex items-start justify-between gap-3 pt-1">
          <div className="min-w-0">
            <Link
              href={`/portal/c/${encodeURIComponent(membership.slug)}`}
              data-tap-target
              className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              {membership.client}
            </Link>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              {headline || table.name}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {table.name} · {membership.organization}
            </p>
          </div>
          <PortalSignOutButton slug={membership.slug} />
        </header>

        <section className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
          <dl className="divide-y divide-border">
            {readOnly.map((field) => {
              const value = readable(document[field.key]);
              return (
                <div
                  key={field.key}
                  className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4"
                >
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground sm:w-40 sm:shrink-0">
                    {field.label}
                  </dt>
                  <dd className="text-sm text-foreground">
                    {value || <span className="text-muted-foreground">Not set yet</span>}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>

        {editable.length > 0 ? (
          <section className="mt-6 space-y-5 rounded-xl border border-border bg-card p-4">
            {editable.map((field) => (
              <PortalFieldEditor
                key={field.key}
                slug={membership.slug}
                recordId={recordId}
                fieldKey={field.key}
                label={field.label}
                initialValue={readable(document[field.key])}
                save={savePortalField}
              />
            ))}
          </section>
        ) : null}

        {table.comments ? (
          <section className="mt-6 pb-12">
            <h2 className="px-1 text-sm font-semibold tracking-tight text-foreground">Messages</h2>
            <div className="mt-2">
              <PortalCommentThread
                slug={membership.slug}
                recordId={recordId}
                comments={comments}
                send={addPortalComment}
              />
            </div>
          </section>
        ) : (
          <div className="pb-12" />
        )}
      </div>
    </Frame>
  );
}

/** The same frame the portal's front page uses, for the same reasons. */
function Frame({
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

/** Which of the portal's Tables holds this record — asked, never inferred. */
async function locate(
  membership: PortalMembership,
  recordId: string,
): Promise<{ table: PortalTable } | null> {
  for (const table of membership.tables) {
    const records = await portalRecords({
      organizationId: membership.organization_id,
      tableId: table.table_id,
    });
    if (records.some((record) => record.id === recordId)) return { table };
  }
  return null;
}

/**
 * One date format, resolved on the server and sent as a string, so the server's
 * HTML and the client's never disagree about a locale or a time zone — a
 * hydration mismatch is a layout shift with extra steps.
 */
const WHEN = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});
