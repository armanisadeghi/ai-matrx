// app/(core)/o/[id]/page.tsx — ONE ADDRESS THAT OPENS ANY ID THE PLATFORM MINTS.
//
// Lane ROUTE-RESOLVER, 2026-09-23. The owner: "a more intelligent routing system that will
// always work and make it easier for all features." Every feature that mints a link — an
// agent's answer, the inbox, a notification, a digest, a hub row, a share email — writes
// `openPath(id)` (`lib/deep-link/openPath.ts`) and this page does the rest:
//
//   1. asks ONE door, `platform.resolve_id`, as the signed-in person — which answers the kind,
//      the organization the object LIVES in, and its screen, only when this person may open it
//      under that object's own read rule;
//   2. sends them to that screen with `?org=` naming the OBJECT's organization, never whichever
//      organization they happened to have selected (access is to the person);
//   3. never redirects between the older tables and the record store: an older dataset opens
//      `/data/<id>`, a record-store table opens `/data-v2/<id>`; `?side=new|old` opens one side
//      to compare, and only when that side exists.
//
// Everything else is said on this page in the door's own words: not yours (identical for an id
// that does not exist, so a link cannot be used to learn anything is there), archived, no
// screen of its own, a side that is not there, or — honestly different from all of those — the
// door could not be asked.
//
// SERVER-RENDERED because the whole job is one question and one redirect: nothing flashes, and
// no client bundle is spent on a page whose normal outcome is that you never see it.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { isOwnFallbackPath, OPEN_BY_ID_FALLBACK_KEY, openPath } from "@/lib/deep-link/openPath";
import { isResolvableId, readSide, resolveId, type ResolvedId } from "@/lib/deep-link/resolveId";
import { currentRequestLoginHref } from "@/utils/auth/server-login-href";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { createClient } from "@/utils/supabase/server";

// Who is asking decides the answer; nothing here is cacheable across people.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // The title names nothing: what a link points at is its owner's.
  title: "Opening",
  robots: { index: false, follow: false },
};

interface OpenByIdPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OpenByIdPage({ params, searchParams }: OpenByIdPageProps) {
  // Already decoded by the App Router — never decoded a second time.
  const { id } = await params;
  const query = await searchParams;
  const asked = id.trim();
  const side = readSide(query.side);

  if (!isResolvableId(asked)) {
    return (
      <OpenNotice
        title="This link does not name anything"
        body="The address ends in something that is not an id this platform makes, so there was nothing to look up. Ask whoever sent it for the link again."
        action={{ href: "/", label: "Go home" }}
      />
    );
  }

  const auth = await getServerAuth();
  if (!auth.isAuthenticated && !auth.authUnavailable) {
    // The login primitive keeps this address as the destination (utils/auth/FEATURE.md).
    redirect(await currentRequestLoginHref(openPath(asked)));
  }

  const answer = await resolveId(await createClient(), asked, side);
  // `redirect` throws by design, so it stays outside any try/catch.
  if (answer.state === "opens") redirect(answer.path);

  // AHEAD OF ITS DOOR. A release can reach people before the migration that adds
  // `platform.resolve_id`; then — and only then — the caller's own previous link opens, so a
  // screen never breaks ahead of its door. Any answer the door DOES give (not yours, archived…)
  // is never routed around this way.
  const fallback = firstValue(query[OPEN_BY_ID_FALLBACK_KEY]);
  if (answer.state === "unknown" && answer.doorAbsent && isOwnFallbackPath(fallback)) {
    redirect(fallback);
  }

  return <OpenNotice {...noticeFor(answer, asked)} />;
}

function firstValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

function noticeFor(
  answer: Exclude<ResolvedId, { state: "opens" }>,
  asked: string,
): OpenNoticeProps {
  switch (answer.state) {
    case "not_yours":
      return { title: "This link does not open for you", body: answer.says, action: { href: "/", label: "Go home" } };
    case "in_trash":
      return { title: "This was archived", body: answer.says, action: { href: "/trash", label: "Open the trash" } };
    case "no_screen":
      return { title: "This has no screen of its own", body: answer.says, action: { href: "/data-v2", label: "Your tables" } };
    case "no_such_side":
      return {
        title: "That side of the table is not there",
        body: answer.says,
        action: { href: openPath(asked), label: "Open the table" },
      };
    case "refused":
      return {
        title: "This link asks for something that cannot be opened",
        body: answer.says,
        action: { href: openPath(asked), label: "Open it without the extra part" },
      };
    case "unknown":
      return {
        title: "This link could not be opened right now",
        // Not an answer about access: the door was not reachable or said something unreadable.
        body: `We could not ask where this goes, so nothing was decided about whether you can open it. Try again in a moment. (${answer.why})`,
        action: { href: openPath(asked), label: "Try again" },
      };
  }
}

interface OpenNoticeProps {
  title: string;
  body: string;
  action: { href: string; label: string };
}

function OpenNotice({ title, body, action }: OpenNoticeProps) {
  return (
    <>
      <PageHeader>
        <HeaderStructured title="Open" />
      </PageHeader>
      <div className="h-full overflow-y-auto bg-textured p-4 pt-[calc(var(--shell-header-h)+1rem)]">
        <div className="mx-auto flex max-w-xl flex-col items-start gap-2 rounded-md border border-border bg-card p-6">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="max-w-prose text-sm text-muted-foreground">{body}</p>
          <Link
            href={action.href}
            className="mt-2 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-accent"
          >
            {action.label}
          </Link>
        </div>
      </div>
    </>
  );
}
