"use client";

// `[[Page]]` / `[[Page|alias]]` / `![[Page]]` — a link to a REAL record.
// (States: resolving · found · missing (Create) · unavailable — see wikilink-resolver.ts.)
//
// Resolution goes through the platform's one cross-entity search (lazy —
// wikilink-resolver.ts). States, each honest:
//   resolving → the name, dotted underline, not yet a link
//   found     → a real link to the record's page (registry route)
//   missing   → the name with a dashed underline; the name itself is the
//               button that makes a note with that name (then links to it)
//   error     → the name, with the reason on hover
// Never an href that goes nowhere.

import { useContext, useEffect, useState, type ReactNode } from "react";
import { ReactReduxContext } from "react-redux";
import { Link2Off } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { WikiResolution } from "./wikilink-resolver";

type Resolver = typeof import("./wikilink-resolver");
let resolverModule: Promise<Resolver> | null = null;
function loadResolver(): Promise<Resolver> {
  resolverModule ??= import("./wikilink-resolver");
  return resolverModule;
}

export function useWikiResolution(target: string): WikiResolution | null {
  const [state, setState] = useState<{ target: string; value: WikiResolution } | null>(null);
  useEffect(() => {
    let live = true;
    loadResolver()
      .then((m) => m.resolveWikiTarget(target))
      .then((value) => {
        if (live) setState({ target, value });
      })
      .catch((err: unknown) => {
        if (live) {
          setState({
            target,
            value: { status: "unavailable", title: target, message: err instanceof Error ? err.message : String(err) },
          });
        }
      });
    return () => {
      live = false;
    };
  }, [target]);
  return state && state.target === target ? state.value : null;
}

/** The active organization, read without subscribing (null outside a Redux tree). */
function useReadOrgId(): () => string | null {
  const ctx = useContext(ReactReduxContext);
  return () => {
    const state = ctx?.store?.getState() as { appContext?: { organization_id?: string | null } } | undefined;
    return state?.appContext?.organization_id ?? null;
  };
}

interface WikiLinkProps {
  "data-target"?: string;
  "data-alias"?: string;
  children?: ReactNode;
}

export function WikiLink(props: WikiLinkProps) {
  const target = String(props["data-target"] ?? "");
  const resolution = useWikiResolution(target);
  const readOrgId = useReadOrgId();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const label = props.children;

  if (created) {
    return (
      <a href={created} className="text-primary underline underline-offset-2" data-content-chrome="" data-wikilink="found">
        {label}
      </a>
    );
  }
  if (!resolution) {
    return (
      <span data-content-chrome="" data-wikilink="resolving" aria-busy className="text-primary/80 underline decoration-dotted underline-offset-2">
        {label}
      </span>
    );
  }
  if (resolution.status === "found") {
    if (!resolution.href) {
      return (
        <span data-content-chrome="" data-wikilink="found-no-page" title={`${resolution.typeLabel} "${resolution.title}" has no page to open`} className="underline decoration-dotted underline-offset-2">
          {label}
        </span>
      );
    }
    return (
      <a
        href={resolution.href}
        title={`${resolution.typeLabel}: ${resolution.title}`}
        data-content-chrome="" data-wikilink="found"
        className="text-primary underline underline-offset-2 hover:decoration-2"
      >
        {label}
      </a>
    );
  }
  if (resolution.status === "unavailable") {
    // Signed out, refused, or a named record that does not exist / cannot be
    // opened: say so — no link, and never an offer to create it.
    return (
      <span
        data-content-chrome="" data-wikilink="unavailable"
        title={`Not available: ${resolution.message}`}
        className="inline-flex items-baseline gap-0.5 text-muted-foreground"
      >
        {label}
        <Link2Off className="h-3 w-3 self-center" aria-hidden />
        <span className="sr-only">(not available)</span>
      </span>
    );
  }

  const create = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const { createWikiPage, splitHeading } = await loadResolver();
      const title = splitHeading(target).page;
      const result = await createWikiPage(title, readOrgId());
      if (!result.ok) {
        toast.error(`"${title}" was not created: ${result.error}`);
        return;
      }
      toast.success(`Created the note "${title}".`);
      if (result.href) setCreated(result.href);
    } finally {
      setCreating(false);
    }
  };

  // The name IS the control (Obsidian's unresolved link): one click creates
  // the note. Never a separate "Create" word inside someone's sentence (UI
  // audit C, 2026-09-26) — and exempt from the touch floor, so running text
  // never grows a 44px line.
  return (
    <button
      type="button"
      data-content-chrome=""
      data-wikilink="missing"
      data-touch-exempt=""
      onClick={create}
      disabled={creating}
      aria-busy={creating || undefined}
      title={creating ? `Creating "${resolution.title}"…` : `No page named "${resolution.title}" yet. Click to create it.`}
      className={cn(
        "inline cursor-pointer border-0 bg-transparent p-0 align-baseline font-[inherit] text-[length:inherit] leading-[inherit] text-muted-foreground underline decoration-dashed underline-offset-2 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
        creating && "cursor-wait opacity-60",
      )}
    >
      {label}
    </button>
  );
}
