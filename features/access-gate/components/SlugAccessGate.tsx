"use client";

/**
 * SlugAccessGate — the canonical access gate for a SLUG-addressed page.
 *
 * `<AccessGate>` is keyed on the record's uuid, but pages like `/shapes/[kind]`,
 * `/education/learn/[...slug]`, `/podcast/[slug]` and `/p/[slug]` address their
 * item by slug. When their read comes back empty they cannot know the uuid —
 * RLS hid the very row that would say it. `access_gate_resolve_slug` (signed-in
 * only, existence-level disclosure; see migrations/access_gate_slug_resolver.sql)
 * asks the platform, and a resolved slug gets the full gate.
 *
 * `tokens` is tried in order and the first that resolves wins — `/podcast/[slug]`
 * is an episode OR a show, resolved the same way the page does (episode first).
 *
 * PUBLIC, PUBLISH-FILTERED PAGES (`publishFiltered`). Those pages 404 a row the
 * viewer CAN read but that is not published — the owner opening their own draft,
 * or anyone on a public-visibility episode not yet released. Showing that person
 * a denial would be a lie, so the gate asks the platform whether the viewer can
 * read the row at all; if they can, the honest answer is "not published", said
 * plainly.
 *
 * A slug nothing resolves (or a signed-out visitor, to whom the resolver says
 * nothing) gets exactly the truth we hold — "this address doesn't match a
 * <thing> you can open" — never upgraded to "doesn't exist" or "no permission".
 * Same contract as OrganizationAccessGate, generalised.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import {
  fetchAccessDeniedContext,
  resolveAccessGateSlug,
} from "@/features/access-gate/service/accessDeniedContext";

export interface SlugAccessGateProps {
  /** Entity tokens to try, in the page's own resolution order. */
  tokens: readonly string[];
  /** The raw route slug (already decoded by the App Router). */
  slug: string;
  /** What the thing is called in the "didn't match" sentence, e.g. "shape". */
  noun: string;
  fallbackHref: string;
  fallbackLabel: string;
  /**
   * The page also filters by publication state (not just RLS), so a miss can
   * be a row the viewer may read that simply is not published.
   */
  publishFiltered?: boolean;
}

export function SlugAccessGate({
  tokens,
  slug,
  noun,
  fallbackHref,
  fallbackLabel,
  publishFiltered = false,
}: SlugAccessGateProps) {
  const tokenKey = tokens.join("|");
  const [resolved, setResolved] = useState<{
    key: string;
    token: string | null;
    id: string | null;
    /** The viewer can read the row: the page's miss was publication. */
    readable: boolean;
  } | null>(null);
  const key = `${tokenKey}::${slug}`;

  useEffect(() => {
    let active = true;
    const list = tokenKey ? tokenKey.split("|") : [];
    void (async () => {
      for (const token of list) {
        const id = slug ? await resolveAccessGateSlug(token, slug) : null;
        if (!active) return;
        if (id) {
          // `fault` lets the resolver report the viewer's real level: `ok`
          // means they can read the row, so only publication hid it.
          const readable = publishFiltered
            ? (await fetchAccessDeniedContext(token, id, "fault")).status ===
              "ok"
            : false;
          if (active) setResolved({ key, token, id, readable });
          return;
        }
      }
      if (active) setResolved({ key, token: null, id: null, readable: false });
    })();
    return () => {
      active = false;
    };
  }, [key, tokenKey, slug, publishFiltered]);

  // Still asking — render nothing rather than flash a "didn't match" claim
  // that may be about to become the full gate. Keyed so a navigation never
  // applies a stale answer to the wrong slug.
  if (!resolved || resolved.key !== key) return null;

  if (resolved.token && resolved.id && resolved.readable) {
    return (
      <Notice
        title={`This ${noun} isn't published`}
        body={`It exists and you can open it, but it has no public page until it's published.`}
        fallbackHref={fallbackHref}
        fallbackLabel={fallbackLabel}
      />
    );
  }

  if (resolved.token && resolved.id) {
    return (
      <AccessGate
        token={resolved.token}
        id={resolved.id}
        fallbackHref={fallbackHref}
        fallbackLabel={fallbackLabel}
      />
    );
  }

  return (
    <Notice
      title={`This address doesn't match a ${noun} you can open`}
      body="Check the link, or sign in with the account it was shared with."
      fallbackHref={fallbackHref}
      fallbackLabel={fallbackLabel}
    />
  );
}

function Notice({
  title,
  body,
  fallbackHref,
  fallbackLabel,
}: {
  title: string;
  body: string;
  fallbackHref: string;
  fallbackLabel: string;
}) {
  return (
    <div className="flex h-full min-h-64 w-full items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted">
            <Link2Off className="h-6 w-6 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </div>
        </div>
        <div className="mt-5">
          <Button asChild size="sm" variant="outline">
            <Link href={fallbackHref}>
              <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
              {fallbackLabel}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
