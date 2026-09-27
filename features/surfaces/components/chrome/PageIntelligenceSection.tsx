"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { INTELLIGENCE_ICON } from "@/components/icons/domain-icons";
import {
  declaredKeysForRoute,
} from "@/features/mandates/feature-intelligence/IntelligenceIndicator";
import { usePageIntelligenceDoors } from "@/features/mandates/feature-intelligence/page-intelligence-doors";
import { declaredPlacesFor } from "@/features/mandates/feature-intelligence/registry";
import { featureIntelligenceHref } from "@/features/mandates/feature-intelligence/hrefs";
import { targetForKey } from "@/features/mandates/feature-intelligence/placement";
import { useLiveSurfaceMandates } from "@/features/surfaces/runtime/surface-mandates";
import { fetchMandateIdentities, type MandateIdentity } from "@/features/mandates/service";
import { mandateDisplayName } from "@/features/mandates/mandate-words";

/** The page's management doors, after agents and conversations in the menu. */
export function PageIntelligenceSection({ onOpened }: { onOpened?: () => void }) {
  const pathname = usePathname() ?? "";
  const doors = usePageIntelligenceDoors();
  const live = useLiveSurfaceMandates();
  const [identities, setIdentities] = useState<Record<string, MandateIdentity>>({});

  const byKey = new Map<string, string>();
  for (const key of declaredKeysForRoute(pathname)) {
    byKey.set(key, featureIntelligenceHref(targetForKey(key), { mandateKey: key }));
  }
  for (const ref of live) {
    const key = ref.mandateKey as string;
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
    fetchMandateIdentities(keyList.split("|"))
      .then((next) => {
        if (!cancelled) setIdentities(next);
      })
      .catch((error: unknown) => {
        console.error("[page-intelligence] names could not be read", error);
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
      <ul className="space-y-0.5">
        {entries.map(([key, href]) => (
          <li key={key}>
            <Link
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              prefetch={false}
              onClick={onOpened}
              className="group flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-accent"
            >
              <span className="min-w-0 flex-1 truncate">{mandateDisplayName(key, identities[key]?.label)}</span>
              <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
