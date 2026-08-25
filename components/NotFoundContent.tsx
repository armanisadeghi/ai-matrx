"use client";

/**
 * The screen for "that page does not exist".
 *
 * WHAT THIS IS NOT. It used to be one grey line of text over a grid of ~40
 * destination tiles — every place in the product, offered at once, to someone
 * who already knows where they were trying to go. Forty doors is not a way
 * out; it is a maze with an apology on top, and it made a wrong link feel like
 * being dumped in the lobby.
 *
 * What a person needs here, in order:
 *  1. To know what happened, and to SEE the address they asked for — most 404s
 *     are a typo, a truncated paste, or an old link, and all three are obvious
 *     the moment the path is on screen.
 *  2. One step back to where they were, and one step to the front door.
 *  3. Only then, somewhere to browse — and browsing is a choice they open, not
 *     the answer shoved at them.
 *
 * Sibling surface: `features/access-gate/` handles the different question of a
 * thing that EXISTS but cannot be opened (no access, deleted, signed out).
 * That one knows which record you wanted, so it can name it and offer to ask
 * the owner. This one only knows a URL. Do not merge them — a gate that
 * guesses which case it is, is the exact defect the access gate was built to
 * end.
 */

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Compass, Home, SearchX } from "lucide-react";

import { Grid, CardProps } from "@/components/official/card-and-grid";
import { Button } from "@/components/ui/button";
import { allNavigationLinks } from "@/features/shell/navigation/navigationLinks";

interface NotFoundContentProps {
  /** Optional custom navigation items to display instead of defaults */
  customItems?: CardProps[];
  /** Message to show - defaults to minimal message */
  message?: string;
  /** Show extended navigation (all primary items) vs just dashboard items */
  extended?: boolean;
}

/** Map icon color names to CardColor types */
const colorMap: Record<string, CardProps["color"]> = {
  "#0ea5e9": "cyan",
  "#8b5cf6": "purple",
  "#d946ef": "pink",
  "#a855f7": "purple",
  "#3b82f6": "blue",
  "#f59e0b": "amber",
  "#10b981": "green",
  "#6366f1": "indigo",
  "#06b6d4": "cyan",
  "#ec4899": "pink",
  "#f97316": "orange",
  "#14b8a6": "teal",
  "#ef4444": "red",
};

/**
 * Reusable 404 Not Found content component.
 * Says what happened, offers the two steps that usually resolve it, and keeps
 * the full destination list one click away for the times they don't.
 */
export function NotFoundContent({
  customItems,
  message = "We couldn't find that page",
  extended = false,
}: NotFoundContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [browsing, setBrowsing] = useState(false);

  const getDefaultItems = (): CardProps[] => {
    const links = extended
      ? allNavigationLinks.filter((link) => link.section === "primary")
      : allNavigationLinks.filter((link) => link.dashboard === true);

    return links.map((link) => ({
      title: link.label,
      description: link.description || `Go to ${link.label}`,
      icon: link.icon as CardProps["icon"],
      color: colorMap[link.favicon?.color || "#6366f1"] || "indigo",
      path: link.href,
    }));
  };

  const items = customItems || getDefaultItems();

  return (
    <div className="min-h-dvh bg-textured flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted">
            <SearchX className="h-7 w-7 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {message}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Nothing lives at this address. It may have moved, or the link may
              be incomplete.
            </p>
            {/* The address itself is the most useful thing on this screen: a
                truncated paste or a stray character is visible instantly, and
                a person can fix their own link without asking anyone. */}
            {pathname ? (
              <p
                className="mt-3 truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground"
                title={pathname}
              >
                {pathname}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
            Go back
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard">
              <Home className="mr-1.5 h-4 w-4" aria-hidden />
              AI Matrx home
            </Link>
          </Button>
          {!browsing && items.length > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setBrowsing(true)}
              className="text-muted-foreground"
            >
              <Compass className="mr-1.5 h-4 w-4" aria-hidden />
              Browse everything
            </Button>
          ) : null}
        </div>
      </div>

      {/* Opened deliberately. THE NO-DEAD-ENDS LAW still holds — every
          destination stays reachable from here; it is simply not the first
          thing shouted at someone who already knew where they were going. */}
      {browsing && items.length > 0 ? (
        <div className="mt-10 w-full max-w-6xl">
          <Grid
            title="Where would you like to go?"
            items={items}
            columns={4}
            className="mx-auto"
          />
        </div>
      ) : null}
    </div>
  );
}
