"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { INTELLIGENCE_ICON } from "@host/components/icons/domain-icons";
import {
  declaredKeysForRoute,
} from "@host/features/mandates/feature-intelligence/IntelligenceIndicator";
import { usePageIntelligenceDoors } from "@host/features/mandates/feature-intelligence/page-intelligence-doors";
import { declaredPlacesFor } from "@host/features/mandates/feature-intelligence/registry";
import { featureIntelligenceHref } from "@host/features/mandates/feature-intelligence/hrefs";
import { targetForKey } from "@host/features/mandates/feature-intelligence/placement";
import { useLiveSurfaceMandates } from "../../runtime/surface-mandates";
import { fetchMandateIdentities, type MandateIdentity } from "../../../mandates/service";
import { mandateDisplayName } from "@host/features/mandates/mandate-words";
import { ErrorAlchemyMenu } from "@host/components/errors/ErrorAlchemyMenu";
import type { AnyMandateKey } from "@host/features/mandates/mandate-key";
import { useOpenMandateWindow } from "../../../host/window-openers";

/**
 * The page's jobs, after agents and conversations in the menu. A row opens the
 * mandate IN PLACE (the law: a mandate never costs the person their page); the
 * arrow beside it is the secondary door to the full intelligence page, in a new tab.
 */
export function PageIntelligenceSection({
  onOpened,
  surfaceName = null,
  isAdmin = false,
}: {
  onOpened?: () => void;
  surfaceName?: string | null;
  isAdmin?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const openMandate = useOpenMandateWindow();
  const doors = usePageIntelligenceDoors();
  const live = useLiveSurfaceMandates();
  const [identities, setIdentities] = useState<Record<string, MandateIdentity>>({});
  const [namesError, setNamesError] = useState<unknown>(null);

  const byKey = new Map<AnyMandateKey, string>();
  for (const key of declaredKeysForRoute(pathname)) {
    byKey.set(key, featureIntelligenceHref(targetForKey(key), { mandateKey: key }));
  }
  for (const ref of live) {
    const key = ref.mandateKey;
    byKey.set(key, featureIntelligenceHref(targetForKey(key), { mandateKey: key }));
  }
  for (const door of doors) {
    if (door.mandateKeys) {
      for (const key of door.mandateKeys) {
        byKey.set(key, featureIntelligenceHref(door.feature, { mandateKey: key, context: door.context }));
      }
      continue;
    }
    for (const place of declaredPlacesFor(door.feature)?.places ?? []) {
      for (const key of place.mandateKeys) {
        byKey.set(key, featureIntelligenceHref(door.feature, { mandateKey: key, context: door.context }));
      }
    }
  }
  const entries = [...byKey.entries()];
  const keyList = entries.map(([key]) => key).join("|");

  useEffect(() => {
    if (!keyList) return;
    let cancelled = false;
    // The keys were typed on the way in; the join is only the effect's stable identity.
    fetchMandateIdentities(keyList.split("|") as AnyMandateKey[])
      .then((next) => {
        if (!cancelled) {
          setIdentities(next);
          setNamesError(null);
        }
      })
      .catch((error: unknown) => {
        console.error("[page-intelligence] names could not be read", error);
        if (!cancelled) setNamesError(error);
      });
    return () => {
      cancelled = true;
    };
  }, [keyList]);

  if (entries.length === 0) return null;

  return (
    <section className="min-w-0 border-t border-border pt-2" aria-label="Page intelligence">
      <div className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <INTELLIGENCE_ICON className="h-3 w-3" aria-hidden />
        Page intelligence
      </div>
      {namesError != null && (
        <p className="flex items-center gap-1 px-2 pb-1 text-[10px] text-muted-foreground">
          Names couldn&apos;t be read — showing each job&apos;s key.
          <ErrorAlchemyMenu error={namesError} size="xs" operation="Read the page's job names" />
        </p>
      )}
      <ul className="space-y-0.5">
        {entries.map(([key, href]) => (
          <li key={key} className="flex min-w-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => {
                openMandate({
                  initialMandateKey: key,
                  mandateKeys: entries.map(([entryKey]) => entryKey),
                  surfaceName,
                  initialView: isAdmin ? "admin" : "yours",
                });
                onOpened?.();
              }}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent"
            >
              <span className="min-w-0 flex-1 truncate">{mandateDisplayName(key, identities[key]?.label)}</span>
            </button>
            <Link
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              prefetch={false}
              onClick={onOpened}
              title="Open the full page in a new tab"
              aria-label={`Open ${mandateDisplayName(key, identities[key]?.label)} full page in a new tab`}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ArrowUpRight className="h-3 w-3" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
