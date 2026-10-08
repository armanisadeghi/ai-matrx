"use client";

// features/admin/users/components/UserAcquisitionExplorer.tsx — WHO ARRIVED, FROM WHERE, AS NUMBERS: a
// mount of the ONE explorer (lane DRILL-SERVER-2) over the declared definition `user_acquisition`
// (aidream apps/shared/records/scripts/drill-definitions/user_acquisition.drill.ts), platform lane.
// Counted on the database (users._acquisition_facts), so nothing is capped — the list beside it reads
// rows into the browser and says when it holds only the newest. The page's focus (?user=) narrows the
// explorer to that person. Also: the tiles' numbers (useAcquisitionTotals), asked of the same door.

import { useEffect, useState } from "react";
import type { DrillSource } from "@ai-matrx/records";
import type { MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

import { DrillExplorer } from "@/components/official/drill-explorer/DrillExplorer";
import { drillClientFor } from "@/components/official/drill-explorer/useDrillExplorer";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { usageNameResolver } from "@/features/admin/usage-drill/useUsageDrill";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

export const USER_ACQUISITION_SOURCE: DrillSource = { kind: "entity", token: "user_acquisition" };

export type AcquisitionTimeframe = "7d" | "30d" | "90d" | "all";

const FIRST_QUESTION: MatrxDrillQuestion = {
  by: ["traffic_kind"],
  show: ["people", "cost", "requests"],
  where: [],
  sort: { key: "people", direction: "desc" },
  window: "30d",
};

export function UserAcquisitionExplorer({ focusUser }: { focusUser: string | null }) {
  return (
    <DrillExplorer
      source={USER_ACQUISITION_SOURCE}
      lane="platform"
      // the platform organization's calendar (UTC) cuts the weeks; the admin seat never acts as itself
      organizationId={SYSTEM_ORGANIZATION_ID}
      timeZone="UTC"
      title="User acquisition"
      rootLabel="Everyone who arrived"
      firstQuestion={FIRST_QUESTION}
      names={{ person: usageNameResolver(SYSTEM_ORGANIZATION_ID, "person") }}
      headline={{ measure: "people", also: ["cost", "requests"] }}
      rowNoun="identity"
      countMeasure="people"
      location="Administration › User acquisition"
      {...(focusUser ? { pageWhere: { person: [focusUser] } } : {})}
      dataAttributes={{ "data-user-acquisition-explorer": "platform" }}
    />
  );
}

/**
 * THE FOCUSED PERSON'S WORDS (lane DRILL-LIVE-FIX-2 #1): `?user=` names a person the loaded list may
 * not hold (it keeps only the newest), so the banner reads the name through the same names door the
 * explorer's person cells use — never the raw id. null while it is being read.
 */
export function useFocusedPersonName(focusUser: string | null): string | null {
  const [named, setNamed] = useState<{ id: string; words: string } | null>(null);
  useEffect(() => {
    if (!focusUser) return;
    let cancelled = false;
    void usageNameResolver(SYSTEM_ORGANIZATION_ID, "person")
      .resolve([focusUser])
      .then((got) => {
        if (cancelled) return;
        const resolver = usageNameResolver(SYSTEM_ORGANIZATION_ID, "person");
        setNamed({ id: focusUser, words: (got.ok ? got.names[focusUser] : undefined) ?? resolver.unreadLabel ?? "Name could not be read" });
      });
    return () => {
      cancelled = true;
    };
  }, [focusUser]);
  return named && named.id === focusUser ? named.words : null;
}

export interface AcquisitionTotals {
  people: number;
  visitor: number;
  guest: number;
  account: number;
  converted: number;
  localTests: number;
  bots: number;
  blocked: number;
  peopleCost: number;
}

const DAYS: Record<Exclude<AcquisitionTimeframe, "all">, number> = { "7d": 7, "30d": 30, "90d": 90 };

type Pair = { traffic: string | null; state: string | null; blocked: string | null; people: number; cost: number };

/**
 * THE TILES, COUNTED ON THE DATABASE: one ask of `user_acquisition` by traffic, identity and blocked
 * for the page's timeframe (and focus). "Likely people" = everything that is neither a bot nor a local
 * test, as the page's own rule; blocked counts every identity whose guest block is active.
 */
export function useAcquisitionTotals(timeframe: AcquisitionTimeframe, focusUser: string | null) {
  const userId = useAppSelector(selectUserId);
  const [state, setState] = useState<{ key: string; totals: AcquisitionTotals | null; error: string | null }>({ key: "", totals: null, error: null });
  const key = `${timeframe}:${focusUser ?? ""}:${userId ?? ""}`;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const to = new Date();
    const from = timeframe === "all" ? new Date("2000-01-01T00:00:00Z") : new Date(to.getTime() - DAYS[timeframe] * 86_400_000);
    void drillClientFor(SYSTEM_ORGANIZATION_ID, userId)
      .drillAsk({
        source: USER_ACQUISITION_SOURCE,
        question: {
          by: ["traffic_kind", "identity_state", "blocked"],
          show: ["people", "cost"],
          lane: "platform",
          limit: 1000,
          window: { key: "created_at", from: from.toISOString(), to: to.toISOString() },
          ...(focusUser ? { where: { person: [focusUser] } } : {}),
        },
      })
      .then((got) => {
        if (cancelled) return;
        if (!got.ok) {
          setState({ key, totals: null, error: got.error.message });
          return;
        }
        const pairs: Pair[] = got.data!.rows
          .filter((row) => row.kind === "group")
          .map((row) => {
            const groups = (row.groups ?? {}) as Record<string, unknown>;
            const measures = (row.measures ?? {}) as Record<string, unknown>;
            return {
              traffic: groups.traffic_kind == null ? null : String(groups.traffic_kind),
              state: groups.identity_state == null ? null : String(groups.identity_state),
              blocked: groups.blocked == null ? null : String(groups.blocked),
              people: Number(measures.people ?? 0),
              cost: Number(measures.cost ?? 0),
            };
          });
        const totals: AcquisitionTotals = { people: 0, visitor: 0, guest: 0, account: 0, converted: 0, localTests: 0, bots: 0, blocked: 0, peopleCost: 0 };
        for (const p of pairs) {
          if (p.traffic === "local_test") totals.localTests += p.people;
          else if (p.traffic === "bot") totals.bots += p.people;
          else {
            totals.people += p.people;
            totals.peopleCost += p.cost;
            if (p.state === "visitor" || p.state === "guest" || p.state === "account" || p.state === "converted") totals[p.state] += p.people;
          }
          if (p.blocked === "true") totals.blocked += p.people;
        }
        setState({ key, totals, error: null });
      });
    return () => {
      cancelled = true;
    };
  }, [key, timeframe, focusUser, userId]);

  return state.key === key ? { totals: state.totals, error: state.error, loading: false } : { totals: null, error: null, loading: true };
}
